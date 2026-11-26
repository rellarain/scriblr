import { useRef, type KeyboardEvent } from 'react'
import { CheckIcon } from '../../../../icons'
import ChannelPicker from '../../../../../feedback/ChannelPicker'
import { MessageCard, type MessageActions } from '../../../../../feedback/MessageCard'
import { TonePicker } from '../../../../../feedback/ToneFaces'
import { toCheck } from '../../../../../feedback/feedbackLogic'
import type { MessageEdit, StaffBundle, StaffMessage, Tone } from '../../../../../feedback/feedbackTypes'

// The Inbox's Check: every message no helper has checked yet, oldest first. The writer already said what it is about and what
// should happen; the helper confirms or corrects both, reads its tone, may ask the writer a question or leave staff a comment,
// and checks it. A checked message joins the statement of its subject and verb, in voting. Changes save at once;
// Shift+Enter moves on to the next message.

export interface CheckActions extends MessageActions {
  edit: (messageId: string, edit: MessageEdit) => Promise<boolean>
}

function CheckCard({ message, bundle, actions, disabled, onNext }: {
  message: StaffMessage
  bundle: StaffBundle
  actions: CheckActions
  disabled: boolean
  onNext: () => void
}) {
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); onNext() } }
  return (
    <div className="checkCard" onKeyDown={onKey} data-check-card>
      <MessageCard message={message} verbs={bundle.verbCategories} actions={actions}>
        <div className="fbControls">
          <span className="fbLabel">About</span>
          <ChannelPicker value={message.channelId} disabled={disabled} label="What it is about" onChange={id => void actions.edit(message.id, { channelId: id })} />
          <span className="fbLabel">Verb</span>
          <div className="fbVerbs" role="group" aria-label="What should happen">
            {bundle.verbCategories.map(v => (
              <button
                key={v.id} type="button" data-cf className="fbVerbChip" aria-pressed={message.verbId === v.id} disabled={disabled}
                onClick={() => void actions.edit(message.id, { verbId: v.id })}
              >
                {v.name}
              </button>
            ))}
          </div>
          <span className="fbLabel">Tone</span>
          <TonePicker value={message.tone} disabled={disabled} label="Its tone" onChange={(tone: Tone | null) => { if (tone) void actions.edit(message.id, { tone }) }} />
          <div className="fbRow">
            <button
              type="button" data-cf className="fbIconBtn fbIconBtn--primary" disabled={disabled || !message.tone}
              aria-label="Check this message" title={message.tone ? 'Check this message: it goes into voting' : 'Set its tone first'}
              onClick={() => void actions.edit(message.id, { checked: true }).then(ok => { if (ok) onNext() })}
            >
              <CheckIcon size={14} /> Check
            </button>
          </div>
        </div>
      </MessageCard>
    </div>
  )
}

export default function CheckView({ bundle, actions }: { bundle: StaffBundle; actions: CheckActions }) {
  const list = useRef<HTMLDivElement>(null)
  const waiting = toCheck(bundle)
  const disabled = !bundle.can.check

  // The next card's first control takes the focus (a checked card leaves the list, so the one now in its place).
  const next = (i: number) => window.requestAnimationFrame(() => {
    const cards = list.current?.querySelectorAll<HTMLElement>('[data-check-card]') ?? []
    const card = cards[Math.min(i + 1, cards.length - 1)] ?? cards[0]
    card?.querySelector<HTMLElement>('[data-cf]:not(:disabled)')?.focus()
  })

  return (
    <div className="fbList" ref={list}>
      {disabled && <p className="fbMuted">Checking needs the Checker role on Helper &gt; Inbox.</p>}
      {waiting.length === 0 && <p className="fbMuted">Nothing to check.</p>}
      {waiting.map((m, i) => <CheckCard key={m.id} message={m} bundle={bundle} actions={actions} disabled={disabled} onNext={() => next(i)} />)}
    </div>
  )
}
