import type { PointerEvent } from 'react'
import AUI from './assets/Interfaces/AUI'
import HUI from './assets/Interfaces/HUI'
import SidebarDivider from './SidebarDivider'
import type { Handedness, HuiPanel } from './interfaceShellTypes'
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
  // AUI's own width in px, dragged from its outer edge (snapping to 400px columns).
  auiWidth: number
  onSetAuiWidth: (width: number) => void
  // Only admins get the AUI panel and its toggle.
  isAdmin: boolean
}

// Dragged to set AUI's own width: pointer-drag resizes (clamped and snapped to 400px
// columns by the caller), like the Writer sidebar's own resize handle
// (assets/Interfaces/writer/WuiSidebar.tsx) but AUI can sit on either screen edge, so
// the drag direction flips with handedness (AUI is always the outer side -- see
// .sidebar's DOM-order comment in App.scss).
function AuiResize({ side, width, onWidthChange }: { side: Handedness; width: number; onWidthChange: (width: number) => void }) {
  const sign = side === 'left' ? 1 : -1
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !e.movementX) return
    onWidthChange(width + sign * e.movementX)
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  return (
    <div
      className="aUIResize" role="separator" aria-orientation="vertical" aria-label="Resize Admin panel" tabIndex={0}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft') onWidthChange(width - sign * (e.shiftKey ? 400 : 40))
        else if (e.key === 'ArrowRight') onWidthChange(width + sign * (e.shiftKey ? 400 : 40))
      }}
    />
  )
}

// DOM order (AUI, divider, HUI) plus .sidebar's handedness-mirrored
// flex-direction (see App.scss) puts AUI on the true screen edge
// ("outermost") and HUI innermost, next to Mainscreen, regardless of
// handedness. AUI stays always-mounted (like HUI) so its width transition
// can animate and its internal section state survives close/reopen.
function Sidebar({
  side, onActivateChats, onCreateChat, helper, panel, onSelectPanel,
  expanded, onCollapse, activeAdminCount, activeStandardCount, pendingAdminCount, pendingStandardCount,
  auiOpen, onToggleAui, auiWidth, onSetAuiWidth, isAdmin,
}: SidebarProps) {
  return (
    <aside className="sidebar" aria-label={`Helper sidebar (${side})`}>
      {isAdmin && <AUI />}
      {isAdmin && auiOpen && <AuiResize side={side} width={auiWidth} onWidthChange={onSetAuiWidth} />}
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
        isAdmin={isAdmin}
      />
      <HUI side={side} helper={helper} panel={panel} />
    </aside>
  )
}

export default Sidebar
