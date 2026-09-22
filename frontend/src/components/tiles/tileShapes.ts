// Tile shapes: presets for a tile's share of the split-tree grid (components/tiles/
// splitTree.ts), not a fixed grid span any more. A grid is measured by its own size
// (not the window's), so a narrow sidebar or a 400px panel goes to one column even
// on a wide monitor.
//
//   link       short, fixed-height strip: name and a one-line summary only, no body
//   small      one column's width, short
//   landscape  wide, short
//   portrait   one column's width, tall
//   large      wide, tall
export type TileShape = 'link' | 'small' | 'landscape' | 'portrait' | 'large'
export const TILE_SHAPES: TileShape[] = ['link', 'small', 'landscape', 'portrait', 'large']
export const SHAPE_LABEL: Record<TileShape, string> = {
  link: 'Link', small: 'Small', landscape: 'Landscape', portrait: 'Portrait', large: 'Large',
}

export const ROW_UNIT = 46
export const GRID_GAP = 8
export const MIN_COLUMN = 140
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

// A tile's measured box is at least this wide/tall to count as "wide"/"tall" for
// content purposes; below both it is "small", below just the height cutoff (and
// always in one column) it never counts as wide, so a narrow panel keeps its
// compact content whatever its container width.
const WIDE_MIN = MIN_COLUMN * 2 + GRID_GAP
const TALL_MIN = ROW_UNIT * 4 + GRID_GAP * 3
// Below this a tile's box is too short for a body at all -- name and summary only,
// like a link tile (a divider can squeeze any tile this short, not just a link one).
export const LINK_MAX_H = ROW_UNIT + GRID_GAP

// What a tile shows is chosen from its actual measured size, not a stored label: a
// stretched tile earns the next tier's content, a squeezed one drops to a simpler
// one. `oneColumn` keeps a narrow container's tiles from reading as "wide" even
// when the container itself happens to be wider than two tile-columns.
export function contentTier(width: number, height: number, oneColumn: boolean, allowed: TileShape[], fallback: TileShape): TileShape {
  if (height < LINK_MAX_H) return allowed.includes('link') ? 'link' : fallback
  const wide = !oneColumn && width >= WIDE_MIN
  const tall = height >= TALL_MIN
  const tier: TileShape = tall ? (wide ? 'large' : 'portrait') : (wide ? 'landscape' : 'small')
  return allowed.includes(tier) ? tier : fallback
}
