import { drawMeasure, drawLabel, drawOverlays, drawSelection, drawSymbol, type MeasureState } from './mapDrawItems'
import { drawPending, drawShape, drawShapeEditor, type PendingShape } from './mapDrawShapes'
import { drawJourneys, type JourneyView } from './mapDrawJourneys'
import type { MapShape } from '../../../../api/types'
import { findItem, type ItemRef, type LegendEntry } from './mapItems'
import type { MapDraft } from './mapModel'
import { hexToRgb, themeDef, themeRgb } from './mapThemes'
import { GRID_MIN_ZOOM, type MapView } from './mapView'

// Drawing a map on a canvas: the terrain as a bitmap of one pixel per cell (made when the cells change), scaled up without smoothing so each cell is a
// crisp square, then the layers above it in their order (symbols, labels), the grid, the scale bar, compass and legend, and the brush outline.
// The colours of the map are data (the author's terrain colours, shown through the map's look, mapThemes.ts); the frame round it takes the ink colour
// of the page it is on.

// The pixels of the terrain: one 32-bit value per cell (R, G, B, opaque, in memory order), in the colours of the map's look.
export function terrainPixels(draft: Pick<MapDraft, 'cells' | 'terrains' | 'theme'>): Uint32Array {
  const palette = draft.terrains.map(t => {
    const [r, g, b] = themeRgb(t.color, draft.theme)
    return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
  })
  const out = new Uint32Array(draft.cells.length)
  const fallback = palette[0] ?? 0xff888888
  for (let i = 0; i < out.length; i += 1) out[i] = palette[draft.cells[i]] ?? fallback
  return out
}

export { hexToRgb }

export interface RenderOptions {
  // CSS pixels of the canvas and the device pixel ratio it is drawn at.
  width: number
  height: number
  dpr: number
  view: MapView
  draft: MapDraft
  // The terrain bitmap (one pixel per cell), null when it is not made yet.
  bitmap: HTMLCanvasElement | null
  showGrid: boolean
  // The page's ink colour, for the frame.
  ink: string
  // The cells under the brush, to outline.
  brush: Array<[number, number]>
  // The chosen symbol, label or shape, and the chosen point of a shape.
  selected: ItemRef | null
  selectedNode: number | null
  // The line or region that is being drawn.
  pending: PendingShape | null
  // The path the Measure tool has so far, and what it says of it.
  measure: MeasureState | null
  // What the legend lists (null = the legend is off).
  legend: LegendEntry[] | null
  // The journeys of characters over the map (none when not given).
  journeys?: JourneyView
}

export function drawMap(ctx: CanvasRenderingContext2D, o: RenderOptions) {
  const { width, height, dpr, view, draft } = o
  const theme = themeDef(draft.theme)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  const w = draft.width * view.zoom, h = draft.height * view.zoom

  // The layers, bottom to top. Terrain is the bitmap (a hidden terrain layer leaves a faint wash so the map's size still shows).
  ctx.save()
  ctx.beginPath()
  ctx.rect(view.x, view.y, w, h)
  ctx.clip()
  for (const layer of draft.layers) {
    if (layer.kind === 'terrain') {
      if (layer.visible && o.bitmap) {
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(o.bitmap, view.x, view.y, w, h)
      } else if (!layer.visible) {
        ctx.save()
        ctx.globalAlpha = 0.08
        ctx.fillStyle = o.ink
        ctx.fillRect(view.x, view.y, w, h)
        ctx.restore()
      }
    } else if (layer.kind === 'symbols' && layer.visible) {
      for (const s of draft.symbols) if (s.layerId === layer.id) drawSymbol(ctx, s, view, theme)
    } else if (layer.kind === 'shapes' && layer.visible) {
      for (const sh of draft.shapes) if (sh.layerId === layer.id) drawShape(ctx, sh, view, theme)
    } else if (layer.kind === 'labels' && layer.visible) {
      for (const l of draft.labels) if (l.layerId === layer.id) drawLabel(ctx, l, view, theme)
    }
  }
  ctx.restore()
  if (o.journeys) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(view.x, view.y, w, h)
    ctx.clip()
    drawJourneys(ctx, o.journeys, view, theme)
    ctx.restore()
  }

  if (o.showGrid && view.zoom >= GRID_MIN_ZOOM) {
    ctx.save()
    ctx.globalAlpha = 0.22
    ctx.strokeStyle = theme.ink
    ctx.lineWidth = 1
    ctx.beginPath()
    // Only the lines that are on the canvas.
    const x0 = Math.max(0, Math.floor(-view.x / view.zoom)), x1 = Math.min(draft.width, Math.ceil((width - view.x) / view.zoom))
    const y0 = Math.max(0, Math.floor(-view.y / view.zoom)), y1 = Math.min(draft.height, Math.ceil((height - view.y) / view.zoom))
    for (let x = x0; x <= x1; x += 1) {
      const px = Math.round(view.x + x * view.zoom) + 0.5
      ctx.moveTo(px, Math.max(0, view.y)); ctx.lineTo(px, Math.min(height, view.y + h))
    }
    for (let y = y0; y <= y1; y += 1) {
      const py = Math.round(view.y + y * view.zoom) + 0.5
      ctx.moveTo(Math.max(0, view.x), py); ctx.lineTo(Math.min(width, view.x + w), py)
    }
    ctx.stroke()
    ctx.restore()
  }

  drawOverlays(ctx, {
    x: view.x, y: view.y, w, h, theme, zoom: view.zoom, cellSize: draft.cellSize, unit: draft.unit, scaleBar: draft.scaleBar, compass: draft.compass, legend: o.legend,
  })

  ctx.save()
  ctx.strokeStyle = o.ink
  ctx.globalAlpha = 0.6
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(view.x) - 0.5, Math.round(view.y) - 0.5, Math.round(w) + 1, Math.round(h) + 1)
  ctx.restore()

  if (o.selected) {
    const item = findItem(draft, o.selected)
    if (item) {
      drawSelection(ctx, item, o.selected, view, theme)
      if (o.selected.kind === 'shape') drawShapeEditor(ctx, item as MapShape, view, theme, o.selectedNode)
    }
  }
  if (o.pending) drawPending(ctx, o.pending, view, theme)
  if (o.measure) drawMeasure(ctx, o.measure, view, theme, o.width)

  if (o.brush.length > 0) {
    ctx.save()
    ctx.strokeStyle = theme.ink
    ctx.lineWidth = 2
    for (const [x, y] of o.brush) ctx.strokeRect(view.x + x * view.zoom + 1, view.y + y * view.zoom + 1, Math.max(1, view.zoom - 2), Math.max(1, view.zoom - 2))
    ctx.restore()
  }
}

// Make (or remake) the terrain bitmap for the draft; null when there is no canvas to draw on (no 2D context).
export function renderTerrain(draft: MapDraft, into: HTMLCanvasElement | null): HTMLCanvasElement | null {
  const canvas = into ?? document.createElement('canvas')
  if (canvas.width !== draft.width) canvas.width = draft.width
  if (canvas.height !== draft.height) canvas.height = draft.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const image = ctx.createImageData(draft.width, draft.height)
  new Uint32Array(image.data.buffer).set(terrainPixels(draft))
  ctx.putImageData(image, 0, 0)
  return canvas
}
