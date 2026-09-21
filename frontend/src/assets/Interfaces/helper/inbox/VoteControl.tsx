import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CloseIcon, QuestionIcon } from '../../../icons'
import type { FeedbackVote, VoteInput } from './feedbackTypes'

const NOTE_MAX = 500
const SAVE_DELAY_MS = 500

type Kind = 'approve' | 'deny' | 'pass'
const KINDS: Kind[] = ['approve', 'deny', 'pass']
const FLAG: Record<Kind, 'approve' | 'deny' | 'passed'> = { approve: 'approve', deny: 'deny', pass: 'passed' }
const NOTE: Record<Kind, 'approveNote' | 'denyNote' | 'passNote'> = { approve: 'approveNote', deny: 'denyNote', pass: 'passNote' }
const NAME: Record<Kind, string> = { approve: 'yes', deny: 'no', pass: 'pass' }
const PLACEHOLDER: Record<Kind, string> = { approve: 'Why yes? (optional)', deny: 'Why no? (optional)', pass: 'Why pass? (optional)' }

const fromVote = (vote?: FeedbackVote): VoteInput => ({
  approve: vote?.approve ?? false, deny: vote?.deny ?? false, passed: vote?.passed ?? false,
  approveNote: vote?.approveNote ?? '', denyNote: vote?.denyNote ?? '', passNote: vote?.passNote ?? '',
})

// The order the selected buttons stack in: the ones already stacked keep their rows, a newly selected one
// takes the next row down.
const stack = (previous: Kind[], input: VoteInput): Kind[] => {
  const on = KINDS.filter(k => input[FLAG[k]])
  return [...previous.filter(k => on.includes(k)), ...on.filter(k => !previous.includes(k))]
}

// A square check (yes), x (no) and ? (pass) for voting on a feedback statement or a solution; any combination
// can be on. A selected button expands to the full width of its row into an optional note field. The first
// selected takes the top row and pushes the unselected ones down to a row of their own, where they share the
// width; a second selected takes the next row, and so on. Clicking a selected button withdraws it and its note.
// Notes save as you type (after a short pause) and when you leave the field.
export function VoteControl({ vote, label, disabled = false, disabledReason, onChange }: {
  vote?: FeedbackVote
  // What is being voted on, for screen readers.
  label: string
  disabled?: boolean
  disabledReason?: string
  onChange: (vote: VoteInput) => void
}) {
  const [input, setInput] = useState<VoteInput>(fromVote(vote))
  const [order, setOrder] = useState<Kind[]>(() => stack([], fromVote(vote)))
  const latest = useRef(input)
  const timer = useRef<number | null>(null)
  const notes = useRef<Partial<Record<Kind, HTMLInputElement | null>>>({})
  const buttons = useRef<Partial<Record<Kind, HTMLButtonElement | null>>>({})

  // What the server holds changed (another browser, a reload): show it, unless a save is pending.
  useEffect(() => {
    if (timer.current !== null) return
    const next = fromVote(vote)
    latest.current = next
    setInput(next)
    setOrder(prev => stack(prev, next))
  }, [vote?.approve, vote?.deny, vote?.passed, vote?.approveNote, vote?.denyNote, vote?.passNote])

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

  function toggle(kind: Kind) {
    const on = !latest.current[FLAG[kind]]
    const next = { ...latest.current, [FLAG[kind]]: on, ...(on ? {} : { [NOTE[kind]]: '' }) } as VoteInput
    setOrder(prev => (on ? [...prev.filter(k => k !== kind), kind] : prev.filter(k => k !== kind)))
    commit(next, true)
    // A button just selected: the cursor goes into its note once the row has been drawn.
    if (on) window.requestAnimationFrame(() => notes.current[kind]?.focus())
  }

  const square = (kind: Kind, on: boolean) => (
    <button
      type="button" ref={el => { buttons.current[kind] = el }} data-cf
      className={`voteSquare voteSquare--${kind}${on ? ' voteSquare--on' : ''}`}
      aria-pressed={on} aria-label={`Vote ${NAME[kind]} on ${label}`}
      disabled={disabled} title={disabled ? disabledReason : `${on ? 'Withdraw' : 'Vote'} ${NAME[kind]}`}
      onClick={() => toggle(kind)}
    >
      {kind === 'approve' ? <CheckIcon size={16} /> : kind === 'deny' ? <CloseIcon size={16} /> : <QuestionIcon size={16} />}
    </button>
  )

  const unselected = KINDS.filter(k => !order.includes(k))
  return (
    <div className="voteControl" role="group" aria-label={`Your vote on ${label}`}>
      {order.map(kind => (
        <div key={kind} className={`voteRow voteRow--${kind}`}>
          {square(kind, true)}
          <input
            ref={el => { notes.current[kind] = el }} className="voteNote" data-cf
            placeholder={PLACEHOLDER[kind]} aria-label={`Note on your ${NAME[kind]} vote on ${label}`} maxLength={NOTE_MAX}
            value={input[NOTE[kind]]} disabled={disabled}
            onChange={e => commit({ ...latest.current, [NOTE[kind]]: e.target.value }, false)}
            onBlur={flush}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); flush() }
              if (e.key === 'Escape') { flush(); buttons.current[kind]?.focus() }
            }}
          />
        </div>
      ))}
      {unselected.length > 0 && (
        <div className={`voteRest${unselected.length === 1 ? ' voteRest--single' : ''}`}>
          {unselected.map(kind => <span key={kind} className="voteRestItem">{square(kind, false)}</span>)}
        </div>
      )}
    </div>
  )
}

export default VoteControl
