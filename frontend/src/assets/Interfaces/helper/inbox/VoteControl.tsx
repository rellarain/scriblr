import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CloseIcon } from '../../../icons'
import type { FeedbackVote, VoteInput } from './feedbackTypes'

const NOTE_MAX = 500
const SAVE_DELAY_MS = 500

// A square check and a square x for voting for and/or against a feedback statement or a
// solution. Clicking either turns it on and expands it into an optional note field for that
// side; both can be on at once (each with its own note); clicking an on button withdraws that
// side and its note. Notes save as you type (after a short pause) and when you leave the field.
export function VoteControl({ vote, label, disabled = false, disabledReason, onChange }: {
  vote?: FeedbackVote
  // What is being voted on, for screen readers.
  label: string
  disabled?: boolean
  disabledReason?: string
  onChange: (vote: VoteInput) => void
}) {
  const [input, setInput] = useState<VoteInput>({
    approve: vote?.approve ?? false, deny: vote?.deny ?? false, approveNote: vote?.approveNote ?? '', denyNote: vote?.denyNote ?? '',
  })
  const latest = useRef(input)
  const timer = useRef<number | null>(null)
  const approveNote = useRef<HTMLInputElement>(null)
  const denyNote = useRef<HTMLInputElement>(null)

  // What the server holds changed (another admin's browser, a reload): show it, unless a save is pending.
  useEffect(() => {
    if (timer.current !== null) return
    const next = { approve: vote?.approve ?? false, deny: vote?.deny ?? false, approveNote: vote?.approveNote ?? '', denyNote: vote?.denyNote ?? '' }
    latest.current = next
    setInput(next)
  }, [vote?.approve, vote?.deny, vote?.approveNote, vote?.denyNote])

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  function commit(next: VoteInput, immediately: boolean) {
    latest.current = next
    setInput(next)
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
    if (immediately) { onChange(next); return }
    timer.current = window.setTimeout(() => { timer.current = null; onChange(latest.current) }, SAVE_DELAY_MS)
  }

  function flush() {
    if (timer.current === null) return
    window.clearTimeout(timer.current)
    timer.current = null
    onChange(latest.current)
  }

  function toggle(side: 'approve' | 'deny') {
    const on = !latest.current[side]
    const next = { ...latest.current, [side]: on, ...(on ? {} : { [`${side}Note`]: '' }) } as VoteInput
    commit(next, true)
    // A side just switched on: the cursor goes into its note.
    if (on) window.requestAnimationFrame(() => (side === 'approve' ? approveNote : denyNote).current?.focus())
  }

  const side = (kind: 'approve' | 'deny') => {
    const on = input[kind]
    const noteKey = kind === 'approve' ? 'approveNote' : 'denyNote'
    const ref = kind === 'approve' ? approveNote : denyNote
    const name = kind === 'approve' ? 'for' : 'against'
    return (
      <div className={`voteSide${on ? ' voteSide--open' : ''}`}>
        <button
          type="button" className={`voteSquare voteSquare--${kind}${on ? ' voteSquare--on' : ''}`}
          aria-pressed={on} aria-label={`Vote ${name} ${label}`} data-cf
          disabled={disabled} title={disabled ? disabledReason : on ? `Withdraw your vote ${name}` : `Vote ${name}`}
          onClick={() => toggle(kind)}
        >
          {kind === 'approve' ? <CheckIcon size={16} /> : <CloseIcon size={16} />}
        </button>
        <input
          ref={ref} className="voteNote" data-cf
          placeholder={kind === 'approve' ? 'Why? (optional)' : 'Why not? (optional)'}
          aria-label={`Note on your vote ${name} ${label}`} maxLength={NOTE_MAX}
          value={input[noteKey]} disabled={disabled || !on} tabIndex={on ? 0 : -1} aria-hidden={!on}
          onChange={e => commit({ ...latest.current, [noteKey]: e.target.value }, false)}
          onBlur={flush}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); flush() }
            if (e.key === 'Escape') { flush(); (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus() }
          }}
        />
      </div>
    )
  }

  return (
    <div className="voteControl" role="group" aria-label={`Your vote on ${label}`}>
      {side('approve')}
      {side('deny')}
    </div>
  )
}

export default VoteControl
