import { BarChartIcon, CalendarIcon, ClockIcon, GearIcon, HelpIcon, ListIcon, PlotIcon, QueueIcon } from '../../../icons'
import { DEFAULT_BOOK_HUE } from '../../../../theme/bookColors'
import { SaveControl } from '../../../../components/SaveControl'
import { SHELF_COMPONENTS } from '../consoleDefs'
import { Placeholder } from '../shared'
import PlotView from '../PlotView'
import ProjectEditor from '../ProjectEditor'
import ProjectOutline from '../ProjectOutline'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { bookRows, categoryRows, plotCounts } from '../tiles/tileData'
import HelpArticles from './HelpArticles'
import PlotpointsTab from './PlotpointsTab'
import { useTabbedLevel, type LevelTab } from './LevelTabs'

export const PROJECT_HELP_NAMES = ['project', 'shelf', 'project console']
const PROJECT_HELP_FALLBACK = 'The Project level is everything about the open project as a whole: its plot, its outline of series and books, schedule, history and analytics, and its own settings.'

const body = (key: string) => SHELF_COMPONENTS.find(c => c.key === key)?.body
const label = (key: string) => SHELF_COMPONENTS.find(c => c.key === key)?.label ?? ''
const placeholder = (key: string) => <Placeholder title={label(key)} body={body(key)} />

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// At Mid the Plot and Outline tabs summarise; the editors themselves are the Max tiles.
function PlotSummary({ w }: { w: WriterWorkspace }) {
  const counts = plotCounts(w.plotNodes)
  const cats = categoryRows(w.plotNodes)
  return (
    <div className="wrSummary">
      <div className="wrBarRow">
        <div className="wrBarLabel"><span>Placed</span><span>{counts.placed} of {counts.values}</span></div>
        <div className="wrBarTrack"><div className="wrBarFill" style={{ width: `${counts.values ? (counts.placed / counts.values) * 100 : 0}%` }} /></div>
      </div>
      {cats.length === 0 && <p className="wrMuted">No plot yet.</p>}
      {cats.map(c => <div key={c.id} className="wrKv"><span>{c.title}</span><span>{plural(c.plotlines, 'plotline')}</span></div>)}
      <p className="wrHint">{plural(counts.plotlines, 'plotline')} · {counts.waiting} waiting. Open the Project to edit the plot.</p>
    </div>
  )
}

function OutlineSummary({ w }: { w: WriterWorkspace }) {
  const books = bookRows(w.outlineNodes)
  return (
    <div className="wrSummary">
      {books.length === 0 && <p className="wrMuted">No books yet.</p>}
      {books.map(b => (
        <button key={b.id} type="button" className="wrOutlineRow" onClick={() => w.openBook(b.id)}>
          <span>{b.title}</span><span className="wrOutlineMeta">{b.chapters} ch</span>
        </button>
      ))}
      <p className="wrHint">Open the Project to arrange series and books.</p>
    </div>
  )
}

function AnalyticsSummary({ w }: { w: WriterWorkspace }) {
  const books = bookRows(w.outlineNodes)
  const max = Math.max(1, ...books.map(b => b.chapters))
  return (
    <div className="wrSummary">
      {books.length === 0 && <p className="wrMuted">No books yet.</p>}
      {books.map(b => (
        <div key={b.id} className="wrBarRow">
          <div className="wrBarLabel"><span>{b.title}</span><span>{b.chapters} chapters</span></div>
          <div className="wrBarTrack"><div className="wrBarFill" style={{ width: `${(b.chapters / max) * 100}%` }} /></div>
        </div>
      ))}
      <p className="wrHint">Word counts and progress are coming.</p>
    </div>
  )
}

export function projectTabs(w: WriterWorkspace): LevelTab[] {
  return [
    { id: 'plot', label: 'Plot', Icon: PlotIcon, fill: true, render: c => (c.size === 'max' ? <PlotView w={w} /> : <PlotSummary w={w} />) },
    { id: 'outline', label: 'Outline', Icon: ListIcon, fill: true, newLabel: 'New book', onNew: () => { w.addOutlineNode(null, 'book', { themeHue: DEFAULT_BOOK_HUE }) }, render: c => (c.size === 'max' ? <ProjectOutline w={w} /> : <OutlineSummary w={w} />) },
    { id: 'plotpoints', label: 'Plotpoints', Icon: QueueIcon, render: () => <PlotpointsTab w={w} /> },
    { id: 'schedule', label: 'Schedule', Icon: CalendarIcon, render: () => placeholder('projectSchedule') },
    { id: 'history', label: 'History', Icon: ClockIcon, render: () => placeholder('projectHistory') },
    { id: 'analytics', label: 'Analytics', Icon: BarChartIcon, render: () => <AnalyticsSummary w={w} /> },
    { id: 'settings', label: 'Settings', Icon: GearIcon, end: true, surface: true, render: () => <ProjectEditor w={w} /> },
    { id: 'help', label: 'Help', Icon: HelpIcon, render: () => <HelpArticles names={PROJECT_HELP_NAMES} fallback={PROJECT_HELP_FALLBACK} /> },
  ]
}

// The Project level's tabs and quick actions (Save, the project's own).
export function useProjectTabs(w: WriterWorkspace, size: 'min' | 'mid' | 'max') {
  return useTabbedLevel({
    storageKey: 'scriblr.writer.project', tabs: projectTabs(w), size, defaultOpen: ['plot'],
    save: <SaveControl status={w.saveStatus} onSave={() => { void w.saveNow() }} onRestore={w.restoreSaved} buttonClassName="wrSmallBtn wrSaveBtn" />,
  })
}
