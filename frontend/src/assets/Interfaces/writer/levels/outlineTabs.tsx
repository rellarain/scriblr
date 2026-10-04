import { useMemo } from 'react'
import { BarChartIcon, GearIcon, HelpIcon, InfoIcon, ListIcon, PlotIcon } from '../../../icons'
import { SaveControl } from '../../../../components/SaveControl'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { buildChildIndex, chaptersOfBook, descendantsOf } from '../outlineTree'
import BookSettings from '../outline/BookSettings'
import { unassignedPlotpoints } from '../outline/outlineModel'
import { textOf } from '../plotFields'
import { PlotOrderToggle, usePlotOrder } from '../plotOrder'
import { assignedLevel, nodeLabel, orderAssignedPlotpoints } from '../plotTree'
import { plotColorVars, plotColors } from '../plotColors'
import { Placeholder } from '../shared'
import { useWordCounts } from '../useWordCounts'
import HelpArticles from './HelpArticles'
import { useTabbedLevel, type LevelTab } from './LevelTabs'

export const OUTLINE_HELP_NAMES = ['outline', 'book']
export const OUTLINE_HELP_FALLBACK = 'The Outline level is the open book: the plotpoints still to place, its arcs, chapters, acts, scenes and moments as cards, its draft stats, and the book’s own settings.'

const kv = (k: string, v: React.ReactNode) => (
  <div className="wrKv"><span>{k}</span><span>{v}</span></div>
)

// The Outline level's tabs, at Mid: the plotpoints still to place, the book's arcs and chapters as
// navigation rows, and the book's facts.
export function UnassignedList({ w }: { w: WriterWorkspace }) {
  const outlineById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const unassigned = useMemo(() => unassignedPlotpoints(w.plotNodes, outlineById, w.plotNodeById), [w.plotNodes, outlineById, w.plotNodeById])
  return (
    <div className="wrOutlineMid">
      <div className="wrPanelHead">Unassigned plotpoints<span className="wrOutlineMeta">{unassigned.length}</span></div>
      {unassigned.length === 0 && <div className="wrMuted">Every plotpoint has a place.</div>}
      {unassigned.map(p => (
        <div key={p.id} className="wrMidPoint" data-point={p.id} style={plotColorVars(plotColors(p, w.plotNodeById))} title={textOf(p, w.plotNodeById).body || undefined}>
          {textOf(p, w.plotNodeById).title}
        </div>
      ))}
      <PlacedList w={w} />
    </div>
  )
}

// The plotpoints already placed in this book, by the time of their scenes or in story order.
export function PlacedList({ w }: { w: WriterWorkspace }) {
  const [order] = usePlotOrder()
  const book = w.activeBook
  const placed = useMemo(() => {
    if (!book) return []
    const byId = new Map(w.outlineNodes.map(n => [n.id, n]))
    const inBook = new Set([book.id, ...descendantsOf(buildChildIndex(w.outlineNodes), book.id).map(n => n.id)])
    const mine = w.plotNodes.filter(p => p.kind === 'plotpoint' && p.assignedMomentId && inBook.has(p.assignedMomentId) && assignedLevel(p, byId) !== 'none')
    return orderAssignedPlotpoints(mine, w.outlineNodes, w.activeProject?.settings.timeSystems ?? [], order)
  }, [book, w.outlineNodes, w.plotNodes, w.activeProject, order])
  if (!book) return null
  const target = (id: string | null) => w.outlineNodes.find(n => n.id === id)
  return (
    <div className="wrPlacedList">
      <div className="wrPanelHead">Placed plotpoints<span className="wrOutlineMeta">{placed.length}</span></div>
      <PlotOrderToggle />
      {placed.length === 0 && <div className="wrMuted">None placed yet.</div>}
      {placed.map(p => (
        <div key={p.id} className="wrMidPoint" data-placed={p.id} style={plotColorVars(plotColors(p, w.plotNodeById))} title={textOf(p, w.plotNodeById).body || undefined}>
          {textOf(p, w.plotNodeById).title}
          <span className="wrMidPointAt">{nodeLabel(target(p.assignedMomentId) ?? book)}</span>
        </div>
      ))}
    </div>
  )
}

export function BookOutlineList({ w }: { w: WriterWorkspace }) {
  const book = w.activeBook
  if (!book) return null
  const index = buildChildIndex(w.outlineNodes)
  const bookChapters = w.activeBookChapters
  return (
    <div className="wrOutlineMid">
      <div className="wrPanelHead">Book outline</div>
      {descendantsOf(index, book.id)
        .filter(n => n.kind === 'arc' || n.kind === 'chapter')
        .map(n => {
          const depth = n.kind === 'chapter' && n.parentId !== book.id ? 1 : 0
          return n.kind === 'arc' ? (
            <div key={n.id} className="wrOutlineRow wrOutlineRow--static" style={{ paddingLeft: 6 }}>
              <span>{nodeLabel(n)}</span><span className="wrOutlineMeta">arc</span>
            </div>
          ) : (
            <button
              key={n.id} type="button" style={{ paddingLeft: 6 + depth * 12 }}
              className={n.id === w.activeChapterId ? 'wrOutlineRow wrOutlineRow--active' : 'wrOutlineRow'}
              onClick={() => w.openChapter(n.id)}
            >
              <span>{bookChapters.findIndex(c => c.id === n.id) + 1} · {nodeLabel(n)}</span>
            </button>
          )
        })}
      {chaptersOfBook(w.outlineNodes, book.id).length === 0 && <div className="wrMuted">No chapters yet.</div>}
    </div>
  )
}

export function BookDetails({ w }: { w: WriterWorkspace }) {
  const book = w.activeBook
  if (!book) return null
  const bookChapters = w.activeBookChapters
  return (
    <div className="wrOutlineMid">
      <div className="wrPanelHead">Book details</div>
      {kv('Title', nodeLabel(book))}
      {kv('Chapters', book.chapterCountTarget ? `${bookChapters.length} of ${book.chapterCountTarget} target` : bookChapters.length)}
      {book.wordCountGoal != null && kv('Word goal', book.wordCountGoal.toLocaleString())}
      {book.synopsis && <div className="wrPanelText">{book.synopsis}</div>}
    </div>
  )
}

function SettingsPane({ w }: { w: WriterWorkspace }) {
  const counts = useWordCounts(w.activeProjectId)
  const book = w.activeBook
  if (!book) return null
  return <BookSettings w={w} book={book} bookWords={counts.books[book.id] ?? 0} compact />
}

// At Max the tabs open and close the parts of the Outline page itself (OutlineMax lays them out),
// so only Mid renders these.
export function outlineTabs(w: WriterWorkspace): LevelTab[] {
  const book = w.activeBook
  return [
    { id: 'unassigned', label: 'Unassigned plotpoints', Icon: PlotIcon, render: () => <UnassignedList w={w} /> },
    {
      id: 'outline', label: 'Book outline', Icon: ListIcon, newLabel: 'New chapter',
      onNew: () => { if (book) w.addOutlineNode(book.id, 'chapter') },
      render: () => <BookOutlineList w={w} />,
    },
    { id: 'details', label: 'Book details', Icon: InfoIcon, render: () => <BookDetails w={w} /> },
    { id: 'settings', label: 'Settings', Icon: GearIcon, end: true, render: () => <SettingsPane w={w} /> },
    { id: 'help', label: 'Help', Icon: HelpIcon, render: () => <HelpArticles names={OUTLINE_HELP_NAMES} fallback={OUTLINE_HELP_FALLBACK} /> },
  ]
}

export function useOutlineTabs(w: WriterWorkspace, size: 'min' | 'mid' | 'max') {
  return useTabbedLevel({
    storageKey: 'scriblr.writer.outline', tabs: outlineTabs(w), size, customMax: true,
    defaultOpen: ['unassigned', 'outline', 'details'], defaultTab: 'outline',
    save: <SaveControl status={w.saveStatus} onSave={() => { void w.saveNow() }} onRestore={w.restoreSaved} buttonClassName="wrSmallBtn wrSaveBtn" />,
  })
}

// Mid's body when no book is open.
export const NoBook = () => <Placeholder title="Book" body="Select a book on the shelf to open it." />
