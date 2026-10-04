import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode, PlotNode } from '../../../../api/types'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { awarenessNext } from '../awareness'
import { descendantsOf, buildChildIndex } from '../outlineTree'
import { assignPoint } from '../plotFields'
import { base, outlineNode, plotNode } from '../plotTestWorkspace'
import type { WriterWorkspace } from '../useWriterWorkspace'
import OutlineMax from './OutlineMax'

// The Outline level against a small stand-in workspace: the outline and plot live in state and the
// plotpoint assignment is the real pure function, so what the cards do is what the app does.

vi.mock('../useWordCounts', () => ({
  useWordCounts: () => ({ chapters: { c1: 12 }, books: { b: 12 }, nodes: { b: 12, c1: 12, act: 12, scene: 12, m1: 12 } }),
}))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

const OUTLINE: OutlineNode[] = [
  outlineNode('b', 'book', null, { title: 'Cold Harbor', chapterCountTarget: 10, wordCountGoal: 1000 }),
  outlineNode('a1', 'arc', 'b', { title: 'Thaw' }),
  outlineNode('c1', 'chapter', 'a1', { title: 'Ice Out' }),
  outlineNode('c2', 'chapter', 'a1', { title: 'The Harbor Master', order: 1 }),
  outlineNode('act', 'act', 'c1', { title: 'Act title' }),
  outlineNode('scene', 'scene', 'act'),
  outlineNode('m1', 'moment', 'scene', { synopsis: 'The pier freezes' }),
]
const PLOT: PlotNode[] = [
  plotNode('cat', 'category', null, { title: 'Romance', hue: 200 }),
  plotNode('line', 'plotline', 'cat', { title: 'The Smuggler' }),
  plotNode('pp1', 'plotpoint', 'line', { title: 'They meet', order: 0 }),
  plotNode('pp2', 'plotpoint', 'line', { title: 'A secret', order: 1 }),
]

function Harness({ activeChapterId = 'c1', actions }: { activeChapterId?: string | null; actions: { openChapter: (id: string) => void } }) {
  const [outlineNodes, setOutline] = useState<OutlineNode[]>(OUTLINE)
  const [plotNodes, setPlot] = useState<PlotNode[]>(PLOT)
  const [active, setActive] = useState<string | null>(activeChapterId)
  const counter = useRef(0)
  const outlineRef = useRef(outlineNodes)
  outlineRef.current = outlineNodes
  const plotRef = useRef(plotNodes)
  plotRef.current = plotNodes
  const byId = new Map(outlineNodes.map(n => [n.id, n]))

  const book = byId.get('b')!
  const w = {
    activeBook: book, activeProjectId: 'p1', activeProject: { settings: { timeSystems: [], chapterWordCountTarget: 500 } },
    outlineNodes, plotNodes, plotNodeById: new Map(plotNodes.map(n => [n.id, n])),
    activeBookChapters: descendantsOf(buildChildIndex(outlineNodes), 'b').filter(n => n.kind === 'chapter'),
    activeChapterId: active, selectChapter: (id: string) => setActive(id), highlightedPointId: null,
    saveStatus: { dirty: false, saving: false, error: undefined, lastSavedAt: null }, saveNow: vi.fn(async () => {}), restoreSaved: vi.fn(async () => {}),
    levelHueOf: () => 200, hueCentreOf: () => null, setNodeHue: vi.fn(),
    moveOutlineNodeInto: vi.fn(), openChapter: actions.openChapter,
    addOutlineNode: (parentId: string | null, kind: OutlineNode['kind'], patch: Partial<OutlineNode> = {}, afterId?: string) => {
      const id = `new${++counter.current}`
      const after = afterId ? outlineRef.current.find(n => n.id === afterId) : undefined
      const order = after ? after.order + 0.5 : outlineRef.current.filter(n => n.parentId === parentId).length
      const next = [...outlineRef.current, outlineNode(id, kind, parentId, { title: '', order, ...patch })]
      outlineRef.current = next
      setOutline(next)
      return id
    },
    updateOutlineNode: (id: string, patch: Partial<OutlineNode>) => setOutline(prev => prev.map(n => (n.id === id ? { ...n, ...patch } : n))),
    deleteOutlineNode: (id: string) => setOutline(prev => {
      const gone = new Set([id, ...descendantsOf(buildChildIndex(prev), id).map(n => n.id)])
      return prev.filter(n => !gone.has(n.id))
    }),
    assignPlotpoint: (id: string, target: string | null) => setPlot(prev => assignPoint(prev, id, target, byId)),
    cyclePlotAwareness: (id: string) => setPlot(prev => prev.map(n => (n.id === id && n.awareness ? { ...n, awareness: awarenessNext(n.awareness) } : n))),
  } as unknown as WriterWorkspace
  return <OutlineMax w={w} />
}

const setup = (activeChapterId: string | null = 'c1') => {
  const openChapter = vi.fn()
  const view = render(<Harness activeChapterId={activeChapterId} actions={{ openChapter }} />)
  return { openChapter, user: userEvent.setup(), ...view }
}

const card = (id: string) => document.querySelector<HTMLElement>(`[data-node="${id}"]`)!
// A card's own add button ("+ Act", ...): its text is the kind and nothing else.
const addButton = (within_: HTMLElement, kind: string) => within(within_).getAllByRole('button').find(b => b.textContent?.trim() === kind)!
const tray = () => screen.getByRole('complementary', { name: 'Unassigned plotpoints' })

// jsdom has no DataTransfer: a stand-in carrying just what the handlers touch.
const dataTransfer = () => ({ effectAllowed: '', setData: vi.fn(), setDragImage: vi.fn() })
function drag(from: Element, to: Element) {
  const dt = dataTransfer()
  fireEvent(from, Object.assign(createEvent.dragStart(from), { dataTransfer: dt }))
  fireEvent(to, Object.assign(createEvent.dragOver(to), { dataTransfer: dt }))
  fireEvent(to, Object.assign(createEvent.drop(to), { dataTransfer: dt }))
  fireEvent(from, Object.assign(createEvent.dragEnd(from), { dataTransfer: dt }))
}

describe('Outline Max: the cards', () => {
  it('shows the arcs and chapters, opens only the open chapter, and numbers acts, scenes and moments inside it', () => {
    setup('c1')
    expect(within(card('a1')).getByLabelText('Arc 1 title')).toHaveProperty('value', 'Thaw')
    expect(within(card('c1')).getByLabelText('Chapter 1 title')).toHaveProperty('value', 'Ice Out')
    // The open chapter shows what is in it; the other is closed down to its header.
    expect(card('c1').querySelector('[data-node="m1"]')).not.toBeNull()
    expect(within(card('c1')).getByText('Moment 1')).toBeTruthy()
    expect(card('c2').querySelector('.wrActCard')).toBeNull()
    expect(within(card('c2')).getByRole('button', { name: 'Expand Chapter 2' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('opens and closes a chapter from its chevron', async () => {
    const { user } = setup('c1')
    await user.click(within(card('c1')).getByRole('button', { name: 'Collapse Chapter 1' }))
    expect(card('c1').querySelector('.wrActCard')).toBeNull()
    await user.click(within(card('c1')).getByRole('button', { name: 'Expand Chapter 1' }))
    expect(card('c1').querySelector('.wrActCard')).not.toBeNull()
  })

  it("shows each card's draft word count, and the chapter in its header stats", () => {
    setup('c1')
    expect(within(card('m1')).getByText('12 words')).toBeTruthy()
    expect(within(card('c1')).getAllByText('12 words').length).toBeGreaterThan(0)
    expect(within(card('c2')).getByText('0 words')).toBeTruthy()
  })

  it('edits titles and synopses in place', async () => {
    const { user } = setup('c1')
    const title = within(card('c2')).getByLabelText('Chapter 2 title')
    await user.clear(title)
    await user.type(title, 'Low Tide')
    expect(title).toHaveProperty('value', 'Low Tide')
    const synopsis = within(card('m1')).getByPlaceholderText('Moment synopsis')
    await user.type(synopsis, '!')
    expect(synopsis).toHaveProperty('value', 'The pier freezes!')
  })

  it('adds an act, a scene and a moment from the buttons', async () => {
    const { user } = setup('c1')
    await user.click(addButton(card('c1'), 'Act'))
    expect(card('c1').querySelectorAll('.wrActCard')).toHaveLength(2)
    await user.click(addButton(card('act'), 'Scene'))
    expect(card('act').querySelectorAll('.wrSceneCard')).toHaveLength(2)
    await user.click(addButton(card('scene'), 'Moment'))
    expect(card('scene').querySelectorAll('.wrMomentCard')).toHaveLength(2)
  })

  it('adds arcs and chapters to the book from the head buttons', async () => {
    const { user } = setup('c1')
    const head = document.querySelector<HTMLElement>('.wrOutlineCardsHead')!
    await user.click(addButton(head, 'Chapter'))
    expect(screen.getAllByLabelText(/Chapter \d title/)).toHaveLength(3)
    await user.click(addButton(head, 'Arc'))
    expect(screen.getAllByLabelText(/Arc \d title/)).toHaveLength(2)
  })

  it('writes a chapter from its pencil', async () => {
    const { user, openChapter } = setup('c1')
    await user.click(within(card('c2')).getByRole('button', { name: 'Write chapter 2' }))
    expect(openChapter).toHaveBeenCalledWith('c2')
  })

  it('deletes a chapter after asking, with everything in it', async () => {
    const { user } = setup('c1')
    await user.click(within(card('c1')).getAllByRole('button', { name: 'Delete' }).at(-1)!)
    expect(within(card('c1')).getByText(/Delete Chapter 1 and everything in it\?/)).toBeTruthy()
    await user.click(within(card('c1')).getByRole('button', { name: 'Confirm' }))
    expect(card('c1')).toBeNull()
    expect(card('m1')).toBeNull()
    expect(card('c2')).not.toBeNull()
  })

  it('creates a sibling chapter on Enter and a child act on Shift+Enter', async () => {
    const { user } = setup('c1')
    const title = within(card('c2')).getByLabelText('Chapter 2 title')
    await user.click(title)
    await user.keyboard('{Enter}')
    expect(screen.getAllByLabelText(/Chapter \d title/)).toHaveLength(3)
    // The new chapter comes after Chapter 2 and has the focus.
    await waitFor(() => expect((document.activeElement as HTMLInputElement).getAttribute('aria-label')).toBe('Chapter 3 title'))
    await user.keyboard('Thin Ice{Shift>}{Enter}{/Shift}')
    const created = screen.getByLabelText('Chapter 3 title').closest('[data-node]') as HTMLElement
    expect(created.querySelectorAll('.wrActCard')).toHaveLength(1)
    await waitFor(() => expect((document.activeElement as HTMLInputElement).placeholder).toBe('Act title')) // focus follows once the card is on the page
  })
})

describe('Outline Max: the edge tabs', () => {
  it('has a tab for each arc and chapter, the open chapter raised', () => {
    setup('c1')
    const tabs = screen.getByRole('navigation', { name: 'Arcs and chapters' })
    expect(within(tabs).getByRole('button', { name: 'Arc 1: Thaw' })).toBeTruthy()
    expect(within(tabs).getByRole('button', { name: 'Chapter 1: Ice Out' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(tabs).getByRole('button', { name: 'Chapter 2: The Harbor Master' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('opens a chapter card when its tab is clicked', async () => {
    const { user } = setup('c1')
    const header = () => within(card('c2')).getByRole('button', { name: /Chapter 2$/ })
    expect(header().getAttribute('aria-expanded')).toBe('false')
    await user.click(screen.getByRole('button', { name: 'Chapter 2: The Harbor Master' }))
    expect(header().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Chapter 2: The Harbor Master' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('adds a chapter from its plus tab', async () => {
    const { user } = setup('c1')
    await user.click(screen.getByRole('button', { name: 'Add chapter' }))
    expect(screen.getAllByLabelText(/Chapter \d title/)).toHaveLength(3)
  })
})

describe('Outline Max: dragging cards', () => {
  it('opens only the gaps a card of that kind belongs in: an act goes among its chapter acts, not into an arc or the book', () => {
    setup('c1')
    fireEvent(card('act').querySelector('.wrGrip')!, Object.assign(createEvent.dragStart(card('act').querySelector('.wrGrip')!), { dataTransfer: dataTransfer() }))
    const openGaps = (list: Element | null) => Array.from(list?.children ?? []).filter(el => el.classList.contains('wrDropGap--open')).length
    const listOf = (el: Element) => Array.from(el.children).find(c => c.classList.contains('wrChildren')) ?? null
    expect(openGaps(listOf(card('c1')))).toBeGreaterThan(0)
    expect(openGaps(listOf(card('a1')))).toBe(0)
    expect(openGaps(document.querySelector('.wrOutlineCards > .wrChildren'))).toBe(0)
  })
})

describe('Outline Max: plotpoints', () => {
  it('lists the unassigned plotpoints in the tray', () => {
    setup('c1')
    expect(within(tray()).getByText('They meet')).toBeTruthy()
    expect(within(tray()).getByText('A secret')).toBeTruthy()
    expect(within(tray()).getByText('2')).toBeTruthy()
  })

  it('places a plotpoint dragged from the tray onto a moment, and boxes it in the card with its eye', () => {
    setup('c1')
    drag(tray().querySelector('[data-point="pp1"]')!, card('m1'))
    expect(tray().querySelector('[data-point="pp1"]')).toBeNull()
    const boxed = card('m1').querySelector('.wrCardPoints [data-point="pp1"]')!
    expect(boxed).not.toBeNull()
    expect(within(boxed as HTMLElement).getByRole('button', { name: /Front-stage/i })).toBeTruthy() // the awareness eye, on a moment
  })

  it('places one on a chapter (no eye there) and on an act', () => {
    setup('c1')
    drag(tray().querySelector('[data-point="pp1"]')!, card('c2'))
    drag(tray().querySelector('[data-point="pp2"]')!, card('act'))
    expect(card('c2').querySelector('.wrCardPoints [data-point="pp1"]')).not.toBeNull()
    expect(card('act').querySelector('.wrCardPoints [data-point="pp2"]')).not.toBeNull()
    expect(card('c2').querySelector('.wrEye')).toBeNull()
  })

  it('takes no plotpoint on an arc', () => {
    setup('c1')
    drag(tray().querySelector('[data-point="pp1"]')!, card('a1'))
    expect(tray().querySelector('[data-point="pp1"]')).not.toBeNull()
  })

  it('sends a placed plotpoint back to the tray from its x, or when it is dragged there', async () => {
    const { user } = setup('c1')
    drag(tray().querySelector('[data-point="pp1"]')!, card('m1'))
    await user.click(within(card('m1')).getByRole('button', { name: 'Unassign They meet' }))
    expect(tray().querySelector('[data-point="pp1"]')).not.toBeNull()

    drag(tray().querySelector('[data-point="pp2"]')!, card('scene'))
    drag(card('scene').querySelector('[data-point="pp2"]')!, tray())
    expect(tray().querySelector('[data-point="pp2"]')).not.toBeNull()
    expect(card('scene').querySelector('[data-point="pp2"]')).toBeNull()
  })

  it('counts what is left in the tray', () => {
    setup('c1')
    drag(tray().querySelector('[data-point="pp1"]')!, card('m1'))
    expect(within(tray()).getByText('1')).toBeTruthy()
    drag(tray().querySelector('[data-point="pp2"]')!, card('m1'))
    expect(within(tray()).getByText(/Every plotpoint has a place/)).toBeTruthy()
  })
})

describe('Outline Max: the book editor and the draft stats', () => {
  it('is a strip with the book title, and opens to its fields', async () => {
    const { user } = setup('c1')
    const editor = screen.getByRole('region', { name: 'Book editor' })
    expect(within(editor).getByText('Cold Harbor')).toBeTruthy()
    expect(within(editor).queryByLabelText('Book title')).toBeNull()
    await user.click(within(editor).getByRole('button', { name: /Cold Harbor/ }))
    const title = within(editor).getByLabelText('Book title')
    await user.type(title, '!')
    expect(title).toHaveProperty('value', 'Cold Harbor!')
    expect(within(editor).getByLabelText('Book colour')).toBeTruthy()
    expect(within(editor).getByRole('progressbar', { name: 'Word goal progress' }).getAttribute('aria-valuenow')).toBe('1') // 12 of 1,000
  })

  it("shows the book's words and chapters against their goals, and each chapter's words", () => {
    setup('c1')
    const stats = screen.getByRole('region', { name: 'Draft stats' })
    expect(within(stats).getByText('12 of 1,000')).toBeTruthy()
    expect(within(stats).getByText('2 of 10')).toBeTruthy()
    const chapters = within(within(stats).getByRole('list', { name: 'Words in each chapter' })).getAllByRole('listitem')
    expect(chapters.map(li => li.textContent)).toEqual(['1 · Ice Out12 words of 500', '2 · The Harbor Master0 words of 500'])
  })
})

describe('Outline Max with no chapter open', () => {
  it('starts every chapter closed', () => {
    setup(null)
    expect(document.querySelectorAll('.wrActCard')).toHaveLength(0)
    expect(base).toBeTruthy()
  })
})
