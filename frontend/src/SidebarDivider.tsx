import type { MouseEvent } from 'react'
import { BriefcaseIcon, GearIcon, InboxIcon, PlusIcon } from './assets/icons'
import type { HuiPanel } from './interfaceShellTypes'
import type { HelperConversation } from './assets/Interfaces/helper/helperTypes'

interface SidebarDividerProps {
  conversations: HelperConversation[]
  selectedChatId: string | null
  onActivateChats: (chatId: string) => void
  onCreateChat: () => void
  panel: HuiPanel
  onSelectPanel: (panel: HuiPanel) => void
  expanded: boolean
  onCollapse: () => void
  activeAdminCount: number
  activeStandardCount: number
  pendingAdminCount: number
  pendingStandardCount: number
  auiOpen: boolean
  onToggleAui: () => void
  isAdmin: boolean
}

// The queue button is always 150px tall. Below 30 total users, each gets a
// literal 5px-tall slot stacked at the button's bottom edge (empty space
// above), so the bar reads as countable unit-blocks; once the count
// reaches 30 it switches to the two segments proportionally splitting the
// full 150px instead.
const USER_UNIT_HEIGHT = 5
const MAX_FIXED_USERS = 30

function SidebarDivider({
  conversations, selectedChatId, onActivateChats, onCreateChat, panel, onSelectPanel,
  expanded, onCollapse,
  activeAdminCount, activeStandardCount, pendingAdminCount, pendingStandardCount,
  auiOpen, onToggleAui, isAdmin,
}: SidebarDividerProps) {
  const totalChatCount = activeAdminCount + activeStandardCount + pendingAdminCount + pendingStandardCount
  const usesFixedHeight = totalChatCount < MAX_FIXED_USERS
  const isAdminActive = auiOpen
  const isSettingsActive = expanded && panel === 'settings'
  const isQueueActive = expanded && panel === 'queue'
  const isInboxActive = expanded && panel === 'inbox' && selectedChatId == null

  function segmentStyle(count: number) {
    return usesFixedHeight
      ? { flexGrow: 0, height: `${count * USER_UNIT_HEIGHT}px` }
      : { flexGrow: count, height: 'auto' }
  }

  // Clicking the divider's own background (not one of its buttons) is an
  // alternate way to collapse, alongside re-clicking the active button --
  // covers the nav's bare area plus the empty chat-stack/spacer space, but
  // not a click that lands on any button inside it.
  function handleDividerClick(e: MouseEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest('button')) return
    onCollapse()
  }

  return (
    <nav className="sidebarDivider" aria-label="Sidebar controls" onClick={handleDividerClick}>
      {isAdmin && (
        <button
          type="button"
          className={isAdminActive ? 'dividerToggle dividerToggle--admin dividerToggle--active' : 'dividerToggle dividerToggle--admin'}
          aria-pressed={isAdminActive} aria-label="Admin" title="Admin"
          onClick={onToggleAui}
        >
          <BriefcaseIcon size={21} />
        </button>
      )}

      {/* No icon by design -- each segment is one queue slice (crossing
          active/pending with admin/standard users), its size representing
          how many users are in it. */}
      <button
        type="button"
        className={isQueueActive ? 'queueButton queueButton--active' : 'queueButton'}
        aria-pressed={isQueueActive}
        aria-label={
          `Queue console: ${activeAdminCount} admin and ${activeStandardCount} standard users being helped, ` +
          `${pendingAdminCount} admin and ${pendingStandardCount} standard users waiting`
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

      <button
        type="button"
        className={isInboxActive ? 'dividerToggle dividerToggle--active' : 'dividerToggle'}
        aria-pressed={isInboxActive} aria-label="Inbox" title="Inbox"
        onClick={() => onSelectPanel('inbox')}
      >
        <InboxIcon size={21} />
      </button>

      <button
        type="button"
        className="dividerToggle dividerToggle--newChat"
        aria-label="New chat" title="New chat"
        onClick={onCreateChat}
      >
        <PlusIcon size={21} />
      </button>

      {/* Each item is a placeholder for a future user photo; no icon on
          purpose, aside from the active one being distinguished by color. */}
      <div className="chatStack" aria-label="Active chats">
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

      <div className="dividerSpacer" aria-hidden="true" />

      <button
        type="button"
        className={isSettingsActive ? 'dividerToggle dividerToggle--active' : 'dividerToggle'}
        aria-pressed={isSettingsActive} aria-label="Settings" title="Settings"
        onClick={() => onSelectPanel('settings')}
      >
        <GearIcon size={21} />
      </button>
    </nav>
  )
}

export default SidebarDivider
