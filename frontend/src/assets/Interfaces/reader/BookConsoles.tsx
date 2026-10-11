import type { CSSProperties } from 'react'
import type { CatalogBook } from '../../../api/reader'
import { BagIcon, BookmarkIcon, FlagIcon, PlayIcon, SwapIcon, TicketIcon } from '../../icons'
import { fillColorCss } from '../../../theme/bookColors'
import { Card, Chip, Meter } from './ReaderBits'
import type { ReaderCtx } from './readerContext'
import { dollars, dueText, ratingText, readingTime, shortDate, stars, wordsText } from './readerFormat'

// The Book page's Bookcover console, laid out like the Writer's book editor: the title and its meta line, how far the reader has come, then
// a cover with a spine edge and page edges in the book's colour beside the details and the ways to read it.

export function BookCover3d({ book }: { book: CatalogBook }) {
  const style = { ['--rd-book' as string]: fillColorCss(book.hue) } as CSSProperties
  return (
    <div className="rdBook3d" style={style} aria-hidden="true">
      <span className="rdBookSpine" />
      <span className="rdBookFace"><span>{book.type}</span><b>{book.title}</b><span>{book.authorName}</span></span>
      <span className="rdBookPages" />
    </div>
  )
}

export function BookcoverConsole({ ctx, book, size }: { ctx: ReaderCtx; book: CatalogBook; size: 'tile' | 'full' }) {
  const { reader } = ctx.data
  if (!reader) return null
  const held = reader.holdings.find(h => h.bookId === book.id && h.status === 'active')
  const position = reader.progress[book.id]
  const lent = Boolean(held?.lentTo)
  return (
    <>
      <div className="rdBookHead">
        <h3 className="rdBig">{book.title}</h3>
        <span className="rdMuted">{book.type} · {book.authorName}{book.series ? ` · ${book.series.title}, book ${book.series.order}` : ''} · {wordsText(book.wordCount)}</span>
        <span className="rdBookHeadRight"><span className="rdStars">{stars(book.rating)}</span><span className="rdMuted">{ratingText(book.rating, book.ratings)}</span></span>
      </div>
      {held && (
        <Card>
          <div className="rdRow"><span className="rdGrow">{position ? `You have read ${Math.round(position.pct)}%` : 'Not started'}</span>
            <span>{position ? `${Math.round((book.wordCount * position.pct) / 100).toLocaleString('en-US')} of ${book.wordCount.toLocaleString('en-US')} words` : ''}</span></div>
          <Meter percent={position?.pct ?? 0} />
        </Card>
      )}
      <div className="rdHero">
        <BookCover3d book={book} />
        <div className="rdHeroBody">
          <div className="rdRow">
            <FlagIcon size={16} />
            {book.flags.length === 0 ? <span className="rdMuted">No content flags</span> : book.flags.map(f => {
              const cls = reader.flagClasses[f.key] ?? f.defaultClass
              return <Chip key={f.key} on={cls !== 'hidden'} title={`${f.name}: ${cls}`}>{f.name} · {cls}</Chip>
            })}
          </div>
          <div className="rdRow">
            {held && <button type="button" className="rdBtn rdBtn--pri" disabled title="The e-reader arrives in a later release"><PlayIcon size={16} />{position ? `Continue · ${Math.round(position.pct)}%` : 'Start reading'}</button>}
            {book.editions < 1 ? <Chip>Coming soon: no edition yet</Chip> : (
              <>
                {!held && <button type="button" className="rdBtn rdBtn--pri" onClick={() => ctx.borrow(book)}><BagIcon size={16} />Borrow · 1 credit</button>}
                {!held && <button type="button" className="rdBtn" onClick={() => ctx.borrow(book)}><BagIcon size={16} />Buy · {dollars(book.buyPriceCents)}</button>}
                {held?.kind === 'borrowed' && <Chip on><TicketIcon size={14} />{dueText(held.dueAt)}{held.dueAt ? ` (${shortDate(held.dueAt)})` : ''}</Chip>}
                {held?.kind === 'owned' && !lent && <Chip on><SwapIcon size={14} />Owned</Chip>}
                {lent && <Chip on>Lent to {held?.lentTo}</Chip>}
              </>
            )}
            <button type="button" className="rdBtn" onClick={() => void ctx.data.actions.toggleWishlist(book.id, !reader.wishlist.includes(book.id))}><BookmarkIcon size={16} />{reader.wishlist.includes(book.id) ? 'On wishlist' : 'Wishlist'}</button>
          </div>
          {size === 'full' && (
            <div className="rdGrid2">
              <Card title="Synopsis"><p className="rdQuote">{book.blurb || 'No synopsis yet.'}</p></Card>
              <Card title="Details">
                <div className="rdRow">{[...book.genres, ...book.tropes].map(t => <Chip key={t}>{t}</Chip>)}</div>
                <span className="rdMuted">{wordsText(book.wordCount)} · about {readingTime(book.wordCount)} · edition {book.editions}{book.publishedAt ? ` · published ${shortDate(book.publishedAt)}` : ''}</span>
              </Card>
            </div>
          )}
          {size === 'full' && <p className="rdMuted">One credit lends a book for one month; spend several to stack months. Credits and purchases are simulated: no money moves.</p>}
        </div>
      </div>
    </>
  )
}
