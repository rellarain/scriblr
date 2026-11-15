import { useState } from 'react'
import { CheckIcon, CloseIcon, EnvelopeIcon } from '../../assets/icons'
import HelpArticles from '../../assets/Interfaces/writer/levels/HelpArticles'
import { useChannels } from '../../channels/channelStore'
import { labelOf, nearest, pathOf } from '../../channels/channelTree'
import type { HelpTarget } from '../../channels/helpTargets'
import ChannelPicker from '../../feedback/ChannelPicker'
import { useMine } from '../../feedback/mineStore'
import { closeUserChat, confirmDraft, sendUserMessage, startChat, useUserChats } from '../../support/supportStores'
import type { Chat, ChatEvent } from '../../support/supportTypes'
import { STAGE_LABEL } from '../../support/supportTypes'

// The Help tile's Chat: ask the people who support this console. A new chat waits in the console's queue until a helper takes it;
// the conversation shows their messages, the guides they send (opened in place) and feedback they draft for you to confirm (it is
// then sent as yours, already checked). One open chat per console.

function EventRow({ chat, event }: { chat: Chat; event: ChatEvent }) {
  const { index } = useChannels()
  const { verbs } = useMine()
  const verb = (id: string) => verbs.find(v => v.id === id)?.name ?? id
  if (event.kind === 'userMessage') return <p className="hcMsg hcMsg--me">{event.text}</p>
  if (event.kind === 'helperMessage' || event.kind === 'adminMessage' || (event.kind === 'greeting' && event.text)) {
    return <p className="hcMsg hcMsg--them">{event.text}</p>
  }
  if (event.kind === 'resource' && event.nodeId) {
    return (
      <details className="hcGuide" open>
        <summary>Guide: {labelOf(index, event.nodeId)}</summary>
        <HelpArticles target={{ id: event.nodeId, aliases: [] }} fallback="This guide is on the way." />
      </details>
    )
  }
  if (event.kind === 'feedbackInitiated' && event.draft) {
    const d = event.draft
    return (
      <div className="hcDraft" role="group" aria-label="Feedback drafted for you">
        <span className="fbLabel">Feedback for you to send</span>
        <span className="fbSubject"><strong>{verb(d.verbId)}</strong> {labelOf(index, d.channelId)}</span>
        <p className="fbText">{d.text}</p>
        {d.confirmed
          ? <span className="fbMuted">Sent. It is under My feedback.</span>
          : chat.status !== 'closed' && (
            <button type="button" className="fbIconBtn fbIconBtn--primary" aria-label="Send this feedback as mine" title="Send it as my feedback" onClick={() => void confirmDraft(chat.id, event.id)}>
              <CheckIcon size={14} /> Send
            </button>
          )}
      </div>
    )
  }
  const note: Partial<Record<ChatEvent['kind'], string>> = {
    taken: 'Someone is here to help.', transfer: 'Passed on to another team; waiting for them.', escalation: 'Passed on to someone more senior; waiting for them.',
    hold: 'On hold for a moment.', checkIn: 'Checking in: still there?', closed: 'The chat is closed.',
    stage: event.stage ? STAGE_LABEL[event.stage] : undefined, focal: event.nodeId ? `About ${labelOf(index, event.nodeId)}` : undefined,
  }
  const text = note[event.kind] ?? (event.text || null)
  return text ? <p className="hcNote">{text}</p> : null
}

export default function HelpChat({ target }: { target: HelpTarget }) {
  const { index } = useChannels()
  const { view, error } = useUserChats()
  const start = nearest(index, target.id)?.id ?? null
  const [focal, setFocal] = useState<string | null>(null)
  const [text, setText] = useState('')
  const at = focal ?? start
  // A chat is by console: the subject must be a console or something in one.
  const inConsole = !!at && pathOf(index, at).length >= 2
  const scope = at ? pathOf(index, at).slice(0, 2).map(n => n.id).pop() : undefined
  const open = view.chats.find(c => c.status !== 'closed' && (c.queue === scope || c.queue === pathOf(index, start).slice(0, 2).map(n => n.id).pop()))

  const send = async () => {
    if (!text.trim()) return
    const ok = open ? await sendUserMessage(open.id, text) : at && inConsole ? await startChat(at, text) : false
    if (ok) setText('')
  }

  return (
    <div className="hcChat" aria-label="Chat">
      {open ? (
        <>
          <div className="fbRow">
            <span className="fbMuted">{open.status === 'pending' ? 'Waiting for someone to answer…' : `About ${labelOf(index, open.focal)}`}</span>
            <button type="button" className="fbIconBtn" aria-label="Close the chat" title="Close the chat" onClick={() => void closeUserChat(open.id)}><CloseIcon size={14} /></button>
          </div>
          <div className="hcLog" role="log" aria-label="Conversation">
            {open.events.map(e => <EventRow key={e.id} chat={open} event={e} />)}
          </div>
        </>
      ) : (
        <>
          <span className="fbLabel">What it is about</span>
          <ChannelPicker value={at} onChange={setFocal} label="What the chat is about" />
        </>
      )}
      <form className="fbReplyForm" onSubmit={e => { e.preventDefault(); void send() }}>
        <input
          className="fbField" value={text} maxLength={2000} aria-label={open ? 'Your message' : 'Your question'}
          placeholder={open ? 'Write a message…' : 'What do you need help with?'} onChange={e => setText(e.target.value)}
        />
        <button type="submit" className="fbIconBtn fbIconBtn--primary" disabled={!text.trim() || (!open && !inConsole)} aria-label={open ? 'Send the message' : 'Start the chat'} title={open ? 'Send' : 'Start the chat'}>
          <EnvelopeIcon size={14} />
        </button>
      </form>
      {error && <p className="fbError" role="alert">{error}</p>}
    </div>
  )
}
