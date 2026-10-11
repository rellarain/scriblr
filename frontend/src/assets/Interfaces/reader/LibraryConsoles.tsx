import { useEffect, useMemo, useState } from 'react'
import { getBooks, type BookQuery, type CatalogBook } from '../../../api/reader'
import { BagIcon, BookmarkIcon, EyeClosedIcon, SearchIcon, SparkleIcon } from '../../icons'
import { useStoredState } from '../writer/storage'
import { Shelf } from '../writer/Shelf'
import { Card, Chip, CoverBlock } from './ReaderBits'
import type { ReaderCtx } from './readerContext'
import { plural, ratingText, shortDate, stars, wordsText } from './readerFormat'
import { progressMap, sectionsBySeries, shelfGroupsOf } from './readerShelf'

// ---------------------------------------------------------------- Catalog

const TYPES: Array<{ key: string; label: string }> = [
  { key: 'novel', label: 'Novel' }, { key: 'novella', label: 'Novella' }, { key: 'essays', label: 'Essays' }, { key: 'magazine', label: 'Magazine' }, { key: 'article', label: 'Article' },
]
const LENGTHS: Array<{ key: string; label: string; min: number; max?: number }> = [
  { key: 'any', label: 'Any length', min: 0 }, { key: 'short', label: 'Under 30,000 words', min: 0, max: 30_000 },
  { key: 'mid', label: '30,000 to 100,000', min: 30_000, max: 100_000 }, { key: 'long', label: 'Over 100,000', min: 100_000 },
]

const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))

function toggled(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value]
}

export function BookCard({ ctx, book }: { ctx: ReaderCtx; book: CatalogBook }) {
  const held = ctx.data.reader?.holdings.some(h => h.bookId === book.id && h.status === 'active')
  return (
    <div className="rdBookCard">
      <button type="button" className="rdBookCardOpen" onClick={() => ctx.openBook(book.id)} aria-label={`Open ${book.title}`}>
        <CoverBlock book={book} />
        <b>{book.title}</b>
        <span className="rdMuted">{book.authorName}</span>
        <span className="rdMuted"><span className="rdStars">{stars(book.rating)}</span> {book.ratings > 0 ? book.rating.toFixed(1) : ''}</span>
      </button>
      {book.editions < 1 ? <span className="rdMuted">Coming soon</span> : held ? <Chip on>In your stack</Chip> : (
        <button type="button" className="rdBtn rdBtn--small" onClick={() => ctx.borrow(book)}><BagIcon size={16} />Borrow or buy</button>
      )}
    </div>
  )
}

export function CatalogConsole({ ctx, size }: { ctx: ReaderCtx; size: 'tile' | 'full' }) {
  const { reader, books } = ctx.data
  const [saved, setSaved] = useStoredState<BookQuery[]>('scriblr.reader.savedFilters', [])
  const [q, setQ] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [tropes, setTropes] = useState<string[]>([])
  const [length, setLength] = useState('any')
  const [minRating, setMinRating] = useState(0)
  const [sort, setSort] = useState<NonNullable<BookQuery['sort']>>('popularity')
  const [hideOwnFlags, setHideOwnFlags] = useState(true)
  const hidden = useMemo(() => Object.entries(reader?.flagClasses ?? {}).filter(([, c]) => c === 'hidden').map(([k]) => k), [reader?.flagClasses])
  const [shown, setShown] = useState<CatalogBook[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const range = LENGTHS.find(l => l.key === length) ?? LENGTHS[0]
  const query: BookQuery = useMemo(() => ({
    q, type: types, genre: genres, trope: tropes, minRating: minRating || undefined, minWords: range.min || undefined, maxWords: range.max,
    hideFlag: hideOwnFlags ? hidden : [], sort, limit: 200,
  }), [q, types, genres, tropes, minRating, range, hideOwnFlags, hidden, sort])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      getBooks(query).then(page => { if (!cancelled) { setShown(page.books); setError(null) } }, e => { if (!cancelled) setError(e instanceof Error ? e.message : 'The catalog could not be searched.') })
    }, 150)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  const list = shown ?? books
  const genreOptions = useMemo(() => unique(books.flatMap(b => b.genres)), [books])
  const tropeOptions = useMemo(() => unique(books.flatMap(b => b.tropes)), [books])
  const flagOptions = useMemo(() => unique(books.flatMap(b => b.flags.map(f => f.key))), [books])
  const shownBooks = size === 'full' ? list : list.slice(0, 4)
  const applySaved = (s: BookQuery) => {
    setQ(s.q ?? ''); setTypes(s.type ?? []); setGenres(s.genre ?? []); setTropes(s.trope ?? []); setMinRating(s.minRating ?? 0); setSort(s.sort ?? 'popularity')
    setLength(LENGTHS.find(l => l.min === (s.minWords ?? 0) && l.max === s.maxWords)?.key ?? 'any')
  }

  return (
    <>
      <div className="rdRow">
        <label className="rdSearch"><SearchIcon size={16} /><input className="rdField" type="search" aria-label="Search the catalog" placeholder="Search title, author, trope" value={q} onChange={e => setQ(e.target.value)} /></label>
        {size === 'full' && (
          <select className="rdField" aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as NonNullable<BookQuery['sort']>)}>
            <option value="popularity">Most popular</option><option value="rating">Best rated</option><option value="words">Longest</option><option value="newest">Newest</option><option value="title">Title</option>
          </select>
        )}
      </div>
      <div className={size === 'full' ? 'rdCatalog' : undefined}>
        {size === 'full' && (
          <Card className="rdFilters">
            <fieldset className="rdFieldset"><legend>Type</legend>
              {TYPES.map(t => <label key={t.key} className="rdCheck"><input type="checkbox" checked={types.includes(t.key)} onChange={() => setTypes(toggled(types, t.key))} />{t.label}</label>)}
            </fieldset>
            <fieldset className="rdFieldset"><legend>Genre</legend>
              <div className="rdRow">{genreOptions.map(g => <button key={g} type="button" aria-pressed={genres.includes(g)} className={genres.includes(g) ? 'rdChip rdChip--on rdChip--button' : 'rdChip rdChip--button'} onClick={() => setGenres(toggled(genres, g))}>{g}</button>)}</div>
            </fieldset>
            <fieldset className="rdFieldset"><legend>Tropes</legend>
              <div className="rdRow">{tropeOptions.map(t => <button key={t} type="button" aria-pressed={tropes.includes(t)} className={tropes.includes(t) ? 'rdChip rdChip--on rdChip--button' : 'rdChip rdChip--button'} onClick={() => setTropes(toggled(tropes, t))}>{t}</button>)}</div>
            </fieldset>
            <label className="rdFieldset"><span className="rdLegend">Word length</span>
              <select className="rdField" value={length} onChange={e => setLength(e.target.value)}>{LENGTHS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
            </label>
            <label className="rdFieldset"><span className="rdLegend">Reader rating</span>
              <select className="rdField" value={minRating} onChange={e => setMinRating(Number(e.target.value))}>{[0, 6, 7, 8, 9].map(r => <option key={r} value={r}>{r === 0 ? 'Any rating' : `${r} of 10 and up`}</option>)}</select>
            </label>
            <fieldset className="rdFieldset"><legend>Flags</legend>
              <label className="rdCheck"><input type="checkbox" checked={hideOwnFlags} onChange={e => setHideOwnFlags(e.target.checked)} /><EyeClosedIcon size={16} />Hide books with my hidden flags{hidden.length ? ` (${hidden.join(', ')})` : ''}</label>
              <span className="rdMuted">Flags in the catalog: {flagOptions.join(', ')}.</span>
            </fieldset>
            <div className="rdRow">
              <button type="button" className="rdBtn" onClick={() => setSaved([...saved, query].slice(-6))}><BookmarkIcon size={16} />Save these filters</button>
              {saved.map((s, i) => <button key={i} type="button" className="rdChip rdChip--button" onClick={() => applySaved(s)}>Saved {i + 1}{s.q ? `: ${s.q}` : ''}</button>)}
            </div>
          </Card>
        )}
        <div>
          {error && <p className="rdError" role="alert">{error}</p>}
          <div className="rdBooks">{shownBooks.map(b => <BookCard key={b.id} ctx={ctx} book={b} />)}</div>
          {list.length === 0 && <p className="rdMuted">No book matches. Loosen a filter.</p>}
          {size === 'tile' && list.length > shownBooks.length && <p className="rdMuted">{plural(list.length, 'book')}. Open the catalog for filters.</p>}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Shelves (with the Display Case as a row)

export function ShelvesConsole({ ctx, size }: { ctx: ReaderCtx; size: 'tile' | 'full' }) {
  const { reader, books, recommendations } = ctx.data
  if (!reader) return null
  const progress = progressMap(books, reader.progress)
  const picks = [...books].filter(b => b.editions > 0).sort((a, b) => b.rating - a.rating || b.ratings - a.ratings).slice(0, 5)
  const picksGroups = shelfGroupsOf([{ id: 'picks', label: null, books: picks }])
  const caseBooks = recommendations.map(r => r.book)
  return (
    <>
      <Shelf label="Staff picks" meta="best rated" groups={picksGroups} progress={progress} activeBookId={null} onOpenBook={ctx.openBook} />
      <Shelf label="Display Case" meta="picked for you" groups={shelfGroupsOf([{ id: 'case', label: null, books: caseBooks }])} progress={progress} activeBookId={null} onOpenBook={ctx.openBook} right={<SparkleIcon size={16} />} />
      {size === 'full' && (
        <>
          <Card title="Why these are in your Display Case" Icon={SparkleIcon}>
            <p className="rdMuted">Built from what you have read and kept on this device. A book carrying a flag you hide is never shown.</p>
            <ul className="rdList">
              {recommendations.map(r => (
                <li key={r.book.id} className="rdItem">
                  <div className="rdItemMain"><b>{r.book.title} · {r.match}% match</b>{r.why.map(w => <span key={w} className="rdMuted">{w}</span>)}</div>
                  <div className="rdRow">
                    <button type="button" className="rdBtn rdBtn--pri" onClick={() => ctx.borrow(r.book)}><BagIcon size={16} />Borrow or buy</button>
                    <button type="button" className="rdBtn" onClick={() => void ctx.data.actions.toggleWishlist(r.book.id, !reader.wishlist.includes(r.book.id))}><BookmarkIcon size={16} />{reader.wishlist.includes(r.book.id) ? 'On wishlist' : 'Wishlist'}</button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Shelf label="By series" meta="in order" groups={shelfGroupsOf(sectionsBySeries(books.filter(b => b.series)))} progress={progress} activeBookId={null} onOpenBook={ctx.openBook} />
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Shelf (one author)

export function ShelfConsole({ ctx, size }: { ctx: ReaderCtx; size: 'tile' | 'full' }) {
  const { reader, books } = ctx.data
  const authors = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of books) map.set(b.authorId, b.authorName)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [books])
  const [chosen, setChosen] = useStoredState<string>('scriblr.reader.shelfAuthor', '')
  if (!reader) return null
  const authorId = authors.some(([id]) => id === chosen) ? chosen : (authors.find(([id]) => id === 'mara-quill') ?? authors[0])?.[0]
  const mine = books.filter(b => b.authorId === authorId)
  const name = authors.find(([id]) => id === authorId)?.[1] ?? ''
  const readers = mine.reduce((n, b) => n + b.readers, 0)
  return (
    <>
      <div className="rdRow">
        <label className="rdRow"><span className="rdMuted">Author</span>
          <select className="rdField" value={authorId} onChange={e => setChosen(e.target.value)} aria-label="Author">{authors.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        </label>
        <span className="rdMuted">{plural(mine.length, 'book')} · {readers.toLocaleString('en-US')} readers</span>
      </div>
      <Shelf label={name} meta={plural(mine.length, 'book')} groups={shelfGroupsOf(sectionsBySeries(mine))} progress={progressMap(books, reader.progress)} activeBookId={null} onOpenBook={ctx.openBook} />
      {size === 'full' && (
        <div className="rdGrid3">
          {mine.map(b => (
            <Card key={b.id}>
              <b>{b.title}</b>
              <span className="rdMuted">{b.series ? `${b.series.title}, book ${b.series.order} · ` : ''}{b.type} · {wordsText(b.wordCount)}</span>
              <span className="rdMuted">{ratingText(b.rating, b.ratings)}</span>
              <button type="button" className="rdBtn" onClick={() => ctx.openBook(b.id)}>Details</button>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- History

export function HistoryConsole({ ctx, size }: { ctx: ReaderCtx; size: 'tile' | 'full' }) {
  const { reader } = ctx.data
  if (!reader) return null
  const events: Array<{ at: string; title: string; detail: string }> = []
  for (const e of reader.ledger) {
    if (e.kind === 'grant') continue
    const title = ctx.data.bookById(e.bookId ?? '')?.title ?? 'A book'
    events.push({ at: e.at, title: `${shortDate(e.at)} · ${e.kind === 'borrow' ? 'Borrowed' : e.kind === 'extend' ? 'Extended' : 'Credits returned for'} ${title}`, detail: e.note })
  }
  for (const h of reader.holdings) {
    if (h.kind === 'owned') events.push({ at: h.startedAt, title: `${shortDate(h.startedAt)} · Bought ${ctx.data.bookById(h.bookId)?.title ?? 'a book'}`, detail: 'Simulated purchase' })
  }
  for (const [id, p] of Object.entries(reader.progress)) {
    if (p.finishedAt) events.push({ at: p.finishedAt, title: `${shortDate(p.finishedAt)} · Finished ${ctx.data.bookById(id)?.title ?? 'a book'}`, detail: `${p.pages} pages read` })
  }
  events.sort((a, b) => b.at.localeCompare(a.at))
  const shown = size === 'full' ? events : events.slice(0, 4)
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const byDay = weekdays.map((label, i) => ({ label, pages: Object.entries(reader.activity).filter(([d]) => new Date(`${d}T00:00:00Z`).getUTCDay() === i).reduce((n, [, a]) => n + a.pages, 0) }))
  const top = Math.max(1, ...byDay.map(d => d.pages))
  return (
    <>
      {shown.length === 0 ? <p className="rdMuted">Nothing here yet. What you borrow, buy and finish is kept here.</p> : (
        <ol className="rdTimeline">{shown.map((e, i) => <li key={`${e.at}-${i}`}><b>{e.title}</b><span className="rdMuted">{e.detail}</span></li>)}</ol>
      )}
      {size === 'full' && (
        <Card title="Which days you read">
          <div className="rdCols" role="img" aria-label="Pages read by weekday">
            {byDay.map(d => <div key={d.label}><span>{d.pages}</span><i style={{ height: `${Math.max(2, (d.pages / top) * 84)}px` }} /><span>{d.label}</span></div>)}
          </div>
        </Card>
      )}
    </>
  )
}

