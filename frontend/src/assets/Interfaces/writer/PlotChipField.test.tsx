import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlotNode } from '../../../api/types'
import { PlotChipField, linkSuggestions } from './PlotChipField'
import { plotNode, useFakeWorkspace } from './plotTestWorkspace'

// The Keywords field of a plot editor (the user, 2026-11-18): keywords, then links to other plot nodes, in one row ending in one box; @ in the box
// searches for a node to link.

const plot = (): PlotNode[] => [
  plotNode('cat', 'category', null, { title: 'Romance', keywords: ['love'] }),
  plotNode('sub', 'subcategory', 'cat', { title: 'Slow burn' }),
  plotNode('line', 'plotline', 'sub', { title: 'Meet cute', keywords: ['rain', 'train'] }),
  plotNode('cat2', 'category', null, { title: 'Crime', order: 1 }),
  plotNode('crew', 'cluster', 'cat2', { title: 'Heist crew' }),
  plotNode('heist', 'plotline', 'crew', { title: 'The heist' }),
  plotNode('hunt', 'plotline', 'cat2', { title: 'Manhunt' }),
]

let nodes: PlotNode[] = []
function Field({ start = plot(), id = 'line' }: { start?: PlotNode[]; id?: string }) {
  const { w, plotNodes } = useFakeWorkspace(start, id)
  nodes = plotNodes
  const node = w.plotNodeById.get(id)!
  return <><PlotChipField w={w} node={node} /><output aria-label="focused">{w.focusedPlotNodeId}</output></>
}
const of = (id: string) => nodes.find(n => n.id === id)!
const box = () => screen.getByRole('combobox', { name: 'Add a keyword or a link to Meet cute' })
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const options = () => within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.querySelector('.wrLinkPickerTitle')?.textContent)

describe('the keywords and links field', () => {
  it('adds a keyword from the box (Enter or +), trimmed and once', () => {
    render(<Field />)
    type(box(), '  storm ')
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(of('line').keywords).toEqual(['rain', 'train', 'storm'])
    expect(box()).toHaveValue('')
    type(box(), 'storm')
    fireEvent.click(screen.getByRole('button', { name: 'Add keyword' }))
    expect(of('line').keywords).toEqual(['rain', 'train', 'storm'])
  })

  it('edits a keyword in place: Enter or leaving keeps it, Escape or an empty edit puts it back, and one already there merges', () => {
    render(<Field />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit keyword rain' }))
    const edit = () => screen.getByRole('combobox', { name: 'Keyword rain' })
    expect(edit()).toHaveFocus()
    type(edit(), 'storm')
    fireEvent.keyDown(edit(), { key: 'Enter' })
    expect(of('line').keywords).toEqual(['storm', 'train']) // in its place
    fireEvent.click(screen.getByRole('button', { name: 'Edit keyword storm' }))
    type(screen.getByRole('combobox', { name: 'Keyword storm' }), 'gale')
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Keyword storm' }), { key: 'Escape' })
    expect(of('line').keywords).toEqual(['storm', 'train'])
    fireEvent.click(screen.getByRole('button', { name: 'Edit keyword storm' }))
    type(screen.getByRole('combobox', { name: 'Keyword storm' }), '  ')
    fireEvent.blur(screen.getByRole('combobox', { name: 'Keyword storm' }))
    expect(of('line').keywords).toEqual(['storm', 'train'])
    fireEvent.click(screen.getByRole('button', { name: 'Edit keyword storm' }))
    type(screen.getByRole('combobox', { name: 'Keyword storm' }), 'train')
    fireEvent.blur(screen.getByRole('combobox', { name: 'Keyword storm' }))
    expect(of('line').keywords).toEqual(['train'])
  })

  it('searches after @ by title or place, titles first, with each kind and place, and leaves out the node\'s own parents', () => {
    render(<Field />)
    type(box(), '@')
    expect(box()).toHaveAttribute('aria-expanded', 'true')
    expect(options()).toEqual(['Crime', 'Heist crew', 'The heist', 'Manhunt'])
    type(box(), '@heist')
    expect(options()).toEqual(['Heist crew', 'The heist'])
    const first = within(screen.getByRole('listbox')).getAllByRole('option')[1]
    expect(first).toHaveTextContent('plotline')
    expect(first).toHaveTextContent('Crime › Heist crew')
    type(box(), '@crime')
    expect(options()).toEqual(['Crime', 'Heist crew', 'The heist', 'Manhunt']) // by place too
    type(box(), '@zzz')
    expect(screen.getByRole('listbox')).toHaveTextContent('Nothing by that name.')
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(of('line').links ?? []).toEqual([]) // nothing to link: nothing happens
    expect(of('line').keywords).toEqual(['rain', 'train']) // and @ is never a keyword
  })

  it('links the first match on Enter, or the one chosen with the arrows, on both ends', () => {
    render(<Field />)
    type(box(), '@heist')
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(of('line').links).toEqual(['crew'])
    expect(of('crew').links).toEqual(['line'])
    type(box(), '@heist')
    expect(options()).toEqual(['The heist']) // a node already linked is no longer offered
    type(box(), '@m')
    expect(options()).toEqual(['Manhunt', 'Crime', 'The heist'])
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    expect(box()).toHaveAttribute('aria-activedescendant', within(screen.getByRole('listbox')).getAllByRole('option')[1].id)
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(of('line').links).toEqual(['crew', 'cat2'])
    expect(screen.getAllByRole('button', { name: /^Open / }).map(b => b.textContent)).toEqual(['Heist crew', 'Crime']) // keywords first, then links
  })

  it('closes the list with Escape, and a second Escape clears the box', () => {
    render(<Field />)
    type(box(), '@he')
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box()).toHaveValue('@he')
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(box()).toHaveValue('')
  })

  it('turns a keyword into a link when its edit starts with @, as one step', () => {
    render(<Field />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit keyword train' }))
    const edit = screen.getByRole('combobox', { name: 'Keyword train' })
    type(edit, '@man')
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Manhunt'))
    expect(of('line').keywords).toEqual(['rain'])
    expect(of('line').links).toEqual(['hunt'])
    expect(of('hunt').links).toEqual(['line'])
  })

  it('opens a linked node from its chip, and asks before taking a link away from both ends', () => {
    const start = plot().map(n => (n.id === 'line' ? { ...n, links: ['hunt'] } : n.id === 'hunt' ? { ...n, links: ['line'] } : n))
    render(<Field start={start} />)
    expect(screen.getByRole('button', { name: 'Open Manhunt' })).toHaveAttribute('title', 'Crime › Manhunt')
    expect(screen.getByRole('button', { name: 'Open Manhunt' }).closest('.wrLinkChip')).toHaveClass('wrChip') // the keywords' chip, in the node's hue
    fireEvent.click(screen.getByRole('button', { name: 'Remove the link to Manhunt' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Remove the link to Manhunt?' })).getByRole('button', { name: 'Confirm' }))
    expect(of('line').links).toEqual([])
    expect(of('hunt').links).toEqual([])
  })

  it('opens the linked node when its title is clicked', () => {
    const start = plot().map(n => (n.id === 'line' ? { ...n, links: ['hunt'] } : n.id === 'hunt' ? { ...n, links: ['line'] } : n))
    render(<Field start={start} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Manhunt' }))
    expect(screen.getByLabelText('focused')).toHaveTextContent('hunt')
  })

  it('sizes the box by what is typed in it (its placeholder while empty)', () => {
    render(<Field />)
    const grow = box().closest('.wrChipBox') as HTMLElement
    expect(grow).toHaveAttribute('data-value', 'Add keyword or @link…')
    type(box(), 'a very long keyword indeed')
    expect(grow).toHaveAttribute('data-value', 'a very long keyword indeed')
  })
})

describe('linkSuggestions', () => {
  it('keeps to twelve', () => {
    const many = plot().concat(Array.from({ length: 20 }, (_, i) => plotNode(`p${i}`, 'plotline', 'cat2', { title: `Plot ${i}` })))
    const byId = new Map(many.map(n => [n.id, n]))
    expect(linkSuggestions(many.find(n => n.id === 'line')!, many, byId, 'plot')).toHaveLength(12)
  })
})
