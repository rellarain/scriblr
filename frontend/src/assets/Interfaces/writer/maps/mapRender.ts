import { drawAreaName, drawMeasure, drawLabel, drawOverlays, drawPlaceName, drawSelection, type MeasureState } from './mapDrawItems'
import { drawBiomeShape, drawPending, drawShape, drawShapeEditor, starGlow, type PendingShape } from './mapDrawShapes'
import { levelDef } from './mapLevels'
import { drawJourneys, type JourneyView } from './mapDrawJourneys'
import type { MapShape } from '../../../../api/types'
import { findItem, showsPoints, type ItemRef, type LegendEntry } from './mapItems'
import type { MapDraft } from './mapModel'
import { resolveBiome, type BiomeIndex } from './mapBiomes'
import { MAX_TINT, contoursOf, heightTint, keptWithHeights, mapHeightRange, shadePixels, type ContourSegment } from './mapHeights'
import { flatten } from './mapShapes'
import { hexToRgb, mapStyle, type MapThemeDef } from './mapThemes'
import { GRID_MIN_ZOOM, type MapView } from './mapView'

// Drawing a map on a canvas: the land (the base biome, then the biome shapes in their order, each in its biome's colour; then the shading of the heights
// over it, lighter where it is higher and darker where it is lower, with relief and contour lines when the map has them on), then the layers above it in
// their order (lines and regions, markers, labels), the names of the areas that are places, the grid, the scale bar, compass and legend. The colours of the
// land are the biomes' (data); the frame round the map takes the ink colour of the page it is on.

export { hexToRgb, MAX_TINT, heightTint }

// A canvas of a size, to draw the shading on (none in a place with no DOM, such as the tests in node: the land is then drawn without its shading).
export type MakeCanvas = (width: number, height: number) => HTMLCanvasElement | null
const domCanvas: MakeCanvas = (width, height) => {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
}

// The neutral land of the Nations view: water stays a pale blue, everything else a pale paper, so the nations' colours read over it.
export const NATIONS_LAND = '#ebe6dc'
export const NATIONS_WATER = '#c3d3e2'

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
  // The chosen label or shape, and the chosen point of a shape.
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
  // The Nations view: the land in neutral colours and the political areas filled in their own (planetary to regional maps).
  nations?: boolean
  // A shape about to be placed (the Place a shape tool's box), drawn over the map with a dashed outline.
  preview?: MapShape | null
  // Where the shading image is drawn (the page's own canvas when not given).
  makeCanvas?: MakeCanvas
}

// The image of the shading of a draft's heights (cached with the heights): one pixel a sample, drawn stretched over the map, smoothed.
function shadeImage(draft: MapDraft, biomes: BiomeIndex, makeCanvas: MakeCanvas): HTMLCanvasElement | null {
  const relief = Boolean(draft.relief)
  return keptWithHeights(draft, biomes, `shade:${relief}`, grid => {
    const canvas = makeCanvas(grid.w, grid.h)
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return null
    const img = ctx.createImageData(grid.w, grid.h)
    img.data.set(shadePixels(grid, mapHeightRange(draft), relief))
    ctx.putImageData(img, 0, 0)
    return canvas
  })
}

// The contour lines over the land: thin lines in the ink, every fifth (and sea level) a little stronger.
function drawContours(ctx: CanvasRenderingContext2D, segments: ContourSegment[], view: MapView, theme: MapThemeDef) {
  if (segments.length === 0) return
  ctx.save()
  ctx.strokeStyle = theme.ink
  ctx.lineCap = 'round'
  for (const index of [false, true]) {
    ctx.globalAlpha = index ? 0.5 : 0.25
    ctx.lineWidth = index ? 1.3 : 0.8
    ctx.beginPath()
    for (const g of segments) {
      if (g.index !== index) continue
      ctx.moveTo(view.x + g.x1 * view.zoom, view.y + g.y1 * view.zoom)
      ctx.lineTo(view.x + g.x2 * view.zoom, view.y + g.y2 * view.zoom)
    }
    ctx.stroke()
  }
  ctx.restore()
}

// The backdrop of a space map: faint stars, the same for a map every time (seeded by its id and size), a few brighter, about one in every two cells.
const STARFIELDS = new Map<string, Float32Array>()
export function starfieldOf(id: string, width: number, height: number): Float32Array {
  const key = `${id}:${width}x${height}`
  const hit = STARFIELDS.get(key)
  if (hit) return hit
  let seed = 2166136261
  for (const ch of key) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const n = Math.min(6000, Math.round(width * height * 0.5))
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i += 1) { out[i * 3] = rand() * width; out[i * 3 + 1] = rand() * height; out[i * 3 + 2] = rand() }
  if (STARFIELDS.size > 16) STARFIELDS.clear()
  STARFIELDS.set(key, out)
  return out
}

function drawStarfield(ctx: CanvasRenderingContext2D, draft: MapDraft, view: MapView, theme: MapThemeDef) {
  const stars = starfieldOf(draft.id, draft.width, draft.height)
  ctx.save()
  ctx.fillStyle = theme.ink
  for (let i = 0; i < stars.length; i += 3) {
    const b = stars[i + 2]
    const r = b > 0.97 ? 1.6 : b > 0.85 ? 1.1 : 0.7
    ctx.globalAlpha = 0.25 + b * 0.6
    ctx.fillRect(view.x + stars[i] * view.zoom - r / 2, view.y + stars[i + 1] * view.zoom - r / 2, r, r)
  }
  ctx.restore()
}

// The land of a map: the base, then its biome shapes in their order, each in its biome's colour (a shape with no biome of its own changes only the height),
// then the shading of the heights over it all, and the contour lines. In the Nations view the land is neutral and has no shading.
export function drawLand(ctx: CanvasRenderingContext2D, draft: MapDraft, biomes: BiomeIndex, view: MapView, layerId: string, opts: { nations?: boolean; makeCanvas?: MakeCanvas; theme?: MapThemeDef } = {}) {
  const w = draft.width * view.zoom, h = draft.height * view.zoom
  const colourOf = (id: string) => {
    const b = resolveBiome(biomes, id)
    if (!opts.nations) return b.color
    return b.group === 'water' ? NATIONS_WATER : b.group === 'land' ? NATIONS_LAND : b.color
  }
  ctx.save()
  ctx.fillStyle = colourOf(draft.base.biome)
  ctx.fillRect(view.x, view.y, w, h)
  ctx.restore()
  const space = levelDef(draft.level).drawn === 'space'
  if (space) drawStarfield(ctx, draft, view, opts.theme ?? mapStyle(draft.level))
  for (const s of draft.shapes) {
    if (s.type !== 'biome' || s.layerId !== layerId || !s.biome) continue
    const b = resolveBiome(biomes, s.biome)
    drawBiomeShape(ctx, s, view, colourOf(s.biome), 0, space && b.group === 'star' ? starGlow(b.color) : undefined)
  }
  if (opts.nations || mapHeightRange(draft) <= 0) return
  const shade = shadeImage(draft, biomes, opts.makeCanvas ?? domCanvas)
  if (shade) {
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(shade, view.x, view.y, w, h)
    ctx.restore()
  }
  if (draft.contours) drawContours(ctx, contoursOf(draft, biomes), view, opts.theme ?? mapStyle(draft.level))
}

// A shape about to be placed: drawn as it will be (a biome area in its biome's colour), under a dashed outline.
function drawPreview(ctx: CanvasRenderingContext2D, shape: MapShape, view: MapView, theme: MapThemeDef, biomes: BiomeIndex) {
  ctx.save()
  ctx.globalAlpha = 0.8
  if (shape.type === 'biome') drawBiomeShape(ctx, shape, view, shape.biome ? resolveBiome(biomes, shape.biome).color : '#7a8aa0')
  else drawShape(ctx, shape, view, theme)
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  for (const ring of [shape.points, ...(shape.type === 'line' ? [] : shape.holes ?? [])]) {
    flatten({ type: ring === shape.points ? shape.type : 'region', points: ring }).forEach((p, i) => {
      const x = view.x + p.x * view.zoom, y = view.y + p.y * view.zoom
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    if (shape.type !== 'line') ctx.closePath()
  }
  ctx.setLineDash([5, 3])
  ctx.strokeStyle = theme.ink
  ctx.lineWidth = 1.2
  ctx.stroke()
  ctx.restore()
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
      if (layer.visible) drawLand(ctx, draft, o.biomes, view, layer.id, { nations: o.nations, makeCanvas: o.makeCanvas, theme })
      else {
        ctx.save()
        ctx.globalAlpha = 0.08
        ctx.fillStyle = o.ink
        ctx.fillRect(view.x, view.y, w, h)
        ctx.restore()
      }
    } else if ((layer.kind === 'shapes' || layer.kind === 'symbols') && layer.visible) {
      for (const sh of draft.shapes) if (sh.layerId === layer.id && sh.type !== 'biome') drawShape(ctx, sh, view, theme, o.nations)
    } else if (layer.kind === 'labels' && layer.visible) {
      for (const l of draft.labels) if (l.layerId === layer.id) drawLabel(ctx, l, view, theme)
    }
  }
  // The names of the areas that are places, over everything on the map.
  for (const sh of draft.shapes) {
    if (sh.type === 'line' || !sh.name || !shownLayers.has(sh.layerId)) continue
    // A marker's name is under it (its picture stays clear); an area's at its middle.
    if (sh.style === 'halo') drawPlaceName(ctx, sh.name, sh, view, theme)
    else drawAreaName(ctx, sh.name, flatten(sh), view, theme)
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
      if (o.selected.kind === 'shape' && showsPoints(item as MapShape, view.zoom)) drawShapeEditor(ctx, item as MapShape, view, theme, o.selectedNode)
    }
  }
  if (o.pending) drawPending(ctx, o.pending, view, theme)
  if (o.preview) drawPreview(ctx, o.preview, view, theme, o.biomes)
  if (o.measure) drawMeasure(ctx, o.measure, view, theme, o.width)
}
