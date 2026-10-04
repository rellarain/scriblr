import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { OutlineNode } from '../../../api/types'
import type { ShelfGroup } from './outlineTree'
import { nodeLabel } from './plotTree'
import { bookThemeHue, isLightColor, themeColorCss } from '../../../theme/bookColors'

const SPINE_HEIGHT = 100

// A spine's width reflects the book's length: 5px for every 40,000 words of
// its word-count goal, with a sliver minimum so a book with no goal stays on
// the shelf. Spines narrower than TITLE_MIN_WIDTH have no room for a title.
const SPINE_PX_PER_40K_WORDS = 5
const SPINE_MIN = 8
const TITLE_MIN_WIDTH = 20
// The selected book turns from its spine to its front cover, this wide.
export const COVER_WIDTH = 74
export function spineWidth(goal: number | null | undefined): number {
  const width = Math.round(((goal && goal > 0 ? goal : 0) / 40000) * SPINE_PX_PER_40K_WORDS)
  return Math.max(SPINE_MIN, width)
}

// A book on the shelf: its spine, which swivels (a 3D turn, see .wrSpine in writer.scss)
// into its front cover while it is the selected book.
export function Spine({ book, active, onOpen }: { book: OutlineNode; active: boolean; onOpen: () => void }) {
  const width = spineWidth(book.wordCountGoal)
  const label = nodeLabel(book)
  return (
    <button
      type="button"
      className={active ? 'wrSpine wrSpine--active' : 'wrSpine'}
      style={{ height: SPINE_HEIGHT, width: active ? COVER_WIDTH : width, '--wr-spine': themeColorCss(bookThemeHue(book)), '--wr-spine-ink': isLightColor(bookThemeHue(book)) ? '#1a1a1a' : undefined // the title on a light spine has to be dark
       } as CSSProperties}
      onClick={onOpen}
      title={label}
      aria-pressed={active}
    >
      <span className="wrSpineFlip">
        <span className="wrSpineSide">{width >= TITLE_MIN_WIDTH && <span>{label}</span>}</span>
        <span className="wrSpineFront"><span className="wrSpineFrontTitle">{label}</span></span>
      </span>
    </button>
  )
}

// A project's spines, grouped: each series is a darkened section with its label above
// the books in it; books outside any series stand on the plain shelf.
export function Shelf({ label, meta, groups, activeBookId, selected, onOpenBook, onOpen, right }: {
  label: string
  meta: string
  groups: ShelfGroup[]
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
  return (
    <div className="wrShelf">
      <div className="wrShelfHeader">
        {onOpen
          ? <button type="button" className={selected ? 'wrShelfName wrShelfName--link wrShelfName--selected' : 'wrShelfName wrShelfName--link'} onClick={onOpen}>{label}</button>
          : <span className={selected ? 'wrShelfName wrShelfName--selected' : 'wrShelfName'}>{label}</span>}
        <span className="wrShelfMeta">{meta}</span>
        {right}
      </div>
      <div ref={booksRef} className={activeBookId ? 'wrShelfBooks wrShelfBooks--picked' : 'wrShelfBooks'}>
        {groups.every(g => g.books.length === 0 && g.series === null) && <span className="wrShelfEmpty">No books yet</span>}
        {groups.map((g, i) => {
          const spines = g.books.map(b => (
            <Spine key={b.id} book={b} active={b.id === activeBookId} onOpen={() => onOpenBook(b.id)} />
          ))
          if (!g.series) return <div key={`loose-${i}`} className="wrShelfLoose">{spines}</div>
          return (
            <div key={g.series.id} className="wrShelfSeries" role="group" aria-label={`Series: ${nodeLabel(g.series)}`}>
              <span className="wrShelfSeriesLabel" title={nodeLabel(g.series)}>{g.series.title.trim() || 'Untitled series'}</span>
              <div className="wrShelfSeriesBooks">{spines}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
