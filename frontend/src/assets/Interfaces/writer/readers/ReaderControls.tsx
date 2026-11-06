import { useEffect, useState } from 'react'
import { getExtrasPreview, getReaderExtras } from '../../../../api/bookPublishing'
import type { BookExtras, BookExtrasInfo, ExtrasChapter, ExtrasWarning } from '../../../../api/types'
import './readers.scss'

// The controls the Maps and Characters consoles share for what readers see: which book's chapters a reveal counts in, the chapter a thing is revealed at, the warning
// for a scene that comes before it, and the preview as a reader.

// The books of the project with the chapters of their next edition and the scenes that come before a reveal. Fetched again when `refreshKey` changes (after a save).
export function useExtrasInfo(projectId: string, refreshKey: unknown) {
  const [books, setBooks] = useState<BookExtrasInfo[]>([])
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    getReaderExtras(projectId).then(b => { if (live) { setBooks(Array.isArray(b) ? b : []); setFailed(false) } }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [projectId, refreshKey])
  const book = books.find(b => b.bookId === picked) ?? books[0] ?? null
  return { books, book, setBook: setPicked, failed }
}

// "From the start", or a chapter of the edition by number and title. A chapter the edition has not got yet (the book has fewer chapters published) is kept as it is.
export function RevealSelect({ label, value, chapters, onChange }: { label: string; value: number | null; chapters: ExtrasChapter[]; onChange: (chapter: number | null) => void }) {
  return (
    <select className="rvSelect" aria-label={label} title={label} value={value === null ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">From the start</option>
      {chapters.map(c => <option key={c.n} value={c.n}>{`Chapter ${c.n}: ${c.title}`}</option>)}
      {value !== null && !chapters.some(c => c.n === value) && <option value={value}>{`Chapter ${value} (not published yet)`}</option>}
    </select>
  )
}

// Which book the chapters belong to, when the project has several.
export function BookPick({ books, bookId, onPick }: { books: BookExtrasInfo[]; bookId: string | null; onPick: (id: string) => void }) {
  if (books.length < 2) return null
  return (
    <div className="rvField">
      <span className="rvLabel" aria-hidden="true">Chapters of the book</span>
      <select className="rvSelect" aria-label="Chapters of the book" value={bookId ?? ''} onChange={e => onPick(e.target.value)}>
        {books.map(b => <option key={b.bookId} value={b.bookId}>{b.title}</option>)}
      </select>
    </div>
  )
}

export function Warnings({ warnings }: { warnings: ExtrasWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <ul className="rvList" aria-label="Spoiler warnings">
      {warnings.map(w => (
        <li key={`${w.targetId}:${w.sceneId}`} className="rvWarn" role="note">
          {`${w.name} is shown from chapter ${w.revealAt}, but the scene "${w.sceneTitle || 'Untitled'}" in chapter ${w.chapter} uses ${w.kind === 'character' ? 'them' : w.kind === 'place' ? 'this place' : 'this map'}.`}
        </li>
      ))}
    </ul>
  )
}

// What a reader who has reached a chapter sees of the saved maps and characters (null while it loads, or when there is no book to read it in).
export function usePreview(projectId: string, bookId: string | null, chapter: number, refreshKey: unknown): BookExtras | null {
  const [extras, setExtras] = useState<{ key: string; value: BookExtras } | null>(null)
  const key = `${bookId}:${chapter}`
  useEffect(() => {
    if (!bookId) return
    let live = true
    getExtrasPreview(projectId, bookId, chapter).then(value => { if (live) setExtras(Array.isArray(value.maps) && Array.isArray(value.characters) ? { key, value } : null) }).catch(() => { if (live) setExtras(null) })
    return () => { live = false }
  }, [projectId, bookId, chapter, key, refreshKey])
  return extras && extras.key === key ? extras.value : null
}

// The chapter a reader is taken to have reached, to preview: not started, or one of the chapters.
export function ReachSelect({ chapters, value, onChange }: { chapters: ExtrasChapter[]; value: number; onChange: (chapter: number) => void }) {
  return (
    <div className="rvField">
      <span className="rvLabel" aria-hidden="true">A reader who has reached</span>
      <select className="rvSelect" aria-label="Preview as a reader who has reached" value={value} onChange={e => onChange(Number(e.target.value))}>
        <option value={0}>The start of the book</option>
        {chapters.map(c => <option key={c.n} value={c.n}>{`Chapter ${c.n}: ${c.title}`}</option>)}
      </select>
    </div>
  )
}
