import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAnalytics } from '../../api/analytics'
import { useProject } from '../../api/projects'
import { useScheduleCompletions, useSetScheduleCompletions } from '../../api/schedule'

function todayLocalDateString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface ScheduleItem {
  id: string
  label: string
}

// The item SET is derived fresh every time from settings + analytics (not
// persisted); only which item ids are checked off is saved, keyed by
// deterministic ids (routine:{id}, priority:{id}, goal:{key}, flag:{treeType}:{nodeId})
// so completion state survives reloads and regenerations of the same items.
function buildItems(
  project: ReturnType<typeof useProject>['data'],
  analytics: ReturnType<typeof useAnalytics>['data']
): ScheduleItem[] {
  if (!project || !analytics) return []
  const items: ScheduleItem[] = []

  const jsDay = new Date().getDay()
  const todayIndex = (jsDay + 6) % 7 // 0=Mon..6=Sun, matching ProjectRoutine.daysOfWeek

  project.index.settings.routines
    .filter((r) => r.daysOfWeek.includes(todayIndex))
    .forEach((r) => {
      items.push({
        id: `routine:${r.id}`,
        label: r.targetWordCount ? `${r.label} (target: ${r.targetWordCount} words)` : r.label,
      })
    })

  project.index.settings.priorities
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 3)
    .forEach((p) => {
      items.push({ id: `priority:${p.id}`, label: p.label })
    })

  const { totals, goals, perBook } = analytics
  if (goals.wordCountTarget != null && totals.totalWordCount < goals.wordCountTarget) {
    items.push({
      id: 'goal:wordCount',
      label: `${goals.wordCountTarget - totals.totalWordCount} words to go on the overall word count goal`,
    })
  }
  perBook.forEach((book) => {
    if (book.chapterCountTarget != null && book.chapterCount < book.chapterCountTarget) {
      items.push({
        id: `goal:chapterCount:${book.nodeId}`,
        label: `"${book.title || 'Untitled book'}" needs ${book.chapterCountTarget - book.chapterCount} more chapter(s)`,
      })
    }
  })

  analytics.flaggedNodes.slice(0, 3).forEach((node) => {
    items.push({
      id: `flag:${node.treeType}:${node.nodeId}`,
      label: `Address ${node.flag.type} flag on "${node.title || 'Untitled'}"`,
    })
  })

  return items
}

function SchedulePanel() {
  const { projectId } = useParams<{ projectId: string }>()
  const date = todayLocalDateString()
  const project = useProject(projectId)
  const analytics = useAnalytics(projectId)
  const { data: completedIds, isLoading: completionsLoading } = useScheduleCompletions(projectId, date)
  const setCompletions = useSetScheduleCompletions(projectId ?? '', date)

  const items = useMemo(() => buildItems(project.data, analytics.data), [project.data, analytics.data])

  if (project.isLoading || analytics.isLoading || completionsLoading) return <p>Loading schedule…</p>

  const completed = new Set(completedIds ?? [])

  function toggle(itemId: string) {
    const next = new Set(completed)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    setCompletions.mutate(Array.from(next))
  }

  return (
    <div className="schedule-panel">
      <h3>Today — {date}</h3>
      {items.length === 0 ? (
        <p className="schedule-panel__empty">
          Nothing generated for today. Add routines, priorities, or goals in Configuration.
        </p>
      ) : (
        <ul className="schedule-panel__items">
          {items.map((item) => (
            <li key={item.id} className="schedule-panel__item">
              <label>
                <input type="checkbox" checked={completed.has(item.id)} onChange={() => toggle(item.id)} />
                <span
                  className={
                    completed.has(item.id)
                      ? 'schedule-panel__item-label is-done'
                      : 'schedule-panel__item-label'
                  }
                >
                  {item.label}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SchedulePanel
