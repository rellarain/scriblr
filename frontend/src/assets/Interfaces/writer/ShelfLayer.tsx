import { useEffect, useRef, useState } from 'react'
import type { WriterWorkspace } from './useWriterWorkspace'
import ShelfConsoleView, { type ShelfSubTab } from './ShelfConsoleView'
import SubTabRow from './SubTabRow'
import ConsoleCornerButtons from './ConsoleCornerButtons'
import { SHELVES_SUBTABS, SHELF_SUBTABS, type ShelvesSubTab } from './wuiSubTabDefs'
import { LibraryIcon } from '../../icons'

interface ShelfLayerProps {
  workspace: WriterWorkspace
}

const SHELVES_TABS = SHELVES_SUBTABS.filter(s => s.label !== 'Settings' && s.label !== 'Help')
const SHELF_TABS = SHELF_SUBTABS.filter(s => s.label !== 'Settings' && s.label !== 'Help')

// The bookshelfContainer layer: the resting Shelves console (Template/
// Schedule/Analytics/Scratchpad -- the project list itself now lives in
// WuiSidebar) when no project is open, or -- once one is -- the
// shelfConsole drawer (ShelfConsoleView) sliding in over the same
// footprint to manage it.
function ShelfLayer({ workspace }: ShelfLayerProps) {
  const [shelvesSubTab, setShelvesSubTab] = useState<ShelvesSubTab>('projects')
  const [shelfSubTab, setShelfSubTab] = useState<ShelfSubTab>('projectOutline')
  const [handleOverride, setHandleOverride] = useState<'open' | 'closed' | null>(null)

  // Only reset a manual override on the transition INTO 'shelf' (not on
  // every render while already there) -- otherwise a manual close while
  // already at 'shelf' would be undone immediately.
  const prevConsoleRef = useRef(workspace.activeConsole)
  useEffect(() => {
    if (prevConsoleRef.current !== 'shelf' && workspace.activeConsole === 'shelf') setHandleOverride(null)
    prevConsoleRef.current = workspace.activeConsole
  }, [workspace.activeConsole])

  const drawerOpen = handleOverride != null ? handleOverride === 'open' : workspace.activeConsole === 'shelf'
  const shelvesActive = SHELVES_SUBTABS.find(s => s.key === shelvesSubTab)!
  const shelfActive = SHELF_SUBTABS.find(s => s.key === shelfSubTab)!

  return (
    <div className="bookshelfContainer">
      <div className="sidebarSpacer" aria-hidden="true" />
      <div className="shelfStage">
        {!workspace.hasOpenProject && (
          <div className="shelvesResting">
            <SubTabRow subTabs={SHELVES_TABS} activeKey={shelvesSubTab} onSelect={setShelvesSubTab} />
            <div className="sectionBody">
              {shelvesSubTab === 'projects' ? (
                <p className="feedbackCardMeta">Select a project from the sidebar shelf, or create a new one there.</p>
              ) : (
                <>
                  <h2>{shelvesActive.label}</h2>
                  <p>{shelvesActive.body}</p>
                </>
              )}
            </div>
            <ConsoleCornerButtons
              activeKey={shelvesSubTab}
              helpSubTab={SHELVES_SUBTABS.find(s => s.label === 'Help')}
              settingsSubTab={SHELVES_SUBTABS.find(s => s.label === 'Settings')}
              onSelect={setShelvesSubTab}
            />
            <h1 className="wUIConsoleTitle">Shelves</h1>
          </div>
        )}

        {workspace.hasOpenProject && (
          <>
            <div className={drawerOpen ? 'shelfConsole shelfConsole--open' : 'shelfConsole'}>
              <SubTabRow subTabs={SHELF_TABS} activeKey={shelfSubTab} onSelect={setShelfSubTab} />
              <div className="sectionBody">
                <ShelfConsoleView subTab={shelfSubTab} workspace={workspace} label={shelfActive.label} body={shelfActive.body} />
              </div>
              <ConsoleCornerButtons
                activeKey={shelfSubTab}
                helpSubTab={SHELF_SUBTABS.find(s => s.label === 'Help')}
                settingsSubTab={SHELF_SUBTABS.find(s => s.label === 'Settings')}
                onSelect={setShelfSubTab}
              />
              <h1 className="wUIConsoleTitle">Shelf</h1>
            </div>
            <button
              type="button"
              className="shelvesHandle"
              aria-pressed={drawerOpen}
              aria-label={drawerOpen ? 'Collapse shelf console' : 'Expand shelf console'}
              title={drawerOpen ? 'Collapse shelf console' : 'Expand shelf console'}
              onClick={() => setHandleOverride(drawerOpen ? 'closed' : 'open')}
            >
              <LibraryIcon size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default ShelfLayer
