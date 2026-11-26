import { GearIcon, PlusIcon } from './assets/icons'
import type { HuiPanel } from './interfaceShellTypes'
import type { HelperConversation } from './assets/Interfaces/helper/helperTypes'

interface HuiMiniProps {
  conversations: HelperConversation[]
  selectedChatId: string | null
  onActivateChats: (chatId: string) => void
  onCreateChat: () => void
  panel: HuiPanel
  onSelectPanel: (panel: HuiPanel) => void
  // HUI's panel is open (beside the page); otherwise HUI is only this, in the band under the header.
  expanded: boolean
  // The meter (App.tsx, from the real queues): "admin" counts escalated chats (tier 2 and up), "standard" first-tier ones.
  activeAdminCount: number
  activeStandardCount: number
  pendingAdminCount: number
  pendingStandardCount: number
}

// The queue meter is always 150px wide. Below 30 chats each gets a 5px slot, stacked from its left edge, so the meter
// reads as countable blocks; from 30 on, the segments share the whole width in proportion.
const USER_UNIT_WIDTH = 5
const MAX_FIXED_USERS = 30

// HUI's mini form, in the band under the header while HUI is on: the queue meter, the chats, New chat and Settings. A button opens HUI's panel on that console; pressing the open one again folds the panel back into the band.
function HuiMini({
  conversations, selectedChatId, onActivateChats, onCreateChat, panel, onSelectPanel, expanded,
  activeAdminCount, activeStandardCount, pendingAdminCount, pendingStandardCount,
}: HuiMiniProps) {
  const totalChatCount = activeAdminCount + activeStandardCount + pendingAdminCount + pendingStandardCount
  const usesFixedWidth = totalChatCount < MAX_FIXED_USERS
  const isSettingsActive = expanded && panel === 'settings' && selectedChatId == null
  const isQueueActive = expanded && panel === 'queue' && selectedChatId == null

  function segmentStyle(count: number) {
    return usesFixedWidth
      ? { flexGrow: 0, width: `${count * USER_UNIT_WIDTH}px` }
      : { flexGrow: count, width: 'auto' }
  }

  return (
    <div className="huiMini" role="group" aria-label="Helper">
      {/* No icon by design -- each segment is one queue slice (crossing active/pending with escalated/first-tier chats),
          its width representing how many chats are in it. */}
      <button
        type="button"
        className={isQueueActive ? 'queueButton queueButton--active' : 'queueButton'}
        aria-pressed={isQueueActive}
        aria-label={
          `Queue console: ${activeAdminCount + activeStandardCount} chats in progress (${activeAdminCount} escalated), ` +
          `${pendingAdminCount + pendingStandardCount} waiting for you (${pendingAdminCount} escalated)`
        }
        title="Queue console"
        onClick={() => onSelectPanel('queue')}
      >
        {pendingAdminCount > 0 && (
          <span className="queueButtonSegment queueButtonSegment--pendingAdmin" style={segmentStyle(pendingAdminCount)} />
        )}
        {pendingStandardCount > 0 && (
          <span className="queueButtonSegment queueButtonSegment--pendingStandard" style={segmentStyle(pendingStandardCount)} />
        )}
        {activeAdminCount > 0 && (
          <span className="queueButtonSegment queueButtonSegment--activeAdmin" style={segmentStyle(activeAdminCount)} />
        )}
        {activeStandardCount > 0 && (
          <span className="queueButtonSegment queueButtonSegment--activeStandard" style={segmentStyle(activeStandardCount)} />
        )}
      </button>

      {/* Each item is a placeholder for a future user photo; no icon on purpose, aside from the active one being
          distinguished by colour. */}
      {conversations.length > 0 && (
        <div className="chatStack" role="group" aria-label="Active chats">
          {conversations.map(chat => {
            const isActive = expanded && chat.id === selectedChatId
            return (
              <button
                key={chat.id} type="button"
                className={isActive ? 'chatStackItem chatStackItem--active' : 'chatStackItem'}
                aria-pressed={isActive}
                title={chat.label} aria-label={chat.label}
                onClick={() => onActivateChats(chat.id)}
              />
            )
          })}
        </div>
      )}

      <button
        type="button"
        className="bandToggle bandToggle--newChat"
        aria-label="New chat" title="New chat"
        onClick={onCreateChat}
      >
        <PlusIcon size={21} />
      </button>

      <button
        type="button"
        className={isSettingsActive ? 'bandToggle bandToggle--active' : 'bandToggle'}
        aria-pressed={isSettingsActive} aria-label="Settings" title="Settings"
        onClick={() => onSelectPanel('settings')}
      >
        <GearIcon size={21} />
      </button>
    </div>
  )
}

export default HuiMini
