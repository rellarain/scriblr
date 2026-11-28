import type { ModelBind, ModelContent, ModelDrive, ModelPoint, ModelRange } from '../../../../../api/types'

// Body keys (slice 9f). A shape may carry body keys: for each key, how far each of its points moves at the key's full amount. A body slider has a morph drive that moves
// every shape with its key by a share of it (atMin..atMax, in percent of the key), and may be scaled by another slider (`by`: the fat a heavier body carries goes to the
// hips the more feminine the body is). The body templates carry keys built from the measured bodies. A twin moves as its original does. Pure.
//
// The solver draws a body with its sliders moved from the body baked in (`bodied`): every keyed point moved, its outlines at key angles too (by the key's own moves
// there, `fem.a90` for the side view, else only as far up or down as the front moves: a broader body is no deeper), its own outline for the back with the front, and
// everything else that has a place (the groups' pivots, the joints' turning points, the marks, the grip points, the proportion guide) moved as the points
// nearest it move, so a taller body bends at its new knees and a broader one turns at its new shoulders.

export type Morph = Array<[number, number]>

// After an edit: a shape whose number of points changed keeps its body keys in step. A point still where it was keeps its moves; a point put in moves halfway between the
// points kept before and after it; a point taken away takes its moves with it.
export function alignMorphs(before: ModelContent, after: ModelContent): ModelContent {
  const old = new Map(before.shapes.map(s => [s.id, s]))
  let changed = false
  const shapes = after.shapes.map(s => {
    const prev = old.get(s.id), keys = s.morphs
    if (!keys || !prev || prev.pts.length === s.pts.length || prev.morphs !== keys) return s
    changed = true
    const next: Record<string, Morph> = {}
    for (const [k, moves] of Object.entries(keys)) {
      const aligned = alignKey(moves, prev.pts, s.pts, s.closed)
      if (aligned) next[k] = aligned
    }
    return { ...s, morphs: Object.keys(next).length ? next : null }
  })
  return changed ? { ...after, shapes } : after
}

function alignKey(moves: Morph, prev: ModelPoint[], next: ModelPoint[], closed: boolean): Morph | null {
  if (moves.length !== prev.length || next.length === 0) return null
  const kept: Array<[number, number] | null> = next.map(p => {
    const same = prev.findIndex(q => q === p || (q.x === p.x && q.y === p.y))
    return same >= 0 ? moves[same] : null
  })
  if (kept.every(m => m === null)) return null
  const n = next.length
  const find = (i: number, step: 1 | -1): [number, number] | null => {
    for (let k = 1; k < n; k++) {
      const j = i + step * k
      if (!closed && (j < 0 || j >= n)) return null
      const m = kept[((j % n) + n) % n]
      if (m) return m
    }
    return null
  }
  return kept.map((m, i) => {
    if (m) return m
    const a = find(i, -1), b = find(i, 1), x = a ?? b!, y = b ?? a!
    return [Math.round(((x[0] + y[0]) / 2) * 100) / 100, Math.round(((x[1] + y[1]) / 2) * 100) / 100]
  })
}

// The body keys the shapes of a model carry, each once, in the order they are first met (a key's own moves at an angle, `fem.a90`, are part of the key).
export function morphKeys(c: ModelContent): string[] {
  const out: string[] = []
  for (const s of c.shapes) for (const k of Object.keys(s.morphs ?? {})) if (!/\.a\d+$/.test(k) && !out.includes(k)) out.push(k)
  return out
}

// How much of each body key the sliders come to now: for each key, the sum of its morph drives' shares (none when every body slider is at rest).
export function keyShares(c: ModelContent, values: Record<string, number>): Map<string, number> {
  const ranges = c.ranges ?? [], byId = new Map(ranges.map(r => [r.id, r]))
  const valueOf = (r: ModelRange) => { const v = values[r.id]; return Math.min(r.max, Math.max(r.min, Number.isFinite(v) ? v : r.rest)) }
  const byFactor = (d: ModelDrive): number => {
    if (!d.by) return 1
    const o = byId.get(d.by.range)
    return !o || d.by.at === 0 ? 0 : valueOf(o) / d.by.at
  }
  const out = new Map<string, number>()
  for (const r of ranges) {
    if (!r.drives.some(d => d.kind === 'morph')) continue
    const v = valueOf(r), up = v >= r.rest, span = up ? r.max - r.rest : r.rest - r.min
    const t = span > 0 ? Math.abs(v - r.rest) / span : 0
    for (const d of r.drives) {
      if (d.kind !== 'morph' || !d.id) continue
      const k = (((up ? d.atMax : d.atMin) / 100) * t) * byFactor(d)
      if (k !== 0) out.set(d.id, (out.get(d.id) ?? 0) + k)
    }
  }
  return out
}

// A field of moves read off the keyed points: at any place, the moves of the nearest points, the nearer the more (a twin's side is the mirror image of its original's).
const NEAREST = 6
type Seed = { x: number; y: number; dx: number; dy: number }
function fieldOf(seeds: Seed[]): (x: number, y: number) => [number, number] {
  return (x, y) => {
    if (!seeds.length) return [0, 0]
    const near: Array<{ d: number; dx: number; dy: number }> = []
    for (const s of seeds) {
      const d = (s.x - x) ** 2 + (s.y - y) ** 2
      if (near.length < NEAREST || d < near[near.length - 1].d) {
        near.push({ d, dx: s.dx, dy: s.dy })
        near.sort((a, b) => a.d - b.d)
        if (near.length > NEAREST) near.pop()
      }
    }
    let w = 0, dx = 0, dy = 0
    for (const n of near) { const k = 1 / (n.d + 1); w += k; dx += n.dx * k; dy += n.dy * k }
    return [dx / w, dy / w]
  }
}

// The model with its body sliders' keys baked in (the same model when the model has no body keys), its morph drives taken away (what they do is in the points now).
// Cached for the last few slider settings of each model.
const baked = new WeakMap<ModelContent, Map<string, ModelContent>>()
export function bodied(c: ModelContent, values: Record<string, number>): ModelContent {
  if (!(c.ranges ?? []).some(r => r.drives.some(d => d.kind === 'morph'))) return c
  const shares = keyShares(c, values)
  // every body slider at rest: the model itself (the morph drives do nothing in the solver, so its caches keep working)
  if (!shares.size) return c
  const sig =[...shares].map(([k, v]) => `${k}:${v.toFixed(5)}`).join(',')
  let hit = baked.get(c)
  const known = hit?.get(sig)
  if (known) return known
  const made = bake(c, shares)
  if (!hit) { hit = new Map(); baked.set(c, hit) }
  if (hit.size >= 6) hit.delete(hit.keys().next().value!)
  hit.set(sig, made)
  return made
}

function bake(c: ModelContent, shares: Map<string, number>): ModelContent {
  const ranges = c.ranges.map(r => (r.drives.some(d => d.kind === 'morph') ? { ...r, drives: r.drives.filter(d => d.kind !== 'morph') } : r))
  const axis = c.axis ?? 100
  // each keyed shape's moves, point by point
  const moves = new Map<string, Array<[number, number]>>()
  for (const s of c.shapes) {
    if (!s.morphs || s.mirrorOf) continue
    let any = false
    const m = s.pts.map((): [number, number] => [0, 0])
    for (const [k, share] of shares) {
      const key = s.morphs[k]
      if (!key || key.length !== s.pts.length) continue
      any = true
      key.forEach(([dx, dy], i) => { m[i][0] += dx * share; m[i][1] += dy * share })
    }
    if (any) moves.set(s.id, m)
  }
  if (!moves.size) return { ...c, ranges }
  // the moves of a shape's outline at an angle: each key's own moves there, else the front's up and down only
  const movesAt = (sId: string, at: number, n: number): Array<[number, number]> | undefined => {
    const s = c.shapes.find(x => x.id === sId)
    if (!s?.morphs) return undefined
    const m = Array.from({ length: n }, (): [number, number] => [0, 0])
    for (const [k, share] of shares) {
      const key = s.morphs[k]
      if (!key || key.length !== n) continue
      const there = s.morphs[`${k}.a${at}`]
      key.forEach(([, dy], i) => { const d = there && there.length === n ? there[i] : [0, dy]; m[i][0] += d[0] * share; m[i][1] += d[1] * share })
    }
    return m
  }
  const twinned = new Set(c.shapes.filter(s => s.mirrorOf).map(s => s.mirrorOf!))
  const seeds: Seed[] = []
  for (const s of c.shapes) {
    const m = moves.get(s.id)
    if (!m) continue
    s.pts.forEach((p, i) => {
      seeds.push({ x: p.x, y: p.y, dx: m[i][0], dy: m[i][1] })
      if (twinned.has(s.id)) seeds.push({ x: 2 * axis - p.x, y: p.y, dx: -m[i][0], dy: m[i][1] })
    })
  }
  const field = fieldOf(seeds)
  const at = (p: [number, number]): [number, number] => { const [dx, dy] = field(p[0], p[1]); return [p[0] + dx, p[1] + dy] }
  const moveBind = (b: ModelBind): ModelBind => {
    const j = b.pivot!
    return { ...b, pivot: { ...j, ...(j.at ? { at: at(j.at) } : {}), ...(j.follow?.at ? { follow: { ...j.follow, at: at(j.follow.at) } } : {}) } }
  }
  const shift = (list: ModelPoint[], m: Array<[number, number]> | undefined): ModelPoint[] =>
    (m && list.length === m.length ? list.map((p, i) => ({ ...p, x: p.x + m[i][0], y: p.y + m[i][1] })) : list)
  const shapes = c.shapes.map(s => {
    const m = moves.get(s.id)
    const pts = shift(s.pts, m).map(p => (p.bind?.pivot ? { ...p, bind: moveBind(p.bind) } : p))
    const marks = s.marks?.map(k => {
      if (k.i !== null && m?.[k.i]) return { ...k, x: k.x + m[k.i][0], y: k.y + m[k.i][1] }
      const [x, y] = at([k.x, k.y])
      return { ...k, x, y }
    })
    const turn = s.turn && m ? { ...s.turn, angles: s.turn.angles.map(a => ({ ...a, pts: shift(a.pts, movesAt(s.id, a.at, a.pts.length)) })) } : s.turn
    return { ...s, pts, ...(s.back ? { back: shift(s.back, m) } : {}), ...(marks ? { marks } : {}), ...(turn !== s.turn ? { turn } : {}) }
  })
  const groups = c.groups.map(g => (g.pivot ? { ...g, pivot: at(g.pivot) } : g))
  const grips = c.grips?.map(g => { const [x, y] = at([g.x, g.y]); return { ...g, x, y } })
  const guide = c.guide ? { ...c.guide, top: at([axis, c.guide.top])[1], lines: c.guide.lines.map(l => ({ ...l, y: at([axis, l.y])[1] })) } : c.guide
  return { ...c, ranges, shapes, groups, ...(grips ? { grips } : {}), ...(c.guide !== undefined ? { guide } : {}) }
}
