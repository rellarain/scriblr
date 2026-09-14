import { useEffect, useState } from 'react'
import type { OutlineNodeKind } from '../../../api/types'
import type { WriterWorkspace, TransitionState } from './useWriterWorkspace'
import BookConsoleView, { type BookSubTab } from './BookConsoleView'
import PageConsoleView, { type PageSubTab } from './PageConsoleView'
import PagesConsoleView, { type PagesSubTab } from './PagesConsoleView'
import SubTabRow from './SubTabRow'
import ConsoleCornerButtons from './ConsoleCornerButtons'
import { BOOK_SUBTABS, PAGE_SUBTABS, PAGES_SUBTABS, BOOK_SUBTAB_BY_KIND } from './wuiSubTabDefs'

interface BookLayerProps {
  workspace: WriterWorkspace
  transitionState: TransitionState
}

const BOOK_TABS = BOOK_SUBTABS.filter(s => s.label !== 'Settings' && s.label !== 'Help')
const PAGE_TABS = PAGE_SUBTABS.filter(s => s.label !== 'Settings' && s.label !== 'Help')
const PAGES_TABS = PAGES_SUBTABS.filter(s => s.label !== 'Settings' && s.label !== 'Help')

// The bookContainer layer: at the book level shows bookIdentityRail +
// bookCover (via BookConsoleView); navigating to a chapter (from
// WuiSidebar) swaps this for pageConsole/pagesConsole instead, with
// WUI.tsx driving the sliderPages transition across that swap -- this
// layer has no navigation controls of its own anymore.
function BookLayer({ workspace, transitionState }: BookLayerProps) {
  const [bookOverrideTab, setBookOverrideTab] = useState<BookSubTab | null>(null)
  const [pageSubTab, setPageSubTab] = useState<PageSubTab>('bookmark')
  const [pagesSubTab, setPagesSubTab] = useState<PagesSubTab>('pagesBookmark')

  // The Book-console override (Outline Template/Settings/Help -- the only
  // Book sub-tabs NOT derived from focusedNode.kind) shouldn't linger once
  // you've left Book console entirely.
  useEffect(() => {
    if (workspace.activeConsole !== 'book') setBookOverrideTab(null)
  }, [workspace.activeConsole])

  const bookKind = workspace.focusedNode?.kind as keyof typeof BOOK_SUBTAB_BY_KIND | undefined
  const bookActiveTab: BookSubTab = bookOverrideTab ?? (bookKind && BOOK_SUBTAB_BY_KIND[bookKind]) ?? 'bookEditor'

  function selectBookSubTab(key: BookSubTab) {
    const kindEntry = (Object.entries(BOOK_SUBTAB_BY_KIND) as [keyof typeof BOOK_SUBTAB_BY_KIND, BookSubTab][])
      .find(([, tab]) => tab === key)
    if (kindEntry) {
      setBookOverrideTab(null)
      workspace.focusNearestOfKind(kindEntry[0] as OutlineNodeKind)
    } else {
      setBookOverrideTab(key)
    }
  }

  const bookVisible = workspace.bookAncestorId != null
  const bookNode = workspace.focusedNode?.kind === 'book'
    ? workspace.focusedNode
    : workspace.ancestryChain.find(n => n.kind === 'book')

  const bookActive = BOOK_SUBTABS.find(s => s.key === bookActiveTab)!
  const pageActive = PAGE_SUBTABS.find(s => s.key === pageSubTab)!
  const pagesActive = PAGES_SUBTABS.find(s => s.key === pagesSubTab)!

  const sliderClass = transitionState === 'idle' ? 'sliderPages' : `sliderPages sliderPages--${transitionState}`

  return (
    <div className="bookContainer">
      <div className="sidebarSpacer" aria-hidden="true" />
      <div className="bookStage">
        {bookVisible && (
          <>
            <div className="bookIdentityRail">{bookNode && <span>{bookNode.title}</span>}</div>

            {workspace.activeConsole === 'book' && (
              <div className="bookCoverMount">
                <SubTabRow subTabs={BOOK_TABS} activeKey={bookActiveTab} onSelect={selectBookSubTab} />
                <div className="sectionBody">
                  <BookConsoleView subTab={bookActiveTab} workspace={workspace} label={bookActive.label} body={bookActive.body} />
                </div>
                <ConsoleCornerButtons
                  activeKey={bookActiveTab}
                  helpSubTab={BOOK_SUBTABS.find(s => s.label === 'Help')}
                  settingsSubTab={BOOK_SUBTABS.find(s => s.label === 'Settings')}
                  onSelect={selectBookSubTab}
                />
                <h1 className="wUIConsoleTitle">Book</h1>
              </div>
            )}

            <div className={sliderClass} aria-hidden="true" />

            {workspace.activeConsole === 'page' && (
              <div className="pageConsole">
                <SubTabRow subTabs={PAGE_TABS} activeKey={pageSubTab} onSelect={setPageSubTab} />
                <div className="sectionBody">
                  <PageConsoleView label={pageActive.label} body={pageActive.body} />
                </div>
                <ConsoleCornerButtons
                  activeKey={pageSubTab}
                  helpSubTab={PAGE_SUBTABS.find(s => s.label === 'Help')}
                  settingsSubTab={PAGE_SUBTABS.find(s => s.label === 'Settings')}
                  onSelect={setPageSubTab}
                />
                <h1 className="wUIConsoleTitle">Page</h1>
              </div>
            )}

            <div className={sliderClass} aria-hidden="true" />

            {workspace.activeConsole === 'pages' && (
              <div className="pagesConsole">
                <SubTabRow subTabs={PAGES_TABS} activeKey={pagesSubTab} onSelect={setPagesSubTab} />
                <div className="sectionBody">
                  <PagesConsoleView label={pagesActive.label} body={pagesActive.body} />
                </div>
                <ConsoleCornerButtons
                  activeKey={pagesSubTab}
                  helpSubTab={PAGES_SUBTABS.find(s => s.label === 'Help')}
                  settingsSubTab={PAGES_SUBTABS.find(s => s.label === 'Settings')}
                  onSelect={setPagesSubTab}
                />
                <h1 className="wUIConsoleTitle">Pages</h1>
              </div>
            )}

            <div className={sliderClass} aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  )
}

export default BookLayer
