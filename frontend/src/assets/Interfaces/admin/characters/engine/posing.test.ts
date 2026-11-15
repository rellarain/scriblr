import { describe, expect, it } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup } from '../modelContent'
import { addFreeAnchor, guardAnchors, placeMat, placeOf, repairMarks, toggleAnchor, togglePosable } from './anchors'
import { apply, rotate, translate } from './geometry'
import { addPivot, poseOf, setPivotSetting } from './pivots'
import { beginPose, beginReach, isPosed, movePose, resetPose, type PoseDrag } from './posing'
import { solve, type Solved } from './rig'
import { transformShape } from './transform'

// Anchors and posing (shape types T4): an anchored point stays put, a shape with one anchor turns about it, two hold it; the figure's root is its anchored body; a drag swings
// at a pivot, turns the figure about its one anchor, or (with no anchor) lets the figure hang from the part that is held.

const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
const lock = (s: string, e: number, t: number): ModelBind => ({ kind: 'edge', s, i: 0, d: [0, 0], e, t, o: 0 })
const bind = (s: ModelShape, i: number, b: ModelBind): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind: b } : p)) })
const with_ = (c: ModelContent, id: string, f: (s: ModelShape) => ModelShape): ModelContent => ({ ...c, shapes: c.shapes.map(s => (s.id === id ? f(s) : s)) })
const anchor = (c: ModelContent, id: string, i: number): ModelContent => with_(c, id, s => { const r = toggleAnchor(s, i); if (!r.ok) throw new Error(r.reason); return r.shape })

// a body (60..100 across, 40..100 down); pivot p1 at (80, 100) with c1 (body) and c2 (arm); the arm 74..86 across, 100..160 down; pivot p2 at (80, 160) with c3 (arm) and
// c4 (forearm); the forearm 74..86 across, 160..200 down
function figure(): ModelContent {
  let c = addGroup(blank('Posing'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', box('body', 60, 40, 40, 60))
  c = addPivot(c, 'o', 80, 100, { pivot: 'p1', circles: ['c1', 'c2'] })
  c = addShape(c, 'o', box('arm', 74, 100, 12, 60))
  c = addPivot(c, 'o', 80, 160, { pivot: 'p2', circles: ['c3', 'c4'] })
  c = addShape(c, 'o', box('fore', 74, 160, 12, 40))
  c = with_(c, 'body', s => bind(s, 3, lock('c1', 0, 0.5)))
  c = with_(c, 'arm', s => bind(bind(s, 0, lock('c2', 1, 0.5)), 3, lock('c3', 0, 0.5)))
  return with_(c, 'fore', s => bind(s, 0, lock('c4', 1, 0.5)))
}
const drawn = (s: Solved, id: string) => s.shapes[id].local.map(p => { const [x, y] = apply(s.shapes[id].matrix, p.x, p.y); return { x, y } })
const mid = (pts: { x: number; y: number }[]) => ({ x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length })
const near = (a: { x: number; y: number }, x: number, y: number, digits = 1) => { expect(a.x).toBeCloseTo(x, digits); expect(a.y).toBeCloseTo(y, digits) }
function drag(c: ModelContent, id: string, from: [number, number], to: [number, number]): ModelContent {
  const r = beginPose(c, id, from)
  if (!r.ok) throw new Error(r.reason)
  return movePose(r.drag.kind === 'dangle' ? r.content : c, r.drag as PoseDrag, to)
}

describe('an anchor', () => {
  it('stays on its point, and the point cannot be moved or taken away', () => {
    const s = anchor(figure(), 'body', 0).shapes.find(x => x.id === 'body')!
    expect(s.marks).toEqual([{ id: 'k1', kind: 'anchor', x: 60, y: 40, i: 0, name: '' }])
    const moved = { ...s, pts: s.pts.map((p, i) => (i === 0 ? { ...p, x: 50 } : p)) }
    expect(guardAnchors(s, moved).ok).toBe(false)
    expect(guardAnchors(s, { ...s, pts: s.pts.slice(1) }).ok).toBe(false)
    // another point moves freely
    const other = { ...s, pts: s.pts.map((p, i) => (i === 2 ? { ...p, x: 120 } : p)) }
    expect(guardAnchors(s, other)).toMatchObject({ ok: true })
  })

  it('lets its shape turn and resize about it, but not move', () => {
    const s = anchor(figure(), 'body', 0).shapes.find(x => x.id === 'body')!
    expect(guardAnchors(s, transformShape(s, translate(10, 0))).ok).toBe(false)
    const turned = guardAnchors(s, transformShape(s, rotate(90, 80, 70), 90))
    expect(turned.ok).toBe(true)
    if (turned.ok) {
      near(turned.shape.pts[0], 60, 40)
      // the corner across from it went round the anchor: (100, 40) is now (60, 80)
      near(turned.shape.pts[1], 60, 80)
    }
  })

  it('held still by two', () => {
    const s = anchor(anchor(figure(), 'body', 0), 'body', 1).shapes.find(x => x.id === 'body')!
    expect(guardAnchors(s, transformShape(s, rotate(30, 80, 70), 30))).toMatchObject({ ok: false, reason: expect.stringMatching(/Two anchors/) })
  })

  it('inside a shape stays where it is while a point moves', () => {
    const s0 = figure().shapes.find(x => x.id === 'body')!
    const r = addFreeAnchor(s0, 70, 60)
    if (!r.ok) throw new Error(r.reason)
    const g = guardAnchors(r.shape, { ...r.shape, pts: r.shape.pts.map((p, i) => (i === 2 ? { ...p, y: 120 } : p)) })
    expect(g.ok && g.shape.marks![0]).toMatchObject({ x: 70, y: 60, i: null })
  })

  it('is not put on a point that follows a shape', () => {
    const arm = figure().shapes.find(x => x.id === 'arm')!
    expect(toggleAnchor(arm, 0)).toMatchObject({ ok: false })
  })

  it('is repaired as the server repairs it', () => {
    expect(repairMarks([{ id: 'a', x: 1, y: 2, i: 7 }, { id: 'a' }, { id: 'b', kind: 'pose', x: 'no', i: 1 }, 'x'], 4)).toEqual([
      { id: 'a', kind: 'anchor', x: 1, y: 2, i: null, name: '' }, { id: 'b', kind: 'pose', x: 0, y: 0, i: 1, name: '' },
    ])
  })
})

describe('the root of a figure', () => {
  it('is its anchored body: the other side swings', () => {
    const c = setPivotSetting(anchor(figure(), 'arm', 1), 'c1', 'turn', 90)
    const pose = poseOf(c)
    expect(pose.rootOf.get('body')).toBe('arm')
    const s = solve(c)
    near(drawn(s, 'arm')[1], 86, 100)
    // the body went a quarter round the pivot point: its top left (60, 40) is now at (140, 80)
    near(drawn(s, 'body')[0], 140, 80)
  })

  it('is drawn where it has been posed, with what hangs from it', () => {
    const c = with_(figure(), 'body', s => ({ ...s, place: { dx: 10, dy: 5, turn: 0 } }))
    const s = solve(c)
    near(drawn(s, 'body')[0], 70, 45)
    near(drawn(s, 'fore')[3], 84, 205)
  })

  it('a place turns about the origin and then moves', () => {
    const m = placeMat({ dx: 3, dy: 4, turn: 90 })
    expect(apply(m, 10, 0).map(v => Math.round(v * 100) / 100)).toEqual([3, 14])
    expect(placeOf(m)).toEqual({ dx: 3, dy: 4, turn: 90 })
  })
})

describe('posing with an anchor', () => {
  it('swings a shape at the nearest pivot, and what hangs further out keeps its angle', () => {
    const c = drag(anchor(figure(), 'body', 0), 'arm', [80, 160], [20, 100])
    expect(c.shapes.find(x => x.id === 'c2')!.pivot!.turn).toBeCloseTo(90, 1)
    const s = solve(c), rest = solve(figure()), quarter = (q: { x: number; y: number }) => { const [x, y] = apply(rotate(90, 80, 100), q.x, q.y); return { x, y } }
    const arm = quarter(mid(drawn(rest, 'arm'))), fore = quarter(mid(drawn(rest, 'fore')))
    near(mid(drawn(s, 'arm')), arm.x, arm.y)
    // the forearm went round with the arm and is still straight on from it
    near(mid(drawn(s, 'fore')), fore.x, fore.y)
  })

  it('turns the figure about its only anchor', () => {
    const c = drag(anchor(figure(), 'body', 0), 'body', [100, 40], [60, 80])
    const s = solve(c)
    near(drawn(s, 'body')[0], 60, 40)
    near(drawn(s, 'body')[1], 60, 80)
    expect(isPosed(c)).toBe(true)
  })

  it('holds a figure with two anchors, and a shape held by a second anchor', () => {
    expect(beginPose(anchor(anchor(figure(), 'body', 0), 'body', 1), 'body', [100, 40])).toMatchObject({ ok: false })
    const c = anchor(anchor(figure(), 'body', 0), 'fore', 2)
    expect(beginPose(c, 'arm', [80, 150])).toMatchObject({ ok: false })
    expect(poseOf(c).blocked).toEqual(new Set(['p1', 'p2']))
  })

  it('a circle on the root side holds still; another circle swings', () => {
    const c = anchor(figure(), 'body', 0)
    expect(beginPose(c, 'c1', [92, 100])).toMatchObject({ ok: false })
    expect(beginPose(c, 'c2', [98, 100])).toMatchObject({ ok: true, drag: { kind: 'swing', circle: 'c2' } })
  })
})

describe('posing with no anchor', () => {
  it('lets the figure hang from the shape that is held, which follows the pointer', () => {
    const c0 = figure()
    const r = beginPose(c0, 'arm', [80, 130])
    expect(r).toMatchObject({ ok: true, drag: { kind: 'dangle' } })
    if (!r.ok) return
    let s = solve(r.content)
    const rest = drawn(solve(c0), 'arm')
    // the arm stays where it was, and the body hangs below the shoulder
    drawn(s, 'arm').forEach((q, i) => near(q, rest[i].x, rest[i].y))
    // (the middle of the body's box as drawn: it weighs by its box)
    const [bx, by] = apply(s.shapes.body.matrix, 80, 70)
    expect(bx).toBeCloseTo(80, 0)
    expect(by).toBeCloseTo(130, 0)
    s = solve(movePose(r.content, r.drag, [90, 135]))
    drawn(s, 'arm').forEach((q, i) => near(q, rest[i].x + 10, rest[i].y + 5))
  })

  it('within the limits of each pivot', () => {
    const c0 = setPivotSetting(setPivotSetting(figure(), 'c2', 'hi', 45), 'c2', 'lo', -45)
    const r = beginPose(c0, 'arm', [80, 130])
    if (!r.ok) throw new Error(r.reason)
    expect(Math.abs(r.content.shapes.find(x => x.id === 'c2')!.pivot!.turn)).toBeLessThanOrEqual(45)
  })

  it('a shape in no figure with a pivot is not posed', () => {
    let c = addGroup(blank('Plain'), newGroup('g', 'Group'))
    c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
    c = addShape(c, 'o', box('a', 0, 0, 10, 10))
    expect(beginPose(c, 'a', [5, 5])).toMatchObject({ ok: false })
  })
})

describe('Reset pose', () => {
  it('puts every turn and place back', () => {
    const c = drag(anchor(figure(), 'body', 0), 'arm', [80, 160], [20, 100])
    const back = resetPose(with_(c, 'body', s => ({ ...s, place: { dx: 4, dy: 0, turn: 0 } })))
    expect(isPosed(back)).toBe(false)
    expect(back.shapes.find(x => x.id === 'c2')!.pivot!.turn).toBe(0)
  })
})

describe('a posable point (T5)', () => {
  const posable = (c: ModelContent, id: string, i: number): ModelContent => with_(c, id, s => { const r = togglePosable(s, i); if (!r.ok) throw new Error(r.reason); return r.shape })
  const markOf = (c: ModelContent, id: string) => { const s = solve(c).shapes[id], m = c.shapes.find(x => x.id === id)!.marks!.find(k => k.kind === 'pose')!; const [x, y] = apply(s.matrix, m.x, m.y); return { x, y } }
  const reachTo = (c: ModelContent, id: string, to: [number, number]) => {
    const m = c.shapes.find(x => x.id === id)!.marks!.find(k => k.kind === 'pose')!
    const r = beginReach(c, id, m.id, [0, 0])
    if (!r.ok) throw new Error(r.reason)
    return movePose(c, r.drag, to)
  }

  it('turns the pivots to reach, and the shape holding it keeps its angle', () => {
    const c = posable(anchor(figure(), 'body', 0), 'fore', 2)
    // the elbow's place a sixth of a turn round the shoulder, the forearm still hanging straight from it
    const [ex, ey] = apply(rotate(60, 80, 100), 80, 160), target: [number, number] = [ex + 6, ey + 40]
    const posed = reachTo(c, 'fore', target)
    near(markOf(posed, 'fore'), target[0], target[1], 0)
    const m = solve(posed).shapes.fore.matrix
    expect(Math.abs((Math.atan2(m[1], m[0]) * 180) / Math.PI)).toBeLessThan(1)
  })

  it('on a shape with one pivot to the anchor, swings it to reach', () => {
    const c = posable(anchor(figure(), 'body', 0), 'arm', 2)
    const [tx, ty] = apply(rotate(45, 80, 100), 86, 160)
    const posed = reachTo(c, 'arm', [tx, ty])
    near(markOf(posed, 'arm'), tx, ty, 0)
    expect(posed.shapes.find(x => x.id === 'c2')!.pivot!.turn).toBeCloseTo(45, 0)
  })

  it('within the limits of each pivot', () => {
    const c = setPivotSetting(posable(anchor(figure(), 'body', 0), 'arm', 2), 'c2', 'hi', 20)
    const posed = reachTo(c, 'arm', apply(rotate(80, 80, 100), 86, 160))
    expect(posed.shapes.find(x => x.id === 'c2')!.pivot!.turn).toBeLessThanOrEqual(20)
  })

  it('with no anchor lets the figure hang from it', () => {
    const c = posable(figure(), 'fore', 2)
    const m = c.shapes.find(x => x.id === 'fore')!.marks![0]
    expect(beginReach(c, 'fore', m.id, [86, 200])).toMatchObject({ ok: true, drag: { kind: 'dangle' } })
  })

  it('is not put on an anchored point, nor an anchor on it', () => {
    const s = anchor(figure(), 'body', 0).shapes.find(x => x.id === 'body')!
    expect(togglePosable(s, 0)).toMatchObject({ ok: false })
    const t = posable(figure(), 'body', 1).shapes.find(x => x.id === 'body')!
    expect(toggleAnchor(t, 1)).toMatchObject({ ok: false })
  })
})
