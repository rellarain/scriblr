import { setKv } from '../../settings/settingsStore'

// Put a grid's tiles back where they began: where each one sits and how big it is, which are minimized or maximized, and the order of the icons in its tab bar.
// The layout is kept per grid with the other saved settings (useSplitLayout.ts, under this key); an empty one is what a grid that was never touched has, so the
// grid lays its tiles out from its default tree again. A grid that is showing is told, and redraws at once.
export const tileLayoutKey = (gridId: string): string => `scriblr.tiles.${gridId}`

export function resetTileLayout(gridId: string): void {
  setKv(tileLayoutKey(gridId), { tree: null, shapes: {}, maximized: null })
}
