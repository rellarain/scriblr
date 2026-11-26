import { useState } from 'react'
import { OutboxIcon } from '../../../icons'
import ChannelPicker from '../../../../feedback/ChannelPicker'
import { MessageCard } from '../../../../feedback/MessageCard'
import { TonePicker } from '../../../../feedback/ToneFaces'
import { staffFeedbackApi } from '../../../../feedback/feedbackApi'
import { changeStaff, loadStaff, useStaff } from '../../../../feedback/staffStore'
import type { OutboxMessage, StaffBundle, Tone } from '../../../../feedback/feedbackTypes'
import '../../../../feedback/feedback.scss'

// The Outbox console (HUI): feedback a user confirmed in one of your chats waits here for you to complete it, with what the
// chat showed: what it is about, what should happen and its tone, and a note for staff if there is more to say. Send puts
// it in the Inbox (AUI > Office > Desk), where a checker checks it like any other. Today's come first; older ones stay until
// sent. Changes save at once; the note goes with Send.

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()

function OutboxCard({ message, bundle }: { message: OutboxMessage; bundle: StaffBundle }) {
  const [note, setNote] = useState('')
  const edit = (change: { channelId?: string; verbId?: string; tone?: Tone }) => changeStaff(a => staffFeedbackApi.editHeld(a, message.id, change))
  const send = () => changeStaff(a => staffFeedbackApi.sendHeld(a, message.id, note))
  return (
    <div className="outboxCard">
      <p className="fbMeta outboxFrom">From {message.author || 'a writer'}</p>
      <MessageCard message={message} verbs={bundle.verbCategories}>
        <div className="fbControls">
          <span className="fbLabel">About</span>
          <ChannelPicker value={message.channelId} label="What it is about" onChange={id => void edit({ channelId: id })} />
          <span className="fbLabel">Verb</span>
          <div className="fbVerbs" role="group" aria-label="What should happen">
            {bundle.verbCategories.map(v => (
              <button key={v.id} type="button" className="fbVerbChip" aria-pressed={message.verbId === v.id} onClick={() => void edit({ verbId: v.id })}>
                {v.name}
              </button>
            ))}
          </div>
          <span className="fbLabel">Tone</span>
          <TonePicker value={message.tone} label="Its tone" onChange={(tone: Tone | null) => { if (tone) void edit({ tone }) }} />
          <span className="fbLabel">Note</span>
          <input
            className="fbField" value={note} maxLength={500} aria-label="A note for staff (optional)" placeholder="A note only staff see (optional)…"
            onChange={e => setNote(e.target.value)}
          />
          <div className="fbRow">
            <button
              type="button" className="fbIconBtn fbIconBtn--primary" disabled={!message.tone}
              aria-label="Send to the Inbox" title={message.tone ? 'Send it to the Inbox, to be checked' : 'Set its tone first'}
              onClick={() => void send()}
            >
              <OutboxIcon size={14} /> Send
            </button>
          </div>
        </div>
      </MessageCard>
    </div>
  )
}

function OutboxSection() {
  const { bundle, status, error } = useStaff()

  if (!bundle) {
    return (
      <div className="outboxSection fbScope">
        <div className="sectionBody">
          {status === 'error'
            ? <p className="inboxError" role="alert">{error} <button type="button" className="toneBtn" onClick={() => void loadStaff()}>Retry</button></p>
            : <p className="feedbackCardMeta">Loading…</p>}
        </div>
      </div>
    )
  }

  const held = bundle.outbox ?? []
  const today = held.filter(m => isToday(m.submittedAt))
  const earlier = held.filter(m => !isToday(m.submittedAt))
  return (
    <div className="outboxSection fbScope">
      {error && <p className="inboxError" role="alert">{error}</p>}
      <div className="sectionBody">
        {held.length === 0 && <p className="fbMuted">Nothing to send. Feedback a writer confirms in one of your chats waits here for you to complete.</p>}
        {today.length > 0 && (
          <section className="fbList" aria-label="From today's chats">
            <h3 className="outboxHead">From today's chats</h3>
            {today.map(m => <OutboxCard key={m.id} message={m} bundle={bundle} />)}
          </section>
        )}
        {earlier.length > 0 && (
          <section className="fbList" aria-label="Earlier">
            <h3 className="outboxHead">Earlier</h3>
            {earlier.map(m => <OutboxCard key={m.id} message={m} bundle={bundle} />)}
          </section>
        )}
      </div>
    </div>
  )
}

export default OutboxSection
