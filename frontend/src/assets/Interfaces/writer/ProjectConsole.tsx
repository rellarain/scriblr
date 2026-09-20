import type { WriterWorkspace } from './useWriterWorkspace'
import { HELP_COMPONENT, SETTINGS_COMPONENT, SHELF_COMPONENTS } from './consoleDefs'
import { ConsoleTitleRow, Placeholder } from './shared'
import { SaveControl } from '../../../components/SaveControl'
import ProjectOutline from './ProjectOutline'
import PlotView from './PlotView'
import TimeSystemEditor from './TimeSystemEditor'

// The Shelf console: everything about the open project as a whole. Project
// Plot is the working editor; the project outline manages its series and books;
// the remaining components are placeholders until they are built.
function ProjectConsole({ w, component }: { w: WriterWorkspace; component: string }) {
  const def = [...SHELF_COMPONENTS, SETTINGS_COMPONENT, HELP_COMPONENT].find(c => c.key === component)
  const project = w.activeProject?.title ?? ''

  let body
  if (w.outlineStatus === 'loading') body = <p className="wrMuted">Loading project…</p>
  else if (w.outlineStatus === 'error') body = <p className="wrError">{w.outlineError ?? 'Failed to load the project.'}</p>
  else if (component === 'projectPlot') body = <PlotView w={w} />
  else if (component === 'projectOutline') body = <ProjectOutline w={w} />
  else if (component === 'projectEditor') body = <TimeSystemEditor w={w} />
  else body = <Placeholder title={def?.label ?? ''} body={def?.body} />

  return (
    <>
      <ConsoleTitleRow
        console="Shelf" component={`${def?.label ?? ''} · ${project}`}
        right={<SaveControl status={w.saveStatus} onSave={() => { void w.saveNow() }} onRestore={w.restoreSaved} buttonClassName="wrSmallBtn wrSaveBtn" />}
      />
      {w.saveError && <p className="wrError">{w.saveError}</p>}
      {w.warnings.length > 0 && <p className="wrMuted">{w.warnings.join(' ')}</p>}
      <div className="wrConsoleBody">{body}</div>
    </>
  )
}

export default ProjectConsole
