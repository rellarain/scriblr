import { useState } from 'react'
import './App.scss'
import WUI from './assets/Interfaces/WUI'
import RUI from './assets/Interfaces/RUI'
import TUI from './assets/Interfaces/TUI'
import VUI from './assets/Interfaces/VUI'
import Header from './Header'
import Sidebar from './Sidebar'
import type { MainInterface, HuiPanel } from './interfaceShellTypes'
import { useHelperChats } from './assets/Interfaces/helper/useHelperChats'
import { useStoredState } from './assets/Interfaces/writer/storage'
import { CURRENT_USER } from './userSeed'
import { DAY_ACTIVITY } from './activitySeed'
import { useSettings } from './settings/settingsStore'
import { useThemeEngine } from './theme/useTheme'

const SIDEBAR_DIVIDER_W = 40
const SIDEBAR_PANEL_W = 400
// AUI's own width snaps to multiples of this (a "column"), at any container size.
const AUI_COLUMN_W = 400

function App() {
  const [activeMain, setActiveMain] = useState<MainInterface>('writer')
  const [showVUI, setShowVUI] = useState<boolean>(false)
  const { ui } = useSettings()
  const handedness = ui.handedness
  const theme = useThemeEngine()
  const isAdmin = theme.effectiveRole === 'admin'
  const [huiExpanded, setHuiExpanded] = useState<boolean>(false)
  const [auiOpen, setAuiOpen] = useState<boolean>(false)
  // Dragged from AUI's own outer edge (Sidebar.tsx's AuiResize), snapped to
  // AUI_COLUMN_W-wide columns; remembered like the Writer sidebar's own width.
  const [auiWidth, setAuiWidth] = useStoredState<number>('scriblr.admin.width', 2 * AUI_COLUMN_W)
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

  // Snaps to the nearest column width (a multiple of AUI_COLUMN_W), never below one.
  function handleSetAuiWidth(width: number) {
    setAuiWidth(Math.max(AUI_COLUMN_W, Math.round(width / AUI_COLUMN_W) * AUI_COLUMN_W))
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
  // edge). AUI's own width is dragged from its outer edge (Sidebar.tsx's
  // AuiResize) and snapped to AUI_COLUMN_W columns; `min()` keeps it from
  // ever exceeding the rest of the screen (minus the divider and whatever
  // width HUI's own panel currently occupies) even if the window shrinks --
  // wide enough to cover the whole screen is effectively an admin takeover
  // (Mainscreen's own width collapses to 0 via --sidebar-w below).
  const huiWidthExpr = huiExpanded ? `${SIDEBAR_PANEL_W}px` : '0px'
  const auiOpenWidthExpr = `min(${auiWidth}px, calc(100vw - ${SIDEBAR_DIVIDER_W}px - ${huiWidthExpr}))`
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
        auiWidth={auiWidth}
        onSetAuiWidth={handleSetAuiWidth}
        isAdmin={isAdmin}
      />

      <div className="base">
        <VUI />
      </div>
    </div>
  )
}

export default App
