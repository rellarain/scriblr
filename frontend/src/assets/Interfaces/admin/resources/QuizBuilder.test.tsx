import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as resourcesApi from '../../../../api/resourcesApi'
import type { ResourceNode, ResourcesFile } from '../../../../api/types'
import QuizBuilder from './QuizBuilder'
import { useResources } from './useResources'

function node(id: string, kind: ResourceNode['kind'], parentId: string | null, order: number, name: string): ResourceNode {
  return { id, kind, parentId, order, name }
}
function file(nodes: ResourceNode[]): ResourcesFile {
  return { schemaVersion: 1, nodes, content: {}, assessments: {} }
}

const writer = node('writer', 'interface', null, 0, 'Writer')
const shelf = node('writer/shelf', 'console', 'writer', 0, 'Shelf')
const plot = node('writer/shelf/plot', 'component', 'writer/shelf', 0, 'Plot')
const plotlines = node('writer/shelf/plot/plotlines', 'feature', 'writer/shelf/plot', 0, 'Plotlines')

afterEach(() => { vi.restoreAllMocks() })

function Harness({ selectedId }: { selectedId: string | null }) {
  const resources = useResources()
  return resources.nodes.length === 0 && selectedId
    ? <div>loading</div>
    : <QuizBuilder resources={resources} selectedId={selectedId} onSelectNode={() => {}} />
}

describe('QuizBuilder', () => {
  beforeEach(() => {
    vi.spyOn(resourcesApi, 'getResources').mockResolvedValue(file([writer, shelf, plot, plotlines]))
  })

  it('an Interface has no Exam/Test/Quiz -- shows the explainer instead', async () => {
    render(<Harness selectedId={writer.id} />)
    expect(await screen.findByText(/Select a Console, Component or Feature/)).toBeTruthy()
  })

  it('a Console builds an Exam, a Component a Test, a Feature a Quiz', async () => {
    const { rerender } = render(<Harness selectedId={shelf.id} />)
    expect(await screen.findByText('Exam')).toBeTruthy()
    rerender(<Harness selectedId={plot.id} />)
    expect(await screen.findByText('Test')).toBeTruthy()
    rerender(<Harness selectedId={plotlines.id} />)
    expect(await screen.findByText('Quiz')).toBeTruthy()
  })

  it('adds a question with four options, the first marked correct by default', async () => {
    const setAssessment = vi.spyOn(resourcesApi, 'putResourceAssessment').mockResolvedValue(file([writer, shelf, plot, plotlines]))
    render(<Harness selectedId={plotlines.id} />)
    fireEvent.click(await screen.findByText('+ Add question'))
    await waitFor(() => expect(setAssessment).toHaveBeenCalledTimes(1))
    const [, questions] = setAssessment.mock.calls[0]
    expect(questions).toHaveLength(1)
    expect(questions[0].options).toHaveLength(4)
    expect(questions[0].options.filter(o => o.isCorrect)).toHaveLength(1)
    expect(questions[0].options[0].isCorrect).toBe(true)
  })

  it('marking a different option correct un-marks the others', async () => {
    vi.spyOn(resourcesApi, 'getResources').mockResolvedValue({
      schemaVersion: 1, nodes: [writer, shelf, plot, plotlines], content: {},
      assessments: {
        [plotlines.id]: {
          questions: [{
            id: 'q1', prompt: 'Pick one',
            options: [
              { id: 'o1', text: 'A', isCorrect: true }, { id: 'o2', text: 'B', isCorrect: false },
              { id: 'o3', text: 'C', isCorrect: false }, { id: 'o4', text: 'D', isCorrect: false },
            ],
          }],
        },
      },
    })
    const setAssessment = vi.spyOn(resourcesApi, 'putResourceAssessment').mockResolvedValue(file([writer, shelf, plot, plotlines]))
    render(<Harness selectedId={plotlines.id} />)
    const radios = await screen.findAllByRole('radio')
    fireEvent.click(radios[2])
    await waitFor(() => expect(setAssessment).toHaveBeenCalledTimes(1))
    const [, questions] = setAssessment.mock.calls[0]
    expect(questions[0].options.map((o: { isCorrect: boolean }) => o.isCorrect)).toEqual([false, false, true, false])
  })
})
