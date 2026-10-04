import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode, PlotNode } from '../../../../api/types'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { outlineNode, plotNode } from '../plotTestWorkspace'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { BookDetails, BookOutlineList, UnassignedList } from './outlineTabs'
import { PLOT_ORDER_KEY } from '../plotOrder'
import { setKv } from '../../../../settings/settingsStore'

// The Outline level's Mid tabs, side by side here.
const OutlineMid = ({ w }: { w: WriterWorkspace }) => <><UnassignedList w={w} /><BookOutlineList w={w} /><BookDetails w={w} /></>

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

const OUTLINE: OutlineNode[] = [
  outlineNode('b', 'book', null, { title: 'Cold Harbor', chapterCountTarget: 12, wordCountGoal: 80000, synopsis: 'A frozen port.' }),
  outlineNode('a1', 'arc', 'b', { title: 'Thaw' }),
  outlineNode('c1', 'chapter', 'a1', { title: 'Ice Out' }),
  outlineNode('c2', 'chapter', 'b', { title: 'Signal Fire', order: 1 }),
]
const PLOT: PlotNode[] = [
  plotNode('cat', 'category', null, { title: 'Romance' }),
  plotNode('line', 'plotline', 'cat'),
  plotNode('open', 'plotpoint', 'line', { title: 'They meet' }),
  plotNode('placed', 'plotpoint', 'line', { title: 'Already placed', assignedMomentId: 'c1' }),
]

function workspace(over: Partial<WriterWorkspace> = {}): WriterWorkspace {
  return {
    activeBook: OUTLINE[0], activeBookChapters: [OUTLINE[2], OUTLINE[3]], activeChapterId: 'c1',
    outlineNodes: OUTLINE, plotNodes: PLOT, plotNodeById: new Map(PLOT.map(n => [n.id, n])), openChapter: vi.fn(),
    ...over,
  } as unknown as WriterWorkspace
}

describe('OutlineMid', () => {
  it('lists the unassigned plotpoints, then the book outline, then the book details', () => {
    render(<OutlineMid w={workspace()} />)
    const heads = Array.from(document.querySelectorAll('.wrPanelHead')).map(h => h.textContent)
    expect(heads).toEqual(['Unassigned plotpoints1', 'Placed plotpoints1', 'Book outline', 'Book details'])
    expect(screen.getByText('They meet')).toBeTruthy()
    expect(document.querySelector('[data-point="placed"]')).toBeNull() // not among the unassigned
    expect(document.querySelector('[data-placed="placed"]')).toBeTruthy() // but in the placed list
    expect(screen.getByText('A frozen port.')).toBeTruthy()
    expect(screen.getByText('2 of 12 target')).toBeTruthy()
    expect(screen.getByText('80,000')).toBeTruthy()
  })

  it('opens a chapter from its row, and marks the open one', async () => {
    const w = workspace()
    render(<OutlineMid w={w} />)
    const row = screen.getByRole('button', { name: '1 · Ice Out' })
    expect(row.className).toContain('wrOutlineRow--active')
    await userEvent.setup().click(screen.getByRole('button', { name: '2 · Signal Fire' }))
    expect(w.openChapter).toHaveBeenCalledWith('c2')
    expect(screen.getByText('arc')).toBeTruthy()
  })

  it('lists the placed plotpoints with where they are, by the time of their scenes or in story order', () => {
    const outline = [
      outlineNode('b', 'book', null, { title: 'Cold Harbor' }), outlineNode('c1', 'chapter', 'b', { title: 'Ice Out' }),
      outlineNode('s1', 'scene', 'c1', { timeValue: { year: 1024, month: 5, day: 1 } }),
      outlineNode('s2', 'scene', 'c1', { order: 1, timeValue: { year: 1024, month: 1, day: 1 } }),
    ]
    const points = [
      plotNode('cat', 'category', null), plotNode('line', 'plotline', 'cat'),
      plotNode('late', 'plotpoint', 'line', { title: 'Late one', assignedMomentId: 's1' }),
      plotNode('early', 'plotpoint', 'line', { title: 'Early one', assignedMomentId: 's2' }),
    ]
    const w = workspace({
      activeBook: outline[0], outlineNodes: outline, plotNodes: points, plotNodeById: new Map(points.map(n => [n.id, n])),
      activeProject: { settings: { timeSystems: [] } },
    } as unknown as Partial<WriterWorkspace>)
    const placed = () => Array.from(document.querySelectorAll('[data-placed]')).map(el => el.getAttribute('data-placed'))
    const first = render(<OutlineMid w={w} />)
    expect(placed()).toEqual(['early', 'late']) // by time
    first.unmount()
    setKv(PLOT_ORDER_KEY, 'story')
    render(<OutlineMid w={w} />)
    expect(placed()).toEqual(['late', 'early']) // as the outline has them
  })

  it('says so when every plotpoint has a place', () => {
    const placed = PLOT.map(p => (p.id === 'open' ? { ...p, assignedMomentId: 'c2' } : p))
    render(<OutlineMid w={workspace({ plotNodes: placed, plotNodeById: new Map(placed.map(n => [n.id, n])) })} />)
    expect(screen.getByText('Every plotpoint has a place.')).toBeTruthy()
  })
})
