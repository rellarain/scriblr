import type { HelperMessage } from './helperTypes'
import MessageBubble from './MessageBubble'

interface MessageListProps {
  messages: HelperMessage[]
  senderName: string
}

function MessageList({ messages, senderName }: MessageListProps) {
  return (
    <div className="helperMessageList">
      {messages.map(m => (
        <MessageBubble key={m.id} message={m} senderName={senderName} />
      ))}
    </div>
  )
}

export default MessageList
