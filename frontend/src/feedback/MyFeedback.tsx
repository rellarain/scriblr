import { useState } from 'react'
import { useChannels } from '../channels/channelStore'
import { labelOf } from '../channels/channelTree'
import { ReturnIcon } from '../assets/icons'
import { STEP_LABEL, shortDate } from './feedbackLogic'
import type { FeedbackQuestion, MyMessage } from './feedbackTypes'
import { answerQuestion } from './mineStore'

// What a user sent and where each stands, as they see it: the statement (verb and subject), their words, the steps it has
// passed (the last one marked), the reason when it was declined, and the questions staff asked them, each with an answer box.

function AnswerBox({ messageId, question }: { messageId: string; question: FeedbackQuestion }) {
  const [text, setText] = useState('')
  const send = async () => { if (text.trim() && (await answerQuestion(messageId, question.id, text))) setText('') }
  return (
    <div className="fbReplyForm">
      <input
        className="fbField" value={text} maxLength={500} aria-label={`Your answer to: ${question.text}`} placeholder="Your answer…"
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void send() } }}
      />
      <button type="button" className="fbIconBtn" aria-label="Send the answer" title="Send the answer" disabled={!text.trim()} onClick={() => void send()}>
        <ReturnIcon size={14} />
      </button>
    </div>
  )
}

export function Questions({ message }: { message: MyMessage }) {
  if (message.questions.length === 0) return null
  return (
    <div className="fbDrawer">
      {message.questions.map(q => (
        <div key={q.id} className="fbReply">
          <p><span className="fbReplyKind">Question</span> {q.text}</p>
          {q.answer ? <p className="fbAnswer"><ReturnIcon size={12} /> {q.answer}</p> : <AnswerBox messageId={message.id} question={q} />}
        </div>
      ))}
    </div>
  )
}

export function MyMessageCard({ message }: { message: MyMessage }) {
  const { index } = useChannels()
  const last = message.steps[message.steps.length - 1]
  return (
    <article className="fbMessage" aria-label={`${message.verbName} ${labelOf(index, message.channelId)}`}>
      <div className="fbMeta">
        <span className="fbSubject"><strong>{message.verbName}</strong> {labelOf(index, message.channelId)}</span>
        <span>{shortDate(message.submittedAt)}</span>
      </div>
      <p className="fbText">{message.text}</p>
      <ol className="fbSteps" aria-label="Where it stands">
        {message.steps.map(s => (
          <li
            key={s.step} className={`fbStep${s === last ? (s.step === 'declined' ? ' fbStep--declined' : ' fbStep--current') : ''}`}
            aria-current={s === last ? 'step' : undefined} title={s.at ? shortDate(s.at) : undefined}
          >
            {STEP_LABEL[s.step] ?? s.step}
          </li>
        ))}
      </ol>
      {message.note && <p className="fbMuted">{message.status === 'declined' ? 'Why: ' : 'Note: '}{message.note}</p>}
      <Questions message={message} />
    </article>
  )
}

export function MyFeedbackList({ messages, empty }: { messages: MyMessage[]; empty: string }) {
  if (messages.length === 0) return <p className="fbMuted">{empty}</p>
  return <div className="fbList">{messages.map(m => <MyMessageCard key={m.id} message={m} />)}</div>
}
