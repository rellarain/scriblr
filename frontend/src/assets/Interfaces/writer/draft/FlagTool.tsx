import { useState } from 'react'
import { CheckIcon, CloseIcon, EyeIcon, FlagIcon, FolderIcon, TrashIcon } from '../../../icons'
import { FLAG_KINDS, type FlagType } from '../../../../api/types'
import type { RevisionFlag } from '../schedule/scheduleApi'

// The Preview's Flag tool: revision flags to come back to, each one of seven kinds and a note. A flag is on a passage (the sentence clicked,
// which the flag then follows as the text is edited, or says its text is gone) or on the project as a whole. A Merge flag on a passage can
// name a second sentence to merge it with, picked on the page. A flag is resolved with what was done about it, and the resolved ones can be
// shown again.

const LABEL: Record<FlagType, string> = {
  review: 'Review', add: 'Add', remove: 'Remove', merge: 'Merge', change: 'Change', simplify: 'Simplify', expand: 'Expand',
}
// What each kind asks of the writer, shown beside the kinds.
const HINT: Record<FlagType, string> = {
  review: 'Read it again later.',
  add: 'Something is missing here.',
  remove: 'Cut this.',
  merge: 'Join this with another passage.',
  change: 'Rewrite this.',
  simplify: 'Say it more plainly.',
  expand: 'Say more here.',
}
export const FLAG_TYPES: Array<{ key: FlagType; label: string }> = FLAG_KINDS.map(key => ({ key, label: LABEL[key] }))
export const flagLabel = (type: FlagType): string => LABEL[type] ?? type

const quote = (text: string) => `“${text.slice(0, 60)}${text.length > 60 ? '…' : ''}”`
const passageText = (p: { snippet: string; stale: boolean }) => (p.stale ? `Text gone: ${quote(p.snippet)}` : quote(p.snippet))
const whereOf = (f: RevisionFlag) => {
  if (f.scope === 'project') return 'The project'
  return f.mergeWith ? `${passageText(f)} + ${passageText(f.mergeWith)}` : passageText(f)
}

// `flags` are the project's flags and this chapter's passage flags; `onShow` selects a passage flag's sentence in the text. The kind is the
// Preview's (it changes what a click on the page does while a Merge's second sentence is being picked): `mergeWith` is that sentence's text
// once picked, `picking` says the next click on the page picks it.
export function FlagTool({ type, onType, hasSentence, mergeWith, picking, onPicking, onClearMerge, flags, error, onAdd, onUpdate, onResolve, onRemove, onShow }: {
  type: FlagType
  onType: (type: FlagType) => void
  hasSentence: boolean
  mergeWith: string | null
  picking: boolean
  onPicking: (on: boolean) => void
  onClearMerge: () => void
  flags: RevisionFlag[]
  error?: string
  onAdd: (scope: 'passage' | 'project', type: FlagType, note: string) => void
  onUpdate: (id: string, body: { type?: FlagType; note?: string }) => void
  onResolve: (id: string, outcome: string) => void
  onRemove: (id: string) => void
  onShow: (at: { momentId: string | null; start: number }) => void
}) {
  const [note, setNote] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [outcome, setOutcome] = useState('')
  const add = (scope: 'passage' | 'project') => { onAdd(scope, type, note.trim()); setNote('') }
  const shown = flags.filter(f => showResolved || f.resolvedAt === null)
  const resolvedCount = flags.filter(f => f.resolvedAt !== null).length
  return (
    <div className="wrFootnoteTool wrFlagTool">
      <div className="wrToolGroup">
        <span className="wrLabel">Flag</span>
        <div className="wrSegmented" role="group" aria-label="Kind of flag">
          {FLAG_TYPES.map(t => (
            <button key={t.key} type="button" aria-pressed={type === t.key} className={type === t.key ? 'wrSegBtn wrSegBtn--active' : 'wrSegBtn'} onClick={() => onType(t.key)}>{t.label}</button>
          ))}
        </div>
        <span className="wrHint wrFlagHint">{HINT[type]}</span>
      </div>
      {type === 'merge' && (
        <div className="wrToolGroup" role="group" aria-label="Merge with">
          <span className="wrLabel">Merge with</span>
          {mergeWith
            ? <span className="wrFlagWhere" title={mergeWith}>{quote(mergeWith)}</span>
            : <span className="wrHint">{picking ? 'Click the second sentence on the page.' : 'Optional: a second sentence to merge the first with.'}</span>}
          <button
            type="button" className={picking ? 'wrSmallBtn wrSmallBtn--accent' : 'wrSmallBtn'} aria-pressed={picking} disabled={!hasSentence}
            title={hasSentence ? 'Pick the second sentence on the page' : 'Click the first sentence first'} onClick={() => onPicking(!picking)}
          >
            {mergeWith ? 'Pick another' : 'Pick on the page'}
          </button>
          {mergeWith && (
            <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label="Clear the sentence to merge with" title="Clear" onClick={onClearMerge}><CloseIcon size={18} /></button>
          )}
        </div>
      )}
      <div className="wrToolGroup">
        <input className="wrField" aria-label="Flag note" placeholder="What to come back to" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
        <button
          type="button" className="wrSmallBtn wrSmallBtn--accent" disabled={!hasSentence} aria-label="Flag this sentence"
          title={hasSentence ? 'Flag the sentence you clicked' : 'Click a sentence first'} onClick={() => add('passage')}
        >
          <FlagIcon size={18} />
        </button>
        <button type="button" className="wrSmallBtn" aria-label="Flag the project" title="Flag the project as a whole, not a passage" onClick={() => add('project')}>
          <FolderIcon size={18} />
        </button>
        {resolvedCount > 0 && (
          <label className="wrShowAssigned"><input type="checkbox" role="switch" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /><span>Show resolved ({resolvedCount})</span></label>
        )}
      </div>
      {shown.length === 0
        ? <span className="wrHint">No flags {showResolved ? 'yet' : 'to come back to'}. Click a sentence, choose a kind, and flag it.</span>
        : (
          <ul className="wrFootnoteList wrFlagList" aria-label="Revision flags">
            {shown.map(f => {
              const done = f.resolvedAt !== null
              const name = f.snippet || 'the project'
              return (
                <li key={f.id} className={done ? 'wrFlagRow wrFlagRow--done' : 'wrFlagRow'}>
                  <select className="wrPreviewSelect" aria-label={`Kind of flag on ${name}`} value={f.type} disabled={done} onChange={e => onUpdate(f.id, { type: e.target.value as FlagType })}>
                    {FLAG_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  <span className="wrFlagWhere" title={f.mergeWith ? `${f.snippet} + ${f.mergeWith.snippet}` : f.snippet}>{whereOf(f)}</span>
                  {done
                    ? <span className="wrHint">{f.note ? `${f.note} · ` : ''}{flagLabel(f.type)} done{f.outcome ? `: ${f.outcome}` : ''}</span>
                    : (
                      <input
                        key={`${f.id}:${f.note}`} className="wrField" aria-label={`Note on ${name}`} placeholder="Note" maxLength={1000} defaultValue={f.note}
                        onBlur={e => { if (e.target.value !== f.note) onUpdate(f.id, { note: e.target.value }) }}
                      />
                    )}
                  {f.scope === 'passage' && !f.stale && (
                    <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label={`Show the flagged text: ${f.snippet.slice(0, 30)}`} title="Show it in the text" onClick={() => onShow(f)}><EyeIcon size={18} /></button>
                  )}
                  {f.mergeWith && !f.mergeWith.stale && (
                    <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label={`Show the text to merge with: ${f.mergeWith.snippet.slice(0, 30)}`} title="Show the second passage" onClick={() => f.mergeWith && onShow(f.mergeWith)}><EyeIcon size={18} /></button>
                  )}
                  {!done && resolving !== f.id && (
                    <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label={`Resolve the flag on ${name}`} title="Resolve" onClick={() => { setResolving(f.id); setOutcome('') }}><CheckIcon size={18} /></button>
                  )}
                  {resolving === f.id && (
                    <span className="wrToolGroup">
                      <input className="wrField" aria-label="What was done" placeholder="What was done" maxLength={1000} autoFocus value={outcome} onChange={e => setOutcome(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onResolve(f.id, outcome.trim()); setResolving(null) } if (e.key === 'Escape') setResolving(null) }} />
                      <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label="Confirm resolved" title="Resolved" onClick={() => { onResolve(f.id, outcome.trim()); setResolving(null) }}><CheckIcon size={18} /></button>
                      <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label="Cancel" title="Cancel" onClick={() => setResolving(null)}><CloseIcon size={18} /></button>
                    </span>
                  )}
                  <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label={`Delete the flag on ${name}`} title="Delete" onClick={() => onRemove(f.id)}><TrashIcon size={18} /></button>
                </li>
              )
            })}
          </ul>
        )}
      {error && <span className="wrError">{error}</span>}
    </div>
  )
}
