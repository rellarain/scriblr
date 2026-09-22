import type { WriterWorkspace } from './useWriterWorkspace'
import { ConsoleTitleRow } from './shared'
import TileGrid from '../../../components/tiles/TileGrid'
import { shelvesTiles } from './tiles/shelvesTiles'

// The Shelves console (nothing open): the dashboard as a grid of tiles. The project
// shelves themselves are in the sidebar.
function ShelvesConsole({ w, onMaximizeChange }: { w: WriterWorkspace; onMaximizeChange?: (on: boolean) => void }) {
  return (
    <>
      <ConsoleTitleRow console="Shelves" component="Dashboard" />
      <div className="wrConsoleBody wrConsoleBody--tiles">
        <TileGrid
          gridId="shelves" label="Dashboard tiles" tiles={shelvesTiles(w)} crumbs={[{ label: 'Shelves' }]}
          onMaximizeChange={onMaximizeChange}
        />
      </div>
    </>
  )
}

export default ShelvesConsole
