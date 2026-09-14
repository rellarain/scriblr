import AUI from './assets/Interfaces/AUI'
import HUI from './assets/Interfaces/HUI'
import SidebarDivider from './SidebarDivider'
import type { AuiSize, Handedness, HuiPanel } from './interfaceShellTypes'
import type { HelperChats } from './assets/Interfaces/helper/useHelperChats'

interface SidebarProps {
  side: Handedness
  onActivateChats: (chatId: string) => void
  onCreateChat: () => void
  helper: HelperChats
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
  auiSize: AuiSize
  onSetAuiSize: (size: AuiSize) => void
}

// DOM order (AUI, divider, HUI) plus .sidebar's handedness-mirrored
// flex-direction (see App.scss) puts AUI on the true screen edge
// ("outermost") and HUI innermost, next to Mainscreen, regardless of
// handedness. AUI stays always-mounted (like HUI) so its width transition
// can animate and its internal section state survives close/reopen.
function Sidebar({
  side, onActivateChats, onCreateChat, helper, panel, onSelectPanel,
  expanded, onCollapse, activeAdminCount, activeStandardCount, pendingAdminCount, pendingStandardCount,
  auiOpen, onToggleAui, auiSize, onSetAuiSize,
}: SidebarProps) {
  return (
    <aside className="sidebar" aria-label={`Helper sidebar (${side})`}>
      <AUI size={auiSize} onSetSize={onSetAuiSize} />
      <SidebarDivider
        conversations={helper.conversations}
        selectedChatId={helper.selectedChatId}
        onActivateChats={onActivateChats}
        onCreateChat={onCreateChat}
        panel={panel}
        onSelectPanel={onSelectPanel}
        expanded={expanded}
        onCollapse={onCollapse}
        activeAdminCount={activeAdminCount}
        activeStandardCount={activeStandardCount}
        pendingAdminCount={pendingAdminCount}
        pendingStandardCount={pendingStandardCount}
        auiOpen={auiOpen}
        onToggleAui={onToggleAui}
      />
      <HUI side={side} helper={helper} panel={panel} />
    </aside>
  )
}

export default Sidebar
