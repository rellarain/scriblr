import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { outlineNode, projectIndex, standInBackend } from '../../../test/workspaceBackend'
import { holdTile } from '../../../test/tileDrag'
import ProjectOutline from './ProjectOutline'
import { useWriterWorkspace, type WriterWorkspace } from './useWriterWorkspace'

// The Project level's Outline tab at Max: the project's series, books, arcs and chapters as nested cards, each editing its title, summary and colour,
// against the real workspace (so an edit is checked where it lands: the outline).

const OUTLINE = [
  outlineNode('s1', 'series', null, 'Saga'),
  outlineNode('b1', 'book', 's1', 'Dawn'),
  outlineNode('a1', 'arc', 'b1', 'Setting out'),
  outlineNode('c1', 'chapter', 'a1', 'Rain'),
  outlineNode('c2', 'chapter', 'b1', 'Loose', 1),
  outlineNode('b2', 'book', null, 'Dusk', 1),
  outlineNode('c3', 'chapter', 'b2', 'Night'),
]

let latest: WriterWorkspace
function Harness() {
  const w = useWriterWorkspace()
  latest = w
  return w.activeProjectId && w.outlineStatus === 'idle' ? <ProjectOutline w={w} /> : null
}

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})

async function open(backend = standInBackend({ p1: { index: projectIndex('p1', 'First'), outline: OUTLINE, plot: [] } })) {
  const view = render(<Harness />)
  await waitFor(() => expect(latest.projects).toHaveLength(1))
  await act(async () => { await latest.openProject('p1') })
  await screen.findByRole('textbox', { name: 'Series 1 title' })
  return { ...view, backend }
}

const get = (id: string) => latest.outlineNodes.find(n => n.id === id)
const card = (id: string) => document.querySelector(`[data-node="${id}"]`) as HTMLElement
const titles = () => [...document.querySelectorAll<HTMLInputElement>('.wrProjInput')].map(i => i.value)
const expand = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Expand ${name}` }))
const gripOf = (id: string) => card(id).querySelector(':scope > .wrProjTop > .wrGrip') as HTMLElement
const footOf = (id: string) => card(id).querySelector(':scope > .wrProjFoot') as HTMLElement

describe('the cards', () => {
  it('nest series, books, arcs and chapters, with books folded until opened, and remember the fold', async () => {
    const { unmount, backend } = await open()
    expect(titles()).toEqual(['Saga', 'Dawn', 'Dusk']) // the books start folded
    expect(within(card('b1')).getByText('2 chapters')).toBeInTheDocument()
    expand('book 1')
    expect(titles()).toEqual(['Saga', 'Dawn', 'Setting out', 'Rain', 'Loose', 'Dusk'])
    expect(card('a1').contains(card('c1'))).toBe(true)
    expect(card('b1').contains(card('c2'))).toBe(true)
    expect(card('s1').contains(card('b1'))).toBe(true)
    expect(screen.getByRole('textbox', { name: 'Book 1, Arc 1 title' })).toHaveValue('Setting out')
    expect(screen.getByRole('textbox', { name: 'Book 1, Chapter 2 title' })).toHaveValue('Loose') // numbered across the book
    expect(within(card('c2')).getByText('Chapter 2')).toBeInTheDocument()
    unmount()
    await open(backend)
    expect(screen.getByRole('textbox', { name: 'Book 1, Arc 1 title' })).toBeInTheDocument() // still open
    fireEvent.click(screen.getByRole('button', { name: 'Collapse book 1, arc 1' }))
    expect(screen.queryByRole('textbox', { name: 'Book 1, Chapter 1 title' })).toBeNull()
  })

  it('edit the title and summary of a series, book, arc and chapter', async () => {
    await open()
    expand('book 1')
    fireEvent.change(screen.getByRole('textbox', { name: 'Book 1, Arc 1 title' }), { target: { value: 'Leaving' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Book 1, Arc 1 summary' }), { target: { value: 'They go.' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Book 1, Chapter 1 summary' }), { target: { value: 'It rains.' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Series 1 summary' }), { target: { value: 'The whole saga.' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Book 1 summary' }), { target: { value: 'Book one.' } })
    expect([get('a1')?.title, get('a1')?.synopsis, get('c1')?.synopsis, get('s1')?.synopsis, get('b1')?.synopsis])
      .toEqual(['Leaving', 'They go.', 'It rains.', 'The whole saga.', 'Book one.'])
    expect(screen.getByRole('textbox', { name: 'Book 1, Chapter 1 summary' }).tagName).toBe('TEXTAREA')
  })

  it("set an open book's chapter target and word goal", async () => {
    await open()
    expand('book 1')
    const goals = card('b1').querySelector('.wrProjGoals') as HTMLElement
    const [target, words] = within(goals).getAllByRole('textbox')
    fireEvent.change(target, { target: { value: '12' } })
    fireEvent.change(words, { target: { value: '80000' } })
    expect([get('b1')?.chapterCountTarget, get('b1')?.wordCountGoal]).toEqual([12, 80000])
  })

  it('give every series, book, arc and chapter a colour slider, and tint a series in its own colour', async () => {
    await open()
    expand('book 1')
    expand('book 2')
    for (const name of ['Series 1', 'Book 1', 'Book 2', 'Book 1, Arc 1', 'Book 1, Chapter 1', 'Book 1, Chapter 2', 'Book 2, Chapter 1']) expect(screen.getByRole('slider', { name: `${name} colour` })).toBeInTheDocument()
    expect(card('s1').style.getPropertyValue('--wr-node-tint')).toMatch(/^hsl\(/)
    expect(card('b1').style.getPropertyValue('--wr-node-tint')).toBe('')
    const project = latest.projectHue
    fireEvent.change(screen.getByRole('slider', { name: 'Series 1 colour' }), { target: { value: String(project + 40) } })
    expect(get('s1')?.themeHue).toBe((project + 40) % 360)
    expect(latest.levelHueOf(get('b1')!)).toBe((project + 40) % 360) // its book follows
    expect(screen.getByRole('img', { name: `Book 1 colour: ${(project + 40) % 360} degrees` })).toBeInTheDocument()
  })

  it('add an arc and a chapter to a book, and delete a chapter', async () => {
    await open()
    expand('book 2')
    fireEvent.click(within(footOf('b2')).getByRole('button', { name: 'Arc' }))
    fireEvent.click(within(footOf('b2')).getByRole('button', { name: 'Chapter' }))
    const kids = () => latest.outlineNodes.filter(n => n.parentId === 'b2').map(n => n.kind)
    expect(kids()).toEqual(['chapter', 'arc', 'chapter'])
    const night = card('c3')
    fireEvent.click(within(night).getByRole('button', { name: 'Delete' }))
    expect(within(night).getByText('Delete Chapter 1?')).toBeInTheDocument()
    fireEvent.click(within(night).getByRole('button', { name: 'Confirm' }))
    expect(get('c3')).toBeUndefined()
  })

  it('open a folded book or arc when a card is added inside it from the keyboard', async () => {
    await open()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Book 2 title' }), { key: 'Enter', shiftKey: true })
    expect(latest.outlineNodes.filter(n => n.parentId === 'b2' && n.kind === 'chapter')).toHaveLength(2)
    expect(screen.getByRole('textbox', { name: 'Book 2, Chapter 2 title' })).toBeInTheDocument()
  })

  it('open a chapter in the Draft from its Write pencil, and a book from its Open book button', async () => {
    await open()
    expand('book 1')
    fireEvent.click(screen.getByRole('button', { name: 'Write book 1, chapter 1' }))
    expect(latest.activeChapterId).toBe('c1')
    fireEvent.click(screen.getByRole('button', { name: 'Open book 2' }))
    expect(latest.activeBookId).toBe('b2')
  })

  it('move a chapter into another book by dragging its grip', async () => {
    await open()
    expand('book 1')
    expand('book 2')
    const held = holdTile(gripOf('c2'), { x: 2000, y: 2000 })
    // The gap after Book 2's own chapter takes it (every box is at 0, 0 in jsdom: give the gap one).
    const gap = [...card('b2').querySelectorAll('.wrDropGap--open')].at(-1) as HTMLElement
    gap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 10, right: 100, bottom: 10, x: 0, y: 0, toJSON: () => ({}) })
    held.moveTo(50, 5)
    held.drop()
    expect(get('c2')?.parentId).toBe('b2')
  })

  it('let a chapter go into a book or an arc, an arc into a book and a book into a series, and nothing else', async () => {
    await open()
    expand('book 1')
    expand('book 2')
    const openGaps = (id: string | null) => {
      const list = id ? card(id).querySelector(':scope > .wrChildren') : document.querySelector('.wrProjStack > .wrChildren')
      return [...(list?.children ?? [])].filter(el => el.classList.contains('wrDropGap--open')).length
    }
    const drag = (id: string) => holdTile(gripOf(id), { x: 2000, y: 2000 })
    let held = drag('a1')
    expect([openGaps('b2'), openGaps('a1'), openGaps('s1'), openGaps(null)].map(n => n > 0)).toEqual([true, false, false, false])
    held.cancel()
    held = drag('b2')
    expect([openGaps('s1'), openGaps(null), openGaps('b1')].map(n => n > 0)).toEqual([true, true, false])
    held.cancel()
    held = drag('s1')
    expect([openGaps(null), openGaps('b2')].map(n => n > 0)).toEqual([true, false])
    held.cancel()
  })
})

describe('outline templates', () => {
  it("saves a book's shape as a template from its card, and starts a new book from it", async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Save book 1 as a template' }))
    const dialog = screen.getByRole('dialog', { name: 'Save Book 1 as a template' })
    expect(within(dialog).getByText('Arc 1 · Setting out')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Template name'), { target: { value: 'Saga book' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save template' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    const head = document.querySelector('.wrProjHead') as HTMLElement
    fireEvent.click(within(head).getByRole('button', { name: /From a template/ }))
    fireEvent.click(within(head).getByRole('menuitem', { name: /Saga book/ }))
    const books = latest.outlineNodes.filter(n => n.kind === 'book' && n.parentId === null)
    const made = books[books.length - 1]
    expect(made.id).not.toBe('b2')
    const kids = latest.outlineNodes.filter(n => n.parentId === made.id).sort((a, b) => a.order - b.order)
    expect(kids.map(k => [k.kind, k.title])).toEqual([['arc', 'Setting out'], ['chapter', 'Loose']])
    // It opens, so its shape is on view.
    expect(screen.getByRole('textbox', { name: 'Book 3, Arc 1 title' })).toHaveValue('Setting out')
  })

  it('starts a book in a series from a template, or an empty one', async () => {
    await open()
    fireEvent.click(within(footOf('s1')).getByRole('button', { name: /From a template/ }))
    fireEvent.click(within(footOf('s1')).getByRole('menuitem', { name: 'An empty book' }))
    expect(latest.outlineNodes.filter(n => n.kind === 'book' && n.parentId === 's1')).toHaveLength(2)
  })
})
