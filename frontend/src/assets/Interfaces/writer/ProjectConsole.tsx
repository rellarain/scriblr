import type { WriterWorkspace } from './useWriterWorkspace'
import { ConsoleTitleRow } from './shared'
import { SaveControl } from '../../../components/SaveControl'
import TileGrid from '../../../components/tiles/TileGrid'
import { shelfTiles } from './tiles/shelfTiles'

// The Shelf console: everything about the open project as a whole, as a grid of
// tiles. Plot, Outline and the project editor are the working editors (each
// expands from its tile); the remaining tiles are placeholders until they are built.
function ProjectConsole({ w }: { w: WriterWorkspace }) {
  const project = w.activeProject?.title ?? ''

  let body
  if (w.outlineStatus === 'loading') body = <p className="wrMuted">Loading project…</p>
  else if (w.outlineStatus === 'error') body = <p className="wrError">{w.outlineError ?? 'Failed to load the project.'}</p>
  else {
    body = (
      <TileGrid
        gridId="shelf" label="Project tiles" tiles={shelfTiles(w)}
        crumbs={[{ label: 'Shelves', onClick: w.backToShelves }, { label: project }]}
      />
    )
  }

  return (
    <>
      <ConsoleTitleRow
        console="Shelf" component={project}
        right={<SaveControl status={w.saveStatus} onSave={() => { void w.saveNow() }} onRestore={w.restoreSaved} buttonClassName="wrSmallBtn wrSaveBtn" />}
      />
      {w.saveError && <p className="wrError">{w.saveError}</p>}
      {w.warnings.length > 0 && <p className="wrMuted">{w.warnings.join(' ')}</p>}
      <div className="wrConsoleBody wrConsoleBody--tiles">{body}</div>
    </>
  )
}

export default ProjectConsole
