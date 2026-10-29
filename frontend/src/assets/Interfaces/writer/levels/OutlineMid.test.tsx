import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode, PlotNode } from '../../../../api/types'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { outlineNode, placing, plotNode } from '../plotTestWorkspace'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { BookDetails, BookOutlineList } from './outlineTabs'
import { PlacedList, PlotTray } from './PlotpointsTab'
import { PLOT_ORDER_KEY } from '../plotOrder'
import { setKv } from '../../../../settings/settingsStore'
import { mockFetch } from '../../../../test/mockFetch'
import { makeWorkspace, type WorkspaceOverrides } from '../../../../test/makeWorkspace'

// The Outline level's Mid tabs and the Project level's Plotpoints tab, side by side here.
const OutlineMid = ({ w }: { w: WriterWorkspace }) => <><PlotTray w={w} /><PlacedList w={w} /><BookOutlineList w={w} /><BookDetails w={w} /></>

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
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
  plotNode('placed', 'plotpoint', 'line', { title: 'Already placed', placements: [placing('c1')] }),
]

function workspace(over: WorkspaceOverrides = {}): WriterWorkspace {
  return makeWorkspace({
    activeBook: OUTLINE[0], activeBookChapters: [OUTLINE[2], OUTLINE[3]], activeChapterId: 'c1',
    outlineNodes: OUTLINE, plotNodes: PLOT, plotNodeById: new Map(PLOT.map(n => [n.id, n])), openChapter: vi.fn(),
    ...over,
  })
}

describe('OutlineMid', () => {
  it('lists the plotpoints (placed ones too) and the placements, then the book outline, then the book details', () => {
    render(<OutlineMid w={workspace()} />)
    const heads = Array.from(document.querySelectorAll('.wrPanelHead, .wrChapterPointsHead')).map(h => h.textContent)
    expect(heads).toEqual(['Plotpoints2', 'Placed in Cold Harbor1', 'Book outline', 'Book details'])
    expect(screen.getByText('They meet')).toBeTruthy()
    expect(document.querySelector('.wrPlotTray [data-point="placed"]')).toBeTruthy() // a placed plotpoint stays in the tray...
    expect(within(document.querySelector<HTMLElement>('.wrPlotTray [data-point="placed"]')!).getByLabelText('Placed once')).toBeTruthy() // ...with its counter
    expect(document.querySelector('[data-placed="placed"]')).toBeTruthy() // and is in the placed list
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
      plotNode('late', 'plotpoint', 'line', { title: 'Late one', placements: [placing('s1')] }),
      plotNode('early', 'plotpoint', 'line', { title: 'Early one', placements: [placing('s2')] }),
      plotNode('twice', 'plotpoint', 'line', { title: 'Twice', order: 1, placements: [placing('s1', null, 'twice-s1'), placing('s2', null, 'twice-s2')] }),
    ]
    const w = workspace({
      activeBook: outline[0], outlineNodes: outline, plotNodes: points, plotNodeById: new Map(points.map(n => [n.id, n])),
      activeProject: { settings: { timeSystems: [] } },
    } )
    // One row for every placement: a plotpoint placed twice is listed twice, each at its own place.
    const placed = () => Array.from(document.querySelectorAll('[data-placed]')).map(el => el.getAttribute('data-placed'))
    const first = render(<OutlineMid w={w} />)
    expect(placed()).toEqual(['early', 'twice', 'late', 'twice']) // by time
    first.unmount()
    setKv(PLOT_ORDER_KEY, 'story')
    render(<OutlineMid w={w} />)
    expect(placed()).toEqual(['late', 'twice', 'early', 'twice']) // as the outline has them
  })

  it('says so when every plotpoint has a place, with the tray narrowed to what is still to place', () => {
    setKv('scriblr.writer.trayStillToPlace', true)
    const placed = PLOT.map(p => (p.id === 'open' ? { ...p, placements: [placing('c2')] } : p))
    render(<OutlineMid w={workspace({ plotNodes: placed, plotNodeById: new Map(placed.map(n => [n.id, n])) })} />)
    expect(screen.getByText(/Every plotpoint has a place/)).toBeTruthy()
  })
})
