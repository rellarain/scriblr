import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlotNode } from '../../../api/types'
import PlotView from './PlotView'
import { placing, plotNode, startingPlot, useFakeWorkspace } from './plotTestWorkspace'
import { dragAt, layOutChips, layOutRows } from '../../../test/chips'

// The category Romance also has a multi-select (Genre), a dropdown (Tone) and a short text (Motto); the plotline Meet cute is under it.
const GENRE = { id: 'fGenre', name: 'Genre', kind: 'multi' as const, options: [{ id: 'o1', label: 'Fantasy' }, { id: 'o2', label: 'Romance' }, { id: 'o3', label: 'Crime' }] }
const TONE = { id: 'fTone', name: 'Tone', kind: 'dropdown' as const, options: [{ id: 't1', label: 'Dark' }, { id: 't2', label: 'Light' }] }
const MOTTO = { id: 'fMotto', name: 'Motto', kind: 'text' as const }
const MOOD = { id: 'fMood', name: 'Mood', kind: 'dropdown' as const, options: [{ id: 'm1', label: 'Calm' }, { id: 'm2', label: 'Tense' }, { id: 'm3', label: 'Wild' }] }

const world = (extra: PlotNode[] = []): PlotNode[] => [
  ...startingPlot().map(n => (n.id === 'cat' ? { ...n, customFieldDefs: [...n.customFieldDefs, GENRE, TONE, MOTTO] } : n)),
  ...extra,
]
const withMood = (): PlotNode[] => world().map(n => (n.id === 'cat' ? { ...n, customFieldDefs: [...n.customFieldDefs, MOOD] } : n))
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

  describe('dragging an option by its grip: the chips slide out of the way', () => {
    // The options of a dropdown are chips. Mood has Calm, Tense and Wild; laid out two to a line, they are Calm and Tense on the first line, Wild and the add chip on the second.
    const dragData = () => {
      const data = new Map<string, string>()
      return { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', setDragImage: () => {} }
    }
    const setup = () => {
      const seen = latest()
      render(<Editor start={withMood()} focused="cat" onNodes={seen.onNodes} />)
      open('Mood')
      const group = screen.getByRole('group', { name: 'Options of Mood' })
      const at = layOutChips(group)
      const chip = (label: string) => within(group).getByDisplayValue(label).closest('[data-chip]') as HTMLElement
      const grip = (label: string) => within(chip(label)).getByLabelText('Drag to reorder options')
      const slide = (label: string) => chip(label).style.transform
      const order = () => seen.nodes().find(n => n.id === 'cat')!.customFieldDefs.find(d => d.id === 'fMood')!.options!.map(o => o.id)
      return { group, at, chip, grip, slide, order, dataTransfer: dragData(), add: group.querySelector('[data-chip-tail]') as HTMLElement }
    }

    it('opens a gap where the option will land: the chips it passes take the places beside them, some on another line', () => {
      const { group, at, chip, grip, slide, dataTransfer, add } = setup()
      fireEvent.dragStart(grip('Wild'), { dataTransfer })
      expect(group).not.toHaveClass('wrOptions--sliding') // nothing moves just because a drag has started
      expect(chip('Wild')).toHaveClass('wrOption--dragging')
      dragAt('dragOver', chip('Calm'), at.leftHalf(0), dataTransfer)
      expect(group).toHaveClass('wrOptions--sliding')
      expect(chip('Wild')).toHaveClass('wrOption--lifted')
      expect([slide('Calm'), slide('Tense'), slide('Wild')]).toEqual(['translate(60px, 0px)', 'translate(-60px, 30px)', ''])
      expect(add.style.transform).toBe('')
      // the pointer in the right half of Fantasy: in front of Romance, so only Romance moves
      dragAt('dragOver', chip('Calm'), at.rightHalf(0), dataTransfer)
      expect([slide('Calm'), slide('Tense')]).toEqual(['', 'translate(-60px, 30px)'])
    })

    it('drops where the gap is: in front of an option, or last, below the last line', () => {
      const { at, chip, grip, order, dataTransfer } = setup()
      fireEvent.dragStart(grip('Wild'), { dataTransfer })
      dragAt('dragOver', chip('Calm'), at.leftHalf(0), dataTransfer)
      dragAt('drop', chip('Calm'), at.leftHalf(0), dataTransfer)
      expect(order()).toEqual(['m3', 'm1', 'm2'])
      expect([chip('Calm'), chip('Tense'), chip('Wild')].map(c => c.style.transform)).toEqual(['', '', '']) // the slides are gone once it has dropped
      expect(chip('Wild')).not.toHaveClass('wrOption--lifted')

      fireEvent.dragStart(grip('Wild'), { dataTransfer })
      dragAt('dragOver', chip('Tense'), at.afterAll(), dataTransfer)
      dragAt('drop', chip('Tense'), at.afterAll(), dataTransfer)
      expect(order()).toEqual(['m1', 'm2', 'm3'])
    })

    it('can move an option one place along, which dropping it on the next one never could', () => {
      const { at, chip, grip, order, dataTransfer } = setup()
      fireEvent.dragStart(grip('Calm'), { dataTransfer })
      dragAt('dragOver', chip('Tense'), at.rightHalf(1), dataTransfer) // the right half of Romance: in front of Crime
      expect(chip('Tense').style.transform).toBe('translate(-60px, 0px)')
      dragAt('drop', chip('Tense'), at.rightHalf(1), dataTransfer)
      expect(order()).toEqual(['m2', 'm1', 'm3'])
    })

    it('moves nothing over its own place, and drops there without changing the order', () => {
      const { at, chip, grip, slide, order, dataTransfer } = setup()
      fireEvent.dragStart(grip('Tense'), { dataTransfer })
      dragAt('dragOver', chip('Tense'), at.leftHalf(1), dataTransfer)
      expect([slide('Calm'), slide('Tense'), slide('Wild')]).toEqual(['', '', ''])
      dragAt('drop', chip('Tense'), at.leftHalf(1), dataTransfer)
      expect(order()).toEqual(['m1', 'm2', 'm3'])
    })

    it('puts the slides away when the pointer leaves the options, and when the drag ends', () => {
      const { group, at, chip, grip, slide, dataTransfer } = setup()
      fireEvent.dragStart(grip('Wild'), { dataTransfer })
      dragAt('dragOver', chip('Calm'), at.leftHalf(0), dataTransfer)
      expect(slide('Calm')).toBe('translate(60px, 0px)')
      fireEvent.dragLeave(group, { dataTransfer, relatedTarget: document.body })
      expect([slide('Calm'), slide('Tense')]).toEqual(['', ''])
      expect(chip('Wild')).not.toHaveClass('wrOption--lifted')
      dragAt('dragOver', chip('Calm'), at.leftHalf(0), dataTransfer)
      fireEvent.dragEnd(grip('Wild'), { dataTransfer })
      expect(group).not.toHaveClass('wrOptions--sliding')
      expect([slide('Calm'), slide('Tense')]).toEqual(['', ''])
    })

    it('takes a drop as the drag enters, and ignores a drag that is not an option', () => {
      const { group, at, chip, grip, order, dataTransfer } = setup()
      expect(fireEvent.dragEnter(chip('Calm'), { dataTransfer })).toBe(true) // no option is dragged: not a place to drop
      fireEvent.dragStart(grip('Wild'), { dataTransfer })
      expect(dragAt('dragEnter', chip('Calm'), at.leftHalf(0), dataTransfer)).toBe(false)
      dragAt('drop', group, at.leftHalf(0), dataTransfer)
      expect(order()).toEqual(['m3', 'm1', 'm2'])
    })
  })

  describe('a multi-select: its options and its answers are one column', () => {
    // Genre has Fantasy, Romance and Crime: a row each, laid out 40px tall, 46px apart.
    const dragData = () => {
      const data = new Map<string, string>()
      return { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', setDragImage: () => {} }
    }
    const setup = (start: PlotNode[] = world()) => {
      const seen = latest()
      render(<Editor start={start} focused="cat" onNodes={seen.onNodes} />)
      open('Genre')
      const group = screen.getByRole('group', { name: 'Options of Genre' })
      const at = layOutRows(group)
      const row = (label: string) => within(group).getByDisplayValue(label).closest('[data-field]') as HTMLElement
      const grip = (label: string) => within(row(label)).getByLabelText('Drag to reorder options')
      const slide = (label: string) => row(label).style.transform
      const order = () => seen.nodes().find(n => n.id === 'cat')!.customFieldDefs.find(d => d.id === 'fGenre')!.options!.map(o => o.id)
      return { seen, group, at, row, grip, slide, order, dataTransfer: dragData() }
    }

    it('lists each option once, as a row with a tick box, and no separate list of answers', () => {
      const { group } = setup()
      expect(screen.queryByRole('group', { name: 'Genre answers' })).toBeNull()
      expect(within(group).getAllByRole('checkbox')).toHaveLength(3)
      expect([...group.querySelectorAll<HTMLInputElement>('.wrOptionInput')].map(i => i.value)).toEqual(['Fantasy', 'Romance', 'Crime'])
      expect(within(group).getAllByLabelText('Drag to reorder options')).toHaveLength(3)
      expect(within(group).queryAllByLabelText('Drag plotpoint')).toHaveLength(0) // nothing is ticked yet
    })

    it('makes the answer when a row is ticked: the row is a card with a grip of its own, and counts how often it is placed', () => {
      const start = world([answer('a1', 'cat', 'fGenre', 'Fantasy', { optionId: 'o1', placements: [placing('ch1'), placing('ch2')] })])
      const { row, seen } = setup(start)
      expect(row('Fantasy')).toHaveClass('wrPlotValue', 'wrPlotValue--assigned')
      expect(within(row('Fantasy')).getByLabelText('Placed 2 times')).toHaveTextContent('×2')
      expect(row('Romance')).not.toHaveClass('wrPlotValue')
      fireEvent.click(within(row('Romance')).getByRole('checkbox'))
      expect(row('Romance')).toHaveClass('wrPlotValue')
      expect(within(row('Romance')).queryByLabelText(/^Placed/)).toBeNull()
      // answers are not dragged onto a chapter from a category's editor: no grip for it there
      expect(within(row('Fantasy')).queryByLabelText('Drag plotpoint')).toBeNull()
      expect(seen.nodes().filter(n => n.parentId === 'cat' && n.fieldId === 'fGenre').map(n => n.title)).toEqual(['Fantasy', 'Romance'])
    })

    it("gives a ticked row of a plotline's own field a grip that drags the answer onto a chapter", () => {
      const own = world().map(n => (n.id === 'line'
        ? { ...n, customFieldDefs: [...n.customFieldDefs, { id: 'fOwn', name: 'Own', kind: 'multi' as const, options: [{ id: 'p1', label: 'One' }, { id: 'p2', label: 'Two' }] }] }
        : n))
      render(<Editor start={own} />)
      open('Own')
      const rowOf = (label: string) => screen.getByDisplayValue(label).closest('[data-field]') as HTMLElement
      expect(within(rowOf('One')).queryByLabelText('Drag plotpoint')).toBeNull()
      fireEvent.click(within(rowOf('One')).getByRole('checkbox'))
      const grip = within(rowOf('One')).getByLabelText('Drag plotpoint')
      expect(within(rowOf('Two')).queryByLabelText('Drag plotpoint')).toBeNull()
      fireEvent.dragStart(grip, { dataTransfer: dragData() })
      expect(rowOf('One')).toHaveClass('wrPlotValue--dragging')
      fireEvent.dragEnd(grip)
      expect(rowOf('One')).not.toHaveClass('wrPlotValue--dragging')
    })

    it('asks before unticking a row whose answer is placed, and unticks an unplaced one at once', () => {
      const start = world([answer('a1', 'cat', 'fGenre', 'Fantasy', { optionId: 'o1', placements: [placing('ch1')] }), answer('a2', 'cat', 'fGenre', 'Crime', { optionId: 'o3' })])
      const { row, seen } = setup(start)
      fireEvent.click(within(row('Crime')).getByRole('checkbox'))
      expect(seen.nodes().some(n => n.id === 'a2')).toBe(false)
      fireEvent.click(within(row('Fantasy')).getByRole('checkbox'))
      expect(screen.getByRole('alertdialog')).toHaveTextContent('Untick Fantasy? Its place goes too.')
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(seen.nodes().some(n => n.id === 'a1')).toBe(true)
      fireEvent.click(within(row('Fantasy')).getByRole('checkbox'))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
      expect(seen.nodes().some(n => n.id === 'a1')).toBe(false)
    })

    it('moves a row one place with Alt and Up or Down as well as Left or Right', () => {
      const { seen } = setup()
      const ids = () => seen.nodes().find(n => n.id === 'cat')!.customFieldDefs.find(d => d.id === 'fGenre')!.options!.map(o => o.id)
      fireEvent.keyDown(screen.getByLabelText('Option 1 of Genre'), { key: 'ArrowDown', altKey: true })
      expect(ids()).toEqual(['o2', 'o1', 'o3'])
      fireEvent.keyDown(screen.getByLabelText('Option 3 of Genre'), { key: 'ArrowUp', altKey: true })
      expect(ids()).toEqual(['o2', 'o3', 'o1'])
    })

    it('opens a gap where the option will land: the rows it passes slide a row\'s height, and the dragged row leaves its place', () => {
      const { group, at, row, grip, slide, dataTransfer } = setup()
      fireEvent.dragStart(grip('Crime'), { dataTransfer })
      expect(group).not.toHaveClass('wrOptionRows--sliding') // nothing moves just because a drag has started
      expect(row('Crime')).toHaveClass('wrOptionRow--dragging')
      dragAt('dragOver', row('Fantasy'), at.upperHalf(0), dataTransfer)
      expect(group).toHaveClass('wrOptionRows--sliding')
      expect(row('Crime')).toHaveClass('wrOptionRow--lifted')
      expect([slide('Fantasy'), slide('Romance'), slide('Crime')]).toEqual(['translateY(46px)', 'translateY(46px)', ''])
      // the lower half of Fantasy: in front of Romance, so only Romance moves
      dragAt('dragOver', row('Fantasy'), at.lowerHalf(0), dataTransfer)
      expect([slide('Fantasy'), slide('Romance')]).toEqual(['', 'translateY(46px)'])
    })

    it('drops where the gap is: in front of a row, or last', () => {
      const { at, row, grip, order, slide, dataTransfer } = setup()
      fireEvent.dragStart(grip('Crime'), { dataTransfer })
      dragAt('dragOver', row('Fantasy'), at.upperHalf(0), dataTransfer)
      dragAt('drop', row('Fantasy'), at.upperHalf(0), dataTransfer)
      expect(order()).toEqual(['o3', 'o1', 'o2'])
      expect([slide('Fantasy'), slide('Romance'), slide('Crime')]).toEqual(['', '', '']) // the slides are gone once it has dropped
      expect(row('Crime')).not.toHaveClass('wrOptionRow--lifted')

      fireEvent.dragStart(grip('Crime'), { dataTransfer })
      dragAt('dragOver', row('Romance'), at.lowerHalf(2), dataTransfer)
      dragAt('drop', row('Romance'), at.lowerHalf(2), dataTransfer)
      expect(order()).toEqual(['o1', 'o2', 'o3'])
    })

    it('moves nothing over its own place; the slides are put away when the pointer leaves the options and when the drag ends', () => {
      const { group, at, row, grip, slide, order, dataTransfer } = setup()
      fireEvent.dragStart(grip('Romance'), { dataTransfer })
      dragAt('dragOver', row('Romance'), at.upperHalf(1), dataTransfer)
      expect([slide('Fantasy'), slide('Romance'), slide('Crime')]).toEqual(['', '', ''])
      dragAt('drop', row('Romance'), at.upperHalf(1), dataTransfer)
      expect(order()).toEqual(['o1', 'o2', 'o3'])

      fireEvent.dragStart(grip('Crime'), { dataTransfer })
      dragAt('dragOver', row('Fantasy'), at.upperHalf(0), dataTransfer)
      fireEvent.dragLeave(group, { dataTransfer, relatedTarget: document.body })
      expect([slide('Fantasy'), slide('Romance')]).toEqual(['', ''])
      expect(row('Crime')).not.toHaveClass('wrOptionRow--lifted')
      dragAt('dragOver', row('Fantasy'), at.upperHalf(0), dataTransfer)
      fireEvent.dragEnd(grip('Crime'), { dataTransfer })
      expect(group).not.toHaveClass('wrOptionRows--sliding')
      expect([slide('Fantasy'), slide('Romance')]).toEqual(['', ''])
    })

    it('says to add the options when there are none', () => {
      const bare = world().map(n => (n.id === 'cat' ? { ...n, customFieldDefs: n.customFieldDefs.map(d => (d.id === 'fGenre' ? { ...d, options: [] } : d)) } : n))
      setup(bare)
      expect(screen.getByText('Add the options to choose from.')).toBeInTheDocument()
      expect(screen.getByLabelText('Add option')).toBeInTheDocument()
    })
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
    // the category's answer has no checkbox (only the plotline's own can be changed) and no lock, but a grip like any answer
    expect(genre.getByTitle('Answered on Romance. Change it there.').querySelector('.wrPlotValueLock')).toBeNull()
    expect(genre.getByTitle('Answered on Romance. Change it there.')).toContainElement(genre.getByLabelText('Drag plotpoint'))
    // and Crime, which the category has answered, is not offered again: the other two options are
    expect(genre.getAllByRole('checkbox')).toHaveLength(2)
    expect(genre.queryByRole('checkbox', { name: 'Crime' })).toBeNull()
  })

  it('offers an option again only while the plotline holds its own answer for it, and says when every option is answered above', () => {
    const own = answer('p1', 'line', 'fGenre', 'Crime', { optionId: 'o3' })
    const { unmount } = render(<Editor start={world([answer('c1', 'cat', 'fGenre', 'Crime', { optionId: 'o3' }), own])} />)
    open('Genre')
    // the plotline answered Crime before the category did: it stays, ticked, so that it can be unticked
    expect(block('fGenre').getByRole('checkbox', { name: 'Crime' })).toBeChecked()
    fireEvent.click(block('fGenre').getByRole('checkbox', { name: 'Crime' }))
    expect(block('fGenre').queryByRole('checkbox', { name: 'Crime' })).toBeNull()
    unmount()

    const all = world([answer('c1', 'cat', 'fGenre', 'Fantasy', { optionId: 'o1' }), answer('c2', 'cat', 'fGenre', 'Romance', { optionId: 'o2' }), answer('c3', 'cat', 'fGenre', 'Crime', { optionId: 'o3' })])
    render(<Editor start={all} />)
    open('Genre')
    expect(block('fGenre').queryAllByRole('checkbox')).toHaveLength(0)
    expect(block('fGenre').getByText('Every option is answered above.')).toBeInTheDocument()
  })

  it('keeps every option on the category itself, whatever it has answered', () => {
    render(<Editor start={world([answer('c1', 'cat', 'fGenre', 'Crime', { optionId: 'o3' })])} focused="cat" />)
    open('Genre')
    expect(block('fGenre').getAllByRole('checkbox')).toHaveLength(3)
  })

  it("counts the category's answer where it is placed, and drags it onto a chapter from the plotline", () => {
    const start = world([answer('c1', 'cat', 'fGenre', 'Crime', { optionId: 'o3', placements: [placing('ch1'), placing('ch2')] })])
    const { container } = render(<Editor start={start} />)
    open('Genre')
    const card = block('fGenre').getByTitle('Answered on Romance. Change it there.')
    expect(within(card).getByLabelText('Placed 2 times')).toHaveTextContent('×2')
    const dataTransfer = { setData: () => {}, getData: () => '', effectAllowed: '', setDragImage: () => {} }
    fireEvent.dragStart(within(card).getByLabelText('Drag plotpoint'), { dataTransfer })
    expect(card).toHaveClass('wrPlotValue--dragging')
    // it is listed in the plotline's outline too, where its places are
    expect(container.querySelectorAll('.wrPlotChip[data-point="c1"]')).toHaveLength(2)
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

  it('picks the option of a dropdown: the select becomes the answer as a chip, whose x brings the select back', () => {
    const seen = latest()
    render(<Editor start={world()} onNodes={seen.onNodes} />)
    open('Tone')
    const select = block('fTone').getByLabelText('Tone answer') as HTMLSelectElement
    expect([...select.options].map(o => o.textContent)).toEqual(['None', 'Dark', 'Light'])
    fireEvent.change(select, { target: { value: 't1' } })
    expect(seen.nodes().filter(n => n.parentId === 'line' && n.fieldId === 'fTone').map(n => n.title)).toEqual(['Dark'])
    // the select is gone: the answer is a chip with a grip and an x
    expect(block('fTone').queryByLabelText('Tone answer')).toBeNull()
    expect(block('fTone').getByLabelText('Drag plotpoint')).toBeInTheDocument()
    expect(block('fTone').getByText('Dark', { selector: '.wrAnswerLabel' })).toBeInTheDocument()
    fireEvent.click(block('fTone').getByRole('button', { name: 'Clear the Tone answer' }))
    expect(seen.nodes().some(n => n.parentId === 'line' && n.fieldId === 'fTone')).toBe(false)
    const again = block('fTone').getByLabelText('Tone answer') as HTMLSelectElement
    expect(again.value).toBe('')
    fireEvent.change(again, { target: { value: 't2' } })
    expect(seen.nodes().filter(n => n.parentId === 'line' && n.fieldId === 'fTone').map(n => n.title)).toEqual(['Light'])
  })

  it('shows the count of a placed dropdown answer where the x was, with no select to change it', () => {
    const seen = latest()
    const start = world([answer('a1', 'line', 'fTone', 'Dark', { optionId: 't1', placements: [placing('ch1'), placing('ch2')] })])
    render(<Editor start={start} onNodes={seen.onNodes} />)
    open('Tone')
    expect(block('fTone').queryByLabelText('Tone answer')).toBeNull()
    expect(block('fTone').queryByRole('button', { name: 'Clear the Tone answer' })).toBeNull()
    expect(block('fTone').getByLabelText('Placed 2 times')).toHaveTextContent('×2')
    expect(block('fTone').getByText('Dark', { selector: '.wrAnswerLabel' })).toBeInTheDocument()
    expect(seen.nodes().some(n => n.id === 'a1')).toBe(true)
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
