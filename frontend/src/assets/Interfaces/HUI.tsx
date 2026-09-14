import type { Handedness, HuiPanel } from '../../interfaceShellTypes'
import type { HelperChats } from './helper/useHelperChats'
import ChatsSection from './helper/ChatsSection'
import InboxSection from './helper/inbox/InboxSection'
import SettingsSection from './helper/SettingsSection'
import QueueSection from './helper/QueueSection'

interface HUIProps {
  side: Handedness
  helper: HelperChats
  panel: HuiPanel
}

// Which panel shows: a selected chat head always wins (Chat); otherwise
// whichever of Inbox/Settings/Queue was picked via the sidebar divider's
// buttons.
function HUI({ side, helper, panel }: HUIProps) {
  const hasSelectedChat = helper.selectedChatId != null

  function renderContent() {
    if (hasSelectedChat) return <ChatsSection helper={helper} />
    if (panel === 'settings') return <SettingsSection />
    if (panel === 'queue') return <QueueSection />
    return <InboxSection />
  }

  return (
    <section className="hUI" aria-label={`Helper panel (${side})`}>
      <div className="hUIMain">{renderContent()}</div>
    </section>
  )
}

export default HUI
