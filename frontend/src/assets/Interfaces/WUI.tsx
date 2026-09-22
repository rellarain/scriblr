import { useEffect, useState } from 'react'
import { useWriterWorkspace } from './writer/useWriterWorkspace'
import WuiSidebar, { SIDEBAR_DEFAULT_WIDTH } from './writer/WuiSidebar'
import ShelvesConsole from './writer/ShelvesConsole'
import ProjectConsole from './writer/ProjectConsole'
import BookConsole from './writer/BookConsole'
import PageConsole from './writer/PageConsole'
import PagesConsole from './writer/PagesConsole'
import ConsoleCorner from '../../components/tiles/ConsoleCorner'
import { PAGES_COMPONENTS } from './writer/consoleDefs'
import { useStoredState } from './writer/shared'
import { useContainerWidth } from '../../components/tiles/useContainerWidth'
import { columnsFor } from '../../components/tiles/tileShapes'
import { readMaximized } from '../../components/tiles/useSplitLayout'
import BookScope from './writer/BookScope'
import './writer/writer.scss'

// The Writer page. The sidebar holds the project shelves and, once something is
// open, its Project / Book / Chapter tiles; the main screen is the current console.
// The Shelves and Shelf consoles are grids of tiles (each expands into its editor);
// the Book, Page and Pages consoles keep their editors, with Settings and Help in
// their bottom right corner.
function WUI() {
  const workspace = useWriterWorkspace()
  const console_ = workspace.activeConsole
  const [pagesComponent, setPagesComponent] = useState<string>(PAGES_COMPONENTS[0].key)
  // The sidebar can be minimized while the main screen fits two columns of tiles or fewer.
  const [collapsed, setCollapsed] = useStoredState<boolean>('scriblr.writer.sidebarCollapsed', false)
  const [sidebarWidth, setSidebarWidth] = useStoredState<number>('scriblr.writer.sidebarWidth', SIDEBAR_DEFAULT_WIDTH)
  // Double-clicking a maximized console's header hides the sidebar; it's remembered
  // with the console's own tile layout (components/tiles/useSplitLayout.ts), so a
  // console left maximized starts that way again too.
  const [sidebarHidden, setSidebarHidden] = useState(() => readMaximized(console_ === 'shelf' ? 'shelf' : 'shelves'))
  // Navigating to a different console re-syncs from that console's own remembered
  // maximize state (or shows the sidebar again outside Shelves/Shelf); a toggle
  // while staying on the same console isn't affected, since this only reruns on a change.
  useEffect(() => {
    setSidebarHidden(console_ === 'shelves' || console_ === 'shelf' ? readMaximized(console_) : false)
  }, [console_])
  const [mainRef, mainWidth] = useContainerWidth<HTMLDivElement>()
  const narrow = columnsFor(mainWidth - 22) <= 2

  // The book editor is a full-height cover with no title row above it.
  const flush = console_ === 'book'
  // The chapter page and its Preview are full-width pages with the chapter tabs on the right edge.
  const edge = console_ === 'page' || console_ === 'pages'

  let content
  if (console_ === 'shelves') content = <ShelvesConsole w={workspace} onMaximizeChange={setSidebarHidden} />
  else if (console_ === 'shelf') content = <ProjectConsole w={workspace} onMaximizeChange={setSidebarHidden} />
  else if (console_ === 'book') content = <BookConsole w={workspace} />
  else if (console_ === 'page') content = <><PageConsole w={workspace} /><ConsoleCorner /></>
  else content = <><PagesConsole w={workspace} component={pagesComponent} onComponent={setPagesComponent} /><ConsoleCorner /></>

  // A book's own colours re-tint its editors (the book, its chapters and their preview).
  const scopedBook = console_ === 'book' || console_ === 'page' || console_ === 'pages' ? workspace.activeBook : undefined

  return (
    <main className="wUI wr">
      {!sidebarHidden && (
        <WuiSidebar
          workspace={workspace} collapsed={collapsed} canCollapse={narrow} onToggleCollapsed={() => setCollapsed(c => !c)}
          width={sidebarWidth} onWidthChange={setSidebarWidth}
        />
      )}
      <BookScope book={scopedBook} className="wrMain">
        <div ref={mainRef} className={flush ? 'wrContent wrContent--flush' : edge ? 'wrContent wrContent--edge' : 'wrContent'}>{content}</div>
      </BookScope>
    </main>
  )
}

export default WUI
