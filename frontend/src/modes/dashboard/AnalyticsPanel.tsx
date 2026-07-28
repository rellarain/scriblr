import { useParams } from 'react-router-dom'
import { useAnalytics } from '../../api/analytics'

function ProgressBar({ label, value, target }: { label: string; value: number; target: number | null }) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : value > 0 ? 100 : 0
  return (
    <div className="analytics-panel__progress">
      <div className="analytics-panel__progress-label">
        <span>{label}</span>
        <span>{target != null ? `${value} / ${target}` : value}</span>
      </div>
      <div className="analytics-panel__progress-track">
        <div className="analytics-panel__progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function BarRow({ title, wordCount, max }: { title: string; wordCount: number; max: number }) {
  const pct = max > 0 ? Math.round((wordCount / max) * 100) : 0
  return (
    <div className="analytics-panel__bar-row">
      <span className="analytics-panel__bar-title">{title || 'Untitled'}</span>
      <div className="analytics-panel__bar-track">
        <div className="analytics-panel__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="analytics-panel__bar-value">{wordCount}</span>
    </div>
  )
}

function AnalyticsPanel() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading } = useAnalytics(projectId)

  if (isLoading) return <p>Loading analytics…</p>
  if (!data) return null

  const { totals, goals, perBook, perChapter } = data
  const maxBookWords = Math.max(1, ...perBook.map((b) => b.wordCount))
  const maxChapterWords = Math.max(1, ...perChapter.map((c) => c.wordCount))

  return (
    <div className="analytics-panel">
      <section className="analytics-panel__section">
        <h3>Progress toward goals</h3>
        <ProgressBar label="Total words" value={totals.totalWordCount} target={goals.wordCountTarget} />
        <ProgressBar label="Books" value={totals.bookCount} target={goals.bookCountTarget} />
        <ProgressBar label="Chapters" value={totals.chapterCount} target={goals.chapterCountTarget} />
      </section>

      <section className="analytics-panel__section">
        <h3>Word count by book</h3>
        {perBook.length === 0 && <p className="analytics-panel__empty">No books yet.</p>}
        {perBook.map((book) => (
          <BarRow key={book.nodeId} title={book.title} wordCount={book.wordCount} max={maxBookWords} />
        ))}
      </section>

      <section className="analytics-panel__section">
        <h3>Word count by chapter</h3>
        {perChapter.length === 0 && <p className="analytics-panel__empty">No chapters yet.</p>}
        {perChapter.map((chapter) => (
          <BarRow key={chapter.nodeId} title={chapter.title} wordCount={chapter.wordCount} max={maxChapterWords} />
        ))}
      </section>

      <section className="analytics-panel__section">
        <h3>Totals</h3>
        <ul className="analytics-panel__totals">
          <li>{totals.bookCount} books</li>
          <li>{totals.chapterCount} chapters</li>
          <li>{totals.sceneCount} scenes</li>
          <li>{totals.momentCount} moments</li>
          <li>{totals.totalWordCount} words</li>
        </ul>
      </section>
    </div>
  )
}

export default AnalyticsPanel
