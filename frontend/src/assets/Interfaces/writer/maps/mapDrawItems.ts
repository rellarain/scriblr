import type { MapLabel, MapShape, MapSymbol } from '../../../../api/types'
import { itemBounds, niceScale, type ItemRef, type LegendEntry } from './mapItems'
import { SYMBOL_BOX, symbolPath } from './mapSymbols'
import type { MapThemeDef } from './mapThemes'
import type { MapView } from './mapView'

// Drawing what is on a map besides its terrain: symbols, labels, the selection, and the scale bar, compass and legend laid over a corner of the map.
// The same functions draw an exported image later (the view is then just a zoom and an offset).

const paths = new Map<string, Path2D>()
function pathOf(kind: string): Path2D | null {
  if (typeof Path2D === 'undefined') return null
  let p = paths.get(kind)
  if (!p) { p = new Path2D(symbolPath(kind)); paths.set(kind, p) }
  return p
}

// A symbol is drawn in its own colour (or the theme's) over a halo that keeps it apart from any terrain.
export function drawSymbol(ctx: CanvasRenderingContext2D, s: MapSymbol, view: MapView, theme: MapThemeDef) {
  const px = s.size * view.zoom
  const left = view.x + s.x * view.zoom - px / 2, top = view.y + s.y * view.zoom - px / 2
  const colour = s.color ?? theme.symbol
  const path = pathOf(s.kind)
  if (px < 4 || !path) {
    // Too small to read as a shape (or no path support): a dot.
    ctx.fillStyle = colour
    ctx.fillRect(left + px / 2 - 1.5, top + px / 2 - 1.5, 3, 3)
    return
  }
  ctx.save()
  ctx.translate(left, top)
  ctx.scale(px / SYMBOL_BOX, px / SYMBOL_BOX)
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1.2, (2.6 * SYMBOL_BOX) / px)
  ctx.strokeStyle = theme.halo
  ctx.stroke(path)
  ctx.fillStyle = colour
  ctx.fill(path, 'evenodd')
  ctx.restore()
  if (s.name) drawPlaceName(ctx, s.name, left + px / 2, top + px, px, theme)
}

// A place's name under its symbol (left out when the symbol is too small for a name to be legible beside it).
function drawPlaceName(ctx: CanvasRenderingContext2D, name: string, cx: number, y: number, px: number, theme: MapThemeDef) {
  const size = Math.min(14, Math.max(9, px * 0.42))
  if (px < 14) return
  ctx.save()
  ctx.font = `600 ${size}px ${theme.font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = theme.halo
  ctx.strokeText(name, cx, y + 1)
  ctx.fillStyle = theme.ink
  ctx.fillText(name, cx, y + 1)
  ctx.restore()
}

// A named area's name, at the middle of its outline (the centre of its points' box, pulled to the centroid of its flattened outline), over a halo. Left out
// when the area is too small on the canvas for the name to fit.
export function drawAreaName(ctx: CanvasRenderingContext2D, name: string, outline: Array<{ x: number; y: number }>, view: MapView, theme: MapThemeDef) {
  if (!name || outline.length < 3) return
  const xs = outline.map(p => p.x), ys = outline.map(p => p.y)
  const w = (Math.max(...xs) - Math.min(...xs)) * view.zoom
  if (w < 40) return
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < outline.length; i += 1) {
    const p = outline[i], q = outline[(i + 1) % outline.length]
    const k = p.x * q.y - q.x * p.y
    a += k; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k
  }
  const [mx, my] = Math.abs(a) > 1e-9 ? [cx / (3 * a), cy / (3 * a)] : [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  const size = Math.min(16, Math.max(10, w / 14))
  ctx.save()
  ctx.font = `600 ${size}px ${theme.font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = theme.halo
  const x = view.x + mx * view.zoom, y = view.y + my * view.zoom
  ctx.strokeText(name, x, y)
  ctx.fillStyle = theme.ink
  ctx.fillText(name, x, y)
  ctx.restore()
}

// The smallest a label is drawn at, in pixels of height; below it the text is not legible and is left out.
export const MIN_LABEL_PX = 6

export function drawLabel(ctx: CanvasRenderingContext2D, l: MapLabel, view: MapView, theme: MapThemeDef) {
  const px = l.size * view.zoom
  if (px < MIN_LABEL_PX) return
  ctx.save()
  ctx.font = `600 ${px}px ${theme.font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(2, px * 0.28)
  ctx.strokeStyle = theme.halo
  const x = view.x + l.x * view.zoom, y = view.y + l.y * view.zoom
  ctx.strokeText(l.text, x, y)
  ctx.fillStyle = theme.ink
  ctx.fillText(l.text, x, y)
  ctx.restore()
}

// The chosen item's outline: a dashed box in the ink over a halo of its own, so it shows on any terrain.
export function drawSelection(ctx: CanvasRenderingContext2D, item: MapSymbol | MapLabel | MapShape, ref: ItemRef, view: MapView, theme: MapThemeDef) {
  const b = itemBounds(item, ref.kind)
  const x = view.x + b.x0 * view.zoom, y = view.y + b.y0 * view.zoom, w = (b.x1 - b.x0) * view.zoom, h = (b.y1 - b.y0) * view.zoom
  ctx.save()
  ctx.lineWidth = 3
  ctx.strokeStyle = theme.halo
  ctx.strokeRect(x - 2, y - 2, w + 4, h + 4)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = theme.ink
  ctx.setLineDash([5, 3])
  ctx.strokeRect(x - 2, y - 2, w + 4, h + 4)
  ctx.restore()
}

export interface OverlayOptions {
  // The map's rectangle on the canvas, in pixels.
  x: number; y: number; w: number; h: number
  theme: MapThemeDef
  zoom: number
  cellSize: number
  unit: string
  scaleBar: boolean
  compass: boolean
  legend: LegendEntry[] | null
}

const PAD = 10
const FONT_PX = 12

function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, theme: MapThemeDef) {
  ctx.save()
  ctx.globalAlpha = 0.88
  ctx.fillStyle = theme.plate
  ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 0.7
  ctx.strokeStyle = theme.ink
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  ctx.restore()
}

// The scale bar, compass and legend, each in a corner of the map (they are left out when the map is too small on the canvas to hold them).
export function drawOverlays(ctx: CanvasRenderingContext2D, o: OverlayOptions) {
  const { x, y, w, h, theme } = o
  ctx.save()
  ctx.font = `600 ${FONT_PX}px ${theme.font}`
  ctx.textBaseline = 'middle'

  if (o.scaleBar && w >= 180 && h >= 70) {
    const scale = niceScale(o.cellSize, o.zoom, Math.min(110, w / 3))
    if (scale) {
      const label = `${scale.units} ${o.unit}`
      const tw = ctx.measureText(label).width
      const bw = Math.max(scale.px, tw)
      const px = x + PAD, py = y + h - PAD - 30
      plate(ctx, px, py, bw + 16, 30, theme)
      ctx.strokeStyle = theme.ink
      ctx.lineWidth = 2
      const by = py + 22, bx = px + 8
      ctx.beginPath()
      ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by); ctx.lineTo(bx + scale.px, by); ctx.lineTo(bx + scale.px, by - 4)
      ctx.stroke()
      ctx.fillStyle = theme.ink
      ctx.textAlign = 'left'
      ctx.fillText(label, bx, py + 10)
    }
  }

  if (o.compass && w >= 120 && h >= 120) {
    const r = 18
    const cx = x + w - PAD - r - 4, cy = y + PAD + r + 12
    plate(ctx, cx - r - 6, cy - r - 18, r * 2 + 12, r * 2 + 26, theme)
    ctx.fillStyle = theme.ink
    ctx.textAlign = 'center'
    ctx.fillText('N', cx, cy - r - 8)
    // North is up: a dark half and a light half make the needle.
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + 6, cy + 2); ctx.lineTo(cx, cy - 2); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx - 6, cy + 2); ctx.lineTo(cx, cy - 2); ctx.closePath()
    ctx.lineWidth = 1.2; ctx.strokeStyle = theme.ink; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx, cy + r); ctx.lineTo(cx + 4, cy + 4); ctx.lineTo(cx - 4, cy + 4); ctx.closePath(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx - 6, cy); ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + r, cy); ctx.stroke()
  }

  if (o.legend && o.legend.length > 0 && w >= 200 && h >= 120) {
    const scale = o.legend.find((e): e is Extract<LegendEntry, { type: 'heights' }> => e.type === 'heights')
    const listed = o.legend.filter(e => e.type !== 'heights')
    // The height scale takes a block of its own under the rows: a ramp from the darkest depth to the lightest height, and three numbers under it.
    const scaleH = scale ? 40 : 0
    const room = Math.max(1, Math.floor((h * 0.6 - 12 - scaleH) / 18))
    const rows = listed.slice(0, room)
    const more = listed.length - rows.length
    ctx.textAlign = 'left'
    const widest = Math.max(0, ...rows.map(e => ctx.measureText(e.name).width), more > 0 ? ctx.measureText(`+ ${more} more`).width : 0)
    const bw = Math.max(widest + 38, scale ? 156 : 0), bh = (rows.length + (more > 0 ? 1 : 0)) * 18 + 12 + scaleH
    const px = x + w - PAD - bw, py = y + h - PAD - bh
    plate(ctx, px, py, bw, bh, theme)
    if (scale) {
      const rx = px + 8, ry = py + bh - scaleH + 2, rw = bw - 16, steps = 12
      // A neutral gray, darkened toward the depths and lightened toward the heights the way the land is.
      for (let k = 0; k < steps; k += 1) {
        const v = ((k + 0.5) / steps) * 2 - 1
        ctx.fillStyle = '#8c8c8c'
        ctx.fillRect(rx + (k * rw) / steps, ry, rw / steps + 0.5, 10)
        ctx.save()
        ctx.globalAlpha = Math.abs(v) * 0.55
        ctx.fillStyle = v > 0 ? '#ffffff' : '#000000'
        ctx.fillRect(rx + (k * rw) / steps, ry, rw / steps + 0.5, 10)
        ctx.restore()
      }
      ctx.strokeStyle = theme.ink; ctx.lineWidth = 1
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, 9)
      ctx.fillStyle = theme.ink
      const num = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('en')}`
      const ty = ry + 22
      ctx.textAlign = 'left'; ctx.fillText(num(scale.low), rx, ty)
      ctx.textAlign = 'center'; ctx.fillText('0', rx + rw / 2, ty)
      ctx.textAlign = 'right'; ctx.fillText(`${num(scale.high)} ${scale.unit}`, rx + rw, ty)
      ctx.textAlign = 'left'
    }
    rows.forEach((e, i) => {
      const ry = py + 6 + i * 18 + 9
      if (e.type === 'terrain') {
        ctx.fillStyle = e.color
        ctx.fillRect(px + 8, ry - 6, 14, 12)
        ctx.strokeStyle = theme.ink; ctx.lineWidth = 1
        ctx.strokeRect(px + 8.5, ry - 5.5, 13, 11)
      } else if (e.type === 'symbol') {
        const p = pathOf(e.kind)
        if (p) {
          ctx.save()
          ctx.translate(px + 7, ry - 8)
          ctx.scale(16 / SYMBOL_BOX, 16 / SYMBOL_BOX)
          ctx.fillStyle = theme.symbol
          ctx.fill(p, 'evenodd')
          ctx.restore()
        }
      }
      ctx.fillStyle = theme.ink
      ctx.fillText(e.name, px + 28, ry)
    })
    if (more > 0) { ctx.fillStyle = theme.ink; ctx.fillText(`+ ${more} more`, px + 28, py + 6 + rows.length * 18 + 9) }
  }
  ctx.restore()
}

export interface MeasureState { points: Array<[number, number]>; cursor: [number, number] | null; text: string }

// The Measure tool's path: a dashed line through its points with a dot at each, and what it says (the length, and the journey) on a plate at the end.
export function drawMeasure(ctx: CanvasRenderingContext2D, m: MeasureState, view: MapView, theme: MapThemeDef, canvasWidth = Infinity) {
  const pts = m.cursor ? [...m.points, m.cursor] : m.points
  const at = ([x, y]: [number, number]): [number, number] => [view.x + x * view.zoom, view.y + y * view.zoom]
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = theme.halo
  ctx.lineWidth = 4
  ctx.beginPath()
  pts.forEach((p, i) => { const [x, y] = at(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
  ctx.stroke()
  ctx.strokeStyle = theme.ink
  ctx.lineWidth = 2
  ctx.setLineDash([7, 4])
  ctx.stroke()
  ctx.setLineDash([])
  for (const p of m.points) {
    const [x, y] = at(p)
    ctx.beginPath()
    ctx.arc(x, y, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = theme.ink
    ctx.fill()
    ctx.strokeStyle = theme.halo
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  if (pts.length > 1) {
    const [x, y] = at(pts[pts.length - 1])
    ctx.font = `600 ${FONT_PX}px ${theme.font}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const w = ctx.measureText(m.text).width + 12
    // The plate is at the right of the end of the path, or at its left when it would run off the canvas.
    const px = x + 10 + w > canvasWidth - 4 ? Math.max(4, x - 10 - w) : x + 10
    plate(ctx, px, y - 22, w, 20, theme)
    ctx.fillStyle = theme.ink
    ctx.fillText(m.text, px + 6, y - 12)
  }
  ctx.restore()
}
