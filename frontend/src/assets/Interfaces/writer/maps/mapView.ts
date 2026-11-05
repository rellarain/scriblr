// The map canvas's view: how many screen pixels a cell is, and where the map's top left corner is on the canvas. Pure, so the pointer-to-cell
// maths is tested without a canvas.

export interface MapView { zoom: number; x: number; y: number }

export const MIN_ZOOM = 1
export const MAX_ZOOM = 64
export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

// The view that shows the whole map, centred, with a small margin.
export function fitView(mapW: number, mapH: number, viewW: number, viewH: number, margin = 16): MapView {
  const zoom = clampZoom(Math.floor(Math.min((viewW - margin * 2) / mapW, (viewH - margin * 2) / mapH) * 100) / 100)
  return { zoom, x: Math.round((viewW - mapW * zoom) / 2), y: Math.round((viewH - mapH * zoom) / 2) }
}

// The cell under a point of the canvas (null off the map).
export function cellAt(view: MapView, px: number, py: number, mapW: number, mapH: number): [number, number] | null {
  const x = Math.floor((px - view.x) / view.zoom)
  const y = Math.floor((py - view.y) / view.zoom)
  return x >= 0 && y >= 0 && x < mapW && y < mapH ? [x, y] : null
}

// The cell under a point, held on the map (for a drag that goes past the edge).
export function nearestCell(view: MapView, px: number, py: number, mapW: number, mapH: number): [number, number] {
  const x = Math.floor((px - view.x) / view.zoom)
  const y = Math.floor((py - view.y) / view.zoom)
  return [Math.min(mapW - 1, Math.max(0, x)), Math.min(mapH - 1, Math.max(0, y))]
}

// Zoom by a factor with the point (px, py) staying where it is on the screen.
export function zoomAt(view: MapView, factor: number, px: number, py: number): MapView {
  const zoom = clampZoom(view.zoom * factor)
  if (zoom === view.zoom) return view
  const k = zoom / view.zoom
  return { zoom, x: px - (px - view.x) * k, y: py - (py - view.y) * k }
}

// Pan so that some of the map always stays in view (at least `keep` pixels of it).
export function panBy(view: MapView, dx: number, dy: number, mapW: number, mapH: number, viewW: number, viewH: number, keep = 48): MapView {
  const w = mapW * view.zoom, h = mapH * view.zoom
  const x = Math.min(viewW - keep, Math.max(keep - w, view.x + dx))
  const y = Math.min(viewH - keep, Math.max(keep - h, view.y + dy))
  return { ...view, x, y }
}

// Grid lines show only when a cell is big enough for them to read as a grid rather than a smudge.
export const GRID_MIN_ZOOM = 6

// The distance between two cells (centre to centre), in the map's unit.
export function distanceBetween(a: [number, number], b: [number, number], cellSize: number): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) * cellSize
}

// A distance as short text: "12.5 miles".
export function formatDistance(value: number, unit: string): string {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${unit}`
}
