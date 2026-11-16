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
  return { schemaVersion: 2, nodes, content: {}, assessments: {} }
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

  it('writes the questions in the markup editor and saves them a moment after the last key', async () => {
    const setAssessment = vi.spyOn(resourcesApi, 'putResourceAssessment').mockResolvedValue(file([writer, shelf, plot, plotlines]))
    render(<Harness selectedId={plotlines.id} />)
    const field = await screen.findByRole('textbox', { name: 'Quiz questions' })
    fireEvent.change(field, { target: { value: '???? Pick one\n?! Right\n?? Wrong' } })
    expect(setAssessment).not.toHaveBeenCalled()
    // saved with each question's permanent id; leaving the field shows the same ids there
    await waitFor(() => expect(setAssessment).toHaveBeenCalledWith(plotlines.id, expect.stringMatching(/^\?\?\?\?#q[0-9a-f]{4} Pick one\n\?! Right\n\?\? Wrong$/)))
    expect(setAssessment).toHaveBeenCalledTimes(1)
    fireEvent.blur(field)
    expect(field).toHaveValue(setAssessment.mock.calls[0][1])
  })

  it('shows what is written, and checks a question with no right option', async () => {
    vi.spyOn(resourcesApi, 'getResources').mockResolvedValue({
      schemaVersion: 2, nodes: [writer, shelf, plot, plotlines], content: {},
      assessments: { [plotlines.id]: { text: '????#q1 Pick one\n?? A\n?? B' } },
    })
    render(<Harness selectedId={plotlines.id} />)
    expect(await screen.findByRole('textbox', { name: 'Quiz questions' })).toHaveValue('????#q1 Pick one\n?? A\n?? B')
    expect(await screen.findByRole('button', { name: /Line 1 This question has no right option/ })).toBeInTheDocument()
  })
})
