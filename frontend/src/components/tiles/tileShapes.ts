// A tile's two read-only states in the split-tree grid (components/tiles/
// splitTree.ts) -- a third, "max", is the console it expands into (TileConsole),
// not a grid state at all.
//
//   mini   a short, fixed-height strip: name and a one-line summary, no body
//   mid    a normal (resizable) leaf: full content that scales with its measured size
//
// The grid is measured by its own size (not the window's), so a narrow sidebar or a
// 400px panel goes to one column even on a wide monitor.
export type TileShape = 'mini' | 'mid'

export const ROW_UNIT = 46
export const GRID_GAP = 8
export const MIN_COLUMN = 140
// A mini tile's own card stays this wide (never the full width of its row), so a
// collapsed tile always reads as one column, not a banner across the grid.
export const MINI_W = 240
// Below this container width every tile stacks edge to edge in one column.
export const ONE_COLUMN_BELOW = 400

export const isOneColumn = (width: number): boolean => width < ONE_COLUMN_BELOW

// How many columns of at least MIN_COLUMN fit in a container `width` px wide. Used
// where a whole-number column count still matters (the Writer's narrow-sidebar
// check), not by the split-tree layout itself.
export function columnsFor(width: number): number {
  if (isOneColumn(width)) return 1
  return Math.max(1, Math.floor((width + GRID_GAP) / (MIN_COLUMN + GRID_GAP)))
}
