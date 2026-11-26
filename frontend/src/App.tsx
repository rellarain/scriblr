import { Suspense, lazy, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './App.scss'
import WUI from './assets/Interfaces/WUI'
import VUI from './assets/Interfaces/VUI'
import Header from './Header'
import Sidebar from './Sidebar'
import ShellBand from './ShellBand'
import HuiMini from './HuiMini'
import type { MainInterface, HuiPanel } from './interfaceShellTypes'
import { useHelperChats } from './assets/Interfaces/helper/useHelperChats'
import { useQueueMeter } from './support/supportStores'
import { useStoredState } from './assets/Interfaces/writer/storage'
import { CURRENT_USER } from './userSeed'
import { useSettings } from './settings/settingsStore'
import { useThemeEngine } from './theme/useTheme'

// The Reader (RUI) and Learning (LUI) are loaded when first opened: the Writer (WUI), the page the app starts on, does not carry them.
const RUI = lazy(() => import('./assets/Interfaces/RUI'))
const LUI = lazy(() => import('./assets/Interfaces/LUI'))

const SIDEBAR_PANEL_W = 400
// The band under the header, shown while a side interface's mini form is in it.
const BAND_H = 40
// AUI's own width snaps to multiples of this (a "column"), at any container size.
const AUI_COLUMN_W = 400

// The page the URL names: /read is the Reader, /learn Learning, anything else (/, /write) the Writer.
const MAIN_PATH: Record<MainInterface, string> = { reader: '/read', learning: '/learn', writer: '/write' }
// Learning was Training, at /train: an old address (a bookmark) is Learning's, and is moved to its new one.
const isOldLearningPath = (pathname: string) => pathname === '/train' || pathname.startsWith('/train/')
export function mainOf(pathname: string): MainInterface {
  if (pathname === '/read' || pathname.startsWith('/read/')) return 'reader'
  if (pathname === '/learn' || pathname.startsWith('/learn/') || isOldLearningPath(pathname)) return 'learning'
  return 'writer'
}
// Where an address that is not a page's own goes: the bare address to the Writer, Learning's old one to its new one.
export function redirectOf(pathname: string): string | null {
  if (pathname === '/') return MAIN_PATH.writer
  if (isOldLearningPath(pathname)) return MAIN_PATH.learning + pathname.slice('/train'.length)
  return null
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeMain = mainOf(location.pathname)
  useEffect(() => {
    const to = redirectOf(location.pathname)
    if (to) navigate(to, { replace: true })
  }, [location.pathname, navigate])
  const [showVUI, setShowVUI] = useState<boolean>(false)
  const { ui } = useSettings()
  const handedness = ui.handedness
  const theme = useThemeEngine()
  const isAdmin = theme.effectiveRole === 'admin'
  // HUI is on (its mini form in the band) and, on top of that, its panel open (huiExpanded); AUI is on or off.
  const [huiOn, setHuiOn] = useState<boolean>(false)
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

  // The header's HUI toggle: on shows its mini form in the band (its panel stays folded until a console is chosen there);
  // off takes HUI away, panel and all.
  function handleToggleHui() {
    if (huiOn) setHuiExpanded(false)
    setHuiOn(!huiOn)
  }

  // AUI has no panel-selection dimension to track like HUI does -- just a
  // direct open/closed flip, independent of HUI (both can be open
  // at once; Mainscreen just narrows further).
  function handleToggleAui() {
    setAuiOpen(open => !open)
  }

  // Snaps to the nearest column width (a multiple of AUI_COLUMN_W), never below one.
  function handleSetAuiWidth(width: number) {
    setAuiWidth(Math.max(AUI_COLUMN_W, Math.round(width / AUI_COLUMN_W) * AUI_COLUMN_W))
  }

  // The queue button's meter, from the real queues (support/supportStores.ts useQueueMeter): the chats the staff member is in and
  // the ones waiting in the queues that are on for them, each split into escalated and first-tier chats.
  const meter = useQueueMeter()
  const activeAdminCount = meter.activeEscalated
  const activeStandardCount = meter.activeFirst
  const pendingAdminCount = meter.waitingEscalated
  const pendingStandardCount = meter.waitingFirst

  // Re-clicking the already-active page's header icon reveals VUI (the
  // Visitor UI: the Base layer, normally fully covered by Mainscreen's opaque background)
  // instead of re-selecting it -- same toggle convention as the sidebar.
  // Clicking a different icon always switches page and hides VUI again.
  function handleSelectMain(next: MainInterface) {
    if (next === activeMain) {
      setShowVUI(v => !v)
      return
    }
    navigate(MAIN_PATH[next])
    setShowVUI(false)
  }

  function renderMainscreen() {
    if (showVUI) return null
    switch (activeMain) {
      case 'reader': return <RUI />
      case 'learning': return <LUI />
      case 'writer': return <WUI />
    }
  }

  // The sidebar, below the header and the band, has up to two columns: AUI's panel (outermost) and HUI's own panel
  // (innermost, Mainscreen edge); their console buttons are in the band. AUI's own width is dragged from its edge
  // (Sidebar.tsx's AuiResize) and snapped to AUI_COLUMN_W columns; `min()` keeps it from ever exceeding the rest of the
  // screen (minus whatever width HUI's own panel currently occupies) even if the window shrinks -- wide enough to cover the
  // whole screen is effectively an admin takeover (Mainscreen's own width collapses to 0 via --sidebar-w below).
  const huiPanelOpen = huiOn && huiExpanded
  const huiWidthExpr = huiPanelOpen ? `${SIDEBAR_PANEL_W}px` : '0px'
  const auiOpenWidthExpr = `min(${auiWidth}px, calc(100vw - ${huiWidthExpr}))`
  const auiWidthExpr = auiOpen && isAdmin ? auiOpenWidthExpr : '0px'
  const sidebarWidthExpr = `calc(${auiWidthExpr} + ${huiWidthExpr})`
  const bandOpen = huiOn

  const shellVars = {
    '--sidebar-w': sidebarWidthExpr,
    '--hui-w': huiWidthExpr,
    '--aui-w': auiWidthExpr,
    '--band-h': bandOpen ? `${BAND_H}px` : '0px',
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
        isAdmin={isAdmin}
        auiOn={auiOpen && isAdmin}
        onToggleAui={handleToggleAui}
        huiOn={huiOn}
        onToggleHui={handleToggleHui}
        waitingChats={pendingAdminCount + pendingStandardCount}
      />

      {bandOpen && (
        <ShellBand>
          {huiOn && (
            <HuiMini
              conversations={helper.conversations}
              selectedChatId={helper.selectedChatId}
              onActivateChats={handleActivateChats}
              onCreateChat={handleCreateChat}
              panel={huiPanel}
              onSelectPanel={handleSelectHuiPanel}
              expanded={huiPanelOpen}
              activeAdminCount={activeAdminCount}
              activeStandardCount={activeStandardCount}
              pendingAdminCount={pendingAdminCount}
              pendingStandardCount={pendingStandardCount}
            />
          )}
        </ShellBand>
      )}

      <Suspense fallback={null}>{renderMainscreen()}</Suspense>

      <Sidebar
        side={handedness}
        helper={helper}
        panel={huiPanel}
        auiOpen={auiOpen && isAdmin}
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
