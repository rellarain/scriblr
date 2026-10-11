import { useCallback, useEffect, useState } from 'react'
import * as api from '../../../../api/bookPublishing'
import type { BookFeedback, BookFlagMeta, BookListing, BookMeta, InviteLevel } from '../../../../api/bookPublishing'
import { getReaders, type ReaderProfile } from '../../../../api/reader'
import { ExportIcon, PlusIcon, TrashIcon } from '../../../icons'
import type { WriterWorkspace } from '../useWriterWorkspace'

// The Book level's Publish tab: put the book in the Reader's library as a numbered edition (or take it off), describe it (type, blurb, genres,
// tags, tropes, content flags, price, cover colour), invite readers at a level, and see what readers did with it. Money here is simulated.

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`
const TYPES: api.BookTypeName[] = ['novel', 'novella', 'essays', 'magazine', 'article']
const CLASSES: api.FlagClassName[] = ['hidden', 'marked', 'highlight', 'spoiler']
const LEVELS: { key: InviteLevel | ''; label: string }[] = [
  { key: '', label: 'Not invited' }, { key: 'alpha', label: 'Alpha (the plan, read-only)' }, { key: 'delta', label: 'Delta (draft chapters)' }, { key: 'beta', label: 'Beta (final-draft chapters)' },
]

export function useBookPublishing(projectId: string | null, bookId: string | null) {
  const [listing, setListing] = useState<BookListing | null>(null)
  const [feedback, setFeedback] = useState<BookFeedback | null>(null)
  const [readers, setReaders] = useState<ReaderProfile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!projectId || !bookId) return
    try {
      const [l, f] = await Promise.all([api.getListing(projectId, bookId), api.getFeedback(projectId, bookId)])
      setListing(l); setFeedback(f)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the publishing details.') }
  }, [projectId, bookId])

  useEffect(() => {
    setListing(null); setFeedback(null); setError(null)
    void load()
    getReaders().then(setReaders).catch(() => undefined)
  }, [load])

  const run = useCallback(async (call: () => Promise<BookListing>) => {
    if (!projectId || !bookId) return
    setBusy(true); setError(null)
    try {
      setListing(await call())
      setFeedback(await api.getFeedback(projectId, bookId))
    } catch (e) { setError(e instanceof Error ? e.message : 'That did not go through.') } finally { setBusy(false) }
  }, [projectId, bookId])

  return {
    listing, feedback, readers, error, busy, reload: load,
    publish: () => run(() => api.publishBook(projectId as string, bookId as string)),
    unpublish: () => run(() => api.unpublishBook(projectId as string, bookId as string)),
    saveMeta: (meta: BookMeta) => run(() => api.putMeta(projectId as string, bookId as string, meta)),
    invite: (invites: Record<string, InviteLevel>) => run(() => api.putInvites(projectId as string, bookId as string, invites)),
  }
}

function ListField({ label, value, onChange }: { label: string; value: string[]; onChange: (next: string[]) => void }) {
  const parse = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)
  const [text, setText] = useState(value.join(', '))
  // The field's own text stays while it is typed (a comma on its way to the next word); it follows the value only when the value changed from outside.
  useEffect(() => { setText(t => (parse(t).join('|') === value.join('|') ? t : value.join(', '))) }, [value])
  return (
    <label className="wrBookEdField">
      <span className="wrLabel">{label}</span>
      <input className="wrField" aria-label={label} value={text} placeholder="Separate with commas"
        onChange={e => { setText(e.target.value); onChange(parse(e.target.value)) }} />
    </label>
  )
}

const slug = (name: string, taken: string[]): string => {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flag'
  let key = base
  for (let i = 2; taken.includes(key); i += 1) key = `${base}-${i}`
  return key
}

function MetaEditor({ listing, busy, onSave }: { listing: BookListing; busy: boolean; onSave: (meta: BookMeta) => void }) {
  const [meta, setMeta] = useState<BookMeta>(listing.meta)
  const [dirty, setDirty] = useState(false)
  // While the price is typed the field keeps its own text (a half-typed number is not yet a price).
  const [priceText, setPriceText] = useState<string | null>(null)
  useEffect(() => { setMeta(listing.meta); setDirty(false) }, [listing.meta])
  const set = (patch: Partial<BookMeta>) => { setMeta(prev => ({ ...prev, ...patch })); setDirty(true) }
  const setFlag = (i: number, patch: Partial<BookFlagMeta>) => set({ flags: meta.flags.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  return (
    <div className="wrCard wrPublishCard">
      <div className="wrCardTitle">Details in the library</div>
      <div className="wrBookEdGrid">
        <label className="wrBookEdField">
          <span className="wrLabel">Type</span>
          <select className="wrField" aria-label="Type" value={meta.type} onChange={e => set({ type: e.target.value as api.BookTypeName })}>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
        </label>
        <label className="wrBookEdField">
          <span className="wrLabel">Buy price (dollars)</span>
          <input className="wrField" type="number" aria-label="Buy price" min={1} max={100} step={0.5} value={priceText ?? meta.buyPriceCents / 100}
            onChange={e => {
              setPriceText(e.target.value)
              const n = Number(e.target.value)
              if (e.target.value !== '' && Number.isFinite(n) && n >= 1 && n <= 100) set({ buyPriceCents: Math.round(n * 100) })
            }}
            onBlur={() => setPriceText(null)} />
        </label>
        <label className="wrBookEdField wrBookEdField--wide">
          <span className="wrLabel">Blurb</span>
          <textarea className="wrField" aria-label="Blurb" rows={3} maxLength={2000} value={meta.blurb} placeholder="What the book is about, for a reader choosing it." onChange={e => set({ blurb: e.target.value })} />
        </label>
        <ListField label="Genres" value={meta.genres} onChange={genres => set({ genres })} />
        <ListField label="Tags" value={meta.tags} onChange={tags => set({ tags })} />
        <ListField label="Tropes" value={meta.tropes} onChange={tropes => set({ tropes })} />
        <div className="wrBookEdField">
          <span className="wrLabel">Cover colour</span>
          <label className="wrCheckRow"><input type="checkbox" aria-label="Own cover colour" checked={meta.coverHue !== null} onChange={e => set({ coverHue: e.target.checked ? 28 : null })} />A colour of its own</label>
          {meta.coverHue !== null && <input type="range" aria-label="Cover hue" min={0} max={360} value={meta.coverHue} onChange={e => set({ coverHue: Number(e.target.value) })} />}
        </div>
      </div>
      <fieldset className="wrBookEdField wrBookEdField--wide">
        <legend className="wrLabel">Content flags (warnings)</legend>
        {meta.flags.length === 0 && <p className="wrMuted">No flags. A flag warns a reader of something in the book; each reader chooses how it shows (hidden, marked, highlight or spoiler).</p>}
        {meta.flags.map((f, i) => (
          <div key={f.key} className="wrPublishFlag">
            <input className="wrField" aria-label={`Flag ${i + 1} name`} placeholder="Name (Grief)" value={f.name} maxLength={60} onChange={e => setFlag(i, { name: e.target.value })} />
            <input className="wrField" aria-label={`Flag ${i + 1} details`} placeholder="Details a reader sees" value={f.detail} maxLength={500} onChange={e => setFlag(i, { detail: e.target.value })} />
            <select className="wrField" aria-label={`Flag ${i + 1} default class`} value={f.defaultClass} onChange={e => setFlag(i, { defaultClass: e.target.value as api.FlagClassName })}>{CLASSES.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label={`Remove flag ${f.name || i + 1}`} onClick={() => set({ flags: meta.flags.filter((_, j) => j !== i) })}><TrashIcon size={14} /></button>
          </div>
        ))}
        <button type="button" className="wrSmallBtn" onClick={() => set({ flags: [...meta.flags, { key: slug(`flag ${meta.flags.length + 1}`, meta.flags.map(x => x.key)), name: '', detail: '', defaultClass: 'marked' }] })}><PlusIcon size={14} /> Add a flag</button>
      </fieldset>
      <div className="wrPublishRow">
        <button type="button" className="wrSmallBtn wrSmallBtn--accent" disabled={!dirty || busy || meta.flags.some(f => !f.name.trim())} onClick={() => onSave({ ...meta, flags: meta.flags.map(f => ({ ...f, key: f.key || slug(f.name, []) })) })}>Save details</button>
        {dirty && <span className="wrHint">Unsaved changes. A new edition takes the saved details.</span>}
      </div>
    </div>
  )
}

function Feedback({ feedback }: { feedback: BookFeedback }) {
  return (
    <div className="wrCard wrPublishCard">
      <div className="wrCardTitle">Readers</div>
      <div className="wrKv"><span>Loans</span><span>{feedback.loans} ({feedback.activeLoans} active)</span></div>
      <div className="wrKv"><span>Sales</span><span>{feedback.sales}</span></div>
      <div className="wrKv"><span>Your share of loans</span><span>{dollars(feedback.loanShareCents)}</span></div>
      <div className="wrKv"><span>Your share of sales</span><span>{dollars(feedback.saleShareCents)}</span></div>
      <div className="wrKv"><b>Earnings, simulated</b><b>{dollars(feedback.loanShareCents + feedback.saleShareCents)}</b></div>
      <div className="wrKv"><span>Rating</span><span>{feedback.ratings > 0 ? `${feedback.rating.toFixed(1)} of 10 (${feedback.ratings})` : 'No ratings yet'}</span></div>
      <p className="wrHint">A loan pays you $3.00 for its first credit and $1.00 for each more; a sale pays 70% of the price. No money moves.</p>
      {feedback.reviews.length > 0 && (
        <ul className="wrPublishList" aria-label="Reviews">
          {feedback.reviews.map(r => <li key={r.id}><b>{r.score} of 10</b> {r.comment}</li>)}
        </ul>
      )}
      {feedback.chapters.length > 0 && (
        <div className="wrPublishChapters" aria-label="Reactions by chapter">
          <span className="wrLabel">Reactions by chapter (anonymous, from readers who share them)</span>
          {feedback.chapters.map(c => (
            <div key={c.n} className="wrKv"><span>{c.n}. {c.title}</span><span>{c.readers === 0 ? 'none shared' : `${c.pleasant} pleasant · ${c.unpleasant} unpleasant`}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BookPublish({ w }: { w: WriterWorkspace }) {
  const book = w.activeBook
  const p = useBookPublishing(w.activeProjectId, book?.id ?? null)
  const [confirming, setConfirming] = useState<'publish' | 'unpublish' | null>(null)
  if (!book) return null
  const { listing, feedback } = p
  if (!listing) return <p className="wrMuted">{p.error ?? 'Loading…'}</p>
  const latest = listing.editions[listing.editions.length - 1]
  const invites = listing.invites
  const setInvite = (id: string, level: InviteLevel | '') => {
    const next = { ...invites }
    if (level) next[id] = level
    else delete next[id]
    void p.invite(next)
  }
  const people = [{ id: 'me', name: 'You (this reader account)' }, ...p.readers.map(r => ({ id: r.id, name: r.name }))]
  return (
    <div className="wrPublish">
      <div className="wrCard wrPublishCard">
        <div className="wrCardTitle">Publish the book</div>
        <div className="wrKv"><span>In the library</span><span>{listing.listed ? 'Yes, for sale and loan' : listing.editions.length > 0 ? 'Unlisted' : 'Not published'}</span></div>
        <div className="wrKv"><span>Editions</span><span>{listing.editions.length === 0 ? 'None yet' : `${listing.editions.length}, the latest published ${new Date(latest.publishedAt).toLocaleDateString()} (${latest.wordCount.toLocaleString()} words, ${latest.chapters.length} chapters)`}</span></div>
        {confirming ? (
          <span className="wrPublishConfirm" role="alertdialog" aria-label={confirming === 'publish' ? 'Publish the book' : 'Take the book off the library'}>
            <span>{confirming === 'publish' ? `Publish edition ${listing.editions.length + 1}?` : 'Take it off sale and loan? Copies readers own and loans already made keep working.'}</span>
            <button type="button" className="wrSmallBtn wrSmallBtn--accent" disabled={p.busy} onClick={() => { void (confirming === 'publish' ? p.publish() : p.unpublish()).then(() => setConfirming(null)) }}>{confirming === 'publish' ? 'Publish' : 'Unpublish'}</button>
            <button type="button" className="wrSmallBtn" disabled={p.busy} onClick={() => setConfirming(null)}>Cancel</button>
          </span>
        ) : (
          <div className="wrPublishRow">
            <button type="button" className="wrSmallBtn wrSmallBtn--accent" disabled={p.busy} aria-label="Publish book" onClick={() => setConfirming('publish')}><ExportIcon size={14} /> {listing.editions.length === 0 ? 'Publish the book' : `Publish edition ${listing.editions.length + 1}`}</button>
            {listing.listed && <button type="button" className="wrSmallBtn" disabled={p.busy} onClick={() => setConfirming('unpublish')}>Unpublish</button>}
          </div>
        )}
        <p className="wrHint">An edition is a frozen copy of the chapters published so far, with their published footnotes and flagged passages. Publish chapters first (the Publish button on a chapter), then the book.</p>
        {p.error && <p className="wrError" role="alert">{p.error}</p>}
      </div>
      <MetaEditor listing={listing} busy={p.busy} onSave={meta => void p.saveMeta(meta)} />
      <div className="wrCard wrPublishCard">
        <div className="wrCardTitle">Invite readers</div>
        <p className="wrHint">Alpha readers see the plan read-only, delta readers work-in-progress chapters, beta readers final-draft chapters as they publish. Alpha and delta are free. Your own level here sets how this reader account reads the book.</p>
        {people.map(person => (
          <label key={person.id} className="wrPublishInvite">
            <span>{person.name}</span>
            <select className="wrField" aria-label={`Invite ${person.name}`} value={invites[person.id] ?? ''} disabled={p.busy} onChange={e => setInvite(person.id, e.target.value as InviteLevel | '')}>
              {LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      {feedback && <Feedback feedback={feedback} />}
    </div>
  )
}
