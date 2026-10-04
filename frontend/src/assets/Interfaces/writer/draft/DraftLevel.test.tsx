import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode, PlotNode } from '../../../../api/types'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { descendantsOf, buildChildIndex } from '../outlineTree'
import { outlineNode, plotNode } from '../plotTestWorkspace'
import type { WriterWorkspace } from '../useWriterWorkspace'
import DraftLevel from './DraftLevel'

// The chapter's draft is stood in for by state in the hook's place (the real one talks to the backend).
const INITIAL = vi.hoisted(() => ({ bodies: {} as Record<string, string> }))
vi.mock('../useChapterDraft', async () => {
  const { useState: state } = await import('react')
  return {
    useChapterDraft: () => {
      const [bodies, setBodies] = state<Record<string, string>>(INITIAL.bodies)
      return {
        bodies, status: 'idle', setBody: (id: string, body: string) => setBodies(prev => ({ ...prev, [id]: body })), restore: async () => {},
        error: undefined, saving: false, dirty: false, saveError: undefined, lastSavedAt: null, editedAt: null, flush: async () => {}, saveNow: async () => {},
      }
    },
  }
})
vi.mock('../usePublications', () => ({ usePublications: () => ({ publications: [], publishing: false, error: undefined, publish: async () => {} }) }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  INITIAL.bodies = {}
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

const OUTLINE: OutlineNode[] = [
  outlineNode('s', 'series', null, { title: 'The Saga' }),
  outlineNode('b', 'book', 's', { title: 'Cold Harbor' }),
  outlineNode('a1', 'arc', 'b', { title: 'Thaw' }),
  outlineNode('c1', 'chapter', 'a1', { title: 'Ice Out', synopsis: 'The pier freezes.' }),
  outlineNode('c2', 'chapter', 'a1', { title: 'Signal Fire', order: 1 }),
  outlineNode('a2', 'arc', 'b', { title: 'Freeze', order: 1 }),
  outlineNode('c3', 'chapter', 'a2', { title: 'Frostbite' }),
  outlineNode('act', 'act', 'c1', { title: 'The Thaw Begins' }),
  outlineNode('sc1', 'scene', 'act', { location: 'The pier', action: 'Ice cracks' }),
  outlineNode('sc2', 'scene', 'act', { order: 1 }),
  outlineNode('m1', 'moment', 'sc1', { synopsis: 'First crack' }),
  outlineNode('m2', 'moment', 'sc2', { synopsis: 'Second crack' }),
]
const PLOT: PlotNode[] = [
  plotNode('cat', 'category', null, { title: 'Romance', hue: 200 }),
  plotNode('line', 'plotline', 'cat', { title: 'The Smuggler' }),
  plotNode('onChapter', 'plotpoint', 'line', { title: 'They meet', assignedMomentId: 'c1' }),
  plotNode('onMoment', 'plotpoint', 'line', { title: 'A secret', assignedMomentId: 'm2', awareness: 'front' }),
  plotNode('loose', 'plotpoint', 'line', { title: 'Not placed yet' }),
]

function Harness({ chapterId = 'c1', console_ = 'page', spies }: { chapterId?: string; console_?: 'page' | 'pages'; spies: Record<string, ReturnType<typeof vi.fn>> }) {
  const [outlineNodes, setOutline] = useState<OutlineNode[]>(OUTLINE)
  const ref = useRef(outlineNodes)
  ref.current = outlineNodes
  const byId = new Map(outlineNodes.map(n => [n.id, n]))
  const w = {
    activeProjectId: 'p1', activeProject: { createdAt: '2026-01-01T00:00:00Z', settings: { timeSystems: [], chapterWordCountTarget: 100 } },
    outlineNodes, plotNodes: PLOT, plotNodeById: new Map(PLOT.map(n => [n.id, n])),
    activeBook: byId.get('b'), activeChapter: byId.get(chapterId), activeConsole: console_,
    activeBookChapters: descendantsOf(buildChildIndex(outlineNodes), 'b').filter(n => n.kind === 'chapter'),
    levelHueOf: () => 200, hueCentreOf: () => null, highlightedPointId: null,
    saveStatus: { dirty: false, saving: false, error: undefined, lastSavedAt: null }, saveNow: async () => {}, restoreSaved: async () => {}, flushAll: () => {},
    updateOutlineNode: (id: string, patch: Partial<OutlineNode>) => setOutline(prev => prev.map(n => (n.id === id ? { ...n, ...patch } : n))),
    addOutlineNode: spies.addOutlineNode, selectChapter: spies.selectChapter, showDraft: spies.showDraft, showPreview: spies.showPreview,
    cyclePlotAwareness: vi.fn(),
  } as unknown as WriterWorkspace
  return <DraftLevel w={w} pagesComponent="reaction" onPagesComponent={() => {}} />
}

function setup(props: { chapterId?: string; console_?: 'page' | 'pages' } = {}) {
  const spies = { addOutlineNode: vi.fn(() => 'free1'), selectChapter: vi.fn(), showDraft: vi.fn(), showPreview: vi.fn() }
  const view = render(<Harness {...props} spies={spies} />)
  return { spies, user: userEvent.setup(), ...view }
}

const tile = () => document.querySelector<HTMLElement>('.wrChapterTile')!
const left = () => document.querySelector<HTMLElement>('.wrSpreadLeft')!
const right = () => document.querySelector<HTMLElement>('.wrSpreadRight')!

describe('Draft level: the chapter tile', () => {
  it('stacks the titles above the chapter, outermost first, and names the chapter by its number', () => {
    setup()
    const stack = Array.from(tile().querySelectorAll('.wrParentTag')).map(t => t.textContent)
    expect(stack).toEqual(['SeriesThe Saga', 'BookCold Harbor', 'ArcThaw'])
    expect(within(tile()).getByText('Chapter 1')).toBeTruthy()
  })

  it('edits the chapter title and synopsis in place when clicked', async () => {
    const { user } = setup()
    expect(within(tile()).queryByRole('textbox', { name: 'Chapter title' })).toBeNull()
    await user.click(within(tile()).getByRole('button', { name: /Chapter title: Ice Out/ }))
    const title = within(tile()).getByRole('textbox', { name: 'Chapter title' })
    await user.type(title, ' II')
    expect(title).toHaveProperty('value', 'Ice Out II')
    await user.keyboard('{Enter}') // done
    expect(within(tile()).getByRole('button', { name: /Chapter title: Ice Out II/ })).toBeTruthy()

    await user.click(within(tile()).getByRole('button', { name: /Chapter synopsis: The pier freezes/ }))
    expect(within(tile()).getByRole('textbox', { name: 'Chapter synopsis' })).toHaveProperty('value', 'The pier freezes.')
  })

  it("counts the draft's words live against the chapter goal", async () => {
    const { user } = setup()
    const stats = within(tile()).getByRole('region', { name: 'Chapter draft stats' })
    expect(within(stats).getByText('0 of 100')).toBeTruthy()
    await user.type(within(right()).getByLabelText('Moment 1 draft'), 'one two three')
    expect(within(stats).getByText('3 of 100')).toBeTruthy()
    expect(within(stats).getByRole('progressbar', { name: 'Chapter words' }).getAttribute('aria-valuenow')).toBe('3')
    expect(within(stats).getByText('1 act')).toBeTruthy()
    expect(within(stats).getByText('2 scenes')).toBeTruthy()
  })

  it('keeps the tools (save, publish, Draft | Preview) in the tile', () => {
    setup()
    expect(within(tile()).getByRole('button', { name: 'Publish chapter' })).toBeTruthy()
    expect(within(tile()).getByRole('group', { name: 'Chapter view' })).toBeTruthy()
  })
})

describe('Draft level: the book pages', () => {
  it('lists the plotpoints in the chapter at the top of the right page, read-only, and leaves out the unplaced', () => {
    setup()
    const points = within(right()).getByRole('region', { name: 'Plotpoints in this chapter' })
    expect(within(points).getByText('They meet')).toBeTruthy()
    expect(within(points).getByText('A secret')).toBeTruthy()
    expect(within(points).queryByText('Not placed yet')).toBeNull()
    expect(points.querySelector('[draggable="true"]')).toBeNull()
  })

  it('leaves the left page as the bare strip of paper under the other levels tiles', () => {
    setup()
    expect(left().textContent).toBe('')
  })
})

describe('Draft level: the right page', () => {
  it('shows the acts, scenes and moments as read-only cards around a draft input each', () => {
    setup()
    expect(within(right()).getByText('The Thaw Begins')).toBeTruthy()
    expect(within(right()).queryByPlaceholderText('Act title')).toBeNull()
    expect(within(right()).getByText('First crack')).toBeTruthy()
    expect(within(right()).queryByPlaceholderText('Moment synopsis')).toBeNull()
    expect(within(right()).getAllByRole('textbox')).toHaveLength(2)
  })

  it("shows a scene's own fields as chips, and a later scene's inherited ones faded", () => {
    setup()
    const [first, second] = Array.from(right().querySelectorAll<HTMLElement>('.wrSceneCard'))
    expect(within(first).getByText('The pier').className).not.toContain('--empty')
    expect(within(second).getByText('The pier').className).toContain('wrStripChip--empty')
  })

  it('types into a moment and counts its words', async () => {
    const { user } = setup()
    const first = within(right()).getByLabelText('Moment 1 draft')
    await user.type(first, 'the ice gave way')
    expect(first).toHaveProperty('value', 'the ice gave way')
    const card = first.closest('.wrMomentCard') as HTMLElement
    expect(within(card).getByText('4 words')).toBeTruthy()
  })

  it('folds an act and remembers it', async () => {
    const { user, unmount } = setup()
    await user.click(within(right()).getByRole('button', { name: 'Fold Act 1' }))
    expect(right().querySelector('.wrSceneCard')).toBeNull()
    unmount()
    setup()
    expect(right().querySelector('.wrSceneCard')).toBeNull()
    expect(within(right()).getByRole('button', { name: 'Unfold Act 1' })).toBeTruthy()
  })

  it('is one free draft for a chapter with no outline, created with the first text typed', async () => {
    const { user, spies } = setup({ chapterId: 'c2' })
    expect(within(right()).getByText(/Nothing outlined yet/)).toBeTruthy()
    await user.type(within(right()).getByPlaceholderText('Draft freely, no outline needed…'), 'a')
    expect(spies.addOutlineNode).toHaveBeenCalledTimes(1)
    expect(spies.addOutlineNode).toHaveBeenCalledWith('c2', 'moment', { freeDraft: true, order: -1 })
  })
})

describe('Draft level: Draft | Preview', () => {
  it('has Preview off until there is something to preview', () => {
    setup()
    expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Draft' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('asks for the preview from its button once there is draft text', async () => {
    INITIAL.bodies = { m1: 'The ice gave way beneath the pier.' }
    const { user, spies } = setup()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(spies.showPreview).toHaveBeenCalled()
  })

  it('shows the preview in place of the right page, with its tools, and goes back to the draft', async () => {
    INITIAL.bodies = { m1: 'The ice gave way beneath the pier.' }
    const { user, spies } = setup({ console_: 'pages' })
    const pane = document.querySelector<HTMLElement>('.wrPreviewPane')!
    expect(within(pane).getByText('The ice gave way beneath the pier.')).toBeTruthy()
    expect(within(pane).getByRole('button', { name: 'Reaction' })).toBeTruthy()
    // The tile stays.
    expect(within(tile()).getByText('Chapter 1')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Draft' }))
    expect(spies.showDraft).toHaveBeenCalled()
  })

  it('keeps the tile and takes the cards away when previewing', () => {
    INITIAL.bodies = { m1: 'Some text' }
    setup({ console_: 'pages' })
    expect(document.querySelector('.wrDraftCards')).toBeNull()
    expect(document.querySelector('.wrChapterTile')).not.toBeNull()
  })
})

describe('Draft level: the edge tabs', () => {
  it('jumps to a chapter from its tab, and to the first chapter of an arc from the arc tab', () => {
    const { spies } = setup()
    const tabs = screen.getByRole('navigation', { name: 'Arcs and chapters' })
    expect(within(tabs).getByRole('button', { name: 'Chapter 1: Ice Out' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(tabs).getByRole('button', { name: 'Chapter 3: Frostbite' }))
    expect(spies.selectChapter).toHaveBeenLastCalledWith('c3')
    fireEvent.click(within(tabs).getByRole('button', { name: 'Arc 1: Thaw' }))
    expect(spies.selectChapter).toHaveBeenLastCalledWith('c1')
  })
})
