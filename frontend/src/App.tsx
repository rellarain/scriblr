import { useState } from 'react'
import './App.scss'
import WUI from './assets/Interfaces/WUI'
import RUI from './assets/Interfaces/RUI'
import TUI from './assets/Interfaces/TUI'
import VUI from './assets/Interfaces/VUI'
import Header from './Header'
import Sidebar from './Sidebar'
import type { MainInterface, HuiPanel, AuiSize } from './interfaceShellTypes'
import { useHelperChats } from './assets/Interfaces/helper/useHelperChats'
import { CURRENT_USER } from './userSeed'
import { DAY_ACTIVITY } from './activitySeed'
import { useSettings } from './settings/settingsStore'
import { useThemeEngine } from './theme/useTheme'

const SIDEBAR_DIVIDER_W = 40
const SIDEBAR_PANEL_W = 400

function App() {
  const [activeMain, setActiveMain] = useState<MainInterface>('writer')
  const [showVUI, setShowVUI] = useState<boolean>(false)
  const { ui } = useSettings()
  const handedness = ui.handedness
  const theme = useThemeEngine()
  const isAdmin = theme.effectiveRole === 'admin'
  const [huiExpanded, setHuiExpanded] = useState<boolean>(false)
  const [auiOpen, setAuiOpen] = useState<boolean>(false)
  const [auiSize, setAuiSize] = useState<AuiSize>('half')
  const [huiPanel, setHuiPanel] = useState<HuiPanel>('inbox')
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)
  const helper = useHelperChats()

  // Re-clicking whatever's already open collapses the sidebar instead of
  // re-selecting it -- applies uniformly to Settings/Queue/Inbox and every
  // individual chat head, so no separate expand/collapse button is needed.
  function handleActivateChats(chatId: string) {
    if (huiExpanded && helper.selectedChatId === chatId) {
      setHuiExpanded(false)
      return
    }
    setHuiExpanded(true)
    // Reset to Inbox so backing out of the chat later lands on the
    // default panel rather than resuming a stale Settings/Queue view.
    setHuiPanel('inbox')
    helper.selectChat(chatId)
  }

  function handleSelectHuiPanel(panel: HuiPanel) {
    if (huiExpanded && huiPanel === panel && helper.selectedChatId == null) {
      setHuiExpanded(false)
      return
    }
    setHuiExpanded(true)
    setHuiPanel(panel)
    // Settings/Queue/Inbox replace the chat view, so close whatever's open
    // -- otherwise the selected-chat view would keep taking priority over them.
    helper.selectChat(null)
  }

  // Always creates a fresh conversation (not a toggle -- there's no
  // persistent "New Chat is selected" state to compare against).
  function handleCreateChat() {
    helper.createConversation()
    setHuiExpanded(true)
    setHuiPanel('inbox')
  }

  // Clicking the divider's own background (not one of its buttons) is an
  // alternate way to collapse, alongside re-clicking the active button.
  function handleCollapseSidebar() {
    setHuiExpanded(false)
  }

  // AUI has no panel-selection dimension to track like HUI does -- just a
  // direct open/closed flip, independent of huiExpanded (both can be open
  // at once; Mainscreen just narrows further).
  function handleToggleAui() {
    setAuiOpen(open => !open)
  }

  // Queue button breakdown: active (currently open, being helped) vs pending
  // (waiting to be helped) -- a heuristic off each profile's free-text
  // status -- crossed with the profile's admin/standard userType.
  const isActiveProfile = (p: typeof helper.profiles[number]) => p.status.toLowerCase().startsWith('active')
  const activeAdminCount = helper.profiles.filter(p => isActiveProfile(p) && p.userType === 'admin').length
  const activeStandardCount = helper.profiles.filter(p => isActiveProfile(p) && p.userType === 'standard').length
  const pendingAdminCount = helper.profiles.filter(p => !isActiveProfile(p) && p.userType === 'admin').length
  const pendingStandardCount = helper.profiles.filter(p => !isActiveProfile(p) && p.userType === 'standard').length

  // Re-clicking the already-active page's header icon reveals VUI (the
  // Base layer, normally fully covered by Mainscreen's opaque background)
  // instead of re-selecting it -- same toggle convention as the sidebar.
  // Clicking a different icon always switches page and hides VUI again.
  function handleSelectMain(next: MainInterface) {
    if (next === activeMain) {
      setShowVUI(v => !v)
      return
    }
    setActiveMain(next)
    setShowVUI(false)
  }

  function renderMainscreen() {
    if (showVUI) return null
    switch (activeMain) {
      case 'reader': return <RUI />
      case 'translator': return <TUI />
      case 'writer': return <WUI />
    }
  }

  // Sidebar now has up to three columns: AUI's panel (outermost), the
  // persistent 40px divider, and HUI's own panel (innermost, Mainscreen
  // edge). AUI's own width is picked via the size buttons at the bottom
  // of its rail (auiSize): 'full' takes the rest of the screen -- minus
  // the divider and whatever width HUI's own panel currently occupies --
  // 'half' is half the viewport regardless of HUI, 'column' matches a
  // single HUI-panel-width column. Only 'full' depends on HUI's width;
  // opening AUI at 'full' with Mainscreen showing through is effectively
  // an admin takeover of the screen (Mainscreen's own width collapses to
  // 0 via --sidebar-w below).
  const huiWidthExpr = huiExpanded ? `${SIDEBAR_PANEL_W}px` : '0px'
  const auiOpenWidthExpr = auiSize === 'full'
    ? `calc(100vw - ${SIDEBAR_DIVIDER_W}px - ${huiWidthExpr})`
    : auiSize === 'half'
    ? '50vw'
    : `${SIDEBAR_PANEL_W}px`
  const auiWidthExpr = auiOpen && isAdmin ? auiOpenWidthExpr : '0px'
  const sidebarWidthExpr = `calc(${SIDEBAR_DIVIDER_W}px + ${auiWidthExpr} + ${huiWidthExpr})`

  const shellVars = {
    '--sidebar-w': sidebarWidthExpr,
    '--hui-w': huiWidthExpr,
    '--aui-w': auiWidthExpr,
  } as React.CSSProperties

  return (
    <div className={`uiShell hand-${handedness}`} style={shellVars}>
      <Header
        active={activeMain}
        onSelect={handleSelectMain}
        vuiOpen={showVUI}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen(v => !v)}
        currentUser={CURRENT_USER}
        activity={DAY_ACTIVITY}
      />

      {renderMainscreen()}

      <Sidebar
        side={handedness}
        onActivateChats={handleActivateChats}
        onCreateChat={handleCreateChat}
        helper={helper}
        panel={huiPanel}
        onSelectPanel={handleSelectHuiPanel}
        expanded={huiExpanded}
        onCollapse={handleCollapseSidebar}
        activeAdminCount={activeAdminCount}
        activeStandardCount={activeStandardCount}
        pendingAdminCount={pendingAdminCount}
        pendingStandardCount={pendingStandardCount}
        auiOpen={auiOpen && isAdmin}
        onToggleAui={handleToggleAui}
        auiSize={auiSize}
        onSetAuiSize={setAuiSize}
        isAdmin={isAdmin}
      />

      <div className="base">
        <VUI />
      </div>
    </div>
  )
}

export default App
