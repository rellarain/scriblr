// AUI's four modes, chosen by resizing it (dragging its edge snaps through them, as tiles and consoles resize):
// - mini: no panel; AUI is only its part of the band under the header (the work and break meters);
// - small: one column (400px), one console showing one tile;
// - medium: two columns or more, up to the width HUI leaves: one console with several tiles, or several consoles with one
//   tile each;
// - max: all the width HUI leaves, every console and tile as the user lays them out.

export type AuiMode = 'mini' | 'small' | 'medium' | 'max'
export interface AuiSize { mode: AuiMode; columns: number }

export const AUI_COLUMN = 400
export const AUI_DEFAULT: AuiSize = { mode: 'medium', columns: 2 }

const MODES: AuiMode[] = ['mini', 'small', 'medium', 'max']

// The size a dragged width snaps to, in the width there is (`available`: the screen less HUI's panel). Under half a column
// is mini; reaching within half a column of the far edge is max.
export function snapAui(rawWidth: number, available: number): AuiSize {
  if (rawWidth < AUI_COLUMN / 2) return { mode: 'mini', columns: 0 }
  if (rawWidth >= available - AUI_COLUMN / 2) return { mode: 'max', columns: Math.max(1, Math.floor(available / AUI_COLUMN)) }
  const columns = Math.max(1, Math.round(rawWidth / AUI_COLUMN))
  if (columns * AUI_COLUMN >= available) return { mode: 'max', columns: Math.max(1, Math.floor(available / AUI_COLUMN)) }
  return columns === 1 ? { mode: 'small', columns: 1 } : { mode: 'medium', columns }
}

// The panel's width in px for a size, in the width there is.
export function auiWidth(size: AuiSize, available: number): number {
  const room = Math.max(0, available)
  switch (size.mode) {
    case 'mini': return 0
    case 'small': return Math.min(AUI_COLUMN, room)
    case 'medium': return Math.min(Math.max(2, size.columns) * AUI_COLUMN, room)
    case 'max': return room
  }
}

// One step wider or narrower (the arrow keys on AUI's edge): a column at a time, mini and max at the ends.
export function stepAui(size: AuiSize, by: 1 | -1, available: number): AuiSize {
  return snapAui(auiWidth(size, available) + by * AUI_COLUMN, available)
}

// A size read back from storage, or the width AUI was kept at before it had modes (`scriblr.admin.width`).
export function auiSizeOf(stored: unknown, oldWidth?: unknown): AuiSize {
  if (stored && typeof stored === 'object') {
    const { mode, columns } = stored as Partial<AuiSize>
    if (typeof mode === 'string' && MODES.includes(mode as AuiMode)) {
      const n = typeof columns === 'number' && Number.isFinite(columns) ? Math.max(0, Math.round(columns)) : 0
      return { mode: mode as AuiMode, columns: mode === 'medium' ? Math.max(2, n) : mode === 'small' ? 1 : n }
    }
  }
  if (typeof oldWidth === 'number' && Number.isFinite(oldWidth) && oldWidth > 0) {
    const columns = Math.max(1, Math.round(oldWidth / AUI_COLUMN))
    return columns === 1 ? { mode: 'small', columns: 1 } : { mode: 'medium', columns }
  }
  return AUI_DEFAULT
}

// How many tiles each console may show at once: one console showing one tile (small); one tile each once several
// consoles are open (medium); no limit (max).
export function oneTileEach(mode: AuiMode, openConsoles: number): boolean {
  return mode === 'small' || (mode === 'medium' && openConsoles > 1)
}
