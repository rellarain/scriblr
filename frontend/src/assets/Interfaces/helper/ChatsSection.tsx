import { useState } from 'react'
import {
  BookOpenIcon, ChatBubblesIcon, ChevronLeftIcon, CloseIcon, EnvelopeIcon, PauseIcon, QuestionIcon, ShieldIcon, SwapIcon,
} from '../../icons'
import { useChannels } from '../../../channels/channelStore'
import { childrenOf, labelOf } from '../../../channels/channelTree'
import ChannelPicker from '../../../feedback/ChannelPicker'
import { TonePicker } from '../../../feedback/ToneFaces'
import type { Tone } from '../../../feedback/feedbackTypes'
import { useStaff } from '../../../feedback/staffStore'
import '../../../feedback/feedback.scss'
import { chatAction, clearStaffChatError, sendStaffMessage, useStaffChats } from '../../../support/supportStores'
import type { Chat, ChatEvent } from '../../../support/supportTypes'
import { EVENT_LABEL, STAGES, STAGE_LABEL } from '../../../support/supportTypes'
import type { HelperChats } from './useHelperChats'
import './chat.scss'

// The Helper panel's Conversation tile: the chat chosen in the sidebar, from the support store. It shows the writer's messages and
// what has happened (as the writer sees it, with the staff side marked), the stage, the queue and tier, and controls to answer
// (Response), send a guide of a feature (Guide), draft feedback for the writer to confirm (Feedback), change the focal feature,
// transfer to another console's queue, escalate to the next tier, hold, check in and close.

type Mode = 'response' | 'guide' | 'feedback'
const MODES: Array<{ key: Mode; label: string; Icon: typeof EnvelopeIcon }> = [
  { key: 'response', label: 'Response', Icon: ChatBubblesIcon },
  { key: 'guide', label: 'Guide', Icon: BookOpenIcon },
  { key: 'feedback', label: 'Feedback', Icon: EnvelopeIcon },
]

function Line({ event }: { event: ChatEvent }) {
  const { index } = useChannels()
  if (event.kind === 'userMessage') return <p className="scMsg scMsg--user">{event.text}</p>
  if (event.text && (event.kind === 'helperMessage' || event.kind === 'adminMessage' || event.kind === 'greeting' || event.kind === 'checkIn' || event.kind === 'hold')) {
    return <p className="scMsg scMsg--staff" title={EVENT_LABEL[event.kind]}>{event.text}</p>
  }
  const what = event.kind === 'resource' && event.nodeId ? `Guide sent: ${labelOf(index, event.nodeId)}`
    : event.kind === 'feedbackInitiated' && event.draft ? `Feedback drafted: ${labelOf(index, event.draft.channelId)}${event.draft.confirmed ? ' (sent)' : ''}`
    : event.kind === 'feedbackConfirmed' ? 'The writer sent the feedback'
    : event.kind === 'transfer' && event.toQueue ? `Transferred to ${labelOf(index, event.toQueue)}`
    : event.kind === 'escalation' ? `Escalated to tier ${event.toTier}`
    : event.kind === 'stage' && event.stage ? `Stage: ${STAGE_LABEL[event.stage]}`
    : event.kind === 'focal' && event.nodeId ? `Feature: ${labelOf(index, event.nodeId)}`
    : EVENT_LABEL[event.kind]
  return <p className="scNote">{what}</p>
}

function Composer({ chat }: { chat: Chat }) {
  const { bundle } = useStaff()
  const [mode, setMode] = useState<Mode>('response')
  const [text, setText] = useState('')
  const [guide, setGuide] = useState<string | null>(null)
  const [subject, setSubject] = useState<string | null>(null)
  const [verb, setVerb] = useState<string | null>(null)
  const [tone, setTone] = useState<Tone | null>(null)
  const done = (ok: boolean) => { if (ok) { setText(''); setVerb(null); setTone(null) } }

  return (
    <div className="scComposer">
      <div className="fbRow" role="tablist" aria-label="Answer with">
        {MODES.map(({ key, label, Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={mode === key} className="fbIconBtn" aria-pressed={mode === key} aria-label={label} title={label} onClick={() => setMode(key)}>
            <Icon size={14} />
          </button>
        ))}
      </div>
      {mode === 'response' && (
        <form className="fbReplyForm" onSubmit={e => { e.preventDefault(); if (text.trim()) void sendStaffMessage(chat.id, text).then(done) }}>
          <input className="fbField" value={text} maxLength={2000} aria-label="Your response" placeholder="Type a response…" onChange={e => setText(e.target.value)} />
          <button type="submit" className="fbIconBtn fbIconBtn--primary" disabled={!text.trim()} aria-label="Send the response" title="Send"><EnvelopeIcon size={14} /></button>
        </form>
      )}
      {mode === 'guide' && (
        <div className="scForm">
          <ChannelPicker value={guide ?? chat.focal} onChange={setGuide} label="The guide of" />
          <button type="button" className="fbIconBtn fbIconBtn--primary" aria-label="Send the guide" title="Send this feature's guide" onClick={() => void chatAction(chat.id, { action: 'resource', nodeId: guide ?? chat.focal })}>
            <BookOpenIcon size={14} />
          </button>
        </div>
      )}
      {mode === 'feedback' && (
        <form className="scForm" aria-label="Draft feedback" onSubmit={e => {
          e.preventDefault()
          const at = subject ?? chat.focal
          if (verb && text.trim()) void chatAction(chat.id, { action: 'feedbackInitiated', draft: { channelId: at, verbId: verb, text, tone } }).then(done)
        }}>
          <ChannelPicker value={subject ?? chat.focal} onChange={setSubject} label="What the feedback is about" />
          <div className="fbVerbs" role="group" aria-label="What should happen">
            {(bundle?.verbCategories ?? []).map(v => (
              <button key={v.id} type="button" className="fbVerbChip" aria-pressed={verb === v.id} onClick={() => setVerb(verb === v.id ? null : v.id)}>{v.name}</button>
            ))}
          </div>
          <textarea className="fbField" value={text} maxLength={2000} aria-label="The feedback" placeholder="The feedback, in the writer's words…" onChange={e => setText(e.target.value)} />
          <TonePicker value={tone} onChange={setTone} label="Its tone" />
          <button type="submit" className="fbIconBtn fbIconBtn--primary" disabled={!verb || !text.trim()} aria-label="Draft it for the writer to confirm" title="The writer confirms it">
            <EnvelopeIcon size={14} />
          </button>
        </form>
      )}
    </div>
  )
}

function Conversation({ chat, onBack }: { chat: Chat; onBack: () => void }) {
  const { index } = useChannels()
  const [queue, setQueue] = useState('')
  const consoles = childrenOf(index, null).flatMap(i => childrenOf(index, i.id)).filter(n => n.id !== chat.queue)
  return (
    <div className="scConversation" aria-label={`Chat with ${chat.userName || 'a writer'}`}>
      <div className="fbRow scTop">
        <button type="button" className="fbIconBtn" onClick={onBack} aria-label="Back to the inbox" title="Back"><ChevronLeftIcon size={14} /></button>
        <strong>{chat.userName || 'A writer'}</strong>
        <span className="fbMuted">{labelOf(index, chat.queue)} · tier {chat.tier}</span>
        <select className="fbSelect" value={chat.stage} aria-label="Stage" onChange={e => void chatAction(chat.id, { action: 'stage', stage: e.target.value as Chat['stage'] })}>
          {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
      </div>
      <details className="scFocal">
        <summary>Feature: {labelOf(index, chat.focal)}</summary>
        <ChannelPicker value={chat.focal} onChange={id => void chatAction(chat.id, { action: 'focal', nodeId: id })} label="The focal feature" />
      </details>
      <div className="scLog" role="log" aria-label="Conversation">
        {chat.events.map(e => <Line key={e.id} event={e} />)}
      </div>
      <Composer chat={chat} />
      <div className="fbRow scActions" aria-label="Chat actions" role="group">
        <button type="button" className="fbIconBtn" aria-label="Check in" title="Check in: still there?" onClick={() => void chatAction(chat.id, { action: 'checkIn', text: 'Are you still there?' })}><QuestionIcon size={14} /></button>
        <button type="button" className="fbIconBtn" aria-label="Put on hold" title="On hold for a moment" onClick={() => void chatAction(chat.id, { action: 'hold', text: 'One moment, please.' })}><PauseIcon size={14} /></button>
        <button type="button" className="fbIconBtn" disabled={chat.tier >= 3} aria-label="Escalate" title={chat.tier >= 3 ? 'At the top tier' : `Escalate to tier ${chat.tier + 1}`} onClick={() => void chatAction(chat.id, { action: 'escalation' })}><ShieldIcon size={14} /></button>
        <select className="fbSelect" value={queue} aria-label="Transfer to" onChange={e => setQueue(e.target.value)}>
          <option value="">Transfer to…</option>
          {consoles.map(n => <option key={n.id} value={n.id}>{labelOf(index, n.id)}</option>)}
        </select>
        <button type="button" className="fbIconBtn" disabled={!queue} aria-label="Transfer" title="Transfer to that console's queue" onClick={() => void chatAction(chat.id, { action: 'transfer', toQueue: queue })}><SwapIcon size={14} /></button>
        <button type="button" className="fbIconBtn" aria-label="Close the chat" title="Close the chat" onClick={() => void chatAction(chat.id, { action: 'closed' })}><CloseIcon size={14} /></button>
      </div>
    </div>
  )
}

// HUI mounts this once a chat head is selected; a selection that is no longer the staff member's shows nothing.
function ChatsSection({ helper }: { helper: HelperChats }) {
  const { view, error } = useStaffChats()
  const chat = view.mine.find(c => c.id === helper.selectedChatId)
  return (
    <div className="helperChatsSection fbScope">
      {error && <p className="fbError" role="alert">{error} <button type="button" className="fbIconBtn" aria-label="Dismiss" title="Dismiss" onClick={clearStaffChatError}>×</button></p>}
      <div className="helperChatsScroll">
        {chat && <Conversation key={chat.id} chat={chat} onBack={() => helper.selectChat(null)} />}
      </div>
    </div>
  )
}

export default ChatsSection
