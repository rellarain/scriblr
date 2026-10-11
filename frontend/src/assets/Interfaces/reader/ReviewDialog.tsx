import { useEffect, useRef, useState } from 'react'
import type { CatalogBook, ReviewDraft, ReviewRead } from '../../../api/reader'
import { PencilIcon, PlusIcon, TrashIcon } from '../../icons'
import { Card, Chip } from './ReaderBits'
import { ReaderDialog } from './ReaderDialogs'
import type { ReaderCtx } from './readerContext'
import { shortDate } from './readerFormat'
import { canReread, criteriaAverage, latestRead, readLabel, reviewOf } from './readerSocial'

// The review of a book, on the paper: a general score (1 to 10, the reader's own), criteria the reader defines and reuses, a spoiler-free comment,
// an optional spoiler essay and the notes to include. A draft saves itself and stays private until it is posted; a posted review is public and can
// be edited (it then says "edited"). A re-read adds a folder tab with its own score, criteria, comment and essay.

const AUTOSAVE_MS = 600
const SCORES = Array.from({ length: 10 }, (_, i) => i + 1)

const draftOf = (read: ReviewRead | undefined): ReviewDraft => ({
  score: read?.score ?? null, criteria: { ...(read?.criteria ?? {}) }, comment: read?.comment ?? '', spoilerEssay: read?.spoilerEssay ?? '', noteIds: [...(read?.noteIds ?? [])],
})

function ReadOnlyRead({ read }: { read: ReviewRead }) {
  const average = criteriaAverage(read.criteria)
  return (
    <>
      <div className="rdRow"><Chip on>Score {read.score ?? '–'} of 10</Chip>{average !== null && <Chip>Criteria average {average}</Chip>}{read.postedAt && <span className="rdMuted">Posted {shortDate(read.postedAt)}</span>}</div>
      <div className="rdRow">{Object.entries(read.criteria).map(([n, v]) => <Chip key={n}>{n} {v}</Chip>)}</div>
      {read.comment && <p className="rdQuote">{read.comment}</p>}
      {read.spoilerEssay && <Card title="Spoiler essay"><p className="rdQuote">{read.spoilerEssay}</p></Card>}
    </>
  )
}

function ReadForm({ ctx, book, read }: { ctx: ReaderCtx; book: CatalogBook; read: ReviewRead | undefined }) {
  const { reader, actions } = ctx.data
  const [form, setForm] = useState<ReviewDraft>(() => draftOf(read))
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [criterion, setCriterion] = useState('')
  const timer = useRef<number | null>(null)
  const latest = useRef(form)
  latest.current = form

  const save = async () => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
    setError(null)
    try { await actions.saveReview(book.id, latest.current); setDirty(false); setSaved(true) } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') }
  }
  useEffect(() => {
    if (!dirty) return undefined
    timer.current = window.setTimeout(() => { void save() }, AUTOSAVE_MS)
    return () => { if (timer.current !== null) window.clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dirty])

  if (!reader) return null
  const change = (patch: Partial<ReviewDraft>) => { setForm({ ...form, ...patch }); setDirty(true); setSaved(false) }
  const posted = read?.status === 'posted'
  const notes = reader.notes.filter(n => n.bookId === book.id)
  const average = criteriaAverage(form.criteria)
  const setCriterionScore = (name: string, value: number) => {
    const next = { ...form.criteria }
    if (value === 0) delete next[name]
    else next[name] = value
    change({ criteria: next })
  }
  const addCriterion = async () => {
    const name = criterion.trim()
    if (!name) return
    try { await actions.setCriteria([...reader.criteriaNames, name]); setCriterion('') } catch (e) { setError(e instanceof Error ? e.message : 'Could not add it.') }
  }
  const removeCriterion = async (name: string) => {
    try {
      await actions.setCriteria(reader.criteriaNames.filter(n => n !== name))
      if (name in form.criteria) setCriterionScore(name, 0)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove it.') }
  }
  const post = async () => {
    await save()
    try { await actions.postReview(book.id) } catch (e) { setError(e instanceof Error ? e.message : 'Could not post it.') }
  }
  const discard = async () => {
    try { await actions.discardDraft(book.id); setForm(draftOf(undefined)); setDirty(false); setSaved(false) } catch (e) { setError(e instanceof Error ? e.message : 'Could not discard it.') }
  }

  return (
    <>
      <div className="rdRow">
        <Chip>{posted ? (read?.editedAt ? 'Posted · edited' : 'Posted, public') : read ? 'Draft saved privately' : 'Draft, not saved yet'}</Chip>
        {saved && <span className="rdMuted" role="status">Saved</span>}
        {read && <span className="rdMuted">Started {shortDate(read.startedAt)}</span>}
      </div>
      <Card title="General score (1 to 10)">
        <div className="rdRow" role="group" aria-label="General score">
          {SCORES.map(n => <button key={n} type="button" className={form.score === n ? 'rdBtn rdBtn--small rdBtn--pri' : 'rdBtn rdBtn--small'} aria-pressed={form.score === n} onClick={() => change({ score: n })}>{n}</button>)}
          {average !== null && <Chip on>Criteria average {average}</Chip>}
        </div>
      </Card>
      <Card title="My criteria (1 to 10)">
        <ul className="rdList">
          {reader.criteriaNames.map(name => (
            <li key={name} className="rdItem">
              <span className="rdGrow"><b>{name}</b></span>
              <select className="rdField" aria-label={`${name} score`} value={form.criteria[name] ?? 0} onChange={e => setCriterionScore(name, Number(e.target.value))}>
                <option value={0}>Not scored</option>
                {SCORES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <button type="button" className="rdIconBtn rdIconBtn--small" aria-label={`Remove criterion ${name}`} disabled={reader.criteriaNames.length <= 1} onClick={() => void removeCriterion(name)}><TrashIcon size={16} /></button>
            </li>
          ))}
        </ul>
        <div className="rdRow">
          <input className="rdField rdGrow" aria-label="New criterion" placeholder="Add a criterion to reuse in every review" maxLength={40} value={criterion} onChange={e => setCriterion(e.target.value)} />
          <button type="button" className="rdBtn" disabled={!criterion.trim()} onClick={() => void addCriterion()}><PlusIcon size={16} />Add</button>
        </div>
      </Card>
      <label className="rdFieldLabel">Comment (spoiler-free)
        <textarea className="rdText" rows={4} maxLength={5000} placeholder="What stayed with you? Keep spoilers out of here." value={form.comment} onChange={e => change({ comment: e.target.value })} />
      </label>
      <label className="rdFieldLabel">Spoiler essay (optional, shown to readers only on a tap)
        <textarea className="rdText" rows={4} maxLength={20000} placeholder="Write about the ending, the twists, what you would change." value={form.spoilerEssay} onChange={e => change({ spoilerEssay: e.target.value })} />
      </label>
      <Card title="Notes and highlights to include">
        {notes.length === 0 ? <p className="rdMuted">You have no notes on this book yet.</p> : notes.map(n => (
          <label key={n.id} className="rdCheck">
            <input type="checkbox" checked={form.noteIds.includes(n.id)} onChange={e => change({ noteIds: e.target.checked ? [...form.noteIds, n.id] : form.noteIds.filter(id => id !== n.id) })} />
            {n.quote || n.note}
          </label>
        ))}
      </Card>
      {error && <p className="rdError" role="alert">{error}</p>}
      <div className="rdRow">
        {!posted && <button type="button" className="rdBtn rdBtn--pri" disabled={form.score === null} onClick={() => void post()}><PencilIcon size={16} />Post review</button>}
        {posted && <span className="rdMuted">Changes to a posted review are saved as you type and marked edited.</span>}
        {!posted && read && <button type="button" className="rdBtn" onClick={() => void discard()}><TrashIcon size={16} />Discard draft</button>}
        {!posted && form.score === null && <span className="rdMuted">Give a general score to post.</span>}
      </div>
    </>
  )
}

export function ReviewDialog({ ctx, book, onClose }: { ctx: ReaderCtx; book: CatalogBook; onClose: () => void }) {
  const { reader, actions } = ctx.data
  const [pick, setPick] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!reader) return null
  const review = reviewOf(reader, book.id)
  const latest = latestRead(review)
  const current = latest?.n ?? 1
  const tab = pick !== null && review?.reads.some(r => r.n === pick) ? pick : current
  const shown = review?.reads.find(r => r.n === tab)
  const reread = async () => {
    setError(null)
    try { await actions.startReread(book.id); setPick(null) } catch (e) { setError(e instanceof Error ? e.message : 'Could not start a re-read.') }
  }
  return (
    <ReaderDialog title={`Review · ${book.title}`} Icon={PencilIcon} onClose={onClose}>
      <div className="rdTabs" role="tablist" aria-label="Reads">
        {(review?.reads ?? [{ n: 1 }]).map(r => (
          <button key={r.n} type="button" role="tab" aria-selected={tab === r.n} className={tab === r.n ? 'rdTab rdTab--on' : 'rdTab'} onClick={() => setPick(r.n)}>{readLabel(r.n)}</button>
        ))}
        <button type="button" className="rdTab" disabled={!canReread(review)} title={canReread(review) ? 'Read it again: this starts a new tab and resets your progress' : 'Post this review first'} onClick={() => void reread()}><PlusIcon size={16} />Start a re-read</button>
      </div>
      {error && <p className="rdError" role="alert">{error}</p>}
      {tab === current ? <ReadForm key={current} ctx={ctx} book={book} read={latest} /> : shown && <ReadOnlyRead read={shown} />}
      <p className="rdMuted">Your review is public once posted; drafts, notes and reactions you keep stay on this machine. The public view shows your latest read, with how many times you have read the book.</p>
    </ReaderDialog>
  )
}
