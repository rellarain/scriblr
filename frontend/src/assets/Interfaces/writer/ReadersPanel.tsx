import { useEffect, useState } from 'react'
import { getPublishedBooks, type BookSummary } from '../../../api/bookPublishing'

// The Dash's Readers tab: every book the author has published, with its loans, sales, earnings (simulated) and rating.

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

export default function ReadersPanel() {
  const [books, setBooks] = useState<BookSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    getPublishedBooks().then(b => { if (live) setBooks(b) }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Could not load your books.') })
    return () => { live = false }
  }, [])
  if (error) return <p className="wrError" role="alert">{error}</p>
  if (!books) return <p className="wrMuted">Loading…</p>
  const total = books.reduce((n, b) => n + b.earningsCents, 0)
  return (
    <div className="wrCard">
      <div className="wrCardTitle">Readers and earnings</div>
      {books.length === 0 && <p className="wrMuted">You have not published a book yet. Publish chapters, then the book, from the Book level&rsquo;s Publish tab.</p>}
      <ul className="wrPublishList" aria-label="Published books">
        {books.map(b => (
          <li key={`${b.projectId}:${b.bookId}`} className="wrKv">
            <span><b>{b.title}</b> <span className="wrMuted">{b.listed ? `edition ${b.editions}` : 'unlisted'}</span></span>
            <span>{b.loans} loans · {b.sales} sales · {dollars(b.earningsCents)}{b.ratings > 0 ? ` · ${b.rating.toFixed(1)} of 10` : ''}{b.reviews > 0 ? ` · ${b.reviews} review${b.reviews === 1 ? '' : 's'}` : ''}</span>
          </li>
        ))}
      </ul>
      {books.length > 0 && <div className="wrKv"><b>Total, simulated</b><b>{dollars(total)}</b></div>}
    </div>
  )
}
