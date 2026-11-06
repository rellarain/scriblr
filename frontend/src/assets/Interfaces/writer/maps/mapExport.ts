import { drawMap, renderTerrain } from './mapRender'
import { legendEntries } from './mapItems'
import { terrainCounts, type MapDraft } from './mapModel'

// A map as a PNG image: the same drawing as on the canvas, at a size of its own (a cell is 16 pixels at 1x, 32 at 2x, 64 at 4x, held so that the longest side
// stays within what a canvas can hold), without the grid or the editing marks, with the layers that were chosen and the scale bar, compass and legend the map
// has switched on.

export const EXPORT_SCALES = [1, 2, 4] as const
export type ExportScale = (typeof EXPORT_SCALES)[number]
export const BASE_CELL_PX = 16
export const MAX_SIDE_PX = 8192
const MARGIN = 2

// How many pixels a cell is, and how big the image is, for a map at a scale.
export function exportSize(width: number, height: number, scale: ExportScale): { cell: number; width: number; height: number } {
  const cell = Math.max(1, Math.min(BASE_CELL_PX * scale, Math.floor((MAX_SIDE_PX - MARGIN * 2) / Math.max(width, height))))
  return { cell, width: Math.round(width * cell) + MARGIN * 2, height: Math.round(height * cell) + MARGIN * 2 }
}

// The draft as it is exported: only the chosen layers are shown.
export function withLayers(draft: MapDraft, chosen: Set<string>): MapDraft {
  return { ...draft, layers: draft.layers.map(l => ({ ...l, visible: l.visible && chosen.has(l.id) })) }
}

// Draw the map on a new canvas (null when there is no 2D context to draw on).
export function renderMapImage(draft: MapDraft, scale: ExportScale, chosenLayers: Set<string>, makeCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')): HTMLCanvasElement | null {
  const size = exportSize(draft.width, draft.height, scale)
  const shown = withLayers(draft, chosenLayers)
  const bitmap = renderTerrain(shown, null)
  const canvas = makeCanvas()
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx || !bitmap) return null
  const counts = shown.legend ? terrainCounts(shown.cells, shown.terrains.length) : []
  drawMap(ctx, {
    width: size.width, height: size.height, dpr: 1, view: { zoom: size.cell, x: MARGIN, y: MARGIN }, draft: shown, bitmap, showGrid: false, ink: '#000000',
    brush: [], selected: null, selectedNode: null, pending: null, measure: null, legend: shown.legend ? legendEntries(shown, counts) : null,
  })
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'))
}

// The name of the image: the map's title made safe, and the scale.
export function imageFileName(title: string, scale: ExportScale): string {
  const safe = title.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'map'
  return `${safe}${scale === 1 ? '' : `@${scale}x`}.png`
}

// Hand a blob to the user as a download.
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function exportMapImage(draft: MapDraft, scale: ExportScale, chosenLayers: Set<string>): Promise<'saved' | 'unavailable'> {
  const canvas = renderMapImage(draft, scale, chosenLayers)
  const blob = canvas ? await canvasToBlob(canvas) : null
  if (!blob) return 'unavailable'
  saveBlob(blob, imageFileName(draft.title, scale))
  return 'saved'
}
