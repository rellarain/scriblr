import type { ReactNode } from 'react'
import { useChannels } from '../channels/channelStore'
import { labelOf } from '../channels/channelTree'
import { CheckIcon, CloseIcon, QuestionIcon } from '../assets/icons'
import { messagesOf } from './feedbackLogic'
import type { StaffBundle, StaffMessage, Statement } from './feedbackTypes'
import { MessageCard, type MessageActions } from './MessageCard'
import { ToneBar } from './ToneFaces'

// An action statement: a verb and a subject (a node of the channel list), with every message that says it (statements on the
// same subject and verb are one). The header gives the verb, the subject, how many messages, the votes so far and the tone;
// the body lists the messages as cards. What a screen does with it (vote, correct, decide) goes in `children`, and per message
// in `messageControls`.
export function StatementCard({ statement, bundle, actions, children, messageControls }: {
  statement: Statement
  bundle: StaffBundle
  actions?: MessageActions
  children?: ReactNode
  messageControls?: (message: StaffMessage) => ReactNode
}) {
  const { index } = useChannels()
  const messages = messagesOf(bundle, statement)
  const title = `${statement.verbName} ${labelOf(index, statement.channelId)}`
  return (
    <section className="fbStatement" aria-label={title}>
      <header className="fbStatementHead">
        <h3 className="fbStatementTitle"><span className="fbVerb">{statement.verbName}</span> {labelOf(index, statement.channelId)}</h3>
        <div className="fbStatementMeta">
          <span className="fbCount" title="Messages">{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span>
          <span className="fbTally" aria-label={`${statement.tally.approve} yes, ${statement.tally.deny} no, ${statement.tally.pass} pass`}>
            <span title="Yes"><CheckIcon size={12} /> {statement.tally.approve}</span>
            <span title="No"><CloseIcon size={12} /> {statement.tally.deny}</span>
            <span title="Pass"><QuestionIcon size={12} /> {statement.tally.pass}</span>
          </span>
          <ToneBar summary={statement.tone} />
          {statement.decision && (
            <span className={`fbBadge fbBadge--${statement.decision}`} title={statement.decisionNote || undefined}>
              {statement.decision === 'accepted' ? 'Accepted' : 'Vetoed'}
            </span>
          )}
        </div>
      </header>
      {children}
      <div className="fbMessages">
        {messages.map(m => (
          <MessageCard key={m.id} message={m} verbs={bundle.verbCategories} actions={actions}>
            {messageControls?.(m)}
          </MessageCard>
        ))}
      </div>
    </section>
  )
}

export default StatementCard
