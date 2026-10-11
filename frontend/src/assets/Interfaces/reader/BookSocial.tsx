import { useState } from 'react'
import type { CatalogBook, ClubPost, ClubView, PublicReview, ReportKind } from '../../../api/reader'
import { ChevronLeftIcon, FlagIcon, FollowIcon, NoteIcon, PencilIcon, PeopleIcon, PlusIcon, SpoilerIcon, TrashIcon } from '../../icons'
import { Card, Chip, Meter, Stat } from './ReaderBits'
import type { ReaderCtx } from './readerContext'
import { readingTime, shortDate } from './readerFormat'
import { canReread, initialsOf, latestRead, personName, reviewOf, scoreStars, sortReviews, visiblePosts, visibleReviews, type ReviewSort } from './readerSocial'

// The Book page's community consoles: Bookface (the book's readers, its clubs and their threads) and Bookcard (what readers say about it, and the
// reader's own review and notes). Everything posted here is kept on this machine; the seeded readers never answer.

const useRun = () => {
  const [error, setError] = useState<string | null>(null)
  const run = async (call: () => Promise<unknown>) => {
    setError(null)
    try { await call() } catch (e) { setError(e instanceof Error ? e.message : 'That did not go through.') }
  }
  return { error, run }
}

export const Avatar = ({ name }: { name: string }) => <span className="rdAv" aria-hidden="true">{initialsOf(name)}</span>

function FollowButton({ ctx, whom, name }: { ctx: ReaderCtx; whom: string; name: string }) {
  const on = ctx.data.reader?.following.includes(whom) ?? false
  return (
    <button type="button" className={on ? 'rdBtn rdBtn--small rdBtn--on' : 'rdBtn rdBtn--small'} aria-pressed={on} aria-label={`${on ? 'Unfollow' : 'Follow'} ${name}`}
      onClick={() => void ctx.data.actions.follow(whom, !on)}>
      <FollowIcon size={16} />{on ? 'Following' : 'Follow'}
    </button>
  )
}

// Hide, report or block: a reported review or post is hidden for this reader until they undo it. Nothing is sent anywhere.
function ReportMenu({ ctx, kind, targetId, readerId, label }: { ctx: ReaderCtx; kind: ReportKind; targetId: string; readerId?: string; label: string }) {
  const [open, setOpen] = useState(false)
  const { run } = useRun()
  const { actions } = ctx.data
  const send = (reason: string) => void run(async () => { await actions.report(kind, targetId, reason); setOpen(false) })
  if (!open) {
    return <button type="button" className="rdBtn rdBtn--small" aria-label={`Hide or report ${label}`} onClick={() => setOpen(true)}><FlagIcon size={16} />Hide or report</button>
  }
  return (
    <span className="rdRow" role="group" aria-label={`Hide or report ${label}`}>
      <button type="button" className="rdBtn rdBtn--small" onClick={() => send('hide')}>Hide</button>
      <button type="button" className="rdBtn rdBtn--small" onClick={() => send('spoiler')}>Spoiler</button>
      <button type="button" className="rdBtn rdBtn--small" onClick={() => send('abuse')}>Abuse</button>
      <button type="button" className="rdBtn rdBtn--small" onClick={() => send('spam')}>Spam</button>
      {readerId && <button type="button" className="rdBtn rdBtn--small" onClick={() => void run(() => actions.block(readerId, true))}>Block reader</button>}
      <button type="button" className="rdBtn rdBtn--small" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  )
}

function HiddenRow({ ctx, kind, ids }: { ctx: ReaderCtx; kind: ReportKind; ids: string[] }) {
  const { reader, actions } = ctx.data
  const reports = (reader?.reports ?? []).filter(r => r.kind === kind && ids.includes(r.targetId))
  if (reports.length === 0) return null
  return (
    <div className="rdRow">
      <span className="rdMuted">{reports.length} hidden by you</span>
      {reports.map(r => <button key={r.id} type="button" className="rdBtn rdBtn--small" onClick={() => void actions.undoReport(r.id)}>Undo ({r.reason})</button>)}
    </div>
  )
}

// A spoiler stays shut until it is tapped.
function Spoiler({ label, children }: { label: string; children: string }) {
  const [shown, setShown] = useState(false)
  if (shown) return <p className="rdQuote rdSpoilerOpen" onClick={() => setShown(false)}>{children}</p>
  return <button type="button" className="rdBtn rdBtn--small rdSpoiler" onClick={() => setShown(true)}><SpoilerIcon size={16} />{label} · tap to reveal</button>
}

// ---------------------------------------------------------------------------------------------------------------------- Bookface

function ClubThread({ ctx, view, onBack }: { ctx: ReaderCtx; view: ClubView; onBack: () => void }) {
  const { reader, actions } = ctx.data
  const [text, setText] = useState('')
  const [spoiler, setSpoiler] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const { error, run } = useRun()
  if (!reader) return null
  const { club } = view
  const posts = visiblePosts(view.posts, reader.reports, reader.blocked)
  const roots = posts.filter(p => !p.replyTo)
  const repliesOf = (id: string) => posts.filter(p => p.replyTo === id)
  const names = club.members.map(id => personName(ctx.data, id))
  const send = () => run(async () => { await actions.post(club.id, text, spoiler, replyTo); setText(''); setSpoiler(false); setReplyTo(null) })
  const Post = ({ post, nested }: { post: ClubPost; nested?: boolean }) => (
    <li className={nested ? 'rdItem rdItem--nested' : 'rdItem'}>
      <Avatar name={personName(ctx.data, post.authorId)} />
      <div className="rdItemMain">
        <span><b>{personName(ctx.data, post.authorId)}</b> <span className="rdMuted">{shortDate(post.at)}</span></span>
        {post.spoiler ? <Spoiler label="Spoiler post">{post.text}</Spoiler> : <p className="rdPostText">{post.text}</p>}
        <span className="rdRow">
          {!nested && view.joined && <button type="button" className="rdBtn rdBtn--small" aria-label={`Reply to ${personName(ctx.data, post.authorId)}`} onClick={() => setReplyTo(post.id)}>Reply</button>}
          {post.authorId === 'me'
            ? <button type="button" className="rdBtn rdBtn--small" aria-label="Delete my post" onClick={() => void run(() => actions.deletePost(post.id))}><TrashIcon size={16} />Delete</button>
            : <ReportMenu ctx={ctx} kind="post" targetId={post.id} readerId={post.authorId} label={`the post by ${personName(ctx.data, post.authorId)}`} />}
        </span>
      </div>
    </li>
  )
  return (
    <>
      <div className="rdRow">
        <button type="button" className="rdBtn rdBtn--small" onClick={onBack}><ChevronLeftIcon size={16} />All clubs</button>
        <h3 className="rdBig rdGrow">{club.name}</h3>
        <button type="button" className={view.joined ? 'rdBtn rdBtn--on' : 'rdBtn rdBtn--pri'} disabled={club.mine} onClick={() => void run(() => actions.joinClub(club.id, !view.joined))}>
          {view.joined ? 'Leave club' : 'Join club'}
        </button>
        {club.mine && <button type="button" className="rdBtn" onClick={() => void run(async () => { await actions.deleteClub(club.id); onBack() })}><TrashIcon size={16} />Delete club</button>}
      </div>
      <p className="rdMuted">{club.description}</p>
      <div className="rdRow">
        {club.meets && <Chip on>{club.meets}</Chip>}
        {club.nextMeetingAt && <Chip>Next: {shortDate(club.nextMeetingAt)}</Chip>}
        <Chip>{view.memberCount} members</Chip>
        {club.bookId && <Chip>Reading {ctx.data.bookById(club.bookId)?.title ?? club.bookId}</Chip>}
      </div>
      {names.length > 0 && <div className="rdRow">{names.map(n => <span key={n} className="rdRow"><Avatar name={n} /><span className="rdMuted">{n}</span></span>)}</div>}
      <ul className="rdList" aria-label={`${club.name} thread`}>
        {roots.map(p => (
          <li key={p.id} className="rdThread">
            <ul className="rdList"><Post post={p} />{repliesOf(p.id).map(r => <Post key={r.id} post={r} nested />)}</ul>
          </li>
        ))}
        {roots.length === 0 && <li className="rdMuted">No posts yet.</li>}
      </ul>
      <HiddenRow ctx={ctx} kind="post" ids={view.posts.map(p => p.id)} />
      {view.joined ? (
        <div className="rdCompose">
          {replyTo && <span className="rdRow"><Chip on>Replying to {personName(ctx.data, view.posts.find(p => p.id === replyTo)?.authorId ?? '')}</Chip><button type="button" className="rdBtn rdBtn--small" onClick={() => setReplyTo(null)}>Cancel reply</button></span>}
          <textarea className="rdText" aria-label="Write a post" rows={3} maxLength={2000} placeholder="Say something about the book. Mark spoilers." value={text} onChange={e => setText(e.target.value)} />
          <div className="rdRow">
            <label className="rdCheck"><input type="checkbox" checked={spoiler} onChange={e => setSpoiler(e.target.checked)} />Contains spoilers</label>
            <button type="button" className="rdBtn rdBtn--pri" disabled={!text.trim()} onClick={() => void send()}><PencilIcon size={16} />Post</button>
          </div>
          <p className="rdMuted">Posts stay on this machine: the other readers here are a demonstration and will not answer.</p>
        </div>
      ) : <p className="rdMuted">Join the club to post in it.</p>}
      {error && <p className="rdError" role="alert">{error}</p>}
    </>
  )
}

export function BookfaceConsole({ ctx, book, size }: { ctx: ReaderCtx; book: CatalogBook; size: 'tile' | 'full' }) {
  const { reader, actions, clubs, details } = ctx.data
  const [openId, setOpenId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [meets, setMeets] = useState('')
  const { error, run } = useRun()
  const detail = details[book.id]
  if (!reader) return null
  const open = clubs.find(c => c.club.id === openId)
  if (open) return <ClubThread ctx={ctx} view={open} onBack={() => setOpenId(null)} />
  const here = clubs.filter(c => c.club.bookId === book.id)
  const others = clubs.filter(c => c.club.bookId !== book.id)
  const ClubRow = ({ view }: { view: ClubView }) => (
    <li className="rdItem">
      <div className="rdItemMain">
        <button type="button" className="rdLink" onClick={() => setOpenId(view.club.id)}><b>{view.club.name}</b></button>
        <span className="rdMuted">{view.memberCount} members{view.club.meets ? ` · ${view.club.meets}` : ''}</span>
      </div>
      <button type="button" className={view.joined ? 'rdBtn rdBtn--on' : 'rdBtn'} aria-pressed={view.joined} aria-label={`${view.joined ? 'Leave' : 'Join'} ${view.club.name}`} disabled={view.club.mine}
        onClick={() => void run(() => actions.joinClub(view.club.id, !view.joined))}>
        <FollowIcon size={16} />{view.joined ? 'Joined' : 'Join'}
      </button>
    </li>
  )
  const start = () => run(async () => {
    const before = new Set(reader.joinedClubs)
    const next = await actions.startClub(name, '', book.id, meets)
    setName(''); setMeets(''); setNaming(false)
    const made = next.joinedClubs.find(id => !before.has(id))
    if (made) setOpenId(made)
  })
  return (
    <>
      {detail && (
        <div className="rdGrid4">
          <Stat value={detail.stats.readingNow.toLocaleString('en-US')} label="reading now" />
          <Stat value={readingTime(detail.stats.averageMinutes * 250)} label="average to finish" />
          <Stat value={`${detail.stats.finishPercent}%`} label="finish it" />
          <Stat value={here.length} label={here.length === 1 ? 'club' : 'clubs'} />
        </div>
      )}
      <Card title="Clubs for this book" Icon={PeopleIcon}>
        {here.length === 0 ? <p className="rdMuted">No club is reading this book yet.</p> : <ul className="rdList">{here.map(v => <ClubRow key={v.club.id} view={v} />)}</ul>}
        {naming ? (
          <div className="rdRow">
            <input className="rdField" aria-label="Club name" placeholder="Name the club" maxLength={80} value={name} onChange={e => setName(e.target.value)} />
            <input className="rdField" aria-label="When it meets" placeholder="When it meets (optional)" maxLength={120} value={meets} onChange={e => setMeets(e.target.value)} />
            <button type="button" className="rdBtn rdBtn--pri" disabled={!name.trim()} onClick={() => void start()}>Start club</button>
            <button type="button" className="rdBtn" onClick={() => setNaming(false)}>Cancel</button>
          </div>
        ) : <div className="rdRow"><button type="button" className="rdBtn" onClick={() => setNaming(true)}><PlusIcon size={16} />Start a club</button></div>}
        {error && <p className="rdError" role="alert">{error}</p>}
      </Card>
      {book.authorId !== 'you' && (
        <Card title="The author" Icon={FollowIcon}>
          <div className="rdRow"><Avatar name={book.authorName} /><b className="rdGrow">{book.authorName}</b><FollowButton ctx={ctx} whom={book.authorId} name={book.authorName} /></div>
          <p className="rdMuted">Follow an author to see their news in your Feed, and a note when they add to a book.</p>
        </Card>
      )}
      {size === 'full' && detail && (
        <Card title="Where readers finish">
          <div className="rdCols">{detail.stats.leaveBars.map((h, i) => <div key={i}><i style={{ height: `${Math.min(100, h * 2.4)}px` }} /><span>{i === 7 ? 'End' : `${(i + 1) * 12}%`}</span></div>)}</div>
          <p className="rdMuted">Share of readers who stop in each eighth of the book (anonymous totals).</p>
        </Card>
      )}
      {size === 'full' && others.length > 0 && (
        <Card title="Other clubs" Icon={PeopleIcon}><ul className="rdList">{others.map(v => <ClubRow key={v.club.id} view={v} />)}</ul></Card>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------------- Bookcard

function ReviewItem({ ctx, review, hideSpoilers }: { ctx: ReaderCtx; review: PublicReview; hideSpoilers: boolean }) {
  const criteria = Object.entries(review.criteria)
  return (
    <li className="rdItem rdItem--review">
      <Avatar name={review.name} />
      <div className="rdItemMain">
        <span className="rdRow">
          <b>{review.name}</b><span className="rdStars" role="img" aria-label={`${review.score} of 10`}>{scoreStars(review.score)}</span>
          <Chip>{review.score} of 10</Chip>
          {review.reads > 1 && <Chip title="The latest read is shown; older reads are on tabs for this reader">Read {review.reads} times</Chip>}
          {review.edited && <Chip>edited</Chip>}
          {!review.mine && <FollowButton ctx={ctx} whom={review.readerId} name={review.name} />}
        </span>
        {review.comment && <p className="rdPostText">{review.comment}</p>}
        {criteria.length > 0 && <span className="rdRow">{criteria.map(([n, v]) => <Chip key={n}>{n} {v}</Chip>)}</span>}
        {review.spoilerEssay && !hideSpoilers && <Spoiler label="Spoiler essay">{review.spoilerEssay}</Spoiler>}
        {!review.mine && <ReportMenu ctx={ctx} kind="review" targetId={review.id} readerId={review.readerId} label={`the review by ${review.name}`} />}
      </div>
    </li>
  )
}

function MyNotes({ ctx, book }: { ctx: ReaderCtx; book: CatalogBook }) {
  const { reader, actions } = ctx.data
  const [quote, setQuote] = useState('')
  const [note, setNote] = useState('')
  const { error, run } = useRun()
  if (!reader) return null
  const mine = reader.notes.filter(n => n.bookId === book.id)
  return (
    <Card title="My notes on this book" Icon={NoteIcon}>
      {mine.length === 0 ? <p className="rdMuted">Notes and highlights you keep while reading are collected here.</p> : (
        <ul className="rdList">
          {mine.map(n => (
            <li key={n.id} className="rdItem">
              <div className="rdItemMain">{n.quote && <span className="rdQuote">&ldquo;{n.quote}&rdquo;</span>}{n.note && <span>{n.note}</span>}<span className="rdMuted">{shortDate(n.at)}</span></div>
              <button type="button" className="rdIconBtn rdIconBtn--small" aria-label="Delete note" onClick={() => void run(() => actions.deleteNote(n.id))}><TrashIcon size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="rdRow">
        <input className="rdField rdGrow" aria-label="Quote" placeholder="A passage (optional)" maxLength={2000} value={quote} onChange={e => setQuote(e.target.value)} />
        <input className="rdField rdGrow" aria-label="Note" placeholder="Your note" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} />
        <button type="button" className="rdBtn" disabled={!quote.trim() && !note.trim()} onClick={() => void run(async () => { await actions.addNote(book.id, quote, note); setQuote(''); setNote('') })}><PlusIcon size={16} />Add</button>
      </div>
      {error && <p className="rdError" role="alert">{error}</p>}
    </Card>
  )
}

export function BookcardConsole({ ctx, book, size }: { ctx: ReaderCtx; book: CatalogBook; size: 'tile' | 'full' }) {
  const { reader, cards, actions } = ctx.data
  const [sort, setSort] = useState<ReviewSort>('top')
  const [hideSpoilers, setHideSpoilers] = useState(false)
  const { error, run } = useRun()
  const card = cards[book.id]
  if (!reader) return null
  if (!card) return <p className="rdMuted" role="status">Loading what readers say…</p>
  const shown = sortReviews(visibleReviews(card.reviews, reader.reports, reader.blocked), sort)
  const mineReview = reviewOf(reader, book.id)
  const mineRead = latestRead(mineReview)
  const setScore = (score: number) => run(() => actions.saveReview(book.id, {
    score, criteria: mineRead?.criteria ?? {}, comment: mineRead?.comment ?? '', spoilerEssay: mineRead?.spoilerEssay ?? '', noteIds: mineRead?.noteIds ?? [],
  }))
  const status = !mineRead ? 'Not reviewed yet' : mineRead.status === 'posted' ? `Posted${mineRead.editedAt ? ' · edited' : ''}` : 'Draft, saved privately'
  return (
    <>
      <div className="rdRow">
        <b className="rdBig">{card.rating.toFixed(1)}</b><span className="rdStars" role="img" aria-label={`${card.rating.toFixed(1)} of 10`}>{scoreStars(card.rating)}</span>
        <span className="rdMuted">{card.ratings.toLocaleString('en-US')} ratings</span>
      </div>
      {card.criteria.length > 0 && (
        <div className="rdBars" aria-label="Average score for each criterion">
          {card.criteria.map(c => <div key={c.name} className="rdBarRow"><span>{c.name}</span><Meter percent={c.average * 10} label={`${c.name} ${c.average} of 10`} /><b>{c.average.toFixed(1)}</b></div>)}
        </div>
      )}
      <div className="rdRow" role="group" aria-label="Sort and filter reviews">
        <button type="button" className={sort === 'top' ? 'rdChip rdChip--on rdChip--button' : 'rdChip rdChip--button'} aria-pressed={sort === 'top'} onClick={() => setSort('top')}>Top</button>
        <button type="button" className={sort === 'newest' ? 'rdChip rdChip--on rdChip--button' : 'rdChip rdChip--button'} aria-pressed={sort === 'newest'} onClick={() => setSort('newest')}>Newest</button>
        <button type="button" className={hideSpoilers ? 'rdChip rdChip--on rdChip--button' : 'rdChip rdChip--button'} aria-pressed={hideSpoilers} onClick={() => setHideSpoilers(!hideSpoilers)}>Hide spoilers</button>
      </div>
      {shown.length === 0 ? <p className="rdMuted">No reviews to show.</p> : (
        <ul className="rdList" aria-label="Reviews">{(size === 'full' ? shown : shown.slice(0, 3)).map(r => <ReviewItem key={r.id} ctx={ctx} review={r} hideSpoilers={hideSpoilers} />)}</ul>
      )}
      <HiddenRow ctx={ctx} kind="review" ids={card.reviews.map(r => r.id)} />
      {size === 'full' && (
        <div className="rdGrid2">
          <Card title="My review" Icon={PencilIcon}>
            <div className="rdRow" role="group" aria-label="General score">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" className={mineRead?.score === n ? 'rdBtn rdBtn--small rdBtn--pri' : 'rdBtn rdBtn--small'} aria-pressed={mineRead?.score === n} onClick={() => void setScore(n)}>{n}</button>
              ))}
            </div>
            <span className="rdMuted">{status}{canReread(mineReview) ? ' · you can start a re-read' : ''}</span>
            <div className="rdRow"><button type="button" className="rdBtn rdBtn--pri" onClick={() => ctx.review(book)}><PencilIcon size={16} />Open full review</button></div>
            {error && <p className="rdError" role="alert">{error}</p>}
          </Card>
          <MyNotes ctx={ctx} book={book} />
        </div>
      )}
      {size === 'tile' && <button type="button" className="rdBtn" onClick={() => ctx.review(book)}><PencilIcon size={16} />{mineRead ? 'My review' : 'Write a review'}</button>}
    </>
  )
}
