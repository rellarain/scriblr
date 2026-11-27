import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode } from '../../../../api/types'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { mockFetchBy } from '../../../../test/mockFetch'
import { outlineNode, plotNode } from '../plotTestWorkspace'
import { ConvertNote } from './ConvertNote'

const OUTLINE: OutlineNode[] = [
  outlineNode('b1', 'book', null, { title: 'The Lantern Road' }),
  outlineNode('c1', 'chapter', 'b1', { title: 'The Courier' }),
  outlineNode('sc1', 'scene', 'c1', { title: '', location: 'The landing' }),
  outlineNode('m1', 'moment', 'sc1', { title: 'The price' }),
  outlineNode('c2', 'chapter', 'b1', { title: 'Tolls', order: 1, flag: { type: 'review', note: 'old' } }),
]
const PLOT = [
  plotNode('cat', 'category', null, { title: 'Characters' }),
  plotNode('line', 'plotline', 'cat', { title: 'Mara Quell', customFieldDefs: [{ id: 'f1', name: 'Her mother', kind: 'points' }] }),
]
const OTHER: OutlineNode[] = [outlineNode('ob', 'book', null, { title: 'Orchard' }), outlineNode('oc', 'chapter', 'ob', { title: 'Bloom' })]
const NOTE = { title: "The ferryman knows her mother's name.", body: 'He says it before she gives hers.' }

function workspace() {
  return makeWorkspace({
    activeProjectId: 'p1',
    projects: [{ projectId: 'p1', title: 'Harbour Lights' }, { projectId: 'p2', title: 'The Glass Orchard' }] as never,
    outlineNodes: OUTLINE, plotNodes: PLOT,
    addOutlineNode: vi.fn(() => 'new'), updateOutlineNode: vi.fn(),
    addPlotValue: vi.fn(() => 'pt'), updatePlotValue: vi.fn(), placePlotpoint: vi.fn(),
  })
}
function backend() {
  return mockFetchBy((url, init) => {
    if (url.endsWith('/projects/p2/outline') && !init?.method) return { schemaVersion: 2, nodes: OTHER }
    if (url.endsWith('/projects/p2/plot') && !init?.method) return { schemaVersion: 2, nodes: [] }
    if (url.includes('/draft/chapter/') && !init?.method) return { moments: { m1: { body: 'She paid.', updatedAt: 'x' } } }
    return {}
  })
}
const sent = (fetch: ReturnType<typeof mockFetchBy>, method: string) =>
  fetch.mock.calls.filter(([, init]) => init?.method === method).map(([url, init]) => [url, JSON.parse(String(init?.body))])
const panel = () => screen.getByRole('region', { name: 'Convert this note' })
const choose = async (name: string) => userEvent.click(within(panel()).getByRole('button', { name }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})

describe('ConvertNote in the open project', () => {
  it('makes an outline node inside a chosen place, from the note’s title and the rest, and says so', async () => {
    backend()
    const w = workspace()
    const onDone = vi.fn()
    render(<ConvertNote w={w} note={NOTE} onDone={onDone} />)
    expect(within(panel()).getByRole('button', { name: 'An outline node' }).getAttribute('aria-pressed')).toBe('true')
    expect((within(panel()).getByLabelText('Title (the first line)') as HTMLInputElement).value).toBe(NOTE.title)
    expect((within(panel()).getByLabelText('Summary (the rest)') as HTMLInputElement).value).toBe(NOTE.body)
    await userEvent.selectOptions(within(panel()).getByLabelText('Inside'), 'sc1')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Convert' }))
    expect(w.addOutlineNode).toHaveBeenCalledWith('sc1', 'moment', { title: NOTE.title, synopsis: NOTE.body })
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ target: 'outline', projectId: 'p1', projectTitle: 'Harbour Lights' }), true)
  })

  it('makes a scene of what happens', async () => {
    backend()
    const w = workspace()
    render(<ConvertNote w={w} note={NOTE} onDone={() => {}} />)
    await userEvent.selectOptions(within(panel()).getByLabelText('A new'), 'scene')
    expect(within(panel()).getByLabelText('Inside').querySelectorAll('option')).toHaveLength(3) // the book and its two chapters
    await userEvent.click(within(panel()).getByRole('button', { name: 'Convert' }))
    expect(w.addOutlineNode).toHaveBeenCalledWith('b1', 'scene', { action: `${NOTE.title} ${NOTE.body}` })
  })

  it('makes a plotpoint in a field, placed on a moment, and goes when it is not kept', async () => {
    backend()
    const w = workspace()
    const onDone = vi.fn()
    render(<ConvertNote w={w} note={NOTE} onDone={onDone} />)
    await choose('A plotpoint')
    expect(within(panel()).getByLabelText('In the field').textContent).toBe('Characters · Mara Quell · Her mother')
    expect((within(panel()).getByLabelText('Title (the first line)') as HTMLInputElement).maxLength).toBe(50)
    await userEvent.selectOptions(within(panel()).getByLabelText('Placed at (optional)'), 'm1')
    await userEvent.click(within(panel()).getByRole('checkbox', { name: 'Keep the note, marked with what it became' }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Convert' }))
    expect(w.addPlotValue).toHaveBeenCalledWith('line', 'f1')
    expect(w.updatePlotValue).toHaveBeenCalledWith('pt', { title: NOTE.title, body: NOTE.body })
    expect(w.placePlotpoint).toHaveBeenCalledWith('pt', 'm1')
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ target: 'plot' }), false)
  })

  it('flags a chapter (saying it takes the place of the flag it has) or the whole project', async () => {
    const fetch = backend()
    const w = workspace()
    render(<ConvertNote w={w} note={NOTE} onDone={() => {}} />)
    await choose('A revision flag')
    await userEvent.selectOptions(within(panel()).getByLabelText('Kind'), 'merge')
    await userEvent.selectOptions(within(panel()).getByLabelText('On'), 'c2')
    expect(within(panel()).getByText(/This chapter has a Review flag already: this one takes its place/)).toBeTruthy()
    await userEvent.click(within(panel()).getByRole('button', { name: 'Convert' }))
    expect(w.updateOutlineNode).toHaveBeenCalledWith('c2', { flag: { type: 'merge', note: `${NOTE.title} ${NOTE.body}` } })

    await userEvent.selectOptions(within(panel()).getByLabelText('On'), 'project')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Convert' }))
    await waitFor(() => expect(sent(fetch, 'POST')).toEqual([['/api/projects/p1/revision-flags', { scope: 'project', type: 'merge', note: `${NOTE.title} ${NOTE.body}` }]]))
  })

  it('puts the note into a moment as a new paragraph, at its start or its end', async () => {
    const fetch = backend()
    const onDone = vi.fn()
    render(<ConvertNote w={workspace()} note={NOTE} onDone={onDone} />)
    await choose('Draft text')
    expect(within(panel()).getByText('The note’s text goes in as a new paragraph of the draft.')).toBeTruthy()
    expect((within(panel()).getByLabelText('Its text') as HTMLTextAreaElement).value).toBe(`${NOTE.title} ${NOTE.body}`)
    await userEvent.click(within(panel()).getByRole('button', { name: 'At the start' }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Convert' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(sent(fetch, 'PUT')).toEqual([['/api/projects/p1/draft/chapter/c1/moment/m1', expect.objectContaining({ body: `${NOTE.title} ${NOTE.body}\n\nShe paid.` })]])
  })

  it('takes the text as it is put right before converting, and needs some', async () => {
    const fetch = backend()
    render(<ConvertNote w={workspace()} note={NOTE} onDone={() => {}} />)
    await choose('A revision flag')
    const field = within(panel()).getByLabelText('The flag’s note')
    await userEvent.clear(field)
    expect((within(panel()).getByRole('button', { name: 'Convert' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(field, 'The ferryman knows. Use it in the crossing.')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Convert' }))
    await waitFor(() => expect(sent(fetch, 'POST')[0][1]).toEqual({ scope: 'project', type: 'review', note: 'The ferryman knows. Use it in the crossing.' }))
  })
})

describe('ConvertNote in another project', () => {
  it('reads that project, and writes the new node into its outline at once', async () => {
    const fetch = backend()
    const w = workspace()
    const onDone = vi.fn()
    render(<ConvertNote w={w} note={NOTE} onDone={onDone} />)
    await userEvent.selectOptions(within(panel()).getByLabelText('In the project'), 'p2')
    await waitFor(() => expect(within(panel()).getByLabelText('Inside').textContent).toContain('Book 1 · Orchard'))
    await userEvent.selectOptions(within(panel()).getByLabelText('Inside'), 'oc')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Convert' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p2', projectTitle: 'The Glass Orchard' }), true))
    expect(w.addOutlineNode).not.toHaveBeenCalled()
    const [[url, tree]] = sent(fetch, 'PUT')
    expect(url).toBe('/api/projects/p2/outline')
    expect(tree.nodes.find((n: OutlineNode) => n.parentId === 'oc')).toMatchObject({ kind: 'moment', title: NOTE.title, synopsis: NOTE.body })
  })

  it('says when there is nowhere to put it, and does not convert', async () => {
    backend()
    render(<ConvertNote w={workspace()} note={NOTE} onDone={() => {}} />)
    await userEvent.selectOptions(within(panel()).getByLabelText('In the project'), 'p2')
    await choose('A plotpoint')
    expect(await within(panel()).findByText(/This project’s plot has no field to write a plotpoint into yet/)).toBeTruthy()
    expect((within(panel()).getByRole('button', { name: 'Convert' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

it('cannot convert an empty note', () => {
  backend()
  render(<ConvertNote w={workspace()} note={{ title: '', body: ' ' }} onDone={() => {}} />)
  expect(within(panel()).getByText('The note is empty.')).toBeTruthy()
  expect((within(panel()).getByRole('button', { name: 'Convert' }) as HTMLButtonElement).disabled).toBe(true)
})
