import type { ModelContent, ModelPlace } from '../../../../../api/types'
import { anchorsOf, marksOf, placeMat, placeOf } from './anchors'
import { IDENTITY, apply, inverse, mul, rotate, translate, type BuiltPoint, type Mat } from './geometry'
import { nearestPlace, slideAt } from './sliders'
import { addJointTurn, poseOf, type Pose } from './pivots'

// Posing by dragging (joints J3). Objects are the posable segments of a figure, joined at pivot points (pivot links). What is posed is kept as each pivot's turn and where a
// figure's first object has been placed; the drawing never changes, so Reset pose puts it all back. A drag on an object:
// - between it and the anchor, the pivots reach (a few rounds, from the innermost, each within its limits) to bring the spot pressed to the pointer, and the object keeps
//   its own angle when its own pivot can turn it back; what lies further out keeps its pose (the user: dragging the palm makes the forearm and the upper arm reach from the
//   shoulder, while the fingers keep theirs);
// - on the anchored object itself, when it is the figure's only anchor: the whole figure turns about the anchor;
// - with no anchor: the object follows the pointer and the rest of the figure hangs from it, each pivot turned (within its limits) so the weight beyond it hangs straight down.
// A posable point (T5) reaches the same way; a slider is dragged along its outline between its stops.

export type PoseDrag =
  | { kind: 'turn'; root: string; at: [number, number]; from: [number, number]; place0: Mat }
  | { kind: 'dangle'; root: string; from: [number, number]; k: Mat; base: ModelContent }
  | { kind: 'reach'; body: string; grab: [number, number]; chain: string[]; angle0: number }
  | { kind: 'slide'; shape: string; i: number; outline: BuiltPoint[]; lo: number; hi: number }
export type PoseStart = { ok: true; drag: PoseDrag; content: ModelContent } | { ok: false; reason: string }

const no = (reason: string): PoseStart => ({ ok: false, reason })
const deg = (r: number): number => (r * 180) / Math.PI
const wrap = (a: number): number => { const t = ((a % 360) + 360) % 360; return t > 180 ? t - 360 : t }
const angleAt = (o: [number, number], p: [number, number]): number => deg(Math.atan2(p[1] - o[1], p[0] - o[0]))
// how far the pointer has gone round a point since the drag began
const sweep = (o: [number, number], a: [number, number], b: [number, number]): number => wrap(angleAt(o, b) - angleAt(o, a))
const objectMat = (pose: Pose, o: string): Mat => pose.objectMats.get(o) ?? IDENTITY
const angleOfMat = (m: Mat): number => deg(Math.atan2(m[1], m[0]))

export const canPose = (c: ModelContent, shapeId: string): boolean => poseOf(c).posable.has(shapeId)
export const isPosed = (c: ModelContent): boolean =>
  c.objects.some(o => !!o.place) || c.shapes.some(s => !!s.place || s.pts.some(p => (p.bind?.pivot?.turn ?? 0) !== 0 || p.bind?.slide?.at != null))

// Every pivot back to 0, every slider where it is drawn and every figure where it was drawn.
export const resetPose = (c: ModelContent): ModelContent => ({
  ...c,
  objects: c.objects.map(o => (o.place ? { ...o, place: null } : o)),
  shapes: c.shapes.map(s => {
    const moved = s.pts.some(p => (p.bind?.pivot?.turn ?? 0) !== 0 || p.bind?.slide?.at != null)
    if (!s.place && !moved) return s
    return {
      ...s, place: null,
      ...(moved ? {
        pts: s.pts.map(p => {
          const b = p.bind
          if (!b || ((b.pivot?.turn ?? 0) === 0 && b.slide?.at == null)) return p
          return { ...p, bind: { ...b, ...(b.pivot ? { pivot: { ...b.pivot, turn: 0 } } : {}), ...(b.slide ? { slide: { ...b.slide, at: null } } : {}) } }
        }),
      } : {}),
    }
  }),
})

const setPlace = (c: ModelContent, root: string, place: ModelPlace | null): ModelContent => ({ ...c, objects: c.objects.map(o => (o.id === root ? { ...o, place } : o)) })

// The pivots from an object toward its root that can turn, innermost first (it stops at one that cannot: an anchor holds the rest).
function chainOf(pose: Pose, body: string): string[] {
  const out: string[] = []
  let x = body
  while (pose.parentOf.has(x)) {
    const p = pose.parentOf.get(x)!
    if (pose.blocked.has(p.joint)) break
    out.push(p.joint)
    x = p.parent
  }
  return out
}

// A drag begun at `at` (in the model's space) from a spot of an object (`grab`, in the object's drawing as it is at rest): what it does, and the content to show at once (a
// dangle lets the figure hang from the start).
function begin(c: ModelContent, body: string, grab: [number, number], at: [number, number], what: string): PoseStart {
  const pose = poseOf(c), root = pose.rootOf.get(body) ?? body, anchors = pose.figureAnchors.get(root) ?? 0
  if (anchors === 0) return dangle(c, pose, body, root, at)
  if (body === root) {
    if (anchors > 1) return no('Two anchors hold this figure where it is.')
    const holder = (pose.bodies.get(root) ?? []).map(id => c.shapes.find(x => x.id === id)!).find(x => anchorsOf(x).length)!
    const m = anchorsOf(holder)[0], A = apply(objectMat(pose, root), m.x, m.y)
    return { ok: true, drag: { kind: 'turn', root, at: A, from: at, place0: placeMat(c.objects.find(o => o.id === root)?.place) }, content: c }
  }
  const chain = chainOf(pose, body)
  if (!chain.length) return no(`Nothing turns between ${what} and the anchor: make the link that joins it a pivot point.`)
  return { ok: true, drag: { kind: 'reach', body, grab, chain, angle0: angleOfMat(objectMat(pose, body)) }, content: c }
}

// A drag begun on a shape at `at` (in the model's space).
export function beginPose(c: ModelContent, shapeId: string, at: [number, number]): PoseStart {
  const pose = poseOf(c), body = pose.bodyOf.get(shapeId)
  if (!body || !pose.posable.has(shapeId)) return no('This shape is in no object.')
  return begin(c, body, apply(inverse(objectMat(pose, body)), at[0], at[1]), at, 'this object')
}

// A drag begun on a posable point.
export function beginReach(c: ModelContent, shapeId: string, markId: string, at: [number, number]): PoseStart {
  const pose = poseOf(c), body = pose.bodyOf.get(shapeId), m = marksOf(c.shapes.find(s => s.id === shapeId)).find(k => k.id === markId)
  if (!body || !m) return no('A posable point poses the object it is on: put it on a shape of one.')
  return begin(c, body, [m.x, m.y], at, 'this point')
}

// A drag begun on a slider: it moves along `outline` (canvas space) between its stops.
export function beginSlide(c: ModelContent, shapeId: string, i: number, outline: BuiltPoint[]): PoseStart {
  const b = c.shapes.find(s => s.id === shapeId)?.pts[i]?.bind
  if (!b?.slide || outline.length < 2) return no('This point does not slide.')
  return { ok: true, drag: { kind: 'slide', shape: shapeId, i, outline, lo: b.slide.lo, hi: b.slide.hi }, content: c }
}

// The content as the drag leaves it with the pointer at `at`. `start` is the content when the drag began.
export function movePose(start: ModelContent, d: PoseDrag, at: [number, number]): ModelContent {
  if (d.kind === 'turn') return setPlace(start, d.root, placeOf(mul(rotate(sweep(d.at, d.from, at), d.at[0], d.at[1]), d.place0)))
  if (d.kind === 'reach') return reach(start, d, at)
  if (d.kind === 'slide') {
    const u = nearestPlace(d.outline, d.lo, d.hi, at[0], at[1])
    return { ...start, shapes: start.shapes.map(s => (s.id === d.shape ? slideAt(s, d.i, u) : s)) }
  }
  return setPlace(d.base, d.root, placeOf(mul(translate(at[0] - d.from[0], at[1] - d.from[1]), d.k)))
}

// ---- reaching ----

// A pivot turned so the object beyond it (away from the root) turns by `by` degrees.
function turnBeyond(c: ModelContent, pose: Pose, joint: string, body: string, by: number): ModelContent {
  const p = pose.parentOf.get(body)
  return p && p.joint === joint ? addJointTurn(c, joint, p.sign * by) : c
}
// The object a pivot of the chain turns (the one beyond it).
const beyondOf = (pose: Pose, joint: string): string | null => {
  for (const [o, p] of pose.parentOf) if (p.joint === joint) return o
  return null
}

// The pivots turned (a few rounds, innermost first) to bring the spot held to t; with two or more, the object held turned back at its own pivot to its angle.
function reach(start: ModelContent, d: Extract<PoseDrag, { kind: 'reach' }>, t: [number, number]): ModelContent {
  const keep = d.chain.length >= 2, joints = keep ? d.chain.slice(1) : d.chain
  const spot = (w: ModelContent): [number, number] => apply(objectMat(poseOf(w), d.body), d.grab[0], d.grab[1])
  let w = start
  for (let round = 0; round < 12; round++) {
    for (const j of joints) {
      const pose = poseOf(w), pj = pose.points.get(j), e = spot(w), beyond = beyondOf(pose, j)
      if (!pj || !beyond || Math.hypot(e[0] - pj[0], e[1] - pj[1]) < 1e-6 || Math.hypot(t[0] - pj[0], t[1] - pj[1]) < 1e-6) continue
      const by = wrap(angleAt(pj, t) - angleAt(pj, e))
      if (Math.abs(by) > 0.01) w = turnBeyond(w, pose, j, beyond, by)
    }
    if (keep) {
      const pose = poseOf(w)
      w = turnBeyond(w, pose, d.chain[0], d.body, wrap(d.angle0 - angleOfMat(objectMat(pose, d.body))))
    }
    const e = spot(w)
    if (Math.hypot(e[0] - t[0], e[1] - t[1]) < 0.5) break
  }
  return w
}

// ---- hanging from one object ----

interface Step { joint: string; far: string; beyond: Set<string> }

// The figure walked out from object g: each pivot met, the object on its far side (away from g) and every object reached through it.
function stepsFrom(pose: Pose, g: string): Step[] {
  const steps: Step[] = [], seen = new Set([g]), queue = [g], via = new Map<string, Step | null>([[g, null]]), up = new Map<Step, Step | null>()
  const near = new Map<string, string[]>()
  for (const j of pose.joints.values()) { near.set(j.from, [...(near.get(j.from) ?? []), j.id]); near.set(j.to, [...(near.get(j.to) ?? []), j.id]) }
  while (queue.length) {
    const o = queue.shift()!
    for (const jid of near.get(o) ?? []) {
      if (pose.blocked.has(jid)) continue
      const j = pose.joints.get(jid)!, far = j.from === o ? j.to : j.from
      if (seen.has(far)) continue
      seen.add(far)
      const step: Step = { joint: jid, far, beyond: new Set() }
      steps.push(step)
      up.set(step, via.get(o) ?? null)
      via.set(far, step)
      queue.push(far)
    }
  }
  for (const [x, first] of via) for (let s = first; s; s = up.get(s) ?? null) s.beyond.add(x)
  return steps
}

// The weighted middle of some objects as they are drawn now (each shape weighs as much as its box is big).
function middleOf(c: ModelContent, pose: Pose, objects: Set<string>): [number, number] | null {
  let w = 0, x = 0, y = 0
  for (const o of objects) {
    for (const id of pose.bodies.get(o) ?? []) {
      const s = c.shapes.find(q => q.id === id)
      if (!s || s.pts.length < 3) continue
      const xs = s.pts.map(p => p.x), ys = s.pts.map(p => p.y)
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
      const a = Math.max(1, (x1 - x0) * (y1 - y0)), [cx, cy] = apply(objectMat(pose, o), (x0 + x1) / 2, (y0 + y1) / 2)
      w += a; x += a * cx; y += a * cy
    }
  }
  return w > 0 ? [x / w, y / w] : null
}

function dangle(c: ModelContent, pose0: Pose, g: string, root: string, at: [number, number]): PoseStart {
  const G0 = objectMat(pose0, g), steps = stepsFrom(pose0, g)
  let w = c
  // a few rounds outward from the object held: each pivot turned so what lies beyond it hangs below it, as seen with the held object where it was
  for (let round = 0; round < 3; round++) {
    for (const st of steps) {
      const pose = poseOf(w), fix = mul(G0, inverse(objectMat(pose, g)))
      const m = middleOf(w, pose, st.beyond), pp = pose.points.get(st.joint), j = pose.joints.get(st.joint)
      if (!m || !pp || !j) continue
      const [mx, my] = apply(fix, m[0], m[1]), [px, py] = apply(fix, pp[0], pp[1])
      if (Math.hypot(mx - px, my - py) < 1e-6) continue
      const by = wrap(90 - deg(Math.atan2(my - py, mx - px)))
      if (Math.abs(by) < 0.01) continue
      // a pivot's turn is how far its `from` side is turned from its `to` side: the far side turned by `by` is the turn changed by as much, one way or the other
      w = addJointTurn(w, st.joint, st.far === j.from ? by : -by)
    }
  }
  // the root placed so the object held is where it was
  const pose = poseOf(w), k = mul(mul(G0, inverse(objectMat(pose, g))), placeMat(w.objects.find(o => o.id === root)?.place))
  const base = w
  return { ok: true, drag: { kind: 'dangle', root, from: at, k, base }, content: setPlace(base, root, placeOf(k)) }
}
