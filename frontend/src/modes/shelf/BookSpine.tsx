import type { OutlineNode } from '../../types'

interface Props {
  book: OutlineNode
  wordCount: number
  isActive: boolean
  onClick: () => void
}

// 5px of spine width per 10,000 words of goal, with a floor so a small (or
// unset) goal still renders a clickable spine instead of collapsing to
// nothing.
const MIN_WIDTH = 16
const PX_PER_10K_WORDS = 5
// Used as the progress denominator when a book has no wordCountGoal set, so
// an un-goaled book still renders a reasonable-looking (if static-width)
// spine rather than collapsing to the minimum.
const DEFAULT_GOAL = 60000

function spineWidth(goal: number | null): number {
  return Math.max(MIN_WIDTH, ((goal ?? DEFAULT_GOAL) / 10000) * PX_PER_10K_WORDS)
}

// A book on the shelf: spine width is driven by the book's word-count goal
// (thicker = bigger goal), with a progress-bar fill rising from the bottom
// showing actual word count against that goal.
function BookSpine({ book, wordCount, isActive, onClick }: Props) {
  const goal = book.wordCountGoal ?? DEFAULT_GOAL
  const width = spineWidth(book.wordCountGoal)
  const progress = Math.min(wordCount / goal, 1)
  const accentStyle = book.color ? ({ '--book-accent': book.color } as React.CSSProperties) : undefined

  return (
    <button
      type="button"
      className={`book-spine${isActive ? ' is-active' : ''}`}
      style={{ ...(accentStyle ?? {}), width }}
      onClick={onClick}
      title={`${book.title || 'Untitled'}${book.wordCountGoal ? ` — ${wordCount}/${book.wordCountGoal} words` : ''}`}
    >
      <span className="book-spine__fill" style={{ height: `${Math.round(progress * 100)}%` }} />
      <span className="book-spine__title">{book.title || 'Untitled'}</span>
    </button>
  )
}

export default BookSpine
