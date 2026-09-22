// Tile shapes and how they lay out in the grid. A grid is measured by its own
// width (not the window's), so a narrow sidebar or a 400px panel gets one column
// even on a wide monitor.
//
//   link       short: name and a one-line summary only (one grid row tall)
//   small      one column, three rows: name, one key number
//   landscape  two columns wide, three rows
//   portrait   one column, five rows tall
//   large      two columns wide, five rows tall
export type TileShape = 'link' | 'small' | 'landscape' | 'portrait' | 'large'
export const TILE_SHAPES: TileShape[] = ['link', 'small', 'landscape', 'portrait', 'large']
export const SHAPE_LABEL: Record<TileShape, string> = {
  link: 'Link', small: 'Small', landscape: 'Landscape', portrait: 'Portrait', large: 'Large',
}

export const ROW_UNIT = 46
export const GRID_GAP = 8
export const MIN_COLUMN = 140
// Below this container width the grid is one column of full-width rows.
export const ONE_COLUMN_BELOW = 400

export interface Span { cols: number; rows: number }

const WIDE_SPAN: Record<TileShape, Span> = {
  link: { cols: 1, rows: 1 },
  small: { cols: 1, rows: 3 },
  landscape: { cols: 2, rows: 3 },
  portrait: { cols: 1, rows: 5 },
  large: { cols: 2, rows: 5 },
}

export const isOneColumn = (width: number): boolean => width < ONE_COLUMN_BELOW

// How many columns of at least MIN_COLUMN fit in a container `width` px wide.
export function columnsFor(width: number): number {
  if (isOneColumn(width)) return 1
  return Math.max(1, Math.floor((width + GRID_GAP) / (MIN_COLUMN + GRID_GAP)))
}

// In one column a small or landscape tile turns into a "row" (icon, name and a
// one-line summary, two grid rows tall); portrait and large keep their full
// content and height.
export const isRowVersion = (shape: TileShape, oneColumn: boolean): boolean =>
  oneColumn && (shape === 'small' || shape === 'landscape')

export function spanOf(shape: TileShape, columns: number): Span {
  if (columns <= 1) {
    if (shape === 'link') return { cols: 1, rows: 1 }
    if (shape === 'small' || shape === 'landscape') return { cols: 1, rows: 2 }
    return { cols: 1, rows: 5 }
  }
  const wide = WIDE_SPAN[shape]
  return { cols: Math.min(wide.cols, columns), rows: wide.rows }
}

// The height in px of a tile of `rows` rows.
export const heightOfRows = (rows: number): number => rows * ROW_UNIT + (rows - 1) * GRID_GAP
