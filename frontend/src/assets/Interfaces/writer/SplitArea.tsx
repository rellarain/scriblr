// The Writer's tiles are the global tile area (components/tiles/TileArea.tsx); this keeps the names the levels import.
import TileArea, { columnsTree, type AreaTile } from '../../../components/tiles/TileArea'

export type SplitTile = AreaTile
export { columnsTree }
export const SplitArea = TileArea
export default TileArea
