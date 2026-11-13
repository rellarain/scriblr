import type { MapLevel } from '../../../../api/types'
import { levelDef } from './mapLevels'

// How what is drawn over the land looks: the colours of symbols without a colour of their own, text and its halo, the frame, the grid and the plate behind
// the scale bar and the legend, and the typeface. A map has no look of its own any more (the colours of the land are its biomes'); a map of space is drawn
// with light ink on its dark backdrop. These are the map's own colours (art, like the biomes), not the app's chrome.

export interface MapThemeDef {
  id: 'land' | 'space'
  // The ink of the frame, the grid, the scale bar and the compass; text; the halo that keeps text and symbols readable over any biome.
  ink: string
  symbol: string
  halo: string
  // The plate behind the scale bar, compass and legend.
  plate: string
  // The typeface of the text.
  font: string
}

export const LAND_STYLE: MapThemeDef = { id: 'land', ink: '#22262c', symbol: '#22262c', halo: '#ffffff', plate: '#f4f5f7', font: 'system-ui, "Segoe UI", sans-serif' }
export const SPACE_STYLE: MapThemeDef = { id: 'space', ink: '#dfe7f5', symbol: '#e9eef8', halo: '#0f1626', plate: '#161f33', font: 'system-ui, "Segoe UI", sans-serif' }

// The style of a map of a level: space levels are drawn light on dark.
export const mapStyle = (level: MapLevel | undefined): MapThemeDef => (levelDef(level).drawn === 'space' ? SPACE_STYLE : LAND_STYLE)

export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [136, 136, 136]
}
