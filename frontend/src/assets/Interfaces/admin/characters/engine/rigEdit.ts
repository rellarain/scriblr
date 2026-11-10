import type { ModelAnchorKind, ModelAttach, ModelContent, ModelDrive, ModelGroup, ModelMove, ModelRange, ModelScaleAxis, ModelShape } from '../../../../../api/types'
import { boxOf, build, clamp, flatten, inverse, apply, r2 } from './geometry'
import { LIMITS } from './limits'
import { anchorFrom, chainDepth, chainOf, defaultValues, descendantsOf, restPivot, solveAtRest, subtreeHeight, type Solved } from './rig'

// The pure operations the Rig and Ranges tabs make on a model's content: hanging groups from each other, fixing them to a shape, setting pivots, and
// making sliders and what they drive. Each returns new content (or why it cannot), and leaves the content it was given alone.

export type Edit = { ok: true; content: ModelContent; note?: string } | { ok: false; reason: string }
export const fail = (reason: string): Edit => ({ ok: false, reason })
export const done = (content: ModelContent, note?: string): Edit => ({ ok: true, content, note })
const label = (name: string, id: string) => name || id

const mapGroup = (c: ModelContent, id: string, change: (g: ModelGroup) => ModelGroup): ModelContent => ({ ...c, groups: c.groups.map(g => (g.id === id ? change(g) : g)) })
const mapRange = (c: ModelContent, id: string, change: (r: ModelRange) => ModelRange): ModelContent => ({ ...c, ranges: c.ranges.map(r => (r.id === id ? change(r) : r)) })

// ---- pivots and the rig tree ----

export function setPivot(c: ModelContent, groupId: string, x: number, y: number): ModelContent {
  return mapGroup(c, groupId, g => ({ ...g, pivot: [r2(clamp(x, -50, 250)), r2(clamp(y, -50, 450))] }))
}

// A group that is about to turn needs a pivot: the middle of its shapes, when it has none yet.
export function ensurePivot(c: ModelContent, groupId: string): ModelContent {
  const g = c.groups.find(x => x.id === groupId)
  if (!g || g.pivot) return c
  const [x, y] = restPivot(c, g)
  return setPivot(c, groupId, x, y)
}

// Hang a group from another (or from nothing). Refused when it would make a circle, or a chain of pivots longer than the limit; its anchor is dropped when
// the shape it was fixed to is no longer in its parent or above.
export function reparent(c: ModelContent, groupId: string, parentId: string | null): Edit {
  const g = c.groups.find(x => x.id === groupId)
  if (!g) return fail('There is no such group.')
  if (parentId === g.parent) return done(c)
  if (parentId !== null) {
    if (!c.groups.some(x => x.id === parentId)) return fail('There is no such parent group.')
    if (parentId === groupId) return fail('A group cannot hang from itself.')
    if (descendantsOf(c, groupId).has(parentId)) return fail('A group cannot hang from one of its own children.')
    const depth = chainDepth(c, parentId) + subtreeHeight(c, groupId)
    if (depth > LIMITS.chainMax) return fail(`That would make a pivot chain ${depth} groups long; the most is ${LIMITS.chainMax}.`)
  }
  let note: string | undefined
  const next = mapGroup(c, groupId, x => {
    let attach = x.attach
    if (attach) {
      const home = groupOfShape(c, attach.shape)
      if (parentId === null || !home || !chainOf(c, parentId).includes(home)) { attach = null; note = 'Its anchor was removed: the shape it was fixed to is not in the new parent or above it.' }
    }
    return { ...x, parent: parentId, attach }
  })
  return done(next, note)
}

export function groupOfShape(c: ModelContent, shapeId: string): string | undefined {
  const object = c.objects.find(o => o.shapes.includes(shapeId))
  return object ? c.groups.find(g => g.objects.includes(object.id))?.id : undefined
}

// Fix a group to a shape of its parent (or above): the pivot moves onto the anchor, so the group does not jump. Refused when the shape is not there, or
// is not in an ancestor group, or the anchor cannot be found.
export function attachGroup(c: ModelContent, groupId: string, att: ModelAttach): Edit {
  const g = c.groups.find(x => x.id === groupId)
  if (!g) return fail('There is no such group.')
  if (g.mirrorOf) return fail('A twin follows its original, so it has no anchor of its own. Break the pair to anchor it.')
  if (g.parent === null) return fail('Hang the group from a parent first: it is fixed to one of the parent\'s shapes.')
  const shape = c.shapes.find(s => s.id === att.shape)
  if (!shape) return fail('That shape does not exist.')
  const home = groupOfShape(c, att.shape)
  if (!home || !chainOf(c, g.parent).includes(home)) return fail('Pick a shape of the parent group, or of a group above it.')
  if (att.kind === 'range' && !(att.slider && c.ranges.some(r => r.id === att.slider))) return fail('Make a slider for the anchor to slide with first.')
  const probe = { ...c, groups: c.groups.map(x => (x.id === groupId ? { ...x, attach: null } : x)) }
  const rest = solveAtRest(probe)
  const an = anchorFrom(probe, rest.shapes, att, defaultValues(probe))
  if (!an) return fail('That place on the shape cannot be found.')
  const pm = rest.mats[g.parent]
  const pivot = pm ? apply(inverse(pm), an[0], an[1]) : an
  return done(mapGroup(c, groupId, x => ({ ...x, attach: att, pivot: [r2(pivot[0]), r2(pivot[1])] })))
}

// An anchor from a click on the canvas: the point nearest the click, the spot along the nearest edge, or the click's relative place inside the shape, read
// from the shape as it is solved now (the click is in canvas space, so the whole-model transform is undone first).
export function attachFromClick(solved: Solved, kind: ModelAnchorKind, shapeId: string, wx: number, wy: number, slider: string | null = null): ModelAttach | null {
  const a = solved.shapes[shapeId]?.pre
  if (!a || a.length < 3) return null
  const [x, y] = apply(inverse(solved.global), wx, wy), n = a.length
  const base = { shape: shapeId, kind, i: 0, t: 0, slider: kind === 'range' ? slider : null, rx: 0.5, ry: 0.5 }
  if (kind === 'point') {
    let best = 0, bd = Infinity
    a.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i } })
    return { ...base, i: best }
  }
  if (kind === 'edge' || kind === 'range') {
    let best = { i: 0, t: 0, d: Infinity }
    for (let e = 0; e < n; e++) {
      const p = a[e], q = a[(e + 1) % n], dx = q.x - p.x, dy = q.y - p.y, len2 = dx * dx + dy * dy
      const t = len2 > 0 ? clamp(((x - p.x) * dx + (y - p.y) * dy) / len2, 0, 1) : 0
      const d = Math.hypot(p.x + dx * t - x, p.y + dy * t - y)
      if (d < best.d) best = { i: e, t, d }
    }
    return { ...base, i: best.i, t: r2(best.t) }
  }
  // inside: the click's relative place in the shape's own box (the same measure the anchor is read with)
  const own = solved.shapes[shapeId], [lx, ly] = own.rig.length >= 3 ? apply(inverse(own.frame), x, y) : [x, y]
  const bb = boxOf((own.rig.length >= 3 ? own.rig : a).map((p): [number, number] => [p.x, p.y]))
  return { ...base, rx: r2(clamp(bb.w > 0 ? (lx - bb.x) / bb.w : 0.5, 0, 1)), ry: r2(clamp(bb.h > 0 ? (ly - bb.y) / bb.h : 0.5, 0, 1)) }
}

export const detachGroup = (c: ModelContent, groupId: string): ModelContent => mapGroup(c, groupId, g => ({ ...g, attach: null }))

export function setAxis(c: ModelContent, x: number): ModelContent {
  return { ...c, axis: r2(clamp(Number.isFinite(x) ? x : 100, 40, 160)) }
}

// ---- sliders ----

export type DriveKindPreset = 'turn' | 'scale' | 'points' | 'bend' | 'length' | 'fall'
// A new slider with a sensible span for the first thing it will drive.
export function newRange(id: string, name: string, kind: DriveKindPreset, scope: string | null = null): ModelRange {
  const span = kind === 'scale' || kind === 'length' ? { min: 50, rest: 100, max: 150, unit: '%' as const } : kind === 'points' ? { min: 0, rest: 0, max: 100, unit: '' as const } : kind === 'fall' ? { min: 0, rest: 0, max: 100, unit: '%' as const } : { min: -30, rest: 0, max: 30, unit: '°' as const }
  return { id, name, scope, ...span, show: true, rand: null, drives: [] }
}

export function addRange(c: ModelContent, r: ModelRange): Edit {
  if (c.ranges.length >= LIMITS.rangesMax) return fail(`A model may have at most ${LIMITS.rangesMax} sliders.`)
  if (c.ranges.some(x => x.id === r.id)) return fail('That slider already exists.')
  return done({ ...c, ranges: [...c.ranges, r] })
}

export function removeRange(c: ModelContent, id: string): Edit {
  const user = c.groups.find(g => g.attach?.kind === 'range' && g.attach.slider === id)
  if (user) return fail(`Group ${label(user.name, user.id)} is anchored along this slider. Change its anchor first.`)
  return done({
    ...c,
    ranges: c.ranges.filter(r => r.id !== id),
    shapes: c.shapes.map(s => (s.loose === id || s.opBy?.slider === id ? { ...s, loose: s.loose === id ? null : s.loose, opBy: s.opBy?.slider === id ? null : s.opBy } : s)),
    presets: (c.presets ?? []).map(p => (id in p.values ? { ...p, values: Object.fromEntries(Object.entries(p.values).filter(([k]) => k !== id)) } : p)),
    // and the options of group states
    groups: c.groups.map(g => (g.states?.some(st => st.options.some(o => id in o.values))
      ? { ...g, states: g.states.map(st => ({ ...st, options: st.options.map(o => (id in o.values ? { ...o, values: Object.fromEntries(Object.entries(o.values).filter(([k]) => k !== id)) } : o)) })) } : g)),
  })
}

export const renameRange = (c: ModelContent, id: string, name: string): ModelContent => mapRange(c, id, r => ({ ...r, name }))
export const setShow = (c: ModelContent, id: string, show: boolean): ModelContent => mapRange(c, id, r => ({ ...r, show }))

// How far one press of a stepper moves a slider's end or rest: whole degrees and percents, finer for a slider with no unit.
export function stepOf(r: ModelRange, big = false): number {
  const base = r.unit ? 1 : r.max - r.min <= 20 ? 0.5 : 1
  return big ? base * 5 : base
}

// A writer's limit held to its slider: inside min..max, in order, and always holding the resting value; one that covers the whole slider is no limit at all.
export function fitLimit(r: Pick<ModelRange, 'min' | 'rest' | 'max' | 'limit'>): [number, number] | null {
  if (!r.limit) return null
  const lo = Math.min(clamp(Math.min(r.limit[0], r.limit[1]), r.min, r.max), r.rest), hi = Math.max(clamp(Math.max(r.limit[0], r.limit[1]), r.min, r.max), r.rest)
  return lo <= r.min && hi >= r.max ? null : [lo, hi]
}

// Move a slider's minimum, rest or maximum one step. They stay in order (min below max, rest between), and the sliders never vanish into each other. A
// writer's limit follows: it stays inside the slider and keeps holding the resting value.
export function stepBound(c: ModelContent, id: string, field: 'min' | 'rest' | 'max', dir: -1 | 1, big = false): ModelContent {
  return mapRange(c, id, r => {
    const step = stepOf(r, big), gap = stepOf(r)
    const next = { ...r }
    if (field === 'min') next.min = Math.min(r2(r.min + dir * step), r.rest, r.max - gap)
    if (field === 'max') next.max = Math.max(r2(r.max + dir * step), r.rest, r.min + gap)
    if (field === 'rest') next.rest = r2(clamp(r.rest + dir * step, r.min, r.max))
    next.min = clamp(next.min, -1000, 1000); next.max = clamp(next.max, -1000, 1000)
    if (r.limit) next.limit = fitLimit(next)
    return next
  })
}

// Move the smallest or the largest value a writer may choose one step. The first press starts from the whole slider. They stay inside the slider and the
// resting value always stays allowed; a limit that reaches both ends of the slider is dropped.
export function stepLimit(c: ModelContent, id: string, end: 'lo' | 'hi', dir: -1 | 1, big = false): ModelContent {
  return mapRange(c, id, r => {
    const [lo, hi] = r.limit ?? [r.min, r.max], step = stepOf(r, big)
    const next: [number, number] = end === 'lo' ? [clamp(r2(lo + dir * step), r.min, r.rest), hi] : [lo, clamp(r2(hi + dir * step), r.rest, r.max)]
    return { ...r, limit: fitLimit({ ...r, limit: next }) }
  })
}

// Let the writer choose anywhere on the slider again.
export const clearLimit = (c: ModelContent, id: string): ModelContent => mapRange(c, id, r => ({ ...r, limit: null }))

// ---- drives ----

const withDrive = (r: ModelRange, d: ModelDrive): ModelRange => ({ ...r, drives: [...r.drives, d] })
const percentOf = (kind: ModelDrive['kind']): boolean => kind === 'scale' || kind === 'length'
// A fall drive is a percent of the way to hanging: 0 to 100 (none at rest)
const fallOf = (kind: ModelDrive['kind']): boolean => kind === 'fall'
// A Turn drive is a pose, and a pose belongs to one side: its twin group is not turned with it (`mirror: false`; the other side gets a slider of its own in the
// Ranges tab or the moment its part is grabbed in Pose mode). Everything else (scale, length, points, bend, fall) is a measure of the body or of the drawing, and a
// twin follows it as before.
const blankDrive = (kind: ModelDrive['kind']): ModelDrive => ({
  kind, group: null, target: null, id: null, axis: 'xy', shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: percentOf(kind) ? 100 : 0, atMax: percentOf(kind) ? 100 : fallOf(kind) ? 100 : 0, mirror: kind !== 'turn',
})

function addDrive(c: ModelContent, rangeId: string, d: ModelDrive): Edit {
  const r = c.ranges.find(x => x.id === rangeId)
  if (!r) return fail('There is no such slider.')
  if (r.drives.length >= LIMITS.drivesMax) return fail(`A slider may drive at most ${LIMITS.drivesMax} things.`)
  return done(mapRange(c, rangeId, x => withDrive(x, d)))
}

// The slider turns a group about its pivot: -20 degrees at its minimum and 20 at its maximum to begin with (the stepper changes that).
export function addTurn(c: ModelContent, rangeId: string, groupId: string): Edit {
  const g = c.groups.find(x => x.id === groupId)
  if (!g) return fail('There is no such group.')
  if (g.mirrorOf) return fail('A twin follows its original: turn the original instead, or break the pair.')
  const edit = addDrive(ensurePivot(c, groupId), rangeId, { ...blankDrive('turn'), group: groupId, atMin: -20, atMax: 20 })
  return edit
}

// The slider scales a group, a shape or the whole model: 80 percent at its minimum and 120 at its maximum to begin with.
export function addScale(c: ModelContent, rangeId: string, target: 'group' | 'shape' | 'model', id: string | null = null): Edit {
  if (target === 'group' && !c.groups.some(g => g.id === id)) return fail('There is no such group.')
  if (target === 'shape' && !c.shapes.some(s => s.id === id)) return fail('There is no such shape.')
  if ((target === 'group' && c.groups.find(g => g.id === id)?.mirrorOf) || (target === 'shape' && c.shapes.find(s => s.id === id)?.mirrorOf)) return fail('A twin follows its original: scale the original instead, or break the pair.')
  const edit = addDrive(target === 'group' && id ? ensurePivot(c, id) : c, rangeId, { ...blankDrive('scale'), target, id: target === 'model' ? null : id, atMin: 80, atMax: 120 })
  return edit
}

// The slider lengthens or shortens a bone (and so the group it starts at, and everything that hangs from it): 80 percent of the bone's rest length at the
// slider's minimum and 120 at its maximum to begin with. A twin of the bone's group follows it.
export function addLength(c: ModelContent, rangeId: string, boneId: string): Edit {
  const b = (c.bones ?? []).find(x => x.id === boneId)
  if (!b) return fail('There is no such bone.')
  const g = c.groups.find(x => x.id === b.start)
  if (!g) return fail('The bone starts at a group that is not there.')
  if (g.mirrorOf) return fail('The bone starts at a twin group; lengthen the original instead.')
  return addDrive(ensurePivot(c, b.start), rangeId, { ...blankDrive('length'), id: boneId, atMin: 80, atMax: 120 })
}

const shapeBox = (s: ModelShape) => (s.pts.length >= 3 ? boxOf(flatten(build(s.pts, s.closed), s.closed)) : null)

// The slider bends a shape smoothly along a length: from its middle down to near its end, 30 degrees each way to begin with.
export function addBend(c: ModelContent, rangeId: string, shapeId: string): Edit {
  const s = c.shapes.find(x => x.id === shapeId), b = s && shapeBox(s)
  if (!s || !b) return fail('Pick a shape with an outline.')
  if (s.mirrorOf) return fail('A twin follows its original: bend the original instead, or break the pair.')
  return addDrive(c, rangeId, { ...blankDrive('bend'), shape: shapeId, pivot: [r2(b.x + b.w / 2), r2(b.y + b.h * 0.5)], y0: r2(b.y + b.h * 0.45), y1: r2(b.y + b.h * 0.85), atMin: -30, atMax: 30 })
}

export function removeDrive(c: ModelContent, rangeId: string, index: number): ModelContent {
  return mapRange(c, rangeId, r => ({ ...r, drives: r.drives.filter((_, i) => i !== index) }))
}

const mapDrive = (c: ModelContent, rangeId: string, index: number, change: (d: ModelDrive) => ModelDrive): ModelContent =>
  mapRange(c, rangeId, r => ({ ...r, drives: r.drives.map((d, i) => (i === index ? change(d) : d)) }))

// Move what a drive does at the slider's minimum or maximum one step (a degree, a percent; 5 when `big`).
export function stepDrive(c: ModelContent, rangeId: string, index: number, field: 'atMin' | 'atMax', dir: -1 | 1, big = false): ModelContent {
  return mapDrive(c, rangeId, index, d => {
    const next = d[field] + dir * (big ? 5 : 1)
    return { ...d, [field]: percentOf(d.kind) ? clamp(next, 5, 1000) : fallOf(d.kind) ? clamp(next, 0, 100) : clamp(next, -360, 360) }
  })
}
// A Length drive lengthens another bone.
export function setDriveBone(c: ModelContent, rangeId: string, index: number, boneId: string): Edit {
  const b = (c.bones ?? []).find(x => x.id === boneId)
  if (!b) return fail('There is no such bone.')
  if (c.groups.find(g => g.id === b.start)?.mirrorOf) return fail('The bone starts at a twin group; lengthen the original instead.')
  return done(mapDrive(c, rangeId, index, d => (d.kind === 'length' ? { ...d, id: boneId } : d)))
}
export const setDriveAxis = (c: ModelContent, rangeId: string, index: number, axis: ModelScaleAxis): ModelContent => mapDrive(c, rangeId, index, d => ({ ...d, axis }))
export const setDriveMirror = (c: ModelContent, rangeId: string, index: number, mirror: boolean): ModelContent => mapDrive(c, rangeId, index, d => ({ ...d, mirror }))
// Move the start or the end of a bend's length one step down or up the shape.
export function stepBendEdge(c: ModelContent, rangeId: string, index: number, edge: 'y0' | 'y1', dir: -1 | 1, big = false): ModelContent {
  return mapDrive(c, rangeId, index, d => {
    const v = clamp(d[edge] + dir * (big ? 5 : 1), -50, 450)
    return edge === 'y0' ? { ...d, y0: Math.min(v, d.y1) } : { ...d, y1: Math.max(v, d.y0) }
  })
}

// ---- recording points ----

const MOVED = 0.05

// Write down how far the points of `edited` (a copy of the shape the admin dragged) sit from where the shape is drawn, as what the slider does to them at
// its maximum or its minimum. The other end of a point already recorded is kept. Refused when the point count changed or nothing moved.
export function recordPoints(c: ModelContent, rangeId: string, shapeId: string, end: 'max' | 'min', edited: ModelShape): Edit {
  const shape = c.shapes.find(s => s.id === shapeId), range = c.ranges.find(r => r.id === rangeId)
  if (!shape || !range) return fail('There is no such slider or shape.')
  if (shape.mirrorOf) return fail('A twin follows its original: record the original instead, or break the pair.')
  if (edited.pts.length !== shape.pts.length) return fail('The number of points changed. Record again without adding or deleting points.')
  const deltas = new Map<number, [number, number]>()
  edited.pts.forEach((p, i) => {
    const dx = r2(p.x - shape.pts[i].x), dy = r2(p.y - shape.pts[i].y)
    if (Math.abs(dx) > MOVED || Math.abs(dy) > MOVED) deltas.set(i, [clamp(dx, -200, 200), clamp(dy, -200, 200)])
  })
  const at = range.drives.findIndex(d => d.kind === 'points' && d.shape === shapeId)
  const existing = at >= 0 ? range.drives[at].moves : []
  if (deltas.size === 0 && !existing.some(m => (end === 'max' ? m.dx || m.dy : m.dxMin || m.dyMin))) return fail('No point was moved.')
  const indices = new Set([...deltas.keys(), ...existing.map(m => m.i)])
  const moves: ModelMove[] = []
  for (const i of [...indices].sort((a, b) => a - b)) {
    const old = existing.find(m => m.i === i) ?? { i, dx: 0, dy: 0, dxMin: 0, dyMin: 0 }, [dx, dy] = deltas.get(i) ?? [0, 0]
    const m = end === 'max' ? { ...old, dx, dy } : { ...old, dxMin: dx, dyMin: dy }
    if (m.dx || m.dy || m.dxMin || m.dyMin) moves.push(m)
  }
  if (at >= 0) return done(mapDrive(c, rangeId, at, d => ({ ...d, moves })))
  return addDrive(c, rangeId, { ...blankDrive('points'), shape: shapeId, moves })
}

// A shape whose points changed in number cannot keep the moves recorded by index: they are dropped, and the sliders they belonged to are named.
export function clearPointMoves(c: ModelContent, shapeId: string): { content: ModelContent; cleared: string[] } {
  const cleared: string[] = []
  const ranges = c.ranges.map(r => {
    if (!r.drives.some(d => d.kind === 'points' && d.shape === shapeId && d.moves.length)) return r
    cleared.push(label(r.name, r.id))
    return { ...r, drives: r.drives.filter(d => !(d.kind === 'points' && d.shape === shapeId)) }
  })
  return { content: cleared.length ? { ...c, ranges } : c, cleared }
}
