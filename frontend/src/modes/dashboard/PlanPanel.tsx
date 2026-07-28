import { useParams } from 'react-router-dom'
import { useAnalytics } from '../../api/analytics'
import type { ProjectAnalytics } from '../../types'

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
  if (goals.chapterCountTarget != null && totals.chapterCount < goals.chapterCountTarget) {
    tasks.push(
      `${goals.chapterCountTarget - totals.chapterCount} more chapter(s) needed to reach the ${goals.chapterCountTarget}-chapter goal`
    )
  }
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

function PlanPanel() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading } = useAnalytics(projectId)

  if (isLoading) return <p>Loading plan…</p>
  if (!data) return null

  const tasks = buildGoalTasks(data)

  return (
    <div className="plan-panel">
      <section className="plan-panel__section">
        <h3>Open goals</h3>
        {tasks.length === 0 ? (
          <p className="plan-panel__empty">All set goals are currently met.</p>
        ) : (
          <ul className="plan-panel__tasks">
            {tasks.map((task, i) => (
              <li key={i}>{task}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="plan-panel__section">
        <h3>Outstanding flags ({data.flaggedNodes.length})</h3>
        {data.flaggedNodes.length === 0 ? (
          <p className="plan-panel__empty">No flagged items.</p>
        ) : (
          <ul className="plan-panel__flags">
            {data.flaggedNodes.map((node) => (
              <li key={`${node.treeType}-${node.nodeId}`} className="plan-panel__flag-row">
                <span className={`node-flag__toggle node-flag__toggle--${node.flag.type} plan-panel__flag-badge`}>
                  {node.flag.type}
                </span>
                <span className="plan-panel__flag-title">{node.title || 'Untitled'}</span>
                <span className="plan-panel__flag-kind">({node.kind})</span>
                {node.flag.note && <span className="plan-panel__flag-note">— {node.flag.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default PlanPanel
