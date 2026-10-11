import { useState } from 'react'
import type { BookFlagMeta, ChapterAuthorNotes } from '../../../../api/bookPublishing'
import { PlusIcon, TrashIcon } from '../../../icons'

// The Preview's Footnote tool: the author's footnotes and flagged passages on a chapter's sentences. A published footnote goes into the next
// edition of the book, on the sentence it belongs to, where readers see it in the page's margin; a flagged passage carries one of the
// book's content flags (its warning), which each reader shows by the class they chose.

export interface SentenceAt { paragraph: number; sentence: number }

const newId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12))
const where = (p: SentenceAt) => `paragraph ${p.paragraph + 1}, sentence ${p.sentence + 1}`

export function FootnoteTool({ at, notes, flags, error, onSave }: {
  at: SentenceAt | null
  notes: ChapterAuthorNotes
  flags: BookFlagMeta[]
  error?: string
  onSave: (next: ChapterAuthorNotes) => void
}) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const add = () => {
    if (!at || !title.trim()) return
    onSave({ ...notes, footnotes: [...notes.footnotes, { id: newId(), paragraph: at.paragraph, sentence: at.sentence, title: title.trim(), text: text.trim(), published: true }] })
    setTitle(''); setText('')
  }
  const flagged = (p: SentenceAt) => notes.flags.filter(f => f.paragraph === p.paragraph && f.sentence === p.sentence)
  return (
    <div className="wrFootnoteTool">
      <div className="wrToolGroup">
        <span className="wrLabel">Footnote</span>
        {at ? <span className="wrHint">On {where(at)}</span> : <span className="wrHint">Click a sentence first</span>}
        <input className="wrField" aria-label="Footnote title" placeholder="Title" maxLength={120} value={title} disabled={!at} onChange={e => setTitle(e.target.value)} />
        <input className="wrField" aria-label="Footnote text" placeholder="What the reader should know" maxLength={2000} value={text} disabled={!at} onChange={e => setText(e.target.value)} />
        <button type="button" className="wrSmallBtn wrSmallBtn--accent" disabled={!at || !title.trim()} onClick={add}><PlusIcon size={14} /> Add footnote</button>
      </div>
      <div className="wrToolGroup">
        <span className="wrLabel">Flag this passage</span>
        {flags.length === 0 ? <span className="wrHint">The book has no content flags yet. Add them in the Book level&rsquo;s Publish tab.</span> : (
          <select className="wrPreviewSelect" aria-label="Flag this passage" disabled={!at} value="" onChange={e => {
            const key = e.target.value
            if (!at || !key) return
            const has = flagged(at).find(f => f.flagKey === key)
            onSave({ ...notes, flags: has ? notes.flags.filter(f => f.id !== has.id) : [...notes.flags, { id: newId(), paragraph: at.paragraph, sentence: at.sentence, flagKey: key }] })
          }}>
            <option value="">Choose a flag…</option>
            {flags.map(f => <option key={f.key} value={f.key}>{at && flagged(at).some(x => x.flagKey === f.key) ? '✓ ' : ''}{f.name}</option>)}
          </select>
        )}
      </div>
      {(notes.footnotes.length > 0 || notes.flags.length > 0) && (
        <ul className="wrFootnoteList" aria-label="Footnotes and flagged passages">
          {notes.footnotes.map(f => (
            <li key={f.id}>
              <span>{where(f)}: <b>{f.title}</b></span>
              <label className="wrCheckRow"><input type="checkbox" checked={f.published} onChange={e => onSave({ ...notes, footnotes: notes.footnotes.map(x => (x.id === f.id ? { ...x, published: e.target.checked } : x)) })} />Published</label>
              <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label={`Delete footnote ${f.title}`} onClick={() => onSave({ ...notes, footnotes: notes.footnotes.filter(x => x.id !== f.id) })}><TrashIcon size={14} /></button>
            </li>
          ))}
          {notes.flags.map(f => (
            <li key={f.id}>
              <span>{where(f)}: flag <b>{flags.find(x => x.key === f.flagKey)?.name ?? f.flagKey}</b></span>
              <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label="Remove flagged passage" onClick={() => onSave({ ...notes, flags: notes.flags.filter(x => x.id !== f.id) })}><TrashIcon size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {error && <span className="wrError">{error}</span>}
    </div>
  )
}
