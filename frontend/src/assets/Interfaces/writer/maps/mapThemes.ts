import type { MapThemeName } from '../../../../api/types'

// The look of a map. A theme changes how the author's terrain colours are shown (the palette itself is never changed), and sets the colours of what is
// drawn over it: symbols without a colour of their own, text and its halo, the frame, the grid and the plate behind the scale bar and the legend.
// These are the map's own colours (art, like the terrains), not the app's chrome.

export interface MapThemeDef {
  id: MapThemeName
  name: string
  // The ink of the frame, the grid, the scale bar and the compass; text; the halo that keeps text and symbols readable over any terrain.
  ink: string
  symbol: string
  halo: string
  // The plate behind the scale bar, compass and legend.
  plate: string
  // The typeface of the text.
  font: string
}

export const MAP_THEMES: MapThemeDef[] = [
  { id: 'parchment', name: 'Parchment', ink: '#4a3524', symbol: '#4a3524', halo: '#f1e4c3', plate: '#efe2c0', font: 'Georgia, "Times New Roman", serif' },
  { id: 'modern', name: 'Modern', ink: '#22262c', symbol: '#22262c', halo: '#ffffff', plate: '#f4f5f7', font: 'system-ui, "Segoe UI", sans-serif' },
  { id: 'night', name: 'Night', ink: '#dfe7f5', symbol: '#e9eefb', halo: '#0f1626', plate: '#161f33', font: 'system-ui, "Segoe UI", sans-serif' },
  { id: 'blueprint', name: 'Blueprint', ink: '#dceaff', symbol: '#eaf3ff', halo: '#14335f', plate: '#183a68', font: 'ui-monospace, Consolas, monospace' },
]

export const themeDef = (id: MapThemeName): MapThemeDef => MAP_THEMES.find(t => t.id === id) ?? MAP_THEMES[1]

export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [136, 136, 136]
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const luma = ([r, g, b]: RGB) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
const round = ([r, g, b]: RGB): RGB => [Math.round(r), Math.round(g), Math.round(b)]

// A terrain colour as the theme shows it: parchment fades it towards old paper, night darkens it towards blue, blueprint draws it in shades of one blue
// by its lightness (so the terrains stay apart), and modern shows it as it is.
export function themeRgb(hex: string, theme: MapThemeName): RGB {
  const c = hexToRgb(hex)
  switch (theme) {
    case 'parchment': {
      const grey = luma(c) * 255
      return round(mix(mix(c, [grey, grey, grey], 0.35), [222, 200, 152], 0.3))
    }
    case 'night':
      return round(mix([c[0] * 0.42, c[1] * 0.45, c[2] * 0.55], [18, 28, 58], 0.25))
    case 'blueprint':
      return round(mix([16, 44, 92], [150, 190, 245], luma(c)))
    default:
      return c
  }
}
