import type { HelperChats } from './useHelperChats'
import ConversationPanel from './ConversationPanel'

interface ChatsSectionProps {
  helper: HelperChats
}

// HUI only ever mounts this once a chat head is selected (it shows
// InboxSection otherwise), so there's always a conversation to show here --
// the `conversation` guard just covers a stale/invalid selectedChatId.
function ChatsSection({ helper }: ChatsSectionProps) {
  const conversation = helper.conversations.find(c => c.id === helper.selectedChatId)

  return (
    <div className="helperChatsSection">
      <div className="helperChatsScroll">
        {conversation && (
          <ConversationPanel
            key={conversation.id} conversation={conversation}
            profile={helper.profiles.find(p => p.chatId === conversation.id)}
            messages={helper.messagesByChat.get(conversation.id) ?? []}
            onBack={() => helper.selectChat(null)}
            onSendText={text => helper.sendTextMessage(conversation.id, text)}
            onSendForm={(title, fields) => helper.sendForm(conversation.id, title, fields)}
            onSendPageLink={(target, label) => helper.sendPageLink(conversation.id, target, label)}
          />
        )}
      </div>
    </div>
  )
}

export default ChatsSection
