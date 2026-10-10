import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { BookProgress, Measure, OutlineNode } from '../../../api/types'
import type { ShelfGroup } from './outlineTree'
import { nodeLabel } from './plotTree'
import { bookThemeHue, fillColorCss } from '../../../theme/bookColors'

// A spine's size follows its book: the width from 20px (no word-count goal) to 64px (220,000 words or more), the height from 160px to
// 200px, so the bars on it have room. The selected book turns from its spine to its front cover, COVER_WIDTH wide.
export const SPINE_MIN_WIDTH = 20
export const SPINE_MAX_WIDTH = 64
export const SPINE_MIN_HEIGHT = 160
export const SPINE_MAX_HEIGHT = 200
const WORDS_PER_WIDTH_PX = 5000 // 8px of width for every 40,000 words
const WORDS_PER_HEIGHT_PX = 5000
export const COVER_WIDTH = 96

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
export function spineWidth(goal: number | null | undefined): number {
  return clamp(SPINE_MIN_WIDTH + Math.round((goal && goal > 0 ? goal : 0) / WORDS_PER_WIDTH_PX), SPINE_MIN_WIDTH, SPINE_MAX_WIDTH)
}
export function spineHeight(goal: number | null | undefined): number {
  return clamp(SPINE_MIN_HEIGHT + Math.round((goal && goal > 0 ? goal : 0) / WORDS_PER_HEIGHT_PX), SPINE_MIN_HEIGHT, SPINE_MAX_HEIGHT)
}

// What each bar of a spine measures, top to bottom: planning, plotting and outlining above the vertical words bar; plotpoint assignment,
// revision and publishing below it.
interface BarDef { key: keyof Omit<BookProgress, 'words'>; label: string; unit: string }
const TOP_BARS: BarDef[] = [
  { key: 'planning', label: 'Planning', unit: 'details' },
  { key: 'plotting', label: 'Plotting', unit: 'plotlines with plotpoints' },
  { key: 'outlining', label: 'Outlining', unit: 'chapters outlined' },
]
const BOTTOM_BARS: BarDef[] = [
  { key: 'assignment', label: 'Plotpoints placed', unit: 'plotpoints' },
  { key: 'revision', label: 'Revision', unit: 'chapters revised' },
  { key: 'published', label: 'Published', unit: 'chapters published' },
]

const NO_PROGRESS: Measure = { done: 0, total: 0 }
const ratioOf = (m: Measure) => (m.total > 0 ? Math.min(1, m.done / m.total) : 0)
// Complete (the whole of what there is, or past the goal) turns a bar to the accent colour.
const isComplete = (m: Measure) => m.total > 0 && m.done >= m.total

function Bar({ measure, label, unit, vertical = false }: { measure: Measure; label: string; unit: string; vertical?: boolean }) {
  const percent = Math.round(ratioOf(measure) * 100)
  const text = measure.total > 0 ? `${label}: ${measure.done} of ${measure.total} ${unit}` : `${label}: nothing to measure yet`
  const classes = ['wrSpineBar', vertical ? 'wrSpineBar--v' : 'wrSpineBar--h', isComplete(measure) ? 'wrSpineBar--complete' : ''].filter(Boolean).join(' ')
  return (
    <span className={classes} role="img" aria-label={text} title={text}>
      <span className="wrSpineBarFill" style={vertical ? { height: `${percent}%` } : { width: `${percent}%` }} />
    </span>
  )
}

// A book on the shelf: its spine, which swivels (a 3D turn, see .wrSpine in writer.scss) into its front cover while it is the selected
// book. The spine has the book's number at the top and no title; its bars show how far the book has come, and a bar appears only where there
// is a goal or something to measure against (the backend gives a total of 0 otherwise): planning, plotting and outlining across the top, the
// draft's words against the book's word-count goal up the middle, and plotpoint assignment, revision and publishing across the bottom. A bar is a dark track of the spine's colour with a lighter fill; when it is complete it turns accent.
export function Spine({ book, number, progress, active, onOpen }: { book: OutlineNode; number: number; progress?: BookProgress; active: boolean; onOpen: () => void }) {
  const width = spineWidth(book.wordCountGoal)
  const height = spineHeight(book.wordCountGoal)
  const label = nodeLabel(book)
  const words = progress?.words ?? NO_PROGRESS
  return (
    <button
      type="button"
      className={active ? 'wrSpine wrSpine--active' : 'wrSpine'}
      style={{ height, width: active ? COVER_WIDTH : width, '--wr-spine': fillColorCss(bookThemeHue(book)) } as CSSProperties}
      onClick={onOpen}
      aria-label={label}
      title={`${label} (book ${number})`}
      aria-pressed={active}
    >
      <span className="wrSpineFlip">
        <span className="wrSpineSide">
          <span className="wrSpineNumber" aria-hidden="true">{number}</span>
          <span className="wrSpineBars">
            {TOP_BARS.map(b => (progress?.[b.key]?.total ?? 0) > 0 && <Bar key={b.key} measure={progress![b.key]} label={b.label} unit={b.unit} />)}
          </span>
          <span className="wrSpineWords">
            {words.total > 0 && <Bar vertical measure={words} label="Words" unit="words of the goal" />}
          </span>
          <span className="wrSpineBars">
            {BOTTOM_BARS.map(b => (progress?.[b.key]?.total ?? 0) > 0 && <Bar key={b.key} measure={progress![b.key]} label={b.label} unit={b.unit} />)}
          </span>
        </span>
        <span className="wrSpineFront"><span className="wrSpineFrontTitle">{label}</span></span>
      </span>
    </button>
  )
}

// A project's spines, grouped: each series is a lighter section with its title across the top, over the books in it; books outside any
// series stand on the plain shelf. The shelf's board carries the project's title (a link when it opens the project), the book count and
// the `right` slot.
export function Shelf({ label, meta, groups, progress, activeBookId, selected, onOpenBook, onOpen, right }: {
  label: string
  meta: string
  groups: ShelfGroup[]
  // Per book id: the bars of its spine.
  progress?: Record<string, BookProgress>
  activeBookId: string | null
  selected?: boolean
  onOpenBook: (bookId: string) => void
  // Makes the shelf title a link to the project.
  onOpen?: () => void
  right?: ReactNode
}) {
  // The wheel scrolls the row sideways (a mouse wheel only turns vertically). React's onWheel
  // is passive, so this listener is added by hand to be allowed to stop the page scrolling.
  const booksRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = booksRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const max = el.scrollWidth - el.clientWidth
      const next = Math.min(max, Math.max(0, el.scrollLeft + e.deltaY))
      if (Math.abs(next - el.scrollLeft) < 1) return // at an end: let the page scroll
      e.preventDefault()
      el.scrollLeft = next
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  let counted = 0
  return (
    <div className="wrShelf">
      <div ref={booksRef} className={activeBookId ? 'wrShelfBooks wrShelfBooks--picked' : 'wrShelfBooks'}>
        {groups.every(g => g.books.length === 0 && g.series === null) && <span className="wrShelfEmpty">No books yet</span>}
        {groups.map((g, i) => {
          const spines = g.books.map(b => {
            counted += 1
            return <Spine key={b.id} book={b} number={counted} progress={progress?.[b.id]} active={b.id === activeBookId} onOpen={() => onOpenBook(b.id)} />
          })
          if (!g.series) return <div key={`loose-${i}`} className="wrShelfLoose">{spines}</div>
          return (
            <div key={g.series.id} className="wrShelfSeries" role="group" aria-label={`Series: ${nodeLabel(g.series)}`}>
              <span className="wrShelfSeriesLabel" title={nodeLabel(g.series)}>{g.series.title.trim() || 'Untitled series'}</span>
              <div className="wrShelfSeriesBooks">{spines}</div>
            </div>
          )
        })}
      </div>
      <div className="wrShelfBoard">
        {onOpen
          ? <button type="button" className={selected ? 'wrShelfName wrShelfName--link wrShelfName--selected' : 'wrShelfName wrShelfName--link'} onClick={onOpen}>{label}</button>
          : <span className={selected ? 'wrShelfName wrShelfName--selected' : 'wrShelfName'}>{label}</span>}
        <span className="wrShelfMeta">{meta}</span>
        {right}
      </div>
    </div>
  )
}
