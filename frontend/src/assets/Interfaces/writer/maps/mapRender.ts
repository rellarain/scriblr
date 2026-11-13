import { drawAreaName, drawMeasure, drawLabel, drawOverlays, drawSelection, drawSymbol, type MeasureState } from './mapDrawItems'
import { drawBiomeShape, drawPending, drawShape, drawShapeEditor, type PendingShape } from './mapDrawShapes'
import { drawJourneys, type JourneyView } from './mapDrawJourneys'
import type { MapShape } from '../../../../api/types'
import { findItem, type ItemRef, type LegendEntry } from './mapItems'
import type { MapDraft } from './mapModel'
import { resolveBiome, type BiomeIndex } from './mapBiomes'
import { landHeight } from './mapHeights'
import { heightRangeOf } from './mapLevels'
import { flatten } from './mapShapes'
import { hexToRgb, mapStyle } from './mapThemes'
import { GRID_MIN_ZOOM, type MapView } from './mapView'

// Drawing a map on a canvas: the land (the base biome, then the biome shapes in their order, each in its biome's colour, lighter where it is higher and
// darker where it is lower), then the layers above it in their order (lines and regions, symbols, labels), the names of the areas that are places, the grid,
// the scale bar, compass and legend. The colours of the land are the biomes' (data); the frame round the map takes the ink colour of the page it is on.

export { hexToRgb }

// How much lighter (above sea level, > 0) or darker (below, < 0) a height makes its biome's colour: up to 0.55 at the map's height range.
export const MAX_TINT = 0.55
export function heightTint(height: number, range: number): number {
  if (!(range > 0) || !Number.isFinite(height) || height === 0) return 0
  return Math.max(-1, Math.min(1, height / range)) * MAX_TINT
}

export interface RenderOptions {
  // CSS pixels of the canvas and the device pixel ratio it is drawn at.
  width: number
  height: number
  dpr: number
  view: MapView
  draft: MapDraft
  // The biomes the map is drawn with (the admin's list and the project's own).
  biomes: BiomeIndex
  showGrid: boolean
  // The page's ink colour, for the frame.
  ink: string
  // The chosen symbol, label or shape, and the chosen point of a shape.
  selected: ItemRef | null
  selectedNode: number | null
  // The line, region or biome shape that is being drawn.
  pending: PendingShape | null
  // The path the Measure tool has so far, and what it says of it.
  measure: MeasureState | null
  // What the legend lists (null = the legend is off).
  legend: LegendEntry[] | null
  // The journeys of characters over the map (none when not given).
  journeys?: JourneyView
}

// The land of a map: the base, then its biome shapes in their order.
export function drawLand(ctx: CanvasRenderingContext2D, draft: MapDraft, biomes: BiomeIndex, view: MapView, layerId: string) {
  const range = heightRangeOf(draft.level, draft.units)
  const w = draft.width * view.zoom, h = draft.height * view.zoom
  ctx.save()
  ctx.fillStyle = resolveBiome(biomes, draft.base.biome).color
  ctx.fillRect(view.x, view.y, w, h)
  const baseTint = heightTint(draft.base.height, range)
  if (baseTint !== 0) {
    ctx.globalAlpha = Math.abs(baseTint)
    ctx.fillStyle = baseTint > 0 ? '#ffffff' : '#000000'
    ctx.fillRect(view.x, view.y, w, h)
  }
  ctx.restore()
  // Each shape is shaded by the height it gives the land over the base (until heights are worked out point by point across shapes, a shape is one shade).
  for (const s of draft.shapes) {
    if (s.type !== 'biome' || s.layerId !== layerId) continue
    if (!s.biome) {
      // A shape that keeps the biome under it only changes the height: it lightens or darkens what is there.
      const tint = heightTint(landHeight(draft.base.height, s, null) - draft.base.height, range)
      if (tint !== 0) {
        ctx.save()
        ctx.globalAlpha = Math.min(1, Math.abs(tint))
        drawBiomeShape(ctx, s, view, tint > 0 ? '#ffffff' : '#000000', 0)
        ctx.restore()
      }
      continue
    }
    const biome = resolveBiome(biomes, s.biome)
    drawBiomeShape(ctx, s, view, biome.color, heightTint(landHeight(draft.base.height, s, biome.group), range))
  }
}

export function drawMap(ctx: CanvasRenderingContext2D, o: RenderOptions) {
  const { width, height, dpr, view, draft } = o
  const theme = mapStyle(draft.level)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  const w = draft.width * view.zoom, h = draft.height * view.zoom

  // The layers, bottom to top. A hidden biomes layer leaves a faint wash so the map's size still shows.
  ctx.save()
  ctx.beginPath()
  ctx.rect(view.x, view.y, w, h)
  ctx.clip()
  const shownLayers = new Set<string>()
  for (const layer of draft.layers) {
    if (layer.visible) shownLayers.add(layer.id)
    if (layer.kind === 'terrain') {
      if (layer.visible) drawLand(ctx, draft, o.biomes, view, layer.id)
      else {
        ctx.save()
        ctx.globalAlpha = 0.08
        ctx.fillStyle = o.ink
        ctx.fillRect(view.x, view.y, w, h)
        ctx.restore()
      }
    } else if (layer.kind === 'symbols' && layer.visible) {
      for (const s of draft.symbols) if (s.layerId === layer.id) drawSymbol(ctx, s, view, theme)
    } else if (layer.kind === 'shapes' && layer.visible) {
      for (const sh of draft.shapes) if (sh.layerId === layer.id && sh.type !== 'biome') drawShape(ctx, sh, view, theme)
    } else if (layer.kind === 'labels' && layer.visible) {
      for (const l of draft.labels) if (l.layerId === layer.id) drawLabel(ctx, l, view, theme)
    }
  }
  // The names of the areas that are places, over everything on the map.
  for (const sh of draft.shapes) {
    if (sh.type !== 'line' && sh.name && shownLayers.has(sh.layerId)) drawAreaName(ctx, sh.name, flatten(sh), view, theme)
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
}
