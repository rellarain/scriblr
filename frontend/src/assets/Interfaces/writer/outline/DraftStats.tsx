import type { OutlineNode, ProjectSettings } from '../../../../api/types'
import { nodeLabel } from '../plotTree'
import { formatWords } from '../wordCount'

// A progress bar toward a goal (none drawn when there is no goal).
function Bar({ current, goal }: { current: number; goal: number | null }) {
  if (!goal || goal <= 0) return null
  const percent = Math.min(100, Math.round((current / goal) * 100))
  return (
    <span className="wrStatBar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} title={`${percent}% of ${goal.toLocaleString()}`}>
      <span className="wrStatBarFill" style={{ width: `${percent}%` }} />
    </span>
  )
}

// The book's draft at a glance: its words and chapters against their goals, and
// each chapter's words against the project's chapter goal. (Every act, scene and
// moment card shows its own count.)
export function DraftStats({ book, chapters, nodeWords, settings }: {
  book: OutlineNode
  chapters: OutlineNode[]
  // Draft words per outline node id (a node with none is absent).
  nodeWords: Record<string, number>
  settings: Pick<ProjectSettings, 'chapterWordCountTarget'> | undefined
}) {
  const bookWords = nodeWords[book.id] ?? 0
  const chapterGoal = settings?.chapterWordCountTarget ?? null
  return (
    <section className="wrDraftStats" aria-label="Draft stats">
      <div className="wrDraftStatsHead"><span>Draft stats</span></div>
      <div className="wrDraftStatsRow">
        <span className="wrStatLabel">Words</span>
        <span className="wrStatValue">
          {bookWords.toLocaleString()}{book.wordCountGoal ? ` of ${book.wordCountGoal.toLocaleString()}` : ''}
        </span>
        <Bar current={bookWords} goal={book.wordCountGoal} />
      </div>
      <div className="wrDraftStatsRow">
        <span className="wrStatLabel">Chapters</span>
        <span className="wrStatValue">{chapters.length}{book.chapterCountTarget ? ` of ${book.chapterCountTarget}` : ''}</span>
        <Bar current={chapters.length} goal={book.chapterCountTarget} />
      </div>
      {chapters.length > 0 && (
        <ol className="wrDraftStatsChapters" aria-label="Words in each chapter">
          {chapters.map((c, i) => {
            const words = nodeWords[c.id] ?? 0
            return (
              <li key={c.id}>
                <span className="wrStatChapter">{i + 1} · {nodeLabel(c)}</span>
                <span className="wrStatValue">{formatWords(words)}{chapterGoal ? ` of ${chapterGoal.toLocaleString()}` : ''}</span>
                <Bar current={words} goal={chapterGoal} />
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

export default DraftStats
