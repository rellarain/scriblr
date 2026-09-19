import { useState } from 'react'
import { useWriterWorkspace, type WuiConsole } from './writer/useWriterWorkspace'
import WuiSidebar from './writer/WuiSidebar'
import ProjectConsole from './writer/ProjectConsole'
import BookConsole from './writer/BookConsole'
import PageConsole from './writer/PageConsole'
import PagesConsole from './writer/PagesConsole'
import { Dashboard, SchedulePanel, AnalyticsPanel, Scratchpad } from './writer/Dashboard'
import {
  COMPONENTS_BY_CONSOLE, DEFAULT_COMPONENT, HELP_COMPONENT, SETTINGS_COMPONENT,
} from './writer/consoleDefs'
import { ConsoleTitleRow, IconColumn, Placeholder } from './writer/shared'
import './writer/writer.scss'

// The Writer page. Navigation lives in the sidebar (project shelves, then
// the Project/Book/Chapter panels); the main screen is an icon column of the
// current console's components beside that console's editor.
function WUI() {
  const workspace = useWriterWorkspace()
  const console_ = workspace.activeConsole
  const [selected, setSelected] = useState<Record<WuiConsole, string>>({ ...DEFAULT_COMPONENT })
  const component = selected[console_]
  const setComponent = (key: string) => setSelected(prev => ({ ...prev, [console_]: key }))

  const components = COMPONENTS_BY_CONSOLE[console_]
  const isUtility = component === SETTINGS_COMPONENT.key || component === HELP_COMPONENT.key
  const utility = component === SETTINGS_COMPONENT.key ? SETTINGS_COMPONENT : HELP_COMPONENT

  // The book editor is a full-height cover with no title row above it.
  const flush = console_ === 'book' && component === 'bookEditor'
  // The chapter page and its Preview are full-width pages with the chapter tabs on the right edge.
  const edge = (console_ === 'page' && component === 'chapter') || console_ === 'pages'

  function shelvesBody() {
    const def = components.find(c => c.key === component)
    const shelvesProjects = workspace.projects
    if (component === 'dashboard') return <Dashboard projects={shelvesProjects} outlines={workspace.projectOutlines} />
    if (component === 'schedule') return <div className="wrColumns wrColumns--single"><SchedulePanel /></div>
    if (component === 'analytics') return <div className="wrColumns wrColumns--single"><AnalyticsPanel projects={shelvesProjects} outlines={workspace.projectOutlines} /></div>
    if (component === 'scratchpad') return <div className="wrColumns wrColumns--single"><Scratchpad /></div>
    return <Placeholder title={def?.label ?? ''} body={def?.body} />
  }

  let content
  if (isUtility) {
    content = (
      <>
        <ConsoleTitleRow console={console_[0].toUpperCase() + console_.slice(1)} component={utility.label} />
        <Placeholder title={utility.label} body={utility.body} />
      </>
    )
  } else if (console_ === 'shelves') {
    content = (
      <>
        <ConsoleTitleRow console="Shelves" component={components.find(c => c.key === component)?.label ?? ''} />
        <div className="wrConsoleBody">{shelvesBody()}</div>
      </>
    )
  } else if (console_ === 'shelf') {
    content = <ProjectConsole w={workspace} component={component} />
  } else if (console_ === 'book') {
    content = <BookConsole w={workspace} component={component} />
  } else if (console_ === 'page') {
    content = <PageConsole w={workspace} component={component} />
  } else {
    content = <PagesConsole w={workspace} component={component} />
  }

  return (
    <main className="wUI wr">
      <WuiSidebar workspace={workspace} />
      <div className="wrMain">
        <IconColumn components={components} active={component} onSelect={setComponent} />
        <div className={flush ? 'wrContent wrContent--flush' : edge ? 'wrContent wrContent--edge' : 'wrContent'}>{content}</div>
      </div>
    </main>
  )
}

export default WUI
