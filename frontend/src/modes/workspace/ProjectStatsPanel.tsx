import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useActivity } from '../../api/activity'
import { useAnalytics } from '../../api/analytics'
import { useOutline, useOutlineHistory, useRevertOutline } from '../../api/outline'
import { usePlotHistory, useRevertPlot } from '../../api/plot'
import type { ActivityLogEntry, ProjectAnalytics } from '../../types'
import { ancestorOfKind } from '../outline/outlineTree'
import TreeDiffView from './TreeDiffView'

function ProgressBar({ label, value, target }: { label: string; value: number; target: number | null }) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : value > 0 ? 100 : 0
  return (
    <div className="project-stats-panel__progress">
      <div className="project-stats-panel__progress-label">
        <span>{label}</span>
        <span>{target != null ? `${value} / ${target}` : value}</span>
      </div>
      <div className="project-stats-panel__progress-track">
        <div className="project-stats-panel__progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function buildGoalTasks(analytics: ProjectAnalytics): string[] {
  const tasks: string[] = []
  const { totals, goals, perBook, perChapter } = analytics

  if (goals.wordCountTarget != null && totals.totalWordCount < goals.wordCountTarget) {
    tasks.push(
      `${goals.wordCountTarget - totals.totalWordCount} more words needed to reach the ${goals.wordCountTarget}-word goal (${totals.totalWordCount} so far)`
    )
  }
  if (goals.bookCountTarget != null && totals.bookCount < goals.bookCountTarget) {
    tasks.push(`${goals.bookCountTarget - totals.bookCount} more book(s) needed to reach the ${goals.bookCountTarget}-book goal`)
  }
  perBook.forEach((book) => {
    if (book.chapterCountTarget != null && book.chapterCount < book.chapterCountTarget) {
      tasks.push(
        `"${book.title || 'Untitled book'}" needs ${book.chapterCountTarget - book.chapterCount} more chapter(s) to reach its ${book.chapterCountTarget}-chapter goal`
      )
    }
  })
  if (goals.bookWordCountTarget != null) {
    const target = goals.bookWordCountTarget
    perBook.forEach((book) => {
      if (book.wordCount < target) {
        tasks.push(`"${book.title || 'Untitled book'}" is ${target - book.wordCount} words short of its ${target}-word target`)
      }
    })
  }
  if (goals.chapterWordCountTarget != null) {
    const target = goals.chapterWordCountTarget
    perChapter.forEach((chapter) => {
      if (chapter.wordCount < target) {
        tasks.push(
          `"${chapter.title || 'Untitled chapter'}" is ${target - chapter.wordCount} words short of its ${target}-word target`
        )
      }
    })
  }
  return tasks
}

// Condensed replacement for the old Dashboard's Activity+Analytics+Plan
// panels: goal progress, open goals, outstanding flags, and a short recent-
// activity list with diff/revert -- no calendar heatmap.
function ProjectStatsPanel() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const analytics = useAnalytics(projectId)
  const activity = useActivity(projectId)
  const { data: outline } = useOutline(projectId)
  const [selected, setSelected] = useState<ActivityLogEntry | null>(null)

  const outlineHistory = useOutlineHistory(projectId)
  const plotHistory = usePlotHistory(projectId)
  const revertOutline = useRevertOutline(projectId ?? '')
  const revertPlot = useRevertPlot(projectId ?? '')

  if (analytics.isLoading || activity.isLoading) return <p>Loading stats…</p>
  if (!analytics.data || !activity.data) return null

  const { totals, goals, perBook, flaggedNodes } = analytics.data
  const tasks = buildGoalTasks(analytics.data)
  const recentLog = activity.data.log.slice(0, 8)

  function fromSnapshotIdFor(entry: ActivityLogEntry): string | undefined {
    const history =
      entry.type === 'outline' ? outlineHistory.data : entry.type === 'plot' ? plotHistory.data : undefined
    if (!history) return undefined
    const index = history.findIndex((s) => s.snapshotId === entry.id)
    return index >= 0 ? history[index + 1]?.snapshotId : undefined
  }

  function handleSelect(entry: ActivityLogEntry) {
    if (entry.type === 'draft' && entry.momentId && outline) {
      const chapter = ancestorOfKind(outline.nodes, entry.momentId, 'chapter')
      const book = chapter ? ancestorOfKind(outline.nodes, chapter.id, 'book') : undefined
      if (chapter && book) {
        navigate(`/project/${projectId}/book/${book.id}/chapter/${chapter.id}/moment/${entry.momentId}`)
      }
      return
    }
    setSelected(entry)
  }

  function handleRevert() {
    if (!selected) return
    const ok = confirm(`Revert the ${selected.type} tree to this version? A safety snapshot is kept if needed.`)
    if (!ok) return
    if (selected.type === 'outline') revertOutline.mutate(selected.id)
    else if (selected.type === 'plot') revertPlot.mutate(selected.id)
  }

  return (
    <div className="project-stats-panel">
      <section className="project-stats-panel__section">
        <h3>Goal progress</h3>
        <ProgressBar label="Total words" value={totals.totalWordCount} target={goals.wordCountTarget} />
        <ProgressBar label="Books" value={totals.bookCount} target={goals.bookCountTarget} />
        {perBook
          .filter((book) => book.chapterCountTarget != null)
          .map((book) => (
            <ProgressBar
              key={book.nodeId}
              label={`"${book.title || 'Untitled'}" chapters`}
              value={book.chapterCount}
              target={book.chapterCountTarget}
            />
          ))}
      </section>

      <section className="project-stats-panel__section">
        <h3>Open goals</h3>
        {tasks.length === 0 ? (
          <p className="project-stats-panel__empty">All set goals are currently met.</p>
        ) : (
          <ul className="project-stats-panel__tasks">
            {tasks.map((task, i) => (
              <li key={i}>{task}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="project-stats-panel__section">
        <h3>Outstanding flags ({flaggedNodes.length})</h3>
        {flaggedNodes.length === 0 ? (
          <p className="project-stats-panel__empty">No flagged items.</p>
        ) : (
          <ul className="project-stats-panel__flags">
            {flaggedNodes.map((node) => (
              <li key={`${node.treeType}-${node.nodeId}`} className="project-stats-panel__flag-row">
                <span className={`node-flag__toggle node-flag__toggle--${node.flag.type} project-stats-panel__flag-badge`}>
                  {node.flag.type}
                </span>
                <span className="project-stats-panel__flag-title">{node.title || 'Untitled'}</span>
                <span className="project-stats-panel__flag-kind">({node.kind})</span>
                {node.flag.note && <span className="project-stats-panel__flag-note">— {node.flag.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="project-stats-panel__section">
        <h3>Recent activity</h3>
        <ul className="project-stats-panel__timeline">
          {recentLog.length === 0 && <li className="project-stats-panel__empty">No activity yet.</li>}
          {recentLog.map((entry) => (
            <li key={`${entry.type}-${entry.id}`}>
              <button
                type="button"
                className={`project-stats-panel__entry project-stats-panel__entry--${entry.type}${
                  selected?.id === entry.id ? ' is-active' : ''
                }`}
                onClick={() => handleSelect(entry)}
              >
                <span className="project-stats-panel__entry-type">{entry.type}</span>
                <span className="project-stats-panel__entry-label">{entry.label}</span>
                <span className="project-stats-panel__entry-date">{new Date(entry.createdAt).toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected && (selected.type === 'outline' || selected.type === 'plot') && (
          <div className="project-stats-panel__detail">
            <TreeDiffView
              projectId={projectId}
              treeType={selected.type}
              fromSnapshotId={fromSnapshotIdFor(selected)}
              toSnapshotId={selected.id}
            />
            <button type="button" className="project-stats-panel__revert" onClick={handleRevert}>
              Revert to this version
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

export default ProjectStatsPanel
