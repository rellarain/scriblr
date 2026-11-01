import { useState } from 'react'
import { CheckIcon, CloseIcon, EyeIcon, FlagIcon, FolderIcon, TrashIcon } from '../../../icons'
import type { RevisionFlag, RevisionFlagType } from '../schedule/scheduleApi'

// The Preview's Flag tool: revision flags to come back to, each a kind (review, edit, add or delete) and a note. A flag is on a passage (the sentence
// clicked, which the flag then follows as the text is edited, or says its text is gone) or on the project as a whole. A flag is resolved with what
// was done about it, and the resolved ones can be shown again.

export const FLAG_TYPES: Array<{ key: RevisionFlagType; label: string }> = [
  { key: 'review', label: 'Review' }, { key: 'edit', label: 'Edit' }, { key: 'add', label: 'Add' }, { key: 'delete', label: 'Delete' },
]
const labelOf = (type: RevisionFlagType) => FLAG_TYPES.find(t => t.key === type)?.label ?? type

// `flags` are the project's flags and this chapter's passage flags; `onShow` selects a passage flag's sentence in the text.
export function FlagTool({ hasSentence, flags, error, onAdd, onUpdate, onResolve, onRemove, onShow }: {
  hasSentence: boolean
  flags: RevisionFlag[]
  error?: string
  onAdd: (scope: 'passage' | 'project', type: RevisionFlagType, note: string) => void
  onUpdate: (id: string, body: { type?: RevisionFlagType; note?: string }) => void
  onResolve: (id: string, outcome: string) => void
  onRemove: (id: string) => void
  onShow: (flag: RevisionFlag) => void
}) {
  const [type, setType] = useState<RevisionFlagType>('review')
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
            <button key={t.key} type="button" aria-pressed={type === t.key} className={type === t.key ? 'wrSegBtn wrSegBtn--active' : 'wrSegBtn'} onClick={() => setType(t.key)}>{t.label}</button>
          ))}
        </div>
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
              return (
                <li key={f.id} className={done ? 'wrFlagRow wrFlagRow--done' : 'wrFlagRow'}>
                  <select className="wrPreviewSelect" aria-label={`Kind of flag on ${f.snippet || 'the project'}`} value={f.type} disabled={done} onChange={e => onUpdate(f.id, { type: e.target.value as RevisionFlagType })}>
                    {FLAG_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  <span className="wrFlagWhere" title={f.snippet}>
                    {f.scope === 'project' ? 'The project' : f.stale ? `Text gone: “${f.snippet.slice(0, 60)}”` : `“${f.snippet.slice(0, 60)}${f.snippet.length > 60 ? '…' : ''}”`}
                  </span>
                  {done
                    ? <span className="wrHint">{f.note ? `${f.note} · ` : ''}{labelOf(f.type)} done{f.outcome ? `: ${f.outcome}` : ''}</span>
                    : (
                      <input
                        key={`${f.id}:${f.note}`} className="wrField" aria-label={`Note on ${f.snippet || 'the project'}`} placeholder="Note" maxLength={1000} defaultValue={f.note}
                        onBlur={e => { if (e.target.value !== f.note) onUpdate(f.id, { note: e.target.value }) }}
                      />
                    )}
                  {f.scope === 'passage' && !f.stale && (
                    <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label={`Show the flagged text: ${f.snippet.slice(0, 30)}`} title="Show it in the text" onClick={() => onShow(f)}><EyeIcon size={18} /></button>
                  )}
                  {!done && resolving !== f.id && (
                    <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label={`Resolve the flag on ${f.snippet || 'the project'}`} title="Resolve" onClick={() => { setResolving(f.id); setOutcome('') }}><CheckIcon size={18} /></button>
                  )}
                  {resolving === f.id && (
                    <span className="wrToolGroup">
                      <input className="wrField" aria-label="What was done" placeholder="What was done" maxLength={1000} autoFocus value={outcome} onChange={e => setOutcome(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onResolve(f.id, outcome.trim()); setResolving(null) } if (e.key === 'Escape') setResolving(null) }} />
                      <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label="Confirm resolved" title="Resolved" onClick={() => { onResolve(f.id, outcome.trim()); setResolving(null) }}><CheckIcon size={18} /></button>
                      <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label="Cancel" title="Cancel" onClick={() => setResolving(null)}><CloseIcon size={18} /></button>
                    </span>
                  )}
                  <button type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label={`Delete the flag on ${f.snippet || 'the project'}`} title="Delete" onClick={() => onRemove(f.id)}><TrashIcon size={18} /></button>
                </li>
              )
            })}
          </ul>
        )}
      {error && <span className="wrError">{error}</span>}
    </div>
  )
}
