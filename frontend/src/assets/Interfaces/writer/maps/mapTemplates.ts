import type { MapShapePoint } from '../../../../api/types'
import type { Rect } from './mapShapes'

// Template shapes: a circle, an ellipse, a rectangle, a polygon of 3 to 12 sides, a blob (seeded: the same seed, the same blob) and a ridge (a long, narrow
// outline with a jagged crest, for a mountain range), each made to fill a box on the map, then edited point by point like any shape.

export type MapTemplate = 'circle' | 'ellipse' | 'rectangle' | 'polygon' | 'blob' | 'ridge'
export const TEMPLATES: Array<{ id: MapTemplate; name: string; title: string }> = [
  { id: 'circle', name: 'Circle', title: 'A circle in the box (as wide as its shorter side)' },
  { id: 'ellipse', name: 'Ellipse', title: 'An ellipse that fills the box' },
  { id: 'rectangle', name: 'Rectangle', title: 'A rectangle: the box itself' },
  { id: 'polygon', name: 'Polygon', title: 'A polygon with as many sides as chosen, in the box' },
  { id: 'blob', name: 'Blob', title: 'A rounded blob, a little different each time' },
  { id: 'ridge', name: 'Ridge', title: 'A long, narrow shape with a jagged crest, along the longer side of the box' },
]
export const POLYGON_SIDES = { min: 3, max: 12 } as const

const corner = (x: number, y: number): MapShapePoint => ({ x, y, smooth: false, hx: null, hy: null })
const curve = (x: number, y: number): MapShapePoint => ({ x, y, smooth: true, hx: null, hy: null })

// A small seeded random number source (0..1).
export function seededRandom(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

// The points of a template that fills a box (in cells), clockwise from the top.
export function templatePoints(template: MapTemplate, box: Rect, opts: { sides?: number; seed?: number } = {}): MapShapePoint[] {
  const w = Math.max(0.01, box.x1 - box.x0), h = Math.max(0.01, box.y1 - box.y0)
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2
  const round = (n: number) => Math.round(n * 1000) / 1000
  const at = (rx: number, ry: number, a: number, make: typeof curve) => make(round(cx + rx * Math.sin(a)), round(cy - ry * Math.cos(a)))
  switch (template) {
    case 'rectangle':
      return [corner(box.x0, box.y0), corner(box.x1, box.y0), corner(box.x1, box.y1), corner(box.x0, box.y1)]
    case 'circle': {
      const r = Math.min(w, h) / 2
      return Array.from({ length: 8 }, (_, i) => at(r, r, (i / 8) * Math.PI * 2, curve))
    }
    case 'ellipse':
      return Array.from({ length: 8 }, (_, i) => at(w / 2, h / 2, (i / 8) * Math.PI * 2, curve))
    case 'polygon': {
      const n = Math.round(Math.min(POLYGON_SIDES.max, Math.max(POLYGON_SIDES.min, opts.sides ?? 6)))
      return Array.from({ length: n }, (_, i) => at(w / 2, h / 2, (i / n) * Math.PI * 2, corner))
    }
    case 'blob': {
      const rand = seededRandom(opts.seed ?? 1)
      const n = 9
      return Array.from({ length: n }, (_, i) => {
        const k = 0.72 + rand() * 0.28
        return at((w / 2) * k, (h / 2) * k, ((i + (rand() - 0.5) * 0.4) / n) * Math.PI * 2, curve)
      })
    }
    case 'ridge': {
      // Along the longer side: a crest of peaks on one side and a smoother foot on the other, coming to points at both ends.
      const rand = seededRandom(opts.seed ?? 7)
      const along = w >= h
      const len = along ? w : h, depth = along ? h : w
      const n = Math.max(4, Math.min(14, Math.round(len / Math.max(0.5, depth * 0.6))))
      const top: MapShapePoint[] = [], foot: MapShapePoint[] = []
      for (let i = 0; i <= n; i += 1) {
        const t = i / n
        const swell = Math.sin(t * Math.PI)
        const crest = (0.5 - swell * (i % 2 === 0 ? 0.5 : 0.28 + rand() * 0.12)) * depth
        const base = (0.5 + swell * 0.42) * depth
        const pt = (u: number, v: number, make: typeof curve) => (along ? make(round(box.x0 + u), round(box.y0 + v)) : make(round(box.x0 + depth - v), round(box.y0 + u)))
        if (i > 0 && i < n) { top.push(pt(t * len, crest, corner)); foot.push(pt(t * len, base, curve)) }
        else top.push(pt(t * len, depth / 2, corner))
      }
      return [...top, ...foot.reverse()]
    }
  }
}

// A box from two points (in either order); with `square` it is as wide as it is tall, growing from the first point.
export function boxFrom(a: [number, number], b: [number, number], square = false): Rect {
  let [x1, y1] = b
  if (square) {
    const d = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
    x1 = a[0] + Math.sign(b[0] - a[0] || 1) * d
    y1 = a[1] + Math.sign(b[1] - a[1] || 1) * d
  }
  return { x0: Math.min(a[0], x1), y0: Math.min(a[1], y1), x1: Math.max(a[0], x1), y1: Math.max(a[1], y1) }
}
