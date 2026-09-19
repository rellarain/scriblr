import type { OutlineNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { BOOK_COMPONENTS, HELP_COMPONENT, SETTINGS_COMPONENT } from './consoleDefs'
import { ChapterTabs, ConsoleTitleRow, NumberInput, Placeholder } from './shared'
import BookOutline from './BookOutline'
import { useWordCounts } from './useWordCounts'

// The 20 cover designs a book can wear, dark to light across the hues.
const COVER_COLORS = [
  '#5a3a1e', '#4d2a3f', '#22485c', '#2f4a36', '#7a2e2e',
  '#a0522d', '#b8732a', '#c9b458', '#8a9a3b', '#3f7a4a',
  '#2e7a72', '#3a8fb0', '#3d5fa8', '#5b4bb0', '#7a6ad9',
  '#8e3f8e', '#c0507a', '#d96aa5', '#6b6b6b', '#2b2b33',
]
const DEFAULT_COVER = COVER_COLORS[0]

// Relative luminance (0 dark .. 1 light) of a #rrggbb colour.
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const LIGHT_COVER = 0.25

// A goal input: the actual count sits above it at the far right of the label,
// and a progress bar along the input's footer fills toward the goal.
function GoalField({ label, current, goal, onChange }: {
  label: string
  current: number
  goal: number | null
  onChange: (value: number | null) => void
}) {
  const percent = goal && goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0
  return (
    <label className="wrCoverField">
      <span className="wrCoverFieldHead">
        <span>{label}</span>
        <span className="wrCoverCurrent" title="Current">{current.toLocaleString('en-US')}</span>
      </span>
      <span className="wrCoverInput">
        <NumberInput value={goal} onChange={onChange} />
        <span
          className="wrProgress" role="progressbar" aria-label={`${label} progress`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} title={`${percent}%`}
        >
          <span className="wrProgressFill" style={{ width: `${percent}%` }} />
        </span>
      </span>
    </label>
  )
}

// The book editor is the book's cover: full height of the console, square
// corners, with the chapter tabs sticking out of its right edge.
function BookCover({ w, book }: { w: WriterWorkspace; book: OutlineNode }) {
  const chapters = w.activeBookChapters
  const cover = book.color ?? DEFAULT_COVER
  const counts = useWordCounts(w.activeProjectId)

  return (
    <div className={luminance(cover) > LIGHT_COVER ? 'wrCoverWrap wrCoverWrap--light' : 'wrCoverWrap'} style={{ ['--wr-cover' as string]: cover }}>
      <div className="wrCover">
        <div className="wrCoverSpine" />
        <div className="wrCoverFrame">
          <div className="wrCoverHead">
            <input
              className="wrCoverTitle" value={book.title} placeholder="Book title" aria-label="Book title"
              onChange={e => w.updateOutlineNode(book.id, { title: e.target.value })}
            />
            <span className="wrCoverRule" />
          </div>

          <div className="wrCoverSummary">
            <label className="wrCoverField">
              <span>Summary</span>
              <textarea
                rows={3} value={book.synopsis} placeholder="What is this book about?"
                onChange={e => w.updateOutlineNode(book.id, { synopsis: e.target.value })}
              />
            </label>
            <div className="wrSwatches" role="group" aria-label="Cover design">
              {COVER_COLORS.map(c => (
                <button
                  key={c} type="button" title="Cover design" aria-label={`Cover color ${c}`} aria-pressed={c === cover}
                  className={c === cover ? 'wrSwatch wrSwatch--active' : 'wrSwatch'}
                  style={{ backgroundColor: c }}
                  onClick={() => w.updateOutlineNode(book.id, { color: c })}
                />
              ))}
            </div>
          </div>

          <div className="wrCoverRow">
            <GoalField
              label="Chapter target" current={chapters.length} goal={book.chapterCountTarget}
              onChange={n => w.updateOutlineNode(book.id, { chapterCountTarget: n })}
            />
            <GoalField
              label="Word goal" current={counts.books[book.id] ?? 0} goal={book.wordCountGoal}
              onChange={n => w.updateOutlineNode(book.id, { wordCountGoal: n })}
            />
          </div>

          <BookOutline w={w} book={book} chapterWords={counts.chapters} />
        </div>
      </div>
      <ChapterTabs
        variant="cover" chapters={chapters} activeId={w.activeChapterId}
        onSelect={id => w.openChapter(id)}
        onAdd={() => w.addOutlineNode(book.id, 'chapter')}
      />
    </div>
  )
}

function BookConsole({ w, component }: { w: WriterWorkspace; component: string }) {
  const book = w.activeBook
  if (!book) return <Placeholder title="Book" body="Select a book on the shelf to open it." />

  const def = [...BOOK_COMPONENTS, SETTINGS_COMPONENT, HELP_COMPONENT].find(c => c.key === component)

  if (component === 'bookEditor') {
    return <BookCover w={w} book={book} />
  }

  return (
    <>
      <ConsoleTitleRow console="Book" component={def?.label ?? ''} />
      <Placeholder title={def?.label ?? ''} body={def?.body} />
    </>
  )
}

export default BookConsole
