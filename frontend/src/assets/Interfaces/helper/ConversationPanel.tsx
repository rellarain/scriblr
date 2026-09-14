import type { ChannelTag, FormFieldDef, HelperConversation, HelperMessage, HelperUserProfile } from './helperTypes'
import ProfileHeader from './ProfileHeader'
import MessageList from './MessageList'
import HelperComposer from './HelperComposer'

interface ConversationPanelProps {
  conversation: HelperConversation
  profile?: HelperUserProfile
  messages: HelperMessage[]
  onBack: () => void
  onSendText: (text: string) => void
  onSendForm: (title: string, fields: FormFieldDef[]) => void
  onSendPageLink: (target: ChannelTag, label?: string) => void
}

function ConversationPanel({
  conversation, profile, messages, onBack, onSendText, onSendForm, onSendPageLink,
}: ConversationPanelProps) {
  return (
    <div className="helperConversation">
      <div className="helperConversationTop">
        <button type="button" className="helperBackBtn" onClick={onBack} aria-label="Back to chats">←</button>
        <span>{conversation.label}</span>
      </div>
      <ProfileHeader profile={profile} />
      <MessageList messages={messages} senderName={profile?.name ?? conversation.label} />
      <HelperComposer onSendText={onSendText} onSendForm={onSendForm} onSendPageLink={onSendPageLink} />
    </div>
  )
}

export default ConversationPanel
