import type { ModelShape } from '../../../../../api/types'
import { boxOf, build, flatten, pathText, type Box } from './geometry'

// Shapes as SVG text and boxes, for the canvas, the thumbnails and the preview strip. No NaN ever reaches the markup: a shape with fewer than
// three points has no path.

export function shapePath(shape: Pick<ModelShape, 'pts' | 'closed'>): string {
  return shape.pts.length >= 3 ? pathText(build(shape.pts, shape.closed), shape.closed) : ''
}

export function shapeBox(shape: Pick<ModelShape, 'pts' | 'closed'>): Box | null {
  if (shape.pts.length < 3) return null
  return boxOf(flatten(build(shape.pts, shape.closed), shape.closed))
}

// The box around several shapes, or null when none has an outline.
export function shapesBox(shapes: Array<Pick<ModelShape, 'pts' | 'closed'>>): Box | null {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false
  for (const s of shapes) {
    const b = shapeBox(s)
    if (!b) continue
    any = true
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
  }
  return any ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

// A viewBox that holds a box with some room around it, in a given aspect (width / height).
export function viewBoxFor(box: Box | null, pad = 6, aspect = 1): string {
  const b = box ?? { x: 60, y: 20, w: 80, h: 80 }
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  let w = Math.max(b.w + pad * 2, 12), h = Math.max(b.h + pad * 2, 12)
  if (w / h < aspect) w = h * aspect
  else h = w / aspect
  const r = (v: number) => Math.round(v * 100) / 100
  return `${r(cx - w / 2)} ${r(cy - h / 2)} ${r(w)} ${r(h)}`
}
