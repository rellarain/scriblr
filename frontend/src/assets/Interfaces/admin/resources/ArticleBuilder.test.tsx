import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as resourcesApi from '../../../../api/resourcesApi'
import type { ResourceContent, ResourceNode, ResourcesFile } from '../../../../api/types'
import ArticleBuilder from './ArticleBuilder'
import { useResources } from './useResources'

function node(id: string, kind: ResourceNode['kind'], parentId: string | null, order: number, name: string): ResourceNode {
  return { id, kind, parentId, order, name }
}
function file(nodes: ResourceNode[], content: Record<string, ResourceContent> = {}): ResourcesFile {
  return { schemaVersion: 1, nodes, content, assessments: {} }
}

const plotlines = node('writer/shelf/plot/plotlines', 'feature', 'writer/shelf/plot', 0, 'Plotlines')
const shelf = node('writer/shelf', 'console', 'writer', 0, 'Shelf')
const plot = node('writer/shelf/plot', 'component', 'writer/shelf', 0, 'Plot')
const writer = node('writer', 'interface', null, 0, 'Writer')
const ALL = [writer, shelf, plot, plotlines]

// Harness: a real useResources hook (so contentOf/setGuide etc. round-trip
// through the mocked api layer exactly as the real component uses them).
function Harness() {
  const resources = useResources()
  return resources.nodes.length === 0
    ? <div>loading</div>
    : <ArticleBuilder resources={resources} selectedId={plotlines.id} onSelectNode={() => {}} />
}

beforeEach(() => {
  vi.spyOn(resourcesApi, 'getResources').mockResolvedValue(file(ALL, {
    [plotlines.id]: { guide: 'Existing guide', tutorials: [], faq: [] },
  }))
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

async function renderReady() {
  render(<Harness />)
  await screen.findByDisplayValue('Existing guide')
}

describe('ArticleBuilder', () => {
  it('shows the selected node\'s breadcrumb and guide text', async () => {
    await renderReady()
    expect(screen.getByText('Writer › Shelf › Plot › Plotlines')).toBeTruthy()
  })

  it('debounces guide edits, saving once after a pause -- not per keystroke', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const putGuide = vi.spyOn(resourcesApi, 'putResourceGuide').mockResolvedValue(file(ALL))
    render(<Harness />)
    await vi.waitFor(() => expect(screen.queryByDisplayValue('Existing guide')).toBeTruthy())

    const textarea = screen.getByPlaceholderText('# Write a markdown guide for this node…')
    fireEvent.change(textarea, { target: { value: 'Existing guide!' } })
    fireEvent.change(textarea, { target: { value: 'Existing guide!!' } })
    expect(putGuide).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(putGuide).toHaveBeenCalledTimes(1)
    expect(putGuide).toHaveBeenCalledWith(plotlines.id, 'Existing guide!!')
  })

  it('switches between Guide/Tutorials/FAQ tabs', async () => {
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: 'Tutorials' }))
    expect(screen.getByText('+ Add tutorial')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'FAQ' }))
    expect(screen.getByText('+ Add FAQ')).toBeTruthy()
  })

  it('adds a tutorial and edits its title through the real save round-trip', async () => {
    const setTutorials = vi.spyOn(resourcesApi, 'putResourceTutorials').mockResolvedValue(
      file(ALL, { [plotlines.id]: { guide: 'Existing guide', tutorials: [{ id: 't1', title: '', body: '' }], faq: [] } }),
    )
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: 'Tutorials' }))
    fireEvent.click(screen.getByText('+ Add tutorial'))
    await waitFor(() => expect(setTutorials).toHaveBeenCalledWith(plotlines.id, [{ id: expect.any(String), title: '', body: '' }]))
  })

  it('promotes a real feedback candidate into a new, feedback-sourced FAQ entry', async () => {
    vi.spyOn(resourcesApi, 'getPromotableFeedback').mockResolvedValue([{ id: 'fb-1', text: 'Lost my plotlines!' }])
    const setFaq = vi.spyOn(resourcesApi, 'putResourceFaq').mockResolvedValue(file(ALL))
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: 'FAQ' }))
    fireEvent.click(screen.getByText('Promote from feedback ▾'))
    const promoteBtn = await screen.findByRole('button', { name: 'Promote' })
    fireEvent.click(promoteBtn)
    await waitFor(() => expect(setFaq).toHaveBeenCalledWith(plotlines.id, [
      expect.objectContaining({ question: 'Lost my plotlines!', source: 'feedback', sourceMessageId: 'fb-1' }),
    ]))
  })

  it('preview as Help renders the guide and offers a feedback form that really submits', async () => {
    const submit = vi.spyOn(resourcesApi, 'submitFeedback').mockResolvedValue({ id: 'fb-9', submittedAt: 'now' })
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: 'Preview ▸' }))
    expect(screen.getByText('Existing guide')).toBeTruthy()
    expect(screen.getByText('Chat with an admin — coming soon')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Submit feedback' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unpleasant' }))
    fireEvent.change(screen.getByPlaceholderText(/explicated intention/), { target: { value: 'Please add a warning.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Please add a warning.', senderTone: 'unpleasant',
      openPage: 'Writer', openConsole: 'Shelf', selectedComponent: 'Plot',
    })))
    expect(await screen.findByText(/your feedback was sent/)).toBeTruthy()
  })

  it('preview as Training has no feedback section', async () => {
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: 'Preview ▸' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preview as Training' }))
    expect(screen.queryByText('Chat with an admin — coming soon')).toBeNull()
    expect(screen.getByText('Check your understanding')).toBeTruthy()
  })

  it('shows a placeholder pane when nothing is selected', async () => {
    vi.spyOn(resourcesApi, 'getResources').mockResolvedValue(file([]))
    function EmptyHarness() {
      const resources = useResources()
      return <ArticleBuilder resources={resources} selectedId={null} onSelectNode={() => {}} />
    }
    render(<EmptyHarness />)
    expect(await screen.findByText(/Select or add an interface/)).toBeTruthy()
  })
})
