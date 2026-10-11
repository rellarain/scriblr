import { useEffect, useState, type ReactNode } from 'react'
import type { CatalogBook } from '../../../api/reader'
import { BagIcon, BookmarkIcon, CloseIcon, HistoryIcon, TicketIcon } from '../../icons'
import { Card, Chip, CoverBlock } from './ReaderBits'
import type { ReaderCtx } from './readerContext'
import { dollars, months, plural, shortDate } from './readerFormat'

// Dialogs open over the Reader: the plan and the credit ledger, and borrowing or buying a book. All money here is simulated.

export function ReaderDialog({ title, Icon, onClose, children }: { title: string; Icon: (p: { size?: number }) => ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="rdModalBg" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rdModal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="rdModalHead">
          <h3><Icon size={16} />{title}</h3>
          <button type="button" className="rdIconBtn" aria-label="Close" onClick={onClose}><CloseIcon size={20} /></button>
        </div>
        <div className="rdModalBody">{children}</div>
      </div>
    </div>
  )
}

const addMonths = (from: Date, n: number): Date => {
  const d = new Date(from)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d
}

// The split of what a borrow pays (cents): the base borrow's $6 is $2 Scriblr, $3 the author, $1 the lender (else Scriblr); an extra borrow's $2 is the same shape.
export const SPLITS = {
  base: { scriblr: 200, author: 300, lender: 100 },
  extra: { scriblr: 67, author: 100, lender: 33 },
}

export function PlanDialog({ ctx, onClose }: { ctx: ReaderCtx; onClose: () => void }) {
  const { reader } = ctx.data
  const [error, setError] = useState<string | null>(null)
  if (!reader) return null
  const setExtra = async (n: number) => {
    setError(null)
    try { await ctx.data.actions.setPlan(n) } catch (e) { setError(e instanceof Error ? e.message : 'Could not change the plan.') }
  }
  const extra = reader.plan.extraCredits
  return (
    <ReaderDialog title="Your plan and credits" Icon={TicketIcon} onClose={onClose}>
      <div className="rdGrid2">
        <Card title="Plan" Icon={TicketIcon}>
          <div className="rdRow"><span className="rdGrow">Base: 1 borrow credit a month</span><b>{dollars(600)}</b></div>
          <div className="rdRow">
            <span className="rdGrow">Extra credits a month, {dollars(200)} each</span>
            <button type="button" className="rdBtn" aria-label="Fewer extra credits" disabled={extra <= 0} onClick={() => void setExtra(extra - 1)}>−</button>
            <b aria-live="polite">{extra}</b>
            <button type="button" className="rdBtn" aria-label="More extra credits" disabled={extra >= 10} onClick={() => void setExtra(extra + 1)}>+</button>
          </div>
          <div className="rdRow"><h3 className="rdCardTitle rdGrow">Total</h3><b className="rdBig">{dollars(reader.planPriceCents)} a month</b></div>
          <p className="rdMuted">
            {plural(reader.creditsPerMonth, 'credit')} a month. You have {plural(reader.balance, 'credit')} now. Unused credits roll over with no expiry, and changing your plan keeps them; a
            change starts with next month&rsquo;s credits. Billing is simulated: no money moves.
          </p>
          {error && <p className="rdError" role="alert">{error}</p>}
        </Card>
        <Card title="Where a borrow's money goes" Icon={BagIcon}>
          <div className="rdRow"><span className="rdGrow">Base borrow</span><span>Scriblr {dollars(SPLITS.base.scriblr)} · Author {dollars(SPLITS.base.author)} · Lender or Scriblr {dollars(SPLITS.base.lender)}</span></div>
          <div className="rdRow"><span className="rdGrow">Each extra borrow ({dollars(200)})</span><span>Scriblr {dollars(SPLITS.extra.scriblr)} · Author {dollars(SPLITS.extra.author)} · Lender or Scriblr {dollars(SPLITS.extra.lender)}</span></div>
          <p className="rdMuted">The lender share goes to the reader who lent an owned copy; otherwise Scriblr keeps it. Authors see their share per book in the Writer.</p>
        </Card>
      </div>
      <Card title="Credit ledger" Icon={HistoryIcon}>
        <table className="rdTable">
          <thead><tr><th>Date</th><th>Book</th><th>Credits</th><th>What happened</th></tr></thead>
          <tbody>
            {reader.ledger.slice(0, 30).map(e => (
              <tr key={e.id}>
                <td>{shortDate(e.at)}</td>
                <td>{e.bookId ? ctx.data.bookById(e.bookId)?.title ?? e.bookId : 'Plan'}</td>
                <td><b>{e.delta > 0 ? `+${e.delta}` : e.delta}</b></td>
                <td>{e.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </ReaderDialog>
  )
}

export function BorrowDialog({ ctx, book, onClose }: { ctx: ReaderCtx; book: CatalogBook; onClose: () => void }) {
  const { reader } = ctx.data
  const [credits, setCredits] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!reader) return null
  const held = reader.holdings.find(h => h.bookId === book.id && h.status === 'active')
  const max = Math.max(1, Math.min(4, reader.balance))
  const due = addMonths(new Date(), credits)
  const run = async (call: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await call(); onClose() } catch (e) { setError(e instanceof Error ? e.message : 'That did not go through.') } finally { setBusy(false) }
  }
  return (
    <ReaderDialog title={`Borrow or buy · ${book.title}`} Icon={BagIcon} onClose={onClose}>
      <div className="rdBorrow">
        <div className="rdBorrowCover"><CoverBlock book={book} /></div>
        <div className="rdBorrowBody">
          <div className="rdRow"><Chip on>{book.type}</Chip><span className="rdMuted">{book.authorName}</span></div>
          {held ? <p>{held.kind === 'owned' ? 'You own this book.' : `You are borrowing it until ${held.dueAt ? shortDate(held.dueAt) : ''}.`}</p> : (
            <>
              <div className="rdRow">
                <span className="rdGrow">Credits to spend (1 credit = 1 month on this book)</span>
                <button type="button" className="rdBtn" aria-label="Fewer credits" disabled={credits <= 1} onClick={() => setCredits(credits - 1)}>−</button>
                <b aria-live="polite">{credits}</b>
                <button type="button" className="rdBtn" aria-label="More credits" disabled={credits >= max} onClick={() => setCredits(credits + 1)}>+</button>
              </div>
              <div className="rdRow">
                <Chip on>{months(credits)}</Chip>
                <Chip>Until {shortDate(due.toISOString())}</Chip>
                <Chip>Credits: {reader.balance} available, {reader.balance - credits} after</Chip>
              </div>
              <p className="rdMuted">
                Cancel before you open it, or return it in under 14 days with less than half read, and every credit comes back. An extension costs one more credit.
                Credits and purchases are simulated: no money moves.
              </p>
              {reader.balance < 1 && <p className="rdError" role="alert">You have no credits. Add credits to your plan, or buy the book.</p>}
              <div className="rdRow">
                <button type="button" className="rdBtn rdBtn--pri" disabled={busy || reader.balance < credits} onClick={() => void run(() => ctx.data.actions.borrow(book.id, credits))}>Borrow for {months(credits)}</button>
                <button type="button" className="rdBtn" disabled={busy} onClick={() => void run(() => ctx.data.actions.buy(book.id))}>Buy · {dollars(book.buyPriceCents)}</button>
                <button type="button" className="rdBtn" onClick={() => void ctx.data.actions.toggleWishlist(book.id, !reader.wishlist.includes(book.id))}><BookmarkIcon size={16} />{reader.wishlist.includes(book.id) ? 'On wishlist' : 'Wishlist'}</button>
                <button type="button" className="rdBtn" onClick={ctx.openPlan}><TicketIcon size={16} />Plan</button>
              </div>
            </>
          )}
          {error && <p className="rdError" role="alert">{error}</p>}
        </div>
      </div>
    </ReaderDialog>
  )
}
