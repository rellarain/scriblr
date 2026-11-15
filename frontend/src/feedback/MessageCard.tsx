import { useState, type ReactNode } from 'react'
import { useChannels } from '../channels/channelStore'
import { labelOf } from '../channels/channelTree'
import { ChatBubblesIcon, EnvelopeIcon, NoteIcon, ReturnIcon } from '../assets/icons'
import { segmentText, shortDate } from './feedbackLogic'
import type { StaffMessage, VerbCategory } from './feedbackTypes'
import { ToneFace } from './ToneFaces'

// One writer's feedback message as staff see it: the text with the words that could mean a verb marked, its date, the
// writer's own tone and the tone staff gave it, and its subject. Its replies (questions to the writer with their answers, and
// staff comments) are folded away under a "## replies" chip that opens a drawer, where staff ask a question or comment.

export interface MessageActions {
  ask: (messageId: string, text: string) => Promise<boolean>
  comment: (messageId: string, text: string) => Promise<boolean>
}

function ReplyForm({ label, placeholder, Icon, onSend }: { label: string; placeholder: string; Icon: typeof NoteIcon; onSend: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState('')
  const send = async () => {
    if (!text.trim()) return
    if (await onSend(text)) setText('')
  }
  return (
    <div className="fbReplyForm">
      <input
        className="fbField" data-cf value={text} maxLength={500} aria-label={label} placeholder={placeholder}
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void send() } }}
      />
      <button type="button" className="fbIconBtn" aria-label={label} title={label} disabled={!text.trim()} onClick={() => void send()}>
        <Icon size={14} />
      </button>
    </div>
  )
}

export function MessageCard({ message, verbs, actions, showSubject = false, children }: {
  message: StaffMessage
  verbs: VerbCategory[]
  actions?: MessageActions
  showSubject?: boolean
  // Controls for this message (the check, a correction), under its text.
  children?: ReactNode
}) {
  const { index } = useChannels()
  const [open, setOpen] = useState(false)
  const replies = message.questions.length + message.questions.filter(q => q.answer).length + message.comments.length
  const verbName = (id: string) => verbs.find(v => v.id === id)?.name ?? id
  const drawerId = `fb-replies-${message.id}`

  return (
    <article className="fbMessage" aria-label={`Feedback ${message.id}`}>
      <p className="fbText">
        {segmentText(message.text, message.flags).map((seg, i) => seg.flag
          ? <mark key={i} className="kwMark" title={`Could mean: ${verbName(seg.flag.categoryId)}`}>{seg.text}</mark>
          : <span key={i}>{seg.text}</span>)}
      </p>
      <div className="fbMeta">
        <span>{shortDate(message.submittedAt)}</span>
        {message.senderTone && <ToneFace tone={message.senderTone} size={12} label={`The writer said ${message.senderTone}`} />}
        {message.tone && <ToneFace tone={message.tone} size={12} label={`Read as ${message.tone}`} />}
        {showSubject && <span className="fbSubject">{verbName(message.verbId)} · {labelOf(index, message.channelId)}</span>}
        <button
          type="button" className="fbChip" aria-expanded={open} aria-controls={drawerId}
          title={open ? 'Hide the replies' : 'Show the replies'} onClick={() => setOpen(o => !o)}
        >
          <ChatBubblesIcon size={12} /> {replies} {replies === 1 ? 'reply' : 'replies'}
        </button>
      </div>
      {children}
      {open && (
        <div className="fbDrawer" id={drawerId}>
          {message.questions.length === 0 && message.comments.length === 0 && <p className="fbMuted">No replies yet.</p>}
          {message.questions.map(q => (
            <div key={q.id} className="fbReply">
              <p><span className="fbReplyKind">Question to the writer{q.mine ? ' (yours)' : ''}</span> {q.text}</p>
              <p className="fbAnswer">{q.answer ? <><ReturnIcon size={12} /> {q.answer}</> : <span className="fbMuted">Waiting for the writer</span>}</p>
            </div>
          ))}
          {message.comments.map(c => (
            <div key={c.id} className="fbReply fbReply--internal">
              <p><span className="fbReplyKind">Comment{c.mine ? ' (yours)' : ''}</span> {c.text}</p>
            </div>
          ))}
          {actions && (
            <>
              <ReplyForm label="Ask the writer" placeholder="A question for the writer…" Icon={EnvelopeIcon} onSend={text => actions.ask(message.id, text)} />
              <ReplyForm label="Comment for staff" placeholder="A comment only staff see…" Icon={NoteIcon} onSend={text => actions.comment(message.id, text)} />
            </>
          )}
        </div>
      )}
    </article>
  )
}

export default MessageCard
