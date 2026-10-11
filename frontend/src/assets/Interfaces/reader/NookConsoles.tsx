import { useMemo, useState } from 'react'
import type { CatalogBook, Holding } from '../../../api/reader'
import { BagIcon, BellIcon, BookmarkIcon, GoalIcon, HeartIcon, HistoryIcon, PlayIcon, ReturnIcon, SwapIcon, TrashIcon } from '../../icons'
import { useStoredState } from '../writer/storage'
import { Shelf } from '../writer/Shelf'
import { buildActivityGrid, currentStreak, type ActivityMetric } from './activityGrid'
import { Card, Meter, Stat } from './ReaderBits'
import type { ReaderCtx } from './readerContext'
import { dollars, dueText, months, plural, shortDate } from './readerFormat'
import { progressMap, shelfGroupsOf, type ShelfSection } from './readerShelf'

// ---------------------------------------------------------------- Stack

function activeHoldings(ctx: ReaderCtx): Array<{ holding: Holding; book: CatalogBook }> {
  const { reader, bookById } = ctx.data
  if (!reader) return []
  return reader.holdings
    .filter(h => h.status === 'active')
    .flatMap(h => { const book = bookById(h.bookId); return book ? [{ holding: h, book }] : [] })
}

function LendForm({ ctx, holding }: { ctx: ReaderCtx; holding: Holding }) {
  const [to, setTo] = useState('')
  const [length, setLength] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const lend = async () => {
    setError(null)
    try { await ctx.data.actions.lend(holding.id, to, length); setTo('') } catch (e) { setError(e instanceof Error ? e.message : 'Could not lend it.') }
  }
  return (
    <div className="rdRow">
      <input className="rdField" aria-label="Lend to" placeholder="Lend to (a name)" value={to} onChange={e => setTo(e.target.value)} />
      <select className="rdField" aria-label="Months to lend for" value={length} onChange={e => setLength(Number(e.target.value))}>
        {[1, 2, 3].map(n => <option key={n} value={n}>{months(n)}</option>)}
      </select>
      <button type="button" className="rdBtn" disabled={!to.trim()} onClick={() => void lend()}><SwapIcon size={16} />Lend</button>
      {error && <span className="rdError" role="alert">{error}</span>}
    </div>
  )
}

export function StackConsole({ ctx, size }: { ctx: ReaderCtx; size: 'tile' | 'full' }) {
  const { reader } = ctx.data
  const held = activeHoldings(ctx)
  const sections = useMemo<ShelfSection[]>(() => {
    const owned = held.filter(x => x.holding.kind === 'owned' && !x.holding.lentTo).map(x => x.book)
    const borrowed = held.filter(x => x.holding.kind === 'borrowed').map(x => x.book)
    const lent = held.filter(x => x.holding.kind === 'owned' && x.holding.lentTo).map(x => x.book)
    return [
      { id: 'owned', label: null, books: owned },
      { id: 'borrowed', label: 'Borrowed', books: borrowed.length ? borrowed : [] },
      { id: 'lent', label: 'Lent out', books: lent },
    ].filter(s => s.books.length > 0)
  }, [held])
  const [toReadOpen, setToReadOpen] = useState(false)
  if (!reader) return null
  const books = held.map(x => x.book)
  return (
    <>
      {held.length === 0 ? (
        <div className="rdCard rdEmptyCard">
          <p>Your stack is empty. Borrow a book with a credit, or buy one, and it stands here.</p>
          <button type="button" className="rdBtn rdBtn--pri" onClick={() => ctx.openLibrary()}><BagIcon size={16} />Browse the Library</button>
        </div>
      ) : (
        <Shelf
          label="Reading stack" meta={plural(held.length, 'book')} groups={shelfGroupsOf(sections)}
          progress={progressMap(books, reader.progress)} activeBookId={null} onOpenBook={ctx.openBook}
        />
      )}
      {size === 'full' && held.length > 0 && (
        <Card title="On loan and due" Icon={HistoryIcon}>
          <ul className="rdList">
            {held.filter(x => x.holding.kind === 'borrowed' || x.holding.lentTo).map(({ holding, book }) => (
              <li key={holding.id} className="rdItem">
                <div className="rdItemMain">
                  <b>{book.title}</b>
                  <span className="rdMuted">
                    {holding.kind === 'borrowed'
                      ? `Borrowed ${months(holding.credits)} · ${dueText(holding.dueAt)}${holding.dueAt ? ` (${shortDate(holding.dueAt)})` : ''}`
                      : `Lent to ${holding.lentTo} · back ${holding.lentUntil ? shortDate(holding.lentUntil) : ''}`}
                  </span>
                </div>
                <div className="rdRow">
                  <button type="button" className="rdBtn" onClick={() => ctx.openBook(book.id)}><PlayIcon size={16} />Read</button>
                  {holding.kind === 'borrowed' ? (
                    <>
                      <button type="button" className="rdBtn" onClick={() => void ctx.data.actions.extend(holding.id)} title="Spend one more credit for another month"><HistoryIcon size={16} />Extend</button>
                      <button type="button" className="rdBtn" onClick={() => void ctx.data.actions.giveBack(holding.id)}><ReturnIcon size={16} />Return</button>
                    </>
                  ) : (
                    <button type="button" className="rdBtn" onClick={() => void ctx.data.actions.recall(holding.id)}><ReturnIcon size={16} />Recall</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {size === 'full' && held.some(x => x.holding.kind === 'owned' && !x.holding.lentTo) && (
        <Card title="Lend a book you own" Icon={SwapIcon}>
          {held.filter(x => x.holding.kind === 'owned' && !x.holding.lentTo).map(({ holding, book }) => (
            <div key={holding.id} className="rdItem"><b>{book.title}</b><LendForm ctx={ctx} holding={holding} /></div>
          ))}
        </Card>
      )}
      {size === 'full' && (
        <Card title="To read and wishlist" Icon={BookmarkIcon}>
          <div className="rdRow">
            {reader.toRead.length + reader.wishlist.length === 0 && <span className="rdMuted">Nothing saved yet. Save a book from the Library to find it again.</span>}
            {reader.toRead.map(id => {
              const b = ctx.data.bookById(id)
              return b && (
                <span key={`t-${id}`} className="rdChip">
                  <BookmarkIcon size={14} />{b.title}
                  <button type="button" className="rdChipX" aria-label={`Remove ${b.title} from to read`} onClick={() => void ctx.data.actions.toggleToRead(id, false)}><TrashIcon size={14} /></button>
                </span>
              )
            })}
            {reader.wishlist.map(id => {
              const b = ctx.data.bookById(id)
              return b && (
                <span key={`w-${id}`} className="rdChip">
                  <HeartIcon size={14} />{b.title} · {dollars(b.buyPriceCents)}
                  <button type="button" className="rdChipX" aria-label={`Remove ${b.title} from the wishlist`} onClick={() => void ctx.data.actions.toggleWishlist(id, false)}><TrashIcon size={14} /></button>
                </span>
              )
            })}
          </div>
          <button type="button" className="rdBtn" onClick={() => setToReadOpen(v => !v)} aria-expanded={toReadOpen}>{toReadOpen ? 'Hide the catalog' : 'Add from the catalog'}</button>
          {toReadOpen && (
            <div className="rdRow">
              {ctx.data.books.filter(b => !reader.toRead.includes(b.id) && !reader.wishlist.includes(b.id)).slice(0, 8).map(b => (
                <button key={b.id} type="button" className="rdChip rdChip--button" onClick={() => void ctx.data.actions.toggleToRead(b.id, true)}><BookmarkIcon size={14} />{b.title}</button>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Journal (the reviews arrive with the Book page)

export function JournalConsole({ ctx, size }: { ctx: ReaderCtx; size: 'tile' | 'full' }) {
  const { reader } = ctx.data
  if (!reader) return null
  const finished = Object.entries(reader.progress).filter(([, p]) => p.finishedAt)
  return (
    <>
      <Card title="Finished" Icon={GoalIcon}>
        {finished.length === 0 ? <p className="rdMuted">Nothing finished yet. A finished book is ready for a review.</p> : (
          <ul className="rdList">
            {finished.map(([id]) => <li key={id} className="rdItem"><b>{ctx.data.bookById(id)?.title ?? id}</b><span className="rdMuted">Ready for a review</span></li>)}
          </ul>
        )}
      </Card>
      {size === 'full' && (
        <Card title="Reviews, notes and reactions" Icon={HeartIcon}>
          <p className="rdMuted">Your reviews, notes and reactions are collected here as you read; they arrive with the Book and Pages pages.</p>
        </Card>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Analytics

const METRICS: Array<{ key: ActivityMetric; label: string }> = [{ key: 'pages', label: 'Pages' }, { key: 'minutes', label: 'Minutes' }, { key: 'sessions', label: 'Sessions' }]

export function ActivityCalendar({ ctx }: { ctx: ReaderCtx }) {
  const [metric, setMetric] = useState<ActivityMetric>('pages')
  const grid = useMemo(() => buildActivityGrid(ctx.data.reader?.activity ?? {}, ctx.today, metric), [ctx.data.reader?.activity, ctx.today, metric])
  return (
    <Card title="Activity, last 12 months" Icon={GoalIcon}>
      <div className="rdCal">
        <div className="rdCalDays" aria-hidden="true"><span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /></div>
        <div className="rdCalScroll">
          <div className="rdCalMonths" style={{ gridTemplateColumns: `repeat(${grid.weeks}, 14px)` }}>
            {grid.months.map(m => <span key={`${m.label}-${m.col}`} style={{ gridColumn: m.col }}>{m.label}</span>)}
          </div>
          <div className="rdCalGrid" role="img" aria-label={`${grid.total} ${metric} on ${grid.activeDays} days`}>
            {grid.cells.map(c => <i key={c.date} className={`rdCalCell rdCalCell--${c.level < 0 ? 'x' : c.level}`} title={c.title} />)}
          </div>
        </div>
      </div>
      <div className="rdRow">
        {METRICS.map(m => <button key={m.key} type="button" className={metric === m.key ? 'rdChip rdChip--on rdChip--button' : 'rdChip rdChip--button'} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>)}
        <span className="rdMuted">{grid.total.toLocaleString('en-US')} {metric} on {grid.activeDays} days</span>
        <span className="rdCalLegend" aria-hidden="true">Less{[0, 1, 2, 3, 4].map(l => <i key={l} className={`rdCalCell rdCalCell--${l}`} />)}More</span>
      </div>
    </Card>
  )
}

export function AnalyticsConsole({ ctx, size }: { ctx: ReaderCtx; size: 'tile' | 'full' }) {
  const { reader } = ctx.data
  const [goals, setGoals] = useStoredState<{ booksPerYear: number; pagesPerDay: number }>('scriblr.reader.goals', { booksPerYear: 24, pagesPerDay: 20 })
  if (!reader) return null
  const days = Object.entries(reader.activity)
  const weekStart = new Date(Date.parse(`${ctx.today}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10)
  const week = days.filter(([d]) => d >= weekStart && d <= ctx.today)
  const pages = week.reduce((n, [, a]) => n + a.pages, 0)
  const minutes = week.reduce((n, [, a]) => n + a.minutes, 0)
  const streak = currentStreak(reader.activity, ctx.today)
  const year = ctx.today.slice(0, 4)
  const finishedThisYear = Object.values(reader.progress).filter(p => p.finishedAt?.startsWith(year)).length
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.parse(`${weekStart}T00:00:00Z`) + i * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    return { key, label: 'SMTWTFS'[d.getUTCDay()], pages: reader.activity[key]?.pages ?? 0 }
  })
  const top = Math.max(1, ...perDay.map(d => d.pages))
  const byGenre = new Map<string, number>()
  for (const [id, position] of Object.entries(reader.progress)) {
    const book = ctx.data.bookById(id)
    if (book) for (const g of book.genres) byGenre.set(g, (byGenre.get(g) ?? 0) + Math.round((book.wordCount * position.pct) / 100))
  }
  const genreTotal = [...byGenre.values()].reduce((a, b) => a + b, 0)
  return (
    <>
      <div className="rdGrid4">
        <Stat value={pages} label="pages this week" />
        <Stat value={`${(minutes / 60).toFixed(1)} h`} label="time reading" />
        <Stat value={minutes > 0 ? Math.round((pages / minutes) * 60) : 0} label="pages an hour" />
        <Stat value={plural(streak, 'day')} label="streak" />
      </div>
      <ActivityCalendar ctx={ctx} />
      {size === 'full' && (
        <>
          <Card title="Pages per day this week" Icon={GoalIcon}>
            <div className="rdCols" role="img" aria-label="Pages per day this week">
              {perDay.map(d => <div key={d.key}><span>{d.pages}</span><i style={{ height: `${Math.max(2, (d.pages / top) * 84)}px` }} /><span>{d.label}</span></div>)}
            </div>
          </Card>
          <div className="rdGrid2">
            <Card title="Genres read">
              {genreTotal === 0 ? <p className="rdMuted">Your genres appear as you read.</p> : [...byGenre.entries()].sort((a, b) => b[1] - a[1]).map(([g, w]) => (
                <div key={g}><div className="rdRow"><span className="rdGrow">{g}</span><span>{Math.round((w / genreTotal) * 100)}%</span></div><Meter percent={(w / genreTotal) * 100} /></div>
              ))}
            </Card>
            <Card title="Goals" Icon={GoalIcon}>
              <label className="rdRow"><span className="rdGrow">Books this year</span>
                <input className="rdField rdField--num" type="number" min={1} max={500} aria-label="Books to finish this year" value={goals.booksPerYear} onChange={e => setGoals({ ...goals, booksPerYear: Math.max(1, Number(e.target.value) || 1) })} />
              </label>
              <div className="rdRow"><span className="rdGrow">Finished</span><span>{finishedThisYear} of {goals.booksPerYear}</span></div>
              <Meter percent={(finishedThisYear / goals.booksPerYear) * 100} />
              <label className="rdRow"><span className="rdGrow">Pages a day</span>
                <input className="rdField rdField--num" type="number" min={1} max={2000} aria-label="Pages to read a day" value={goals.pagesPerDay} onChange={e => setGoals({ ...goals, pagesPerDay: Math.max(1, Number(e.target.value) || 1) })} />
              </label>
              <div className="rdRow"><span className="rdGrow">Today</span><span>{reader.activity[ctx.today]?.pages ?? 0} of {goals.pagesPerDay}</span></div>
              <Meter percent={((reader.activity[ctx.today]?.pages ?? 0) / goals.pagesPerDay) * 100} accent />
            </Card>
          </div>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Feed (the people you follow arrive with the social slice)

export function FeedConsole({ ctx, size }: { ctx: ReaderCtx; size: 'tile' | 'full' }) {
  const { reader, books } = ctx.data
  if (!reader) return null
  const fresh = [...books].filter(b => b.publishedAt).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')).slice(0, size === 'full' ? 8 : 4)
  return (
    <>
      {reader.notifications.length > 0 && (
        <Card title="Notifications" Icon={BellIcon}>
          <ul className="rdList">{reader.notifications.map(n => (
            <li key={n.id} className="rdItem"><div className="rdItemMain"><b>{n.title}</b><span className="rdMuted">{ctx.data.bookById(n.detail)?.title ?? n.detail}</span></div></li>
          ))}</ul>
          {size === 'full' && <button type="button" className="rdBtn" onClick={() => void ctx.data.actions.readNotifications()}>Mark all read</button>}
        </Card>
      )}
      <Card title="New in the library" Icon={BellIcon}>
        <ul className="rdList">
          {fresh.map(b => (
            <li key={b.id} className="rdItem">
              <button type="button" className="rdLink" onClick={() => ctx.openBook(b.id)}><b>{b.title}</b></button>
              <span className="rdMuted">{b.authorName} · {b.type} · {b.publishedAt ? shortDate(b.publishedAt) : ''}</span>
            </li>
          ))}
        </ul>
      </Card>
      {size === 'full' && <p className="rdMuted">Activity from the readers, authors and clubs you follow shows here once you follow someone.</p>}
    </>
  )
}
