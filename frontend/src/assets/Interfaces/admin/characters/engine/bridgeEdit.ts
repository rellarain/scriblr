import type { ModelBind, ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { addShape, freshId, objectOfShape, outlineSize, randomId, shapeById, type MakeId } from '../modelContent'
import { bakedPaint } from './colour'
import { apply, edgeAt, inverse, nearestEdge, r2, transformList, windSign } from './geometry'
import { LIMITS, linkCount } from './limits'
import { twinShape } from './pairEdit'
import { solveAtRest } from './rig'
import { done, fail, type Edit } from './rigEdit'

// Bridges (phase 5b): skin between two parts, as at an elbow, a shoulder or a wrist. A bridge is a shape of four points locked to the edges of the two parts it
// joins; its two sides leave one part along the direction of that part's edge and arrive at the other along the direction of its edge, so the outline runs on
// smoothly through a bend however far the parts have turned. Any edge-locked point can be set to leave along its edge (the flag `tan` of its link); a bridge is
// only four such points, two on each part, in the order that does not cross.

export interface EdgeSpot { shape: string; e: number; t: number }

const unit = (v: number): number => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))

// Whether a shape's outline has points that leave along their edge to another shape (it is a bridge of some sort).
export function isBridge(s: ModelShape): boolean {
  const pts = s.pts
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i].bind, b = pts[(i + 1) % pts.length].bind
    if (a?.kind === 'edge' && a.tan && b?.kind === 'edge' && b.tan && a.s !== b.s) return true
  }
  return false
}

// Four spots on the edges of two parts: the first on part A, the second on part B (the two ends of one side), then the other side: one on B and one on A (in
// either order; they are put in the order that does not cross). A new bridge goes into the object of part B, just above its top shape, painted as part B is.
export function bridgeBetween(c: ModelContent, spots: EdgeSpot[], make: MakeId = randomId): Edit & { shapeId?: string } {
  if (spots.length !== 4) return fail('A bridge needs four spots: one on each part for each side.')
  const aId = spots[0].shape, bId = spots[1].shape
  if (aId === bId) return fail('Pick the second spot on the other part: a bridge joins two different parts.')
  const rest = [spots[2], spots[3]]
  const onB = rest.find(s => s.shape === bId), onA = rest.find(s => s.shape === aId && s !== onB)
  if (!onB || !onA) return fail('The other side needs one spot on each part.')
  const ordered = [spots[0], spots[1], onB, onA]
  const a = shapeById(c, aId), b = shapeById(c, bId), home = b && objectOfShape(c, bId)
  if (!a || !b || !home) return fail('One of the parts is not there.')
  if (a.mirrorOf || b.mirrorOf) return fail('Build the bridge on the original side and pair it: a twin follows its original.')
  if (a.shade || b.shade) return fail('A bridge joins body parts, not shading shapes.')
  if (home.shapes.length >= LIMITS.shapesPerObjectMax) return fail(`An object may have at most ${LIMITS.shapesPerObjectMax} shapes.`)
  if (c.shapes.length >= LIMITS.shapesMax) return fail(`A model may have at most ${LIMITS.shapesMax} shapes.`)
  if (linkCount(c) + 4 > LIMITS.linksMax) return fail(`A bridge takes four point links and the model may have at most ${LIMITS.linksMax}.`)
  for (const sp of ordered) {
    const s = shapeById(c, sp.shape)
    if (!s || outlineSize(c, s) < 3) return fail('Pick spots on shapes that have an outline.')
  }
  const solved = solveAtRest(c), rb = solved.shapes[bId]
  if (!rb || rb.pre.length < 3 || !solved.shapes[aId] || solved.shapes[aId].pre.length < 3) return fail('Those parts are not drawn, so they have no edges to join.')
  const inv = inverse(rb.frame)
  const modes: ModelPoint['m'][] = ['sc', 'cs', 'sc', 'cs']
  const pts: ModelPoint[] = []
  for (const [k, sp] of ordered.entries()) {
    const pre = solved.shapes[sp.shape].pre
    const e = Math.min(pre.length - 1, Math.max(0, Math.round(Number.isFinite(sp.e) ? sp.e : 0))), t = unit(sp.t)
    const [mx, my] = edgeAt(pre, windSign(pre), e, t, 0)
    const [lx, ly] = apply(inv, mx, my)
    const bind: ModelBind = { kind: 'edge', s: sp.shape, i: 0, d: [0, 0], e, t: r2(t), o: 0, tan: true }
    pts.push({ x: r2(lx), y: r2(ly), m: modes[k], hi: null, ho: null, bind })
  }
  const id = freshId(c, 's', make)
  const paint = bakedPaint(c, b)
  const topZ = Math.max(b.z, ...home.shapes.map(sid => shapeById(c, sid)?.z ?? 0))
  const bridge: ModelShape = {
    id, name: 'Bridge', closed: true, z: r2(Math.min(100, Math.max(a.z, topZ))), op: 1, view: b.view === a.view ? b.view : 'both', pts, half: 0, template: null, mirrorOf: null,
    back: null, zBack: null, loose: b.loose ?? null, copyOf: null, hide: false,
    slot: paint.slot, gray: paint.gray, tone: paint.tone, derive: paint.derive, shade: null, grad: paint.grad, blend: paint.blend, clip: null, cut: [], helper: false,
  }
  let next = addShape(c, home.id, bridge, home.shapes[home.shapes.length - 1])
  // when both parts have twins the other side gets the twin of the bridge, in the twin of part B's object: the other arm is joined like this one
  const twinA = c.shapes.find(s => s.mirrorOf === aId), twinB = c.shapes.find(s => s.mirrorOf === bId), twinHome = twinB && objectOfShape(c, twinB.id)
  if (twinA && twinB && twinHome) {
    if (twinHome.shapes.length + (twinHome.id === home.id ? 1 : 0) >= LIMITS.shapesPerObjectMax || next.shapes.length >= LIMITS.shapesMax) return fail('The twin side has no room for the twin of the bridge: remove a shape there first.')
    next = addShape(next, twinHome.id, twinShape(bridge, freshId(next, 's', make)), twinB.id)
  }
  return { ...done(next), shapeId: id }
}

// The spot on the edge of a shape that is nearest the place (x, y) in the model's space (as the shape stands at rest): where a bridge is to join it.
export function spotFromClick(c: ModelContent, shapeId: string, x: number, y: number): EdgeSpot | null {
  const t = solveAtRest(c).shapes[shapeId]
  if (!t || t.pre.length < 3) return null
  const hit = nearestEdge(transformList(t.rig, t.frame), x, y)
  return hit ? { shape: shapeId, e: hit.e, t: r2(hit.t) } : null
}

// Make a point locked to an edge leave along that edge, or stop. Only an edge link can: a point welded to another point has no edge.
export function setLeaves(c: ModelContent, shapeId: string, i: number, on: boolean): Edit {
  const s = shapeById(c, shapeId), p = s?.pts[i]
  if (!s || !p) return fail('There is no such point.')
  if (s.mirrorOf) return fail('A twin follows its original: change the original, or break the pair.')
  if (p.bind?.kind !== 'edge') return fail('Only a point locked to the edge of a shape can leave along that edge.')
  if ((p.bind.tan === true) === on) return done(c)
  return done({ ...c, shapes: c.shapes.map(x => (x.id === shapeId ? { ...x, pts: x.pts.map((q, k) => (k === i && q.bind ? { ...q, bind: { ...q.bind, tan: on } } : q)) } : x)) })
}
