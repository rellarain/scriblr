import type { ModelContent, ModelPlace } from '../../../../../api/types'
import { anchorsOf, placeMat, placeOf } from './anchors'
import { IDENTITY, apply, inverse, mul, rotate, translate, type Mat } from './geometry'
import { circlesOf, isPivotCircle, poseOf, setPivotSetting, type Pose } from './pivots'

// Posing by dragging (shape types T4). What is posed is kept as each pivot circle's turn and where a figure's first shape has been placed; the drawing never changes, so Reset
// pose puts it all back. A drag on a shape of a figure:
// - with an anchor in the figure, on a shape away from the anchored one: it swings at the nearest pivot between it and the anchor (what hangs further out keeps its angles);
// - on the anchored shape itself, when it is the figure's only anchor: the whole figure turns about the anchor;
// - with no anchor: the shape follows the pointer and the rest of the figure hangs from it, each pivot turned (within its limits) so the weight beyond it hangs straight down,
//   like a doll held by one part.
// A drag on a pivot circle (not the one on the root's side) swings it.

export type PoseDrag =
  | { kind: 'swing'; circle: string; at: [number, number]; from: [number, number]; turn0: number }
  | { kind: 'turn'; root: string; at: [number, number]; from: [number, number]; place0: Mat }
  | { kind: 'dangle'; root: string; from: [number, number]; k: Mat; base: ModelContent }
export type PoseStart = { ok: true; drag: PoseDrag; content: ModelContent } | { ok: false; reason: string }

const no = (reason: string): PoseStart => ({ ok: false, reason })
const deg = (r: number): number => (r * 180) / Math.PI
const wrap = (a: number): number => { const t = ((a % 360) + 360) % 360; return t > 180 ? t - 360 : t }
const angleAt = (o: [number, number], p: [number, number]): number => deg(Math.atan2(p[1] - o[1], p[0] - o[0]))
// how far the pointer has gone round a point since the drag began
const sweep = (o: [number, number], a: [number, number], b: [number, number]): number => wrap(angleAt(o, b) - angleAt(o, a))
const matOf = (pose: Pose, id: string): Mat => pose.mats.get(id) ?? IDENTITY

// The pivot a body swings at: the nearest one on its way to the root whose far side holds it (a body on the same circle as the one it hangs from goes with that one).
export function swingOf(pose: Pose, body: string): { pivot: string; circle: string } | null {
  let x = body
  while (pose.parentOf.has(x)) {
    const p = pose.parentOf.get(x)!
    if (p.circle !== p.held) return { pivot: p.pivot, circle: p.circle }
    x = p.parent
  }
  return null
}

export const canPose = (c: ModelContent, shapeId: string): boolean => poseOf(c).posable.has(shapeId)
export const isPosed = (c: ModelContent): boolean => c.shapes.some(s => !!s.place || (!!s.pivot && (s.pivot.turn ?? 0) !== 0))

// Every turn back to 0 and every figure where it was drawn.
export const resetPose = (c: ModelContent): ModelContent => ({
  ...c, shapes: c.shapes.map(s => (s.place || (s.pivot && s.pivot.turn) ? { ...s, place: null, ...(s.pivot ? { pivot: { ...s.pivot, turn: 0 } } : {}) } : s)),
})

const setPlace = (c: ModelContent, root: string, place: ModelPlace | null): ModelContent => ({ ...c, shapes: c.shapes.map(s => (s.id === root ? { ...s, place } : s)) })
const addTurn = (c: ModelContent, circle: string, by: number): ModelContent => {
  const s = c.shapes.find(x => x.id === circle)
  return s?.pivot ? setPivotSetting(c, circle, 'turn', (s.pivot.turn ?? 0) + by) : c
}

// A drag begun on a shape at `at` (in the model's space): what it does, and the content to show at once (a dangle lets the figure hang from the start).
export function beginPose(c: ModelContent, shapeId: string, at: [number, number]): PoseStart {
  const pose = poseOf(c), s = c.shapes.find(x => x.id === shapeId)
  if (!s || !pose.posable.has(shapeId)) return no('This shape is not part of a figure with a pivot.')
  if (isPivotCircle(s)) {
    const pid = s.pivot!.at
    if (pose.nearOf.get(pid) === s.id) return no('This circle holds still: drag a shape that hangs on another circle of its pivot.')
    if (pose.blocked.has(pid)) return no('This pivot cannot turn: its two sides are joined again, or an anchor holds the side beyond it.')
    return { ok: true, drag: { kind: 'swing', circle: s.id, at: pose.points.get(pid)!, from: at, turn0: s.pivot!.turn ?? 0 }, content: c }
  }
  const body = pose.bodyOf.get(shapeId)
  if (!body) return no('Shadows, lights and stretch shapes follow their connections: drag a shape they follow.')
  const root = pose.rootOf.get(body) ?? body, anchors = pose.figureAnchors.get(root) ?? 0
  if (anchors === 0) return dangle(c, pose, body, root, at)
  if (body === root) {
    if (anchors > 1) return no('Two anchors hold this figure where it is.')
    const holder = (pose.bodies.get(root) ?? []).map(id => c.shapes.find(x => x.id === id)!).find(x => anchorsOf(x).length)!
    const m = anchorsOf(holder)[0], A = apply(matOf(pose, holder.id), m.x, m.y)
    return { ok: true, drag: { kind: 'turn', root, at: A, from: at, place0: placeMat(c.shapes.find(x => x.id === root)?.place) }, content: c }
  }
  const w = swingOf(pose, body)
  if (!w) return no('Nothing turns between this shape and the anchor.')
  if (pose.blocked.has(w.pivot)) return no('This shape cannot swing: an anchor holds it, or its pivot is joined again on both sides.')
  const circle = c.shapes.find(x => x.id === w.circle)!
  return { ok: true, drag: { kind: 'swing', circle: w.circle, at: pose.points.get(w.pivot)!, from: at, turn0: circle.pivot!.turn ?? 0 }, content: c }
}

// The content as the drag leaves it with the pointer at `at`. `start` is the content when the drag began.
export function movePose(start: ModelContent, d: PoseDrag, at: [number, number]): ModelContent {
  if (d.kind === 'swing') return setPivotSetting(start, d.circle, 'turn', d.turn0 + sweep(d.at, d.from, at))
  if (d.kind === 'turn') return setPlace(start, d.root, placeOf(mul(rotate(sweep(d.at, d.from, at), d.at[0], d.at[1]), d.place0)))
  return setPlace(d.base, d.root, placeOf(mul(translate(at[0] - d.from[0], at[1] - d.from[1]), d.k)))
}

// ---- hanging from one body ----

interface Step { pivot: string; held: string; circle: string; beyond: Set<string> }

// The figure walked out from body g: at each pivot, the circle on g's side and each other circle with what lies beyond it.
function stepsFrom(c: ModelContent, pose: Pose, g: string): Step[] {
  const steps: Step[] = [], seenB = new Set([g]), seenP = new Set<string>(), queue = [g]
  const via = new Map<string, Step | null>([[g, null]]), up = new Map<Step, Step | null>()
  while (queue.length) {
    const b = queue.shift()!
    for (const h of pose.hangs.get(b) ?? []) {
      const pid = c.shapes.find(x => x.id === h)!.pivot!.at
      if (seenP.has(pid)) continue
      seenP.add(pid)
      for (const o of circlesOf(c, pid)) {
        const next = (pose.onCircle.get(o.id) ?? []).filter(x => !seenB.has(x))
        if (!next.length) continue
        const step: Step | null = o.id === h ? (via.get(b) ?? null) : { pivot: pid, held: h, circle: o.id, beyond: new Set<string>() }
        if (o.id !== h && step) { steps.push(step); up.set(step, via.get(b) ?? null) }
        for (const x of next) { seenB.add(x); queue.push(x); via.set(x, step) }
      }
    }
  }
  // what lies beyond each step: every body reached through it
  for (const [x, first] of via) for (let s = first; s; s = up.get(s) ?? null) s.beyond.add(x)
  return steps
}

// The weighted middle of some bodies as they are drawn now (each shape weighs as much as its box is big).
function middleOf(c: ModelContent, pose: Pose, bodies: Set<string>): [number, number] | null {
  let w = 0, x = 0, y = 0
  for (const b of bodies) {
    for (const id of pose.bodies.get(b) ?? []) {
      const s = c.shapes.find(q => q.id === id)
      if (!s || s.pts.length < 3) continue
      const xs = s.pts.map(p => p.x), ys = s.pts.map(p => p.y)
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
      const a = Math.max(1, (x1 - x0) * (y1 - y0)), [cx, cy] = apply(matOf(pose, id), (x0 + x1) / 2, (y0 + y1) / 2)
      w += a; x += a * cx; y += a * cy
    }
  }
  return w > 0 ? [x / w, y / w] : null
}

function dangle(c: ModelContent, pose0: Pose, g: string, root: string, at: [number, number]): PoseStart {
  const G0 = matOf(pose0, g), steps = stepsFrom(c, pose0, g)
  let w = c
  // a few rounds outward from the held body: each pivot turned so what lies beyond it hangs below it, as seen with the held body where it was
  for (let round = 0; round < 3; round++) {
    for (const st of steps) {
      const pose = poseOf(w), fix = mul(G0, inverse(matOf(pose, g)))
      const m = middleOf(w, pose, st.beyond), pp = pose.points.get(st.pivot)
      if (!m || !pp) continue
      const [mx, my] = apply(fix, m[0], m[1]), [px, py] = apply(fix, pp[0], pp[1])
      if (Math.hypot(mx - px, my - py) < 1e-6) continue
      const by = wrap(90 - deg(Math.atan2(my - py, mx - px)))
      if (Math.abs(by) < 0.01) continue
      // the circle on the root's side holds still: turning the root's side is the held circle turned the other way
      w = pose.nearOf.get(st.pivot) === st.circle ? addTurn(w, st.held, -by) : addTurn(w, st.circle, by)
    }
  }
  // the root placed so the held body is where it was
  const pose = poseOf(w), k = mul(mul(G0, inverse(matOf(pose, g))), placeMat(w.shapes.find(x => x.id === root)?.place))
  const base = w
  return { ok: true, drag: { kind: 'dangle', root, from: at, k, base }, content: setPlace(base, root, placeOf(k)) }
}
