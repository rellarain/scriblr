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
import { PlotTray } from '../levels/PlotpointsTab'
import OutlineMax from './OutlineMax'

// The Outline level (with the Project level's Plotpoints tab beside it, where the tray now is) against a small stand-in workspace: the outline and plot live in state and the
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
  const [plotDragId, setPlotDragId] = useState<string | null>(null)
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
    activeChapterId: active, selectChapter: (id: string) => setActive(id), highlightedPointId: null, plotDragId, setPlotDragId,
    saveStatus: { dirty: false, saving: false, error: undefined, lastSavedAt: null }, saveNow: vi.fn(async () => {}), restoreSaved: vi.fn(async () => {}),
    levelHueOf: () => 200, levelTintOf: () => 'hsl(200, 30%, 50%)', hueCentreOf: () => null, setNodeHue: vi.fn(),
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
  return <><PlotTray w={w} /><OutlineMax w={w} /></>
}

const setup = (activeChapterId: string | null = 'c1') => {
  const openChapter = vi.fn()
  const view = render(<Harness activeChapterId={activeChapterId} actions={{ openChapter }} />)
  return { openChapter, user: userEvent.setup(), ...view }
}

// The open chapter's banner on the page (its row in the contents carries the same data-node, and comes first).
const banner = () => document.querySelector<HTMLElement>('.wrChapterBanner')!
const card = (id: string) => document.querySelector<HTMLElement>(`[data-node="${id}"]`)!
// A card's own add button ("+ Act", ...): its text is the kind and nothing else.
const addButton = (within_: HTMLElement, kind: string) => within(within_).getAllByRole('button').find(b => b.textContent?.trim() === kind)!
// The chapter tabs at the book's edge (one each), and the arc tab.
const chapterTabs = () => within(screen.getByRole('navigation', { name: 'Arcs and chapters' })).getAllByRole('button', { name: /^Chapter \d+:/ })
const arcTab = () => screen.getByRole('button', { name: 'Arc 1: Thaw' })
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

describe('Outline Max: the contents', () => {
  it("shows only the chapter picked by its tab: its row and its cards, not the arc or the other chapters", async () => {
    const { user } = setup('c1')
    const nav = screen.getByRole('navigation', { name: 'Arcs and chapters contents' })
    expect(within(nav).getByRole('button', { name: 'Open chapter 1' }).getAttribute('aria-current')).toBe('true')
    expect(within(nav).queryByLabelText('Arc 1 title')).toBeNull()
    expect(within(nav).queryByRole('button', { name: 'Open chapter 2' })).toBeNull()
    expect(document.querySelector('.wrChapterBanner')?.getAttribute('data-node')).toBe('c1')
    expect(document.querySelectorAll('.wrChapterBanner')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Chapter 2: The Harbor Master' }))
    expect(within(nav).getByRole('button', { name: 'Open chapter 2' }).getAttribute('aria-current')).toBe('true')
    expect(within(nav).queryByRole('button', { name: 'Open chapter 1' })).toBeNull()
    expect(document.querySelector('.wrChapterBanner')?.getAttribute('data-node')).toBe('c2')
    expect(document.querySelector('[data-node="m1"]')).toBeNull()
  })

  it("shows only the arc picked by its tab: the arc and each of its chapters' outlines", async () => {
    const { user } = setup('c1')
    await user.click(arcTab())
    const nav = screen.getByRole('navigation', { name: 'Arcs and chapters contents' })
    expect(arcTab().getAttribute('aria-pressed')).toBe('true')
    expect(within(nav).getByLabelText('Arc 1 title')).toHaveProperty('value', 'Thaw')
    expect(within(nav).getByLabelText('Chapter 1 title')).toBeTruthy()
    expect(within(nav).getByLabelText('Chapter 2 title')).toBeTruthy()
    expect(Array.from(document.querySelectorAll('.wrChapterBanner')).map(el => el.getAttribute('data-node'))).toEqual(['c1', 'c2'])
    // No chapter tab is raised while the arc is: choosing one goes back to that chapter alone.
    expect(chapterTabs().every(t => t.getAttribute('aria-pressed') === 'false')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Chapter 2: The Harbor Master' }))
    expect(arcTab().getAttribute('aria-pressed')).toBe('false')
    expect(within(nav).queryByLabelText('Arc 1 title')).toBeNull()
    expect(document.querySelectorAll('.wrChapterBanner')).toHaveLength(1)
  })

  it('opens a book on its first chapter when none is open', () => {
    setup(null)
    expect(document.querySelector('.wrChapterBanner')?.getAttribute('data-node')).toBe('c1')
  })

  it('unfolds the open chapter in the contents: its title, colour and trash', () => {
    setup('c1')
    const nav = screen.getByRole('navigation', { name: 'Arcs and chapters contents' })
    expect(within(nav).getByLabelText('Chapter 1 title')).toHaveProperty('value', 'Ice Out')
    expect(within(nav).getByLabelText('Chapter 1 colour')).toBeTruthy()
    expect(within(nav).queryByLabelText('Chapter 2 title')).toBeNull() // the others are rows to click
  })

  it('edits the open chapter title and an arc title in place', async () => {
    const { user } = setup('c1')
    const title = screen.getByLabelText('Chapter 1 title')
    await user.clear(title)
    await user.type(title, 'Low Tide')
    expect(title).toHaveProperty('value', 'Low Tide')
    expect(within(document.querySelector('.wrChapterBanner') as HTMLElement).getByText('Low Tide')).toBeTruthy()
    await user.click(arcTab())
    const arc = screen.getByLabelText('Arc 1 title')
    await user.type(arc, ' II')
    expect(arc).toHaveProperty('value', 'Thaw II')
  })

  it('adds arcs and chapters from the contents buttons, a new chapter becoming the open one', async () => {
    const { user } = setup('c1')
    const head = document.querySelector<HTMLElement>('.wrCtHead')!
    await user.click(addButton(head, 'Chapter'))
    expect(chapterTabs()).toHaveLength(3)
    expect(document.querySelector('.wrChapterBanner')?.getAttribute('data-node')).toBe('new1')
    await user.click(addButton(head, 'Arc'))
    expect(screen.getAllByRole('button', { name: /^Arc \d+:/ })).toHaveLength(2)
  })

  it('deletes the open chapter after asking, with everything in it', async () => {
    const { user } = setup('c1')
    const detail = document.querySelector<HTMLElement>('.wrCtDetail')!
    await user.click(within(detail).getByRole('button', { name: 'Delete' }))
    expect(within(detail).getByText(/Delete Chapter 1 and everything in it\?/)).toBeTruthy()
    await user.click(within(detail).getByRole('button', { name: 'Confirm' }))
    expect(card('c1')).toBeNull()
    expect(card('m1')).toBeNull()
  })

  it('creates a sibling chapter on Enter in a chapter title', async () => {
    const { user } = setup('c1')
    await user.click(screen.getByLabelText('Chapter 1 title'))
    await user.keyboard('{Enter}')
    expect(chapterTabs()).toHaveLength(3)
    // The new chapter comes after Chapter 1, becomes the open one and has the focus.
    await waitFor(() => expect((document.activeElement as HTMLInputElement).getAttribute('aria-label')).toBe('Chapter 2 title'))
  })
})

describe('Outline Max: the open chapter', () => {
  it('shows what is in it as cards, numbering acts, scenes and moments inside it', () => {
    setup('c1')
    expect(banner().querySelector('[data-node="m1"]')).not.toBeNull()
    expect(within(banner()).getByText('Moment 1')).toBeTruthy()
    expect(within(banner()).getByText('Chapter 1')).toBeTruthy()
  })

  it("shows each card's draft word count, and the chapter's in its banner", () => {
    setup('c1')
    expect(within(card('m1')).getByText('12 words')).toBeTruthy()
    expect(within(banner()).getAllByText('12 words').length).toBeGreaterThan(0)
  })

  it('edits synopses in place', async () => {
    const { user } = setup('c1')
    const synopsis = within(card('m1')).getByPlaceholderText('Moment synopsis')
    await user.type(synopsis, '!')
    expect(synopsis).toHaveProperty('value', 'The pier freezes!')
  })

  it('adds an act, a scene and a moment from the buttons', async () => {
    const { user } = setup('c1')
    await user.click(addButton(banner(), 'Act'))
    expect(banner().querySelectorAll('.wrActCard')).toHaveLength(2)
    await user.click(addButton(card('act'), 'Scene'))
    expect(card('act').querySelectorAll('.wrSceneCard')).toHaveLength(2)
    await user.click(addButton(card('scene'), 'Moment'))
    expect(card('scene').querySelectorAll('.wrMomentCard')).toHaveLength(2)
  })

  it('writes the chapter from its pencil', async () => {
    const { user, openChapter } = setup('c1')
    await user.click(within(banner()).getByRole('button', { name: 'Write chapter 1' }))
    expect(openChapter).toHaveBeenCalledWith('c1')
  })
})

describe('Outline Max: the page edges and tabs', () => {
  it('stand at the right of the cover: a tab for each arc and chapter, the open chapter raised', () => {
    setup('c1')
    const tabs = screen.getByRole('navigation', { name: 'Arcs and chapters' })
    expect(document.querySelectorAll('.wrEdgeLeaves i').length).toBeGreaterThanOrEqual(10)
    expect(within(tabs).getByRole('button', { name: 'Arc 1: Thaw' })).toBeTruthy()
    expect(within(tabs).getByRole('button', { name: 'Chapter 1: Ice Out' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(tabs).getByRole('button', { name: 'Chapter 2: The Harbor Master' }).getAttribute('aria-pressed')).toBe('false')
  })

  it("open a chapter from its tab, the first chapter of an arc from the arc tab, and add one from the plus tab", async () => {
    const { user } = setup('c1')
    await user.click(screen.getByRole('button', { name: 'Chapter 2: The Harbor Master' }))
    expect(document.querySelector('.wrChapterBanner')?.getAttribute('data-node')).toBe('c2')
    await user.click(screen.getByRole('button', { name: 'Arc 1: Thaw' }))
    expect(document.querySelector('.wrChapterBanner')?.getAttribute('data-node')).toBe('c1')
    await user.click(screen.getByRole('button', { name: 'Add chapter' }))
    expect(chapterTabs()).toHaveLength(3)
    expect(document.querySelector('.wrChapterBanner')?.getAttribute('data-node')).toBe('new1')
  })
})

describe('Outline Max: dragging cards', () => {
  it('opens only the gaps a card of that kind belongs in: an act goes among the chapter acts', () => {
    setup('c1')
    fireEvent(card('act').querySelector('.wrGrip')!, Object.assign(createEvent.dragStart(card('act').querySelector('.wrGrip')!), { dataTransfer: dataTransfer() }))
    const openGaps = (list: Element | null) => Array.from(list?.children ?? []).filter(el => el.classList.contains('wrDropGap--open')).length
    const listOf = (el: Element) => Array.from(el.children).find(c => c.classList.contains('wrChildren')) ?? null
    expect(openGaps(listOf(banner()))).toBeGreaterThan(0)
  })

  it("opens only the gaps a chapter belongs in, in a focused arc: among its chapters, not into a chapter", async () => {
    const { user } = setup('c1')
    await user.click(arcTab())
    const grip = card('c2').querySelector('.wrGrip')!
    fireEvent(grip, Object.assign(createEvent.dragStart(grip), { dataTransfer: dataTransfer() }))
    const openGaps = (list: Element | null) => Array.from(list?.children ?? []).filter(el => el.classList.contains('wrDropGap--open')).length
    const listOf = (el: Element) => Array.from(el.children).find(c => c.classList.contains('wrChildren')) ?? null
    expect(openGaps(listOf(card('a1')))).toBeGreaterThan(0)
  })

  it("has no grip on the arc or chapter it is focused on (it has no siblings to move among)", async () => {
    const { user } = setup('c1')
    expect(card('c1').querySelector('.wrCtRow .wrGrip')).toBeNull()
    await user.click(arcTab())
    expect(card('a1').querySelector('.wrCtArcHead .wrGrip')).toBeNull()
    expect(card('c2').querySelector('.wrCtRow .wrGrip')).not.toBeNull()
  })
})

describe('Outline Max: plotpoints', () => {
  it('lists the unassigned plotpoints in the tray (the Project level tab)', () => {
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

  it('places one on the chapter (no eye there) and on an act', () => {
    setup('c1')
    drag(tray().querySelector('[data-point="pp1"]')!, banner())
    drag(tray().querySelector('[data-point="pp2"]')!, card('act'))
    expect(banner().querySelector(':scope > .wrCardPoints [data-point="pp1"]')).not.toBeNull()
    expect(card('act').querySelector('.wrCardPoints [data-point="pp2"]')).not.toBeNull()
    expect(banner().querySelector(':scope > .wrCardPoints .wrEye')).toBeNull()
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
  it("is a strip with the book title and the level's tabs, and the Settings tab opens its fields", async () => {
    const { user } = setup('c1')
    const editor = screen.getByRole('complementary', { name: 'Book cover' })
    expect(within(editor).getByText('Cold Harbor')).toBeTruthy()
    expect(within(editor).queryByLabelText('Book title')).toBeNull()
    const names = within(within(editor).getByRole('toolbar', { name: 'Tabs' })).getAllByRole('button').map(b => b.getAttribute('aria-label'))
    expect(names).toEqual(['Book outline', 'Book details', 'Settings', 'Help'])
    await user.click(within(editor).getByRole('button', { name: 'Settings' }))
    const title = within(editor).getByLabelText('Book title')
    await user.type(title, '!')
    expect(title).toHaveProperty('value', 'Cold Harbor!')
    expect(within(editor).getByLabelText('Book colour')).toBeTruthy()
    expect(within(editor).getByRole('progressbar', { name: 'Word goal progress' }).getAttribute('aria-valuenow')).toBe('1') // 12 of 1,000
  })

  it("edits the book's preview formatting under Settings, and resets it to the defaults", async () => {
    const { user } = setup('c1')
    const editor = screen.getByRole('complementary', { name: 'Book cover' })
    await user.click(within(editor).getByRole('button', { name: 'Settings' }))
    const size = within(editor).getByLabelText('Font size') as HTMLInputElement
    expect(size.value).toBe('17')
    expect((within(editor).getByRole('button', { name: /Reset to the defaults/ }) as HTMLButtonElement).disabled).toBe(true)
    await user.clear(size)
    await user.type(size, '21')
    expect((within(editor).getByLabelText('Font size') as HTMLInputElement).value).toBe('21')
    await user.click(within(editor).getByRole('button', { name: 'Italic' }))
    expect(within(editor).getByRole('button', { name: 'Italic' }).getAttribute('aria-pressed')).toBe('true')
    await user.selectOptions(within(editor).getByLabelText('Preview font'), 'mono')
    expect((within(editor).getByLabelText('Preview font') as HTMLSelectElement).value).toBe('mono')
    // Out-of-range values are held to the limits.
    const spacing = within(editor).getByLabelText('Line spacing') as HTMLInputElement
    await user.clear(spacing)
    await user.type(spacing, '9')
    await user.tab() // leaving the field holds it to the limits
    expect(Number((within(editor).getByLabelText('Line spacing') as HTMLInputElement).value)).toBe(3)

    await user.click(within(editor).getByRole('button', { name: /Reset to the defaults/ }))
    expect((within(editor).getByLabelText('Font size') as HTMLInputElement).value).toBe('17')
    expect(within(editor).getByRole('button', { name: 'Italic' }).getAttribute('aria-pressed')).toBe('false')
  })

  it("opens and closes the stats (on the cover) and the chapter's cards with their tabs", async () => {
    const { user } = setup('c1')
    const editor = screen.getByRole('complementary', { name: 'Book cover' })
    expect(screen.getByRole('region', { name: 'Draft stats' })).toBeTruthy()
    expect(document.querySelector('.wrChapterBanner')).toBeTruthy()

    await user.click(within(editor).getByRole('button', { name: 'Book details' }))
    expect(screen.queryByRole('region', { name: 'Draft stats' })).toBeNull()
    await user.click(within(editor).getByRole('button', { name: 'Book outline' }))
    expect(document.querySelector('.wrChapterBanner')).toBeNull()
    await user.click(within(editor).getByRole('button', { name: 'Book outline' }))
    expect(document.querySelector('.wrChapterBanner')).toBeTruthy()
  })

  it("adds a chapter from the header's New button", async () => {
    const { user } = setup('c1')
    const before = chapterTabs().length
    await user.click(within(screen.getByRole('complementary', { name: 'Book cover' })).getByRole('button', { name: 'New chapter' }))
    expect(chapterTabs().length).toBe(before + 1)
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
