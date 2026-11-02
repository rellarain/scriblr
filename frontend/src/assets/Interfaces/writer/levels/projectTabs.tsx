import { CalendarIcon, ClockIcon, FolderIcon, GearIcon, HelpIcon, OutlineIcon, PlotIcon } from '../../../icons'
import WorkspaceSaveCluster from './WorkspaceSaveCluster'
import { SHELF_COMPONENTS } from '../consoleDefs'
import { Placeholder } from '../shared'
import PlotView from '../PlotView'
import ProjectEditor from '../ProjectEditor'
import ProjectOutline from '../ProjectOutline'
import { nearestOfKind } from '../outlineTree'
import type { HistoryScope, WriterWorkspace } from '../useWriterWorkspace'
import { bookRows, categoryRows, plotCounts } from '../tiles/tileData'
import ProjectConsole from '../plan/ProjectConsole'
import { ProjectSummary } from '../plan/ProjectSummary'
import ScheduleConsole from '../schedule/ScheduleConsole'
import { ScheduleSummary } from '../schedule/ScheduleSummary'
import HelpArticles from './HelpArticles'
import { useTabbedLevel, type LevelTab } from './LevelTabs'

export const PROJECT_HELP_NAMES = ['project', 'shelf', 'project console']
const PROJECT_HELP_FALLBACK = 'The Project level is everything about the open project as a whole: its plot, its outline of series and books, schedule, its project plan (phases, goals, processes, exercises, routines and tasks), history and analytics, and its own settings.'

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

// Opens the node a task is about: an outline chapter (or a scene or act in one) in the Draft level, a book in its outline, a plot node focused in the plot.
function openNode(w: WriterWorkspace, tree: 'outline' | 'plot', id: string) {
  if (tree === 'plot') { w.focusPlotNode(id); return }
  const node = w.outlineNodes.find(n => n.id === id)
  if (node?.kind === 'book') { w.openBook(id); return }
  const chapter = nearestOfKind(w.outlineNodes, id, 'chapter')
  if (chapter) w.openChapter(chapter.id)
}

export function projectTabs(w: WriterWorkspace): LevelTab[] {
  return [
    { id: 'plot', label: 'Plot', Icon: PlotIcon, fill: true, surface: false, titleSlot: true, iconSize: 20, render: c => (c.size === 'max' ? <PlotView w={w} titleSlot={c.titleSlot} /> : <PlotSummary w={w} />) },
    { id: 'outline', label: 'Outline', Icon: OutlineIcon, fill: true, render: c => (c.size === 'max' ? <ProjectOutline w={w} /> : <OutlineSummary w={w} />) },
    {
      id: 'schedule', label: 'Schedule', Icon: CalendarIcon, fill: true, surface: false, titleSlot: true, iconSize: 20,
      render: c => {
        const id = w.activeProjectId
        if (!id) return <p className="wrMuted">Open a project to plan its schedule.</p>
        return c.size === 'max' ? <ScheduleConsole scope="project" titleSlot={c.titleSlot} projectIds={[id]} titles={{ [id]: w.activeProject?.title ?? 'Project' }} onOpenNode={(tree, node) => openNode(w, tree, node)} /> : <ScheduleSummary projectIds={[id]} />
      },
    },
    {
      id: 'plan', label: 'Project', Icon: FolderIcon, fill: true, surface: false, titleSlot: true, iconSize: 20,
      render: c => {
        const id = w.activeProjectId
        if (!id) return <p className="wrMuted">Open a project to plan it.</p>
        const titles = { [id]: w.activeProject?.title ?? 'Project' }
        return c.size === 'max' ? <ProjectConsole scope="project" titleSlot={c.titleSlot} projectIds={[id]} titles={titles} /> : <ProjectSummary projectIds={[id]} titles={titles} />
      },
    },
    { id: 'history', label: 'History', Icon: ClockIcon, render: () => placeholder('projectHistory') },
    { id: 'settings', label: 'Settings', Icon: GearIcon, end: true, surface: true, render: () => <ProjectEditor w={w} /> },
    { id: 'help', label: 'Help', Icon: HelpIcon, render: () => <HelpArticles names={PROJECT_HELP_NAMES} fallback={PROJECT_HELP_FALLBACK} /> },
  ]
}

// What each Project tab edits, for Undo and Redo (the other tabs have nothing to undo).
const PROJECT_SCOPES: Record<string, HistoryScope> = { plot: 'plot', outline: 'outline', settings: 'settings' }

// The Project level's tabs and quick actions (Save, the project's own).
export function useProjectTabs(w: WriterWorkspace, size: 'min' | 'mid' | 'max') {
  return useTabbedLevel({
    storageKey: 'scriblr.writer.project', tabs: projectTabs(w), size, defaultOpen: ['plot'], flush: w.flushAll,
    save: focused => <WorkspaceSaveCluster w={w} scope={focused ? PROJECT_SCOPES[focused] : undefined} />,
  })
}
