import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RevisionFlag } from '../schedule/scheduleApi'
import { FlagTool } from './FlagTool'

const flag = (over: Partial<RevisionFlag>): RevisionFlag => ({
  id: 'f1', scope: 'passage', type: 'edit', note: 'Tighten', chapterId: 'c1', momentId: 'm1', start: 0, end: 10, snippet: 'The bell rang.', stale: false,
  createdAt: '2026-10-01T00:00:00Z', resolvedAt: null, outcome: '', ...over,
})

function setup(flags: RevisionFlag[], hasSentence = true) {
  const on = { onAdd: vi.fn(), onUpdate: vi.fn(), onResolve: vi.fn(), onRemove: vi.fn(), onShow: vi.fn() }
  render(<FlagTool hasSentence={hasSentence} flags={flags} {...on} />)
  return on
}

describe('the Flag tool', () => {
  it('flags the sentence with the kind and note chosen, and the project without a sentence', () => {
    const on = setup([])
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.change(screen.getByLabelText('Flag note'), { target: { value: ' Say more ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Flag this sentence' }))
    expect(on.onAdd).toHaveBeenLastCalledWith('passage', 'add', 'Say more')
    expect(screen.getByLabelText('Flag note')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Flag the project' }))
    expect(on.onAdd).toHaveBeenLastCalledWith('project', 'add', '')
  })

  it('cannot flag a sentence until one is clicked', () => {
    setup([], false)
    expect(screen.getByRole('button', { name: 'Flag this sentence' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Flag the project' })).toBeEnabled()
  })

  it('lists the open flags with their text or the project, and says when the text is gone', () => {
    setup([flag({}), flag({ id: 'f2', scope: 'project', snippet: '', note: 'Pacing', type: 'review' }), flag({ id: 'f3', stale: true, snippet: 'Old words.' })])
    const list = screen.getByRole('list', { name: 'Revision flags' })
    expect(list).toHaveTextContent('“The bell rang.”')
    expect(list).toHaveTextContent('The project')
    expect(list).toHaveTextContent('Text gone: “Old words.”')
    expect(screen.queryByRole('button', { name: /Show the flagged text: Old/ })).toBeNull()
  })

  it('changes a flag\'s kind and, when it is left, its note', () => {
    const on = setup([flag({})])
    fireEvent.change(screen.getByLabelText('Kind of flag on The bell rang.'), { target: { value: 'delete' } })
    expect(on.onUpdate).toHaveBeenLastCalledWith('f1', { type: 'delete' })
    const note = screen.getByLabelText('Note on The bell rang.')
    fireEvent.blur(note)
    expect(on.onUpdate).toHaveBeenCalledTimes(1) // unchanged: nothing sent
    fireEvent.change(note, { target: { value: 'Cut it' } })
    fireEvent.blur(note)
    expect(on.onUpdate).toHaveBeenLastCalledWith('f1', { note: 'Cut it' })
  })

  it('resolves with what was done, and shows or hides the resolved ones', () => {
    const on = setup([flag({}), flag({ id: 'f2', resolvedAt: '2026-10-02T00:00:00Z', outcome: 'Rewrote it', snippet: 'Done text.' })])
    expect(screen.queryByText(/Done text/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Resolve the flag on The bell rang.' }))
    fireEvent.change(screen.getByLabelText('What was done'), { target: { value: 'Tightened' } })
    fireEvent.keyDown(screen.getByLabelText('What was done'), { key: 'Enter' })
    expect(on.onResolve).toHaveBeenCalledWith('f1', 'Tightened')
    fireEvent.click(screen.getByRole('switch', { name: /Show resolved/ }))
    expect(screen.getByRole('list', { name: 'Revision flags' })).toHaveTextContent('Rewrote it')
  })

  it('shows a flag in the text and deletes it', () => {
    const on = setup([flag({})])
    fireEvent.click(screen.getByRole('button', { name: /Show the flagged text/ }))
    expect(on.onShow).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete the flag on The bell rang.' }))
    expect(on.onRemove).toHaveBeenCalledWith('f1')
  })
})
