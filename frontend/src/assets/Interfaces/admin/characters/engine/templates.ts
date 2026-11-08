import type { ModelPoint, ModelPointMode } from '../../../../../api/types'
import { r2, type Box } from './geometry'

// Template shapes: point lists in a -1..1 square, stretched to the box they are placed in. A template is only a start: once placed, a shape is
// freeform and every point can be moved, added, deleted and given another mode. (The user's list: square, circle, hexagon, trapezoid, teardrop,
// line, rectangle, path, and the extras: oval, rounded rectangle, triangle, diamond, crescent, leaf, heart, arc, star, wave, blob, and a line
// with a width at each point, saved as a filled shape.)
type Raw = Array<[number, number] | [number, number, ModelPointMode]>

export interface Template { id: string; name: string; pts: Raw; aspect: number }

const star = (): Raw => {
  const o: Raw = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.45 : 1
    o.push([Math.cos(a) * r, Math.sin(a) * r, 's'])
  }
  return o
}
const wave = (): Raw => {
  // a strip whose top edge undulates: curve points along both edges
  const top: Raw = [], bottom: Raw = []
  for (let i = 0; i < 5; i++) {
    const x = -1 + i * 0.5
    top.push([x, -0.35 + (i % 2 ? 0.25 : -0.25)])
    bottom.unshift([x, 0.35 + (i % 2 ? 0.25 : -0.25)])
  }
  return top.concat(bottom)
}

export const TEMPLATES: Template[] = [
  { id: 'circle', name: 'Circle', aspect: 1, pts: [[0, -1], [1, 0], [0, 1], [-1, 0]] },
  { id: 'oval', name: 'Oval', aspect: 1, pts: [[0, -1], [0.78, 0], [0, 1], [-0.78, 0]] },
  { id: 'square', name: 'Square', aspect: 1, pts: [[-1, -1, 's'], [1, -1, 's'], [1, 1, 's'], [-1, 1, 's']] },
  { id: 'rectangle', name: 'Rectangle', aspect: 0.5, pts: [[-1, -1, 's'], [1, -1, 's'], [1, 1, 's'], [-1, 1, 's']] },
  { id: 'rounded', name: 'Rounded rectangle', aspect: 1, pts: [[-0.55, -1, 'cs'], [0.55, -1, 'sc'], [1, -0.55, 'cs'], [1, 0.55, 'sc'], [0.55, 1, 'cs'], [-0.55, 1, 'sc'], [-1, 0.55, 'cs'], [-1, -0.55, 'sc']] },
  { id: 'hexagon', name: 'Hexagon', aspect: 1, pts: [[0, -1, 's'], [0.87, -0.5, 's'], [0.87, 0.5, 's'], [0, 1, 's'], [-0.87, 0.5, 's'], [-0.87, -0.5, 's']] },
  { id: 'trapezoid', name: 'Trapezoid', aspect: 1, pts: [[-0.55, -1, 's'], [0.55, -1, 's'], [1, 1, 's'], [-1, 1, 's']] },
  { id: 'triangle', name: 'Triangle', aspect: 1, pts: [[0, -1, 's'], [1, 0.9, 's'], [-1, 0.9, 's']] },
  { id: 'diamond', name: 'Diamond', aspect: 1, pts: [[0, -1, 's'], [0.8, 0, 's'], [0, 1, 's'], [-0.8, 0, 's']] },
  { id: 'teardrop', name: 'Teardrop', aspect: 1, pts: [[0, -1, 's'], [0.8, 0.3], [0, 1], [-0.8, 0.3]] },
  { id: 'leaf', name: 'Leaf', aspect: 1, pts: [[0, -1, 's'], [0.7, 0], [0, 1, 's'], [-0.7, 0]] },
  { id: 'heart', name: 'Heart', aspect: 1, pts: [[0, -0.45, 's'], [0.5, -0.95], [1, -0.4], [0, 1, 's'], [-1, -0.4], [-0.5, -0.95]] },
  { id: 'star', name: 'Star', aspect: 1, pts: star() },
  { id: 'crescent', name: 'Crescent', aspect: 1, pts: [[0.3, -1, 's'], [-0.9, 0], [0.3, 1, 's'], [-0.2, 0]] },
  { id: 'arc', name: 'Arc', aspect: 1, pts: [[-1, 0.6, 's'], [-0.7, -0.5], [0, -0.95], [0.7, -0.5], [1, 0.6, 's'], [0.6, 0.55], [0, 0.1], [-0.6, 0.55]] },
  { id: 'wave', name: 'Wave', aspect: 0.5, pts: wave() },
  { id: 'blob', name: 'Blob', aspect: 1, pts: [[0, -0.9], [0.8, -0.55], [1, 0.1], [0.5, 0.9], [-0.3, 1], [-0.95, 0.3], [-0.8, -0.5]] },
  { id: 'line', name: 'Line', aspect: 0.12, pts: [[-1, -1, 's'], [1, -1, 's'], [1, 1, 's'], [-1, 1, 's']] },
  { id: 'tapered', name: 'Tapered line', aspect: 0.3, pts: [[-1, 0, 's'], [-0.5, -0.2], [0.5, -0.12], [1, 0, 's'], [0.5, 0.12], [-0.5, 0.2]] },
  { id: 'path', name: 'Path (freeform)', aspect: 1, pts: [[-1, -0.6, 's'], [0.2, -1, 's'], [1, 0.1, 's'], [-0.3, 1, 's']] },
]

export const TEMPLATE_IDS = TEMPLATES.map(t => t.id)

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find(t => t.id === id)
}

// The points of a template stretched to fill a box (a box smaller than six units is widened, so a template is never a dot).
export function templatePoints(id: string, box: Box): ModelPoint[] {
  const t = templateById(id)
  if (!t) return []
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, hw = Math.max(box.w, 6) / 2, hh = Math.max(box.h, 6) / 2
  return t.pts.map(a => ({ x: r2(cx + a[0] * hw), y: r2(cy + a[1] * hh), m: (a[2] ?? 'c') as ModelPointMode, hi: null, ho: null }))
}

// A box of the template's own proportions, `size` units across (or tall, for a tall one), centred on (cx, cy).
export function templateBox(id: string, cx: number, cy: number, size = 40): Box {
  const aspect = templateById(id)?.aspect ?? 1
  const w = aspect <= 1 ? size : size / aspect, h = Math.max(6, aspect <= 1 ? size * aspect : size)
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}
