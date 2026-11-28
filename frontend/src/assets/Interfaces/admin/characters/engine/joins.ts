import type { ModelContent, ModelGroup, ModelShape } from '../../../../../api/types'
import { apply } from './geometry'
import type { PaintItem } from './paint'
import type { Solved } from './rig'

// Joins (slice 9c). While a model's joins are on, the shapes of a join set are drawn as one outline round them: the set's outline is painted once, under its lowest shape, as
// every member's outline at twice its width, and each member's own outline is left out. Every member's fill then covers the inner half of that outline wherever the parts
// overlap, so only the outside of the set shows a line, however the parts are posed. A joint cap is a circle at a group's pivot, as wide as the limb there (times its
// size), painted like the group's lowest shape and drawn in that shape's set, so a limb turned a long way shows no notch at the joint.

const shapeById = (c: ModelContent, id: string | null | undefined): ModelShape | undefined => (id ? c.shapes.find(s => s.id === id) : undefined)
const groupById = (c: ModelContent, id: string | null | undefined): ModelGroup | undefined => (id ? c.groups.find(g => g.id === id) : undefined)

// The shape a shape takes its joins from: its own, else its original's (a twin, a clone, a member that follows the pattern).
function joinSource(c: ModelContent, s: ModelShape): ModelShape {
  if (s.join !== undefined || s.joinBack !== undefined) return s
  const from = shapeById(c, s.mirrorOf) ?? shapeById(c, s.cloneOf) ?? (s.pts.length < 3 ? shapeById(c, s.copyOf) : undefined)
  return from ?? s
}
// The join set a shape is drawn in (null: none), seen from the front or from behind.
export function joinOf(c: ModelContent, s: ModelShape, behind = false): string | null {
  const src = joinSource(c, s)
  if (behind && typeof src.joinBack === 'string') return src.joinBack.trim() || null
  return src.join?.trim() || null
}
// A group's joint cap (a twin group's is its original's), or null.
export const capOf = (c: ModelContent, g: ModelGroup): number | null => g.cap ?? groupById(c, g.mirrorOf)?.cap ?? null
// The join sets the model has, with how many shapes are in each (from the front).
export function joinSets(c: ModelContent): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const s of c.shapes) { const k = joinOf(c, s); if (k) counts.set(k, (counts.get(k) ?? 0) + 1) }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
}

const slug = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_')
const r2 = (v: number) => Math.round(v * 100) / 100
const circle = (cx: number, cy: number, r: number) => `M${r2(cx - r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx + r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx - r)} ${r2(cy)}Z`
function segDist(px: number, py: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0
  return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t))
}
// How far a ray from (px, py) along (dx, dy) runs before it leaves the outlines (Infinity: it meets none of their edges).
function rayHit(px: number, py: number, dx: number, dy: number, polys: Array<Array<[number, number]>>): number {
  let best = Infinity
  for (const poly of polys) {
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex
      if (Math.abs(den) < 1e-12) continue
      const t = ((a[0] - px) * ey - (a[1] - py) * ex) / den, u = ((a[0] - px) * dy - (a[1] - py) * dx) / den
      if (t > 1e-9 && u >= 0 && u <= 1) best = Math.min(best, t)
    }
  }
  return best
}
// Half the limb's width at a joint: half its shortest chord through the pivot (across a limb, not along it, so its rounded end does not shorten it); with the pivot
// outside the outlines, the distance to the nearest edge.
export function halfWidthAt(px: number, py: number, polys: Array<Array<[number, number]>>): number {
  let chord = Infinity
  for (let a = 0; a < 180; a += 5) {
    const t = (a * Math.PI) / 180, dx = Math.cos(t), dy = Math.sin(t)
    chord = Math.min(chord, rayHit(px, py, dx, dy, polys) + rayHit(px, py, -dx, -dy, polys))
  }
  if (Number.isFinite(chord)) return chord / 2
  let near = Infinity
  for (const poly of polys) for (let k = 0; k < poly.length; k++) near = Math.min(near, segDist(px, py, poly[k], poly[(k + 1) % poly.length]))
  return near
}

const drawn = (i: PaintItem) => !i.helper && !i.shading && !i.cast && !i.blank && !i.role

// The items with the joins drawn in: each set's outline before its lowest member, the joint caps before their group's lowest member, and the members without outlines.
export function joinItems(c: ModelContent, solved: Solved, items: PaintItem[]): PaintItem[] {
  if (!c.joins) return items
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  const keyOf = new Map<string, string>()
  for (const i of items) {
    const s = shapes.get(i.id)
    if (!s || !drawn(i)) continue
    const k = joinOf(c, s, !!solved.behind)
    if (k) keyOf.set(i.id, k)
  }
  if (keyOf.size === 0) return items
  const at = new Map(items.map((i, k) => [i.id, k]))
  const before = new Map<number, PaintItem[]>()
  const put = (k: number, item: PaintItem) => before.set(k, [...(before.get(k) ?? []), item])

  // the joint caps: at the pivot, as wide as the limb there (the group's own shapes in a set)
  const caps = new Map<string, PaintItem[]>()
  for (const g of c.groups) {
    const size = capOf(c, g), pivot = solved.pivots[g.id]
    if (!size || !pivot) continue
    const own = g.objects.flatMap(oid => c.objects.find(o => o.id === oid)?.shapes ?? []).filter(id => keyOf.has(id) && at.has(id)).sort((a, b) => at.get(a)! - at.get(b)!)
    if (own.length === 0) continue
    const [px, py] = apply(solved.global, pivot[0], pivot[1])
    const near = halfWidthAt(px, py, own.map(id => solved.shapes[id]?.poly ?? []).filter(poly => poly.length >= 3))
    if (!Number.isFinite(near) || near <= 0.05) continue
    const first = items[at.get(own[0])!], key = keyOf.get(own[0])!
    const cap: PaintItem = {
      id: `cap-${slug(g.id)}`, d: circle(px, py, near * size), fill: first.fill, opacity: first.opacity, gradient: null, blend: null, clipD: null, compDs: [], cutDs: [],
      helper: false, shading: false, line: null, wear: first.wear, blank: false, role: 'cap',
    }
    put(at.get(own[0])!, cap)
    caps.set(key, [...(caps.get(key) ?? []), cap])
  }

  // each set's outline, before its lowest member: every member's (and cap's) outline at twice the widest member outline, the fill not painted
  const sets = new Map<string, string[]>()
  for (const [id, k] of keyOf) sets.set(k, [...(sets.get(k) ?? []), id])
  for (const [key, ids] of sets) {
    const lined = ids.map(id => items[at.get(id)!]).filter(i => i.line)
    if (lined.length === 0) continue
    const w = Math.max(...lined.map(i => i.line!.w)), alpha = Math.max(...lined.map(i => i.line!.alpha))
    const ds = [...ids.map(id => items[at.get(id)!].d), ...(caps.get(key) ?? []).map(cp => cp.d)]
    const first = Math.min(...ids.map(id => at.get(id)!))
    const halo: PaintItem = {
      id: `join-${slug(key)}`, d: ds.join(' '), fill: '#000000', opacity: 0, gradient: null, blend: null, clipD: null, compDs: [], cutDs: [], helper: false, shading: false,
      line: { w: r2(2 * w), alpha }, wear: null, blank: false, role: 'halo',
    }
    before.set(first, [halo, ...(before.get(first) ?? [])])
  }

  const out: PaintItem[] = []
  items.forEach((item, k) => {
    out.push(...(before.get(k) ?? []))
    if (keyOf.has(item.id) && item.line) { const { lineD: _l, ...rest } = item; out.push({ ...rest, line: null }) } else out.push(item)
  })
  return out
}
