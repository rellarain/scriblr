import { fireEvent, render, screen } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FlagType } from '../../../../api/types'
import type { RevisionFlag } from '../schedule/scheduleApi'
import { FLAG_TYPES, FlagTool } from './FlagTool'

const flag = (over: Partial<RevisionFlag>): RevisionFlag => ({
  id: 'f1', scope: 'passage', type: 'change', note: 'Tighten', chapterId: 'c1', momentId: 'm1', start: 0, end: 10, snippet: 'The bell rang.', stale: false,
  mergeWith: null, createdAt: '2026-10-01T00:00:00Z', resolvedAt: null, outcome: '', ...over,
})

type Props = ComponentProps<typeof FlagTool>

// The kind is the Preview's; here a small host keeps it.
function Host(props: Omit<Props, 'type' | 'onType'> & { start?: FlagType; onKind?: (t: FlagType) => void }) {
  const [type, setType] = useState<FlagType>(props.start ?? 'review')
  return <FlagTool {...props} type={type} onType={t => { setType(t); props.onKind?.(t) }} />
}

function setup(flags: RevisionFlag[], over: Partial<Props> & { start?: FlagType } = {}) {
  const on = { onAdd: vi.fn(), onUpdate: vi.fn(), onResolve: vi.fn(), onRemove: vi.fn(), onShow: vi.fn(), onPicking: vi.fn(), onClearMerge: vi.fn(), onKind: vi.fn() }
  render(<Host hasSentence mergeWith={null} picking={false} flags={flags} {...on} {...over} />)
  return on
}

describe('the Flag tool', () => {
  it('offers the seven kinds, each with what it asks', () => {
    setup([])
    expect(FLAG_TYPES.map(t => t.label)).toEqual(['Review', 'Add', 'Remove', 'Merge', 'Change', 'Simplify', 'Expand'])
    const kinds = screen.getByRole('group', { name: 'Kind of flag' })
    expect(Array.from(kinds.querySelectorAll('button')).map(b => b.textContent)).toEqual(FLAG_TYPES.map(t => t.label))
    expect(screen.getByText('Read it again later.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Simplify' }))
    expect(screen.getByRole('button', { name: 'Simplify' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Say it more plainly.')).toBeInTheDocument()
  })

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
    setup([], { hasSentence: false })
    expect(screen.getByRole('button', { name: 'Flag this sentence' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Flag the project' })).toBeEnabled()
  })

  it('asks for the sentence to merge with only for Merge, and picks it on the page', () => {
    const on = setup([])
    expect(screen.queryByRole('group', { name: 'Merge with' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    expect(on.onKind).toHaveBeenLastCalledWith('merge')
    const merge = screen.getByRole('group', { name: 'Merge with' })
    expect(merge).toHaveTextContent('Optional: a second sentence')
    fireEvent.click(screen.getByRole('button', { name: 'Pick on the page' }))
    expect(on.onPicking).toHaveBeenCalledWith(true)
  })

  it('shows the sentence picked to merge with, and clears it', () => {
    const on = setup([], { start: 'merge', mergeWith: 'The coins were for the crossing.' })
    expect(screen.getByRole('group', { name: 'Merge with' })).toHaveTextContent('“The coins were for the crossing.”')
    fireEvent.click(screen.getByRole('button', { name: 'Clear the sentence to merge with' }))
    expect(on.onClearMerge).toHaveBeenCalled()
  })

  it('says to click the page while picking, and cannot pick before a first sentence', () => {
    setup([], { start: 'merge', picking: true })
    expect(screen.getByText('Click the second sentence on the page.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick on the page' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lists the open flags with their text or the project, and says when the text is gone', () => {
    setup([flag({}), flag({ id: 'f2', scope: 'project', snippet: '', note: 'Pacing', type: 'review' }), flag({ id: 'f3', stale: true, snippet: 'Old words.' })])
    const list = screen.getByRole('list', { name: 'Revision flags' })
    expect(list).toHaveTextContent('“The bell rang.”')
    expect(list).toHaveTextContent('The project')
    expect(list).toHaveTextContent('Text gone: “Old words.”')
    expect(screen.queryByRole('button', { name: /Show the flagged text: Old/ })).toBeNull()
  })

  it('lists a merge flag with both passages, and shows either in the text', () => {
    const merge = flag({ type: 'merge', mergeWith: { momentId: 'm2', start: 4, end: 20, snippet: 'It rang twice.', stale: false } })
    const on = setup([merge])
    expect(screen.getByRole('list', { name: 'Revision flags' })).toHaveTextContent('“The bell rang.” + “It rang twice.”')
    fireEvent.click(screen.getByRole('button', { name: 'Show the text to merge with: It rang twice.' }))
    expect(on.onShow).toHaveBeenLastCalledWith(expect.objectContaining({ momentId: 'm2', start: 4 }))
  })

  it('changes a flag\'s kind and, when it is left, its note', () => {
    const on = setup([flag({})])
    fireEvent.change(screen.getByLabelText('Kind of flag on The bell rang.'), { target: { value: 'remove' } })
    expect(on.onUpdate).toHaveBeenLastCalledWith('f1', { type: 'remove' })
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
    expect(screen.getByRole('list', { name: 'Revision flags' })).toHaveTextContent('Change done: Rewrote it')
  })

  it('shows a flag in the text and deletes it', () => {
    const on = setup([flag({})])
    fireEvent.click(screen.getByRole('button', { name: /Show the flagged text/ }))
    expect(on.onShow).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete the flag on The bell rang.' }))
    expect(on.onRemove).toHaveBeenCalledWith('f1')
  })
})
