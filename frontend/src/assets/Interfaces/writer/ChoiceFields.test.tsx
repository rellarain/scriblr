import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlotNode } from '../../../api/types'
import PlotView from './PlotView'
import { placing, plotNode, startingPlot, useFakeWorkspace } from './plotTestWorkspace'

// The category Romance also has a multi-select (Genre), a dropdown (Tone) and a short text (Motto); the plotline Meet cute is under it.
const GENRE = { id: 'fGenre', name: 'Genre', kind: 'multi' as const, options: [{ id: 'o1', label: 'Fantasy' }, { id: 'o2', label: 'Romance' }, { id: 'o3', label: 'Crime' }] }
const TONE = { id: 'fTone', name: 'Tone', kind: 'dropdown' as const, options: [{ id: 't1', label: 'Dark' }, { id: 't2', label: 'Light' }] }
const MOTTO = { id: 'fMotto', name: 'Motto', kind: 'text' as const }

const world = (extra: PlotNode[] = []): PlotNode[] => [
  ...startingPlot().map(n => (n.id === 'cat' ? { ...n, customFieldDefs: [...n.customFieldDefs, GENRE, TONE, MOTTO] } : n)),
  ...extra,
]
const answer = (id: string, parentId: string, fieldId: string, title: string, over: Partial<PlotNode> = {}) =>
  plotNode(id, 'plotpoint', parentId, { title, fieldId, ...over })

function Editor({ start, focused = 'line', onNodes }: { start: PlotNode[]; focused?: string; onNodes?: (n: PlotNode[]) => void }) {
  const { w, plotNodes } = useFakeWorkspace(start, focused)
  onNodes?.(plotNodes)
  return <PlotView w={w} />
}

const open = (name: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Expand ${name}`) }))
const block = (fieldId: string) => within(document.querySelector<HTMLElement>(`[data-field="${fieldId}"]`)!)
const checked = (fieldId: string) => block(fieldId).queryAllByRole('checkbox').filter(b => (b as HTMLInputElement).checked).map(b => b.getAttribute('aria-label') ?? b.parentElement?.textContent)
const latest = () => {
  let nodes: PlotNode[] = []
  return { onNodes: (n: PlotNode[]) => { nodes = n }, nodes: () => nodes }
}

describe('a choice field on the node that defines it', () => {
  it('shows a kind for each field, and lets it be changed while the field has no values', () => {
    render(<Editor start={world()} focused="cat" />)
    const select = screen.getByLabelText('Kind of Genre') as HTMLSelectElement
    expect(select.value).toBe('multi')
    expect((screen.getByLabelText('Kind of Theme') as HTMLSelectElement).value).toBe('points')
    expect([...select.options].map(o => o.textContent)).toEqual(['Plotpoints', 'Multi-select', 'Dropdown', 'Short text'])
    // Theme already has a value (Trust): its kind is fixed
    expect(screen.getByLabelText('Kind of Theme')).toBeDisabled()
    expect(screen.getByLabelText('Kind of Theme')).toHaveAttribute('title', 'A field keeps its kind once it has values.')
    fireEvent.change(select, { target: { value: 'dropdown' } })
    expect((screen.getByLabelText('Kind of Genre') as HTMLSelectElement).value).toBe('dropdown')
  })

  it('opens the field of a new kind, with its options to add', () => {
    render(<Editor start={world()} focused="cat" />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Field' })[0])
    const names = screen.getAllByLabelText('Field name')
    const fresh = names[names.length - 1]
    fireEvent.change(fresh, { target: { value: 'Mood' } })
    fireEvent.change(screen.getByLabelText('Kind of Mood'), { target: { value: 'multi' } })
    expect(screen.getByRole('group', { name: 'Options of Mood' })).toBeInTheDocument()
    expect(screen.getByText('Add the options to choose from.')).toBeInTheDocument()
  })

  it('adds an option with Enter or the plus, cut to 30 characters, and says when one is there already', () => {
    const seen = latest()
    render(<Editor start={world()} focused="cat" onNodes={seen.onNodes} />)
    open('Genre')
    const options = within(screen.getByRole('group', { name: 'Options of Genre' }))
    const add = options.getByLabelText('Add option') as HTMLInputElement
    expect(add.maxLength).toBe(30)
    fireEvent.change(add, { target: { value: 'Horror' } })
    fireEvent.keyDown(add, { key: 'Enter' })
    expect(options.getByLabelText('Option 4 of Genre')).toHaveValue('Horror')
    expect(add.value).toBe('')
    fireEvent.change(add, { target: { value: 'horror' } })
    fireEvent.click(options.getByRole('button', { name: 'Add the option' }))
    expect(screen.getByText('That option is there already.')).toBeInTheDocument()
    expect(seen.nodes().find(n => n.id === 'cat')!.customFieldDefs.find(d => d.id === 'fGenre')!.options).toHaveLength(4)
  })

  it('renames an option in place, dropping one left blank when nothing answers with it', () => {
    const seen = latest()
    render(<Editor start={world()} focused="cat" onNodes={seen.onNodes} />)
    open('Genre')
    const third = screen.getByLabelText('Option 3 of Genre')
    fireEvent.change(third, { target: { value: 'Mystery' } })
    expect(screen.getByLabelText('Option 3 of Genre')).toHaveValue('Mystery')
    fireEvent.change(third, { target: { value: '' } })
    fireEvent.blur(third)
    expect(screen.queryByLabelText('Option 3 of Genre')).toBeNull()
    expect(seen.nodes().find(n => n.id === 'cat')!.customFieldDefs.find(d => d.id === 'fGenre')!.options!.map(o => o.id)).toEqual(['o1', 'o2'])
  })

  it('reorders options with Alt and the arrow keys', () => {
    const seen = latest()
    render(<Editor start={world()} focused="cat" onNodes={seen.onNodes} />)
    open('Genre')
    fireEvent.keyDown(screen.getByLabelText('Option 3 of Genre'), { key: 'ArrowLeft', altKey: true })
    expect(seen.nodes().find(n => n.id === 'cat')!.customFieldDefs.find(d => d.id === 'fGenre')!.options!.map(o => o.id)).toEqual(['o1', 'o3', 'o2'])
    fireEvent.keyDown(screen.getByLabelText('Option 1 of Genre'), { key: 'ArrowRight', altKey: true })
    expect(seen.nodes().find(n => n.id === 'cat')!.customFieldDefs.find(d => d.id === 'fGenre')!.options!.map(o => o.id)).toEqual(['o3', 'o1', 'o2'])
  })

  it('removes an option at once when nothing uses it, and asks first when answers do', () => {
    const seen = latest()
    const used = world([
      answer('a1', 'line', 'fGenre', 'Fantasy', { optionId: 'o1', placements: [placing('ch1'), placing('ch2')] }),
      answer('a2', 'cat', 'fGenre', 'Fantasy', { optionId: 'o1' }),
    ])
    render(<Editor start={used} focused="cat" onNodes={seen.onNodes} />)
    open('Genre')
    fireEvent.click(screen.getByRole('button', { name: 'Remove option Crime' }))
    expect(screen.queryByLabelText('Option 3 of Genre')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove option Fantasy' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Remove Fantasy? 2 answers use it and 2 places go.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Option 1 of Genre')).toHaveValue('Fantasy')
    fireEvent.click(screen.getByRole('button', { name: 'Remove option Fantasy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.queryByLabelText('Option 1 of Genre')).toHaveValue('Romance')
    expect(seen.nodes().some(n => n.optionId === 'o1')).toBe(false)
  })

  it('has its own answer on the category, with no value to write into it', () => {
    const seen = latest()
    render(<Editor start={world()} focused="cat" onNodes={seen.onNodes} />)
    open('Genre')
    expect(block('fGenre').queryByRole('button', { name: /Value/ })).toBeNull()
    fireEvent.click(block('fGenre').getByRole('checkbox', { name: 'Romance' }))
    expect(seen.nodes().filter(n => n.optionId === 'o2').map(n => [n.parentId, n.title])).toEqual([['cat', 'Romance']])
    expect(checked('fGenre')).toEqual(['Romance'])
  })
})

describe('answering on a plotline', () => {
  it('shows the field\'s kind but no way to change it, and the category\'s answer read-only above its own', () => {
    const start = world([answer('c1', 'cat', 'fGenre', 'Crime', { optionId: 'o3' })])
    render(<Editor start={start} />)
    expect(screen.queryByLabelText('Kind of Genre')).toBeNull()
    open('Genre')
    const genre = block('fGenre')
    expect(genre.getByText('Multi-select')).toBeInTheDocument()
    expect(genre.getByText('Category: Romance')).toBeInTheDocument()
    expect(genre.getByText('Crime', { selector: '.wrAnswerLabel' })).toBeInTheDocument()
    expect(genre.getByTitle('Answered on Romance. Change it there.')).toBeInTheDocument()
    expect(genre.getByText('This plotline')).toBeInTheDocument()
    expect(genre.queryByLabelText('Options of Genre')).toBeNull()
    // the category's answer has no grip and no checkbox: only the plotline's own can be changed or dragged
    expect(genre.queryAllByLabelText('Drag plotpoint')).toHaveLength(0)
    expect(genre.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('says so when the category has no answer yet', () => {
    render(<Editor start={world()} />)
    open('Genre')
    expect(block('fGenre').getByText('No answer')).toBeInTheDocument()
  })

  it('ticks and unticks options of a multi-select; a ticked one is a card with a grip', () => {
    const seen = latest()
    render(<Editor start={world()} onNodes={seen.onNodes} />)
    open('Genre')
    fireEvent.click(block('fGenre').getByRole('checkbox', { name: 'Fantasy' }))
    fireEvent.click(block('fGenre').getByRole('checkbox', { name: 'Crime' }))
    expect(seen.nodes().filter(n => n.parentId === 'line' && n.fieldId === 'fGenre').map(n => [n.title, n.optionId])).toEqual([['Fantasy', 'o1'], ['Crime', 'o3']])
    expect(checked('fGenre')).toEqual(['Fantasy', 'Crime'])
    expect(block('fGenre').getAllByLabelText('Drag plotpoint')).toHaveLength(2)
    fireEvent.click(block('fGenre').getByRole('checkbox', { name: 'Fantasy' }))
    expect(seen.nodes().filter(n => n.parentId === 'line' && n.fieldId === 'fGenre').map(n => n.title)).toEqual(['Crime'])
  })

  it('counts an answer that is placed, and asks before unticking it, which takes its places along', () => {
    const seen = latest()
    const start = world([answer('a1', 'line', 'fGenre', 'Fantasy', { optionId: 'o1', placements: [placing('ch1'), placing('ch2')] })])
    render(<Editor start={start} onNodes={seen.onNodes} />)
    open('Genre')
    expect(block('fGenre').getByLabelText('Placed 2 times')).toHaveTextContent('×2')
    fireEvent.click(block('fGenre').getByRole('checkbox', { name: 'Fantasy' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Untick Fantasy? Its 2 places go too.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(seen.nodes().some(n => n.id === 'a1')).toBe(true)
    fireEvent.click(block('fGenre').getByRole('checkbox', { name: 'Fantasy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(seen.nodes().some(n => n.id === 'a1')).toBe(false)
  })

  it('picks the option of a dropdown, shows it as a card, and changes it freely while it is not placed', () => {
    const seen = latest()
    render(<Editor start={world()} onNodes={seen.onNodes} />)
    open('Tone')
    const select = block('fTone').getByLabelText('Tone answer') as HTMLSelectElement
    expect([...select.options].map(o => o.textContent)).toEqual(['None', 'Dark', 'Light'])
    fireEvent.change(select, { target: { value: 't1' } })
    expect(seen.nodes().filter(n => n.parentId === 'line' && n.fieldId === 'fTone').map(n => n.title)).toEqual(['Dark'])
    expect(block('fTone').getByLabelText('Drag plotpoint')).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 't2' } })
    expect(seen.nodes().filter(n => n.parentId === 'line' && n.fieldId === 'fTone').map(n => n.title)).toEqual(['Light'])
    fireEvent.change(select, { target: { value: '' } })
    expect(seen.nodes().some(n => n.parentId === 'line' && n.fieldId === 'fTone')).toBe(false)
  })

  it('asks before a placed dropdown answer is changed or cleared', () => {
    const seen = latest()
    const start = world([answer('a1', 'line', 'fTone', 'Dark', { optionId: 't1', placements: [placing('ch1')] })])
    render(<Editor start={start} onNodes={seen.onNodes} />)
    open('Tone')
    const select = block('fTone').getByLabelText('Tone answer') as HTMLSelectElement
    expect(select.value).toBe('t1')
    fireEvent.change(select, { target: { value: 't2' } })
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Change to Light? Its place goes too.')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(seen.nodes().filter(n => n.parentId === 'line' && n.fieldId === 'fTone').map(n => [n.title, n.placements!.length])).toEqual([['Light', 0]])
    fireEvent.change(select, { target: { value: '' } })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(seen.nodes().some(n => n.parentId === 'line' && n.fieldId === 'fTone')).toBe(false)
  })

  it('writes a short text: the answer is made with the first character and follows the typing', () => {
    const seen = latest()
    render(<Editor start={world()} onNodes={seen.onNodes} />)
    open('Motto')
    const input = block('fMotto').getByLabelText('Motto answer') as HTMLInputElement
    expect(input.maxLength).toBe(50)
    expect(block('fMotto').queryByLabelText('Drag plotpoint')).toBeNull()
    fireEvent.change(input, { target: { value: 'Never ' } })
    expect(seen.nodes().filter(n => n.parentId === 'line' && n.fieldId === 'fMotto').map(n => n.title)).toEqual(['Never '])
    fireEvent.change(input, { target: { value: 'Never again' } })
    expect(seen.nodes().filter(n => n.parentId === 'line' && n.fieldId === 'fMotto').map(n => n.title)).toEqual(['Never again'])
    expect(block('fMotto').getByLabelText('Drag plotpoint')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: ' Never again ' } })
    fireEvent.blur(input)
    expect(seen.nodes().find(n => n.parentId === 'line' && n.fieldId === 'fMotto')!.title).toBe('Never again')
  })

  it('takes the answer away when the text is left blank, unless it is placed; the x clears a placed one after asking', () => {
    const seen = latest()
    const start = world([
      answer('a1', 'line', 'fMotto', 'Never again', { placements: [placing('ch1')] }),
    ])
    render(<Editor start={start} onNodes={seen.onNodes} />)
    open('Motto')
    const input = block('fMotto').getByLabelText('Motto answer') as HTMLInputElement
    expect(block('fMotto').getByLabelText('Placed once')).toHaveTextContent('×1')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(input).toHaveValue('Never again') // placed: it stays
    fireEvent.click(block('fMotto').getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Clear the answer? Its place goes too.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(seen.nodes().some(n => n.id === 'a1')).toBe(false)
    // not placed: leaving it blank takes it away
    fireEvent.change(input, { target: { value: 'Again' } })
    expect(seen.nodes().some(n => n.fieldId === 'fMotto')).toBe(true)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(seen.nodes().some(n => n.fieldId === 'fMotto' && n.parentId === 'line')).toBe(false)
  })

  it('counts the field\'s answers in its head, and has no unassigned count', () => {
    const start = world([answer('a1', 'line', 'fGenre', 'Fantasy', { optionId: 'o1', placements: [placing('ch1')] }), answer('a2', 'line', 'fGenre', 'Crime', { optionId: 'o3' })])
    render(<Editor start={start} />)
    const head = block('fGenre').getByRole('button', { name: /^Expand Genre/ }).closest('.wrFieldHead') as HTMLElement
    expect(within(head).getByTitle('2 answers')).toHaveTextContent('2')
    expect(within(head).getByTitle('1 placement in all')).toHaveTextContent('×1')
  })
})

describe('the keys that add fields', () => {
  it('leave an option and a short text alone: Enter and Shift+Enter in them add no field', () => {
    render(<Editor start={world([answer('m1', 'cat', 'fMotto', 'Never')])} focused="cat" />)
    open('Genre')
    open('Motto')
    const fields = () => screen.getAllByLabelText('Field name').length
    const before = fields()
    fireEvent.keyDown(screen.getByLabelText('Option 1 of Genre'), { key: 'Enter' })
    fireEvent.keyDown(screen.getByLabelText('Option 1 of Genre'), { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(screen.getByLabelText('Motto answer'), { key: 'Enter' })
    fireEvent.keyDown(screen.getByLabelText('Motto answer'), { key: 'Enter', ctrlKey: true })
    expect(fields()).toBe(before)
  })
})
