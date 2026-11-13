import type { MapLineStyle, MapShape, MapShapeType } from '../../../../api/types'
import { flatten, isClosed, makeShape, outVector, segmentsOf, type Pen } from './mapShapes'
import type { MapThemeDef } from './mapThemes'
import type { MapView } from './mapView'

// Drawing lines and regions: the curve of a shape traced on the canvas (straight pieces and cubic curves), a line in one of six styles, a region's fill with a
// pattern over it, the points and handles of the chosen shape, and the shape that is being drawn.

const DEFAULT_FILL = '#7a8aa0'

function trace(ctx: CanvasRenderingContext2D, shape: Pick<MapShape, 'type' | 'points'>, view: MapView) {
  const sx = (x: number) => view.x + x * view.zoom, sy = (y: number) => view.y + y * view.zoom
  ctx.beginPath()
  const segs = segmentsOf(shape)
  if (segs.length === 0) return
  ctx.moveTo(sx(segs[0].a[0]), sy(segs[0].a[1]))
  for (const s of segs) {
    if (s.straight) ctx.lineTo(sx(s.b[0]), sy(s.b[1]))
    else ctx.bezierCurveTo(sx(s.c1[0]), sy(s.c1[1]), sx(s.c2[0]), sy(s.c2[1]), sx(s.b[0]), sy(s.b[1]))
  }
  if (isClosed(shape)) ctx.closePath()
}

// The path that is traced now, stroked in a style. `w` is the width in pixels of the line itself (a road and a wall are drawn wider round it).
function strokeStyled(ctx: CanvasRenderingContext2D, style: MapLineStyle, colour: string, w: number, theme: MapThemeDef, again: () => void) {
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.setLineDash([])
  ctx.strokeStyle = colour
  switch (style) {
    case 'dashed':
      ctx.lineCap = 'butt'
      ctx.lineWidth = w
      ctx.setLineDash([w * 3.5, w * 2.2])
      ctx.stroke()
      break
    case 'dotted':
      ctx.lineWidth = w * 1.1
      ctx.setLineDash([0.1, w * 2.4])
      ctx.stroke()
      break
    case 'road':
      // Two edges with the road between them.
      ctx.lineWidth = w * 2.4
      ctx.stroke()
      again()
      ctx.lineWidth = w * 1.2
      ctx.strokeStyle = theme.plate
      ctx.stroke()
      break
    case 'wall':
      ctx.lineCap = 'butt'
      ctx.lineWidth = w * 1.4
      ctx.stroke()
      again()
      ctx.lineWidth = w * 2.6
      ctx.setLineDash([w * 1.1, w * 1.1])
      ctx.stroke()
      break
    case 'fence':
      ctx.lineWidth = Math.max(1, w * 0.7)
      ctx.stroke()
      again()
      ctx.lineCap = 'butt'
      ctx.lineWidth = w * 2.8
      ctx.setLineDash([Math.max(1, w * 0.45), w * 2.6])
      ctx.stroke()
      break
    default:
      ctx.lineWidth = w
      ctx.stroke()
  }
  ctx.setLineDash([])
}

// A pattern over the inside of a region (the region's own outline is the clip): lines or dots in the fill colour, spaced by the zoom.
function drawPattern(ctx: CanvasRenderingContext2D, shape: MapShape, view: MapView, colour: string) {
  const pts = flatten(shape)
  if (pts.length === 0) return
  const xs = pts.map(p => view.x + p.x * view.zoom), ys = pts.map(p => view.y + p.y * view.zoom)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const step = Math.max(5, view.zoom * 0.7)
  ctx.save()
  trace(ctx, shape, view)
  ctx.clip()
  ctx.globalAlpha = Math.min(1, shape.opacity + 0.45)
  ctx.strokeStyle = colour
  ctx.fillStyle = colour
  ctx.lineWidth = 1
  ctx.beginPath()
  const h = y1 - y0
  if (shape.pattern === 'hatch' || shape.pattern === 'cross') {
    for (let k = x0 - h; k <= x1; k += step) { ctx.moveTo(k, y1); ctx.lineTo(k + h, y0) }
  }
  if (shape.pattern === 'cross') {
    for (let k = x0; k <= x1 + h; k += step) { ctx.moveTo(k, y1); ctx.lineTo(k - h, y0) }
  }
  ctx.stroke()
  if (shape.pattern === 'dots') {
    const r = Math.max(1, step * 0.13)
    for (let y = y0 + step / 2; y < y1; y += step) {
      for (let x = x0 + step / 2; x < x1; x += step) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill() }
    }
  }
  ctx.restore()
}

// A biome shape: its outline filled in its biome's colour (no line round it: the land meets the land). The shading by height is drawn over the whole land
// afterwards (mapHeights.ts); `tint` (-1 to 1: white over it, or black) is for a shape shown on its own, such as one being drawn.
export function drawBiomeShape(ctx: CanvasRenderingContext2D, shape: Pick<MapShape, 'type' | 'points'>, view: MapView, color: string, tint = 0) {
  if (shape.points.length < 3) return
  ctx.save()
  trace(ctx, shape, view)
  ctx.fillStyle = color
  ctx.fill()
  if (tint !== 0) {
    ctx.globalAlpha = Math.min(1, Math.abs(tint))
    ctx.fillStyle = tint > 0 ? '#ffffff' : '#000000'
    ctx.fill()
  }
  ctx.restore()
}

// The colour a political area is filled with in the Nations view: its own fill, else its line colour, else one of a few drawn from its id.
const NATION_FILLS = ['#d98c6a', '#7fa8d9', '#c9b45a', '#9a7fc4', '#6fb58f', '#d17a9b', '#b9935f', '#5fa9b0']
export function nationFill(shape: Pick<MapShape, 'id' | 'fill' | 'color'>): string {
  if (shape.fill) return shape.fill
  if (shape.color) return shape.color
  let n = 0
  for (const ch of shape.id) n = (n * 31 + ch.charCodeAt(0)) >>> 0
  return NATION_FILLS[n % NATION_FILLS.length]
}

// A line or region. A political region (a nation, a state, a municipality) is only its border over the land, unless `nations` is on (the Nations view),
// when it is filled in its own colour.
export function drawShape(ctx: CanvasRenderingContext2D, shape: MapShape, view: MapView, theme: MapThemeDef, nations = false) {
  if (shape.points.length < 2) return
  const w = Math.max(1, shape.width * view.zoom)
  const colour = shape.color ?? theme.ink
  const again = () => trace(ctx, shape, view)
  ctx.save()
  if (isClosed(shape) && shape.points.length >= 3 && shape.political && nations) {
    trace(ctx, shape, view)
    ctx.globalAlpha = shape.political === 'nation' ? 0.6 : 0.35
    ctx.fillStyle = nationFill(shape)
    ctx.fill()
    ctx.globalAlpha = 1
  } else if (isClosed(shape) && shape.points.length >= 3 && !shape.political) {
    const fill = shape.fill ?? shape.color ?? DEFAULT_FILL
    trace(ctx, shape, view)
    ctx.globalAlpha = shape.pattern === 'solid' ? shape.opacity : shape.opacity * 0.5
    ctx.fillStyle = fill
    ctx.fill()
    ctx.globalAlpha = 1
    if (shape.pattern !== 'solid') drawPattern(ctx, shape, view, fill)
  }
  trace(ctx, shape, view)
  strokeStyled(ctx, shape.style, colour, w, theme, again)
  ctx.restore()
}

// The points and handles of the chosen shape: a square for each point (the chosen one filled), and for a smooth point its handle, a line to a circle at
// each end (the handle and the other side of it).
export function drawShapeEditor(ctx: CanvasRenderingContext2D, shape: MapShape, view: MapView, theme: MapThemeDef, node: number | null) {
  const closed = isClosed(shape)
  const sx = (x: number) => view.x + x * view.zoom, sy = (y: number) => view.y + y * view.zoom
  ctx.save()
  shape.points.forEach((p, i) => {
    if (!p.smooth) return
    const [vx, vy] = outVector(shape.points, i, closed)
    ctx.strokeStyle = theme.ink
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(sx(p.x - vx), sy(p.y - vy)); ctx.lineTo(sx(p.x + vx), sy(p.y + vy))
    ctx.stroke()
    for (const sign of [1, -1]) {
      ctx.beginPath()
      ctx.arc(sx(p.x + sign * vx), sy(p.y + sign * vy), 3.5, 0, Math.PI * 2)
      ctx.fillStyle = theme.halo
      ctx.fill()
      ctx.stroke()
    }
  })
  shape.points.forEach((p, i) => {
    const x = sx(p.x), y = sy(p.y)
    ctx.fillStyle = i === node ? theme.ink : theme.halo
    ctx.strokeStyle = theme.ink
    ctx.lineWidth = 1.5
    ctx.fillRect(x - 4, y - 4, 8, 8)
    ctx.strokeRect(x - 4, y - 4, 8, 8)
  })
  ctx.restore()
}

// The shape being drawn: its kind, what has been clicked, where the pointer is, the pen it is drawn with and, for a biome shape, its biome's colour.
export interface PendingShape { type: MapShapeType; points: Array<[number, number]>; cursor: [number, number] | null; pen: Pen; color?: string }

// The shape being drawn: what has been clicked, and a piece on to the pointer; a dot at each point. A biome shape shows its fill with a dashed outline.
export function drawPending(ctx: CanvasRenderingContext2D, pending: PendingShape, view: MapView, theme: MapThemeDef) {
  const pts = pending.cursor ? [...pending.points, pending.cursor] : pending.points
  if (pts.length === 0) return
  if (pending.type === 'biome' && pts.length >= 2) {
    const shape = makeShape('pending', '', 'biome', pts, pending.pen)
    if (pts.length >= 3) drawBiomeShape(ctx, shape, view, pending.color ?? DEFAULT_FILL)
    ctx.save()
    trace(ctx, shape, view)
    ctx.setLineDash([5, 3])
    ctx.strokeStyle = theme.ink
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  } else if (pts.length >= 2) drawShape(ctx, makeShape('pending', '', pending.type, pts, pending.pen), view, theme)
  ctx.save()
  ctx.strokeStyle = theme.ink
  ctx.fillStyle = theme.halo
  ctx.lineWidth = 1.5
  for (const [x, y] of pending.points) {
    ctx.beginPath()
    ctx.arc(view.x + x * view.zoom, view.y + y * view.zoom, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}
