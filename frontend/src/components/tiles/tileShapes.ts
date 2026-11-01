// How tiles share a grid (components/tiles/splitTree.ts).
//
//   mini   minimized: takes no room, shown as an icon in the console's tab bar, and keeps its slot in the layout
//   mid    open: a normal (resizable) leaf
//
// The grid is measured by its own size (not the window's), so a narrow sidebar or a 400px panel goes to one column even
// on a wide monitor.
export type TileShape = 'mini' | 'mid'

export const ROW_UNIT = 46
export const GRID_GAP = 8
export const MIN_COLUMN = 140
// Below this container width every tile stacks edge to edge in one column.
export const ONE_COLUMN_BELOW = 400

export const isOneColumn = (width: number): boolean => width < ONE_COLUMN_BELOW
