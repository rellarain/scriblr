import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { CatalogBook } from '../../api/reader'
import { BackIcon, BarChartIcon, BellIcon, BodyIcon, BookFaceIcon, CardIcon, CatalogIcon, CoverIcon, FaceIcon, FeedIcon, FlagIcon, FootnoteIcon, FrontIcon, GoalIcon, HeartIcon, HistoryIcon, HomeIcon, JournalIcon, LibraryIcon, NoteIcon, PagesIcon, PlotIcon, ShelfIcon, ShelvesIcon, SlidersIcon, StackIcon, TicketIcon, TreeIcon } from '../icons'
import { fillColorCss } from '../../theme/bookColors'
import { useThemeState } from '../../theme/useTheme'
import { useStoredState } from './writer/storage'
import { BookcoverConsole, LevelBadge } from './reader/BookConsoles'
import { BackmatterConsole, EdgeTabs, FrontmatterConsole, OutlineConsole, PlanConsole, PlotConsole, RevisionsConsole } from './reader/BookMatter'
import { BookcardConsole, BookfaceConsole } from './reader/BookSocial'
import { resolve, withFull, type ConsoleStates } from './reader/consoleStates'
import { AnalyticsConsole, FeedConsole, JournalConsole, StackConsole } from './reader/NookConsoles'
import { CatalogConsole, HistoryConsole, ShelfConsole, ShelvesConsole } from './reader/LibraryConsoles'
import { BorrowDialog, PlanDialog } from './reader/ReaderDialogs'
import { AnnotationsConsole, FlagsConsole, FootnotesConsole, ReactionsConsole, SettingsConsole } from './reader/PagesConsoles'
import { usePagesSession } from './reader/PagesSession'
import { ReadingPage } from './reader/ReadingPage'
import { ReviewDialog } from './reader/ReviewDialog'
import { levelOf } from './reader/readerSocial'
import { ReaderPanel, type ConsoleDef } from './reader/ReaderPanel'
import type { ReaderCtx } from './reader/readerContext'
import { parseReaderPath, readerPath, type ReaderLocation, type ReaderPage } from './reader/readerRoutes'
import { loadBook, loadReader, useReader } from './reader/readerStore'
import './reader/reader.scss'

// The Reader (RUI): four pages that open one from the next, as the Writer's levels do. The Nook (home) holds the Reader's own things (the Stack,
// the Journal, Analytics, the Feed); the Library the shelves and the catalog; the Book one book and its cover; Pages reads it. The earlier
// pages stand at the left as narrow rails. Each page's consoles are an icon, a tile or the full console, and the URL names the page, the book
// and the full console (/read/library/catalog, /read/book/<id>, /read/book/<id>/pages).

const PAGE_LABEL: Record<ReaderPage, string> = { nook: 'Nook', library: 'Library', book: 'Book', pages: 'Pages' }
const PAGE_ICON = { nook: HomeIcon, library: LibraryIcon, book: BookFaceIcon, pages: PagesIcon }

const NOOK_IDS = ['stack', 'journal', 'analytics', 'feed']
const NOOK_DEFAULTS: ConsoleStates = { stack: 'tile', journal: 'tile', analytics: 'tile' }
const LIBRARY_IDS = ['catalog', 'shelves', 'shelf', 'history']
const LIBRARY_DEFAULTS: ConsoleStates = { catalog: 'tile', shelves: 'tile' }
const BOOK_IDS = ['cover', 'face', 'card', 'front', 'back']
// An alpha reader is also given the author's planning, read-only.
const ALPHA_IDS = [...BOOK_IDS, 'outline', 'plot', 'plan', 'revisions']
const BOOK_DEFAULTS: ConsoleStates = { cover: 'tile' }
const PAGES_IDS = ['flags', 'reactions', 'body', 'footnotes', 'annotations', 'settings']
const PAGES_DEFAULTS: ConsoleStates = { body: 'tile' }

// The page's consoles: what is stored for them (and the URL's full console on top), and how a change is stored and written to the URL.
function usePageStates(loc: ReaderLocation, ids: string[], defaults: ConsoleStates) {
  const navigate = useNavigate()
  const [stored, setStored] = useStoredState<ConsoleStates>(`scriblr.reader.consoles.${loc.page}`, {})
  const states = useMemo(() => withFull(ids, resolve(ids, stored, defaults), loc.console), [ids, stored, defaults, loc.console])
  const onStates = useCallback((next: ConsoleStates) => {
    setStored(next)
    const full = Object.entries(next).find(([, v]) => v === 'full')?.[0] ?? null
    navigate(readerPath({ ...loc, console: full }), { replace: true })
  }, [loc, navigate, setStored])
  return { states, onStates }
}

function RUI() {
  const location = useLocation()
  const navigate = useNavigate()
  const loc = useMemo(() => parseReaderPath(location.pathname), [location.pathname])
  const data = useReader()
  const { settings, activeZone } = useThemeState()
  const [planOpen, setPlanOpen] = useState(false)
  const [borrowing, setBorrowing] = useState<CatalogBook | null>(null)
  const [reviewing, setReviewing] = useState<CatalogBook | null>(null)
  const [lastBookId, setLastBookId] = useStoredState<string>('scriblr.reader.lastBook', '')
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => { void loadReader() }, [])
  useEffect(() => { if (loc.bookId) setLastBookId(loc.bookId) }, [loc.bookId, setLastBookId])
  useEffect(() => { if (loc.bookId && data.status === 'ready') void loadBook(loc.bookId).catch(() => undefined) }, [loc.bookId, data.status])

  const themeHue = settings.zones[activeZone].palette.theme.h
  const book = loc.bookId ? data.bookById(loc.bookId) : undefined
  const colors: Record<ReaderPage, string> = {
    nook: fillColorCss(themeHue),
    library: fillColorCss((themeHue + 120) % 360),
    book: fillColorCss(book?.hue ?? themeHue),
    pages: fillColorCss(book?.hue ?? themeHue),
  }
  const go = (page: ReaderPage, extra: Partial<ReaderLocation> = {}) => navigate(readerPath({ page, bookId: extra.bookId ?? loc.bookId ?? (lastBookId || null), ...extra }))
  const ctx: ReaderCtx = {
    data, today,
    openBook: id => navigate(readerPath({ page: 'book', bookId: id })),
    openLibrary: console => navigate(readerPath({ page: 'library', console: console ?? null })),
    openPages: (id, chapter) => navigate(readerPath({ page: 'pages', bookId: id, chapter: chapter ?? null })),
    borrow: b => setBorrowing(b),
    openPlan: () => setPlanOpen(true),
    review: b => setReviewing(b),
  }

  const order: ReaderPage[] = ['nook', 'library', 'book', 'pages']
  const before = order.slice(0, order.indexOf(loc.page))
  const forward = (page: ReaderPage): boolean => (page === 'book' || page === 'pages' ? Boolean(loc.bookId || lastBookId) : true)
  const after = order.slice(order.indexOf(loc.page) + 1).filter(forward)
  const pill = data.reader && (
    <button type="button" className="rdPill" onClick={() => setPlanOpen(true)} title="Your plan and credits">
      <TicketIcon size={16} />{data.reader.balance} {data.reader.balance === 1 ? 'credit' : 'credits'}
    </button>
  )
  const unread = data.reader?.notifications.filter(n => !n.read).length ?? 0
  const bell = data.reader && (
    <button type="button" className="rdIconBtn" aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'} title="Notifications" onClick={() => navigate(readerPath({ page: 'nook', console: 'feed' }))}>
      <BellIcon size={20} />{unread > 0 && <span className="rdDot">{unread}</span>}
    </button>
  )
  const right = (
    <>
      {bell}
      {pill}
      {after.map(page => {
        const Icon = PAGE_ICON[page]
        return <button key={page} type="button" className="rdIconBtn" aria-label={`Open ${PAGE_LABEL[page]}`} title={`Open ${PAGE_LABEL[page]}`} onClick={() => go(page)}><Icon size={20} /></button>
      })}
    </>
  )

  let content
  if (data.status === 'error') content = <p className="rdEmpty" role="alert">{data.error}</p>
  else if (data.status !== 'ready') content = <p className="rdEmpty" role="status">Loading the library…</p>
  else if (loc.page === 'nook') content = <NookPage loc={loc} ctx={ctx} color={colors.nook} right={right} />
  else if (loc.page === 'library') content = <LibraryPage loc={loc} ctx={ctx} color={colors.library} right={right} />
  else if (loc.page === 'book') content = <BookPage loc={loc} ctx={ctx} color={colors.book} right={right} book={book} />
  else content = <PagesPage loc={loc} ctx={ctx} color={colors.pages} right={right} book={book} />

  return (
    <main className="rUI wr rdRoot">
      <div className="rdLayout">
        {before.map(page => {
          const Icon = PAGE_ICON[page]
          return (
            <button key={page} type="button" className="rdRail" style={{ ['--rd-f' as string]: colors[page] }} aria-label={`Back to ${PAGE_LABEL[page]}`} title={PAGE_LABEL[page]} onClick={() => go(page)}>
              <Icon size={20} /><span>{page === 'book' && book ? book.title : PAGE_LABEL[page]}</span>
            </button>
          )
        })}
        {content}
      </div>
      {planOpen && <PlanDialog ctx={ctx} onClose={() => setPlanOpen(false)} />}
      {reviewing && <ReviewDialog ctx={ctx} book={reviewing} onClose={() => setReviewing(null)} />}
      {borrowing && <BorrowDialog ctx={ctx} book={borrowing} onClose={() => setBorrowing(null)} />}
    </main>
  )
}

interface PageProps { loc: ReaderLocation; ctx: ReaderCtx; color: string; right: React.ReactNode }

function NookPage({ loc, ctx, color, right }: PageProps) {
  const { states, onStates } = usePageStates(loc, NOOK_IDS, NOOK_DEFAULTS)
  const consoles: ConsoleDef[] = [
    { id: 'stack', label: 'Stack', Icon: StackIcon, render: size => <StackConsole ctx={ctx} size={size} /> },
    { id: 'journal', label: 'Journal', Icon: JournalIcon, render: size => <JournalConsole ctx={ctx} size={size} /> },
    { id: 'analytics', label: 'Analytics', Icon: BarChartIcon, render: size => <AnalyticsConsole ctx={ctx} size={size} /> },
    { id: 'feed', label: 'Feed', Icon: FeedIcon, render: size => <FeedConsole ctx={ctx} size={size} /> },
  ]
  return <ReaderPanel title="Nook" Icon={HomeIcon} color={color} consoles={consoles} states={states} onStates={onStates} right={right} />
}

function LibraryPage({ loc, ctx, color, right }: PageProps) {
  const { states, onStates } = usePageStates(loc, LIBRARY_IDS, LIBRARY_DEFAULTS)
  const consoles: ConsoleDef[] = [
    { id: 'catalog', label: 'Catalog', Icon: CatalogIcon, render: size => <CatalogConsole ctx={ctx} size={size} /> },
    { id: 'shelves', label: 'Shelves', Icon: ShelvesIcon, render: size => <ShelvesConsole ctx={ctx} size={size} /> },
    { id: 'shelf', label: 'Shelf', Icon: ShelfIcon, render: size => <ShelfConsole ctx={ctx} size={size} /> },
    { id: 'history', label: 'History', Icon: HistoryIcon, render: size => <HistoryConsole ctx={ctx} size={size} /> },
  ]
  return <ReaderPanel title="Library" Icon={LibraryIcon} color={color} consoles={consoles} states={states} onStates={onStates} right={right} />
}

function BookPage({ loc, ctx, color, right, book }: PageProps & { book: CatalogBook | undefined }) {
  const alpha = Boolean(book && ctx.data.reader && levelOf(ctx.data.reader, book.id) === 'alpha')
  const { states, onStates } = usePageStates(loc, alpha ? ALPHA_IDS : BOOK_IDS, BOOK_DEFAULTS)
  if (!book) return <p className="rdEmpty" role="alert">That book is not in the library.</p>
  const consoles: ConsoleDef[] = [
    { id: 'cover', label: 'Bookcover', Icon: CoverIcon, render: size => <BookcoverConsole ctx={ctx} book={book} size={size} /> },
    { id: 'face', label: 'Bookface', Icon: FaceIcon, render: size => <BookfaceConsole ctx={ctx} book={book} size={size} /> },
    { id: 'card', label: 'Bookcard', Icon: CardIcon, render: size => <BookcardConsole ctx={ctx} book={book} size={size} /> },
    { id: 'front', label: 'Frontmatter', Icon: FrontIcon, render: size => <FrontmatterConsole ctx={ctx} book={book} size={size} /> },
    { id: 'back', label: 'Backmatter', Icon: BackIcon, render: size => <BackmatterConsole ctx={ctx} book={book} size={size} /> },
  ]
  if (alpha) {
    consoles.push(
      { id: 'outline', label: 'Outline', Icon: TreeIcon, render: () => <OutlineConsole ctx={ctx} book={book} /> },
      { id: 'plot', label: 'Plot', Icon: PlotIcon, render: () => <PlotConsole ctx={ctx} book={book} /> },
      { id: 'plan', label: 'Plan', Icon: GoalIcon, render: () => <PlanConsole ctx={ctx} book={book} /> },
      { id: 'revisions', label: 'Revisions', Icon: HistoryIcon, render: () => <RevisionsConsole ctx={ctx} book={book} /> },
    )
  }
  return (
    <ReaderPanel title={book.title} Icon={BookFaceIcon} color={color} consoles={consoles} states={states} onStates={onStates} right={right}
      notice={<div className="rdNotice"><LevelBadge ctx={ctx} book={book} /></div>} edge={<EdgeTabs ctx={ctx} book={book} />} className="rdLevel--book" />
  )
}

function PagesPage({ loc, ctx, color, right, book }: PageProps & { book: CatalogBook | undefined }) {
  if (!book) return <p className="rdEmpty" role="alert">That book is not in the library.</p>
  return <PagesBook loc={loc} ctx={ctx} color={color} right={right} book={book} />
}

// The e-reader: the page (Body) and the consoles beside it share one reading session.
function PagesBook({ loc, ctx, color, right, book }: PageProps & { book: CatalogBook }) {
  const { states, onStates } = usePageStates(loc, PAGES_IDS, PAGES_DEFAULTS)
  const session = usePagesSession(ctx, book, loc.chapter)
  const focus = ctx.data.reader?.settings.focus ?? false
  const consoles: ConsoleDef[] = [
    { id: 'flags', label: 'Flags', Icon: FlagIcon, render: () => <FlagsConsole ctx={ctx} session={session} /> },
    { id: 'reactions', label: 'Reactions', Icon: HeartIcon, render: () => <ReactionsConsole ctx={ctx} session={session} /> },
    { id: 'body', label: 'Body', Icon: BodyIcon, wide: true, render: () => <ReadingPage ctx={ctx} session={session} /> },
    { id: 'footnotes', label: 'Footnotes', Icon: FootnoteIcon, render: () => <FootnotesConsole ctx={ctx} session={session} /> },
    { id: 'annotations', label: 'Annotations', Icon: NoteIcon, render: () => <AnnotationsConsole ctx={ctx} session={session} /> },
    { id: 'settings', label: 'Settings', Icon: SlidersIcon, render: () => <SettingsConsole ctx={ctx} session={session} /> },
  ]
  return (
    <ReaderPanel title={book.title} Icon={PagesIcon} color={color} consoles={consoles} states={states} onStates={onStates} right={right}
      notice={<div className="rdNotice"><LevelBadge ctx={ctx} book={book} /></div>}
      edge={<EdgeTabs ctx={ctx} book={book} current={session.n} chapters={session.text?.chapters} />} className={focus ? 'rdLevel--pages rdLevel--focus' : 'rdLevel--pages'} />
  )
}

export default RUI
