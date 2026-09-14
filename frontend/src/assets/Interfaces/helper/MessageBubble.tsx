import type { HelperMessage } from './helperTypes'
import { channelTagLabel } from './inbox/inboxHelpers'

interface MessageBubbleProps {
  message: HelperMessage
  senderName: string
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function MessageBubble({ message, senderName }: MessageBubbleProps) {
  const bubbleClass = message.sender === 'admin'
    ? 'helperMessageBubble helperMessageBubble--admin'
    : 'helperMessageBubble helperMessageBubble--user'

  return (
    <div className={bubbleClass}>
      {message.kind === 'text' && (
        <p className="feedbackCardText">{message.text}</p>
      )}

      {message.kind === 'form' && message.form && (
        <>
          {message.text && <p className="feedbackCardText">{message.text}</p>}
          <div className="helperMessageForm">
            <p className="feedbackCardMeta">{message.form.title}</p>
            {message.form.fields.map(field => (
              <div key={field.id} className="statementRow">
                <span className="statementField statementField--readonly">
                  {field.label} — ({field.kind})
                </span>
              </div>
            ))}
            {message.form.sent && (
              <span className="helperFormSentBadge teamBadge">Sent</span>
            )}
          </div>
        </>
      )}

      {message.kind === 'pageLink' && message.pageLink && (
        <>
          {message.text && <p className="feedbackCardText">{message.text}</p>}
          <span className="helperMessagePageLink channelPill">
            {message.pageLink.label ?? channelTagLabel(message.pageLink.target)} →
          </span>
        </>
      )}

      <p className="helperMessageMeta">
        {message.sender === 'admin' ? 'You' : senderName} · {formatTimestamp(message.sentAt)}
      </p>
    </div>
  )
}

export default MessageBubble
