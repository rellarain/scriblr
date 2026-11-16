import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, shapeById, starterContent } from '../modelContent'
import { centreAnchorOf, guardAnchors, markXY, repairMarks, toggleCentreAnchor } from './anchors'
import { centreOf, drawnCentre } from './centre'
import { connect, dropTargetAt, rebindByPlace } from './connect'
import { addPoint } from './edit'
import { apply, translate } from './geometry'
import { NEW_JOINT, poseOf, setJointSetting, toggleJoint } from './pivots'
import { solveAtRest } from './rig'
import type { Edit } from './rigEdit'
import { parseModelFile, serializeModels } from '../modelFile'
import { frameOf, transformShape, turnFrom } from './transform'

// Every shape has a centre (shape editor C1): the middle of its box (turning with it), or a symmetric shape's centre. Another shape's point links to it (and the link can be
// a pivot), a shape is anchored at it, and it turns about it.

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
// A (object oa) is 60..100 across, 100..140 down; B (object ob) is 100..140 across, 100..140 down, its centre at (120, 120)
function two(): ModelContent {
  let c = addGroup(starterContent('Centres'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'oa', name: 'A', layer: 'body', shapes: [] })
  c = addObject(c, 'g', { id: 'ob', name: 'B', layer: 'body', shapes: [] })
  c = addShape(c, 'oa', box('a', 60, 100, 40, 40))
  return addShape(c, 'ob', box('b', 100, 100, 40, 40))
}
const toCentre = (c: ModelContent, s: string, i: number, t: string): ModelContent => {
  const solved = solveAtRest(c), mid = drawnCentre(shapeById(c, t)!, solved.shapes[t])!
  return must(connect(c, solved, s, i, { kind: 'center', shapeId: t, x: mid[0], y: mid[1] }))
}
const drawnPoint = (c: ModelContent, s: string, i: number): [number, number] => {
  const r = solveAtRest(c).shapes[s], p = r.local[i]
  return apply(r.matrix, p.x, p.y).map(v => Math.round(v * 100) / 100) as [number, number]
}
const withShape = (c: ModelContent, id: string, f: (s: ModelShape) => ModelShape): ModelContent => ({ ...c, shapes: c.shapes.map(s => (s.id === id ? f(s) : s)) })

describe('a shape\'s centre', () => {
  it('is the middle of its box, which turns with the shape, or a symmetric shape\'s centre', () => {
    expect(centreOf(box('s', 100, 100, 40, 20))).toEqual([120, 110])
    // turned a quarter about (120, 110): the frame turns with it, so the centre stays
    const turned = transformShape(box('s', 100, 100, 40, 20), [0, 1, -1, 0, 230, -10], 90)
    expect(centreOf(turned)!.map(v => Math.round(v * 100) / 100)).toEqual([120, 110])
    const sym = { ...box('s', 100, 100, 40, 20), sym: { a: 90, n: 1, side: 0, cx: 120, cy: 104, m: 1 } }
    expect(centreOf(sym)).toEqual([120, 104])
    expect(centreOf({ ...box('s', 0, 0, 1, 1), pts: [] })).toBeNull()
  })

  it('is offered to a dragged point: the nearer of a point and a centre wins', () => {
    const c = two(), solved = solveAtRest(c)
    expect(dropTargetAt(c, solved, 'a', 120, 121, 3)).toMatchObject({ kind: 'center', shapeId: 'b', x: 120, y: 120 })
    expect(dropTargetAt(c, solved, 'a', 140, 101, 3)).toMatchObject({ kind: 'point', shapeId: 'b', i: 1 })
  })
})

describe('a point linked to a centre', () => {
  it('sits on it and follows it when the shape moves or changes', () => {
    const c = toCentre(two(), 'a', 1, 'b')
    expect(shapeById(c, 'a')!.pts[1].bind).toMatchObject({ kind: 'center', s: 'b', d: [0, 0] })
    expect(drawnPoint(c, 'a', 1)).toEqual([120, 120])
    const moved = withShape(c, 'b', s => transformShape(s, translate(10, -5)))
    expect(drawnPoint(moved, 'a', 1)).toEqual([130, 115])
    const wider = withShape(c, 'b', s => ({ ...s, pts: s.pts.map((p, k) => (k === 1 || k === 2 ? { ...p, x: 160 } : p)) }))
    expect(drawnPoint(wider, 'a', 1)).toEqual([130, 120])
  })

  it('keeps its link when the shape it is on gains a point', () => {
    const c = toCentre(two(), 'a', 1, 'b'), solved = solveAtRest(c)
    const after = withShape(c, 'b', s => addPoint(s, 0).shape)
    expect(shapeById(rebindByPlace(c, solved, after, 'b').content, 'a')!.pts[1].bind).toMatchObject({ kind: 'center', s: 'b' })
  })

  it('can be a pivot point: the object beyond it turns about the centre', () => {
    let c = toCentre(two(), 'a', 1, 'b')
    const r = toggleJoint(c, 'a', 1)
    if (!r.ok) throw new Error(r.reason)
    c = setJointSetting(r.content, 'a', 1, 'turn', 90)
    expect(shapeById(c, 'a')!.pts[1].bind!.pivot).toMatchObject({ ...NEW_JOINT, turn: 90 })
    const joint = [...poseOf(c).joints.values()][0]
    expect(joint.at).toEqual([120, 120])
  })
})

describe('an anchor on the centre', () => {
  it('sits on the centre, follows it, and is kept by the server\'s rules', () => {
    const r = toggleCentreAnchor(box('s', 100, 100, 40, 20))
    if (!r.ok) throw new Error(r.reason)
    const m = centreAnchorOf(r.shape)!
    expect(m).toMatchObject({ kind: 'anchor', c: true, i: null, x: 120, y: 110 })
    expect(markXY({ ...r.shape, pts: r.shape.pts.map(p => ({ ...p, x: p.x + 4 })) }, m)).toEqual([124, 110])
    expect(repairMarks([{ ...m, i: 2 }], 4)[0]).toMatchObject({ c: true, i: null })
    const off = toggleCentreAnchor(r.shape)
    expect(off.ok && centreAnchorOf(off.shape)).toBeFalsy()
  })

  it('holds the shape where it is but lets it turn about the centre', () => {
    const r = toggleCentreAnchor(box('s', 100, 100, 40, 20))
    if (!r.ok) throw new Error(r.reason)
    const moved = guardAnchors(r.shape, transformShape(r.shape, translate(10, 0)))
    expect(moved).toMatchObject({ ok: false })
    const f = frameOf(r.shape)!, turned = turnFrom(r.shape, f, [160, 110], 120, 150)
    const kept = guardAnchors(r.shape, turned)
    expect(kept.ok && centreOf(kept.shape)!.map(v => Math.round(v * 100) / 100)).toEqual([120, 110])
  })
})

describe('turning about the centre', () => {
  it('turns a symmetric shape about the point its lines cross', () => {
    const s = { ...box('s', 100, 100, 40, 20), sym: { a: 90, n: 1, side: 0, cx: 120, cy: 104, m: 1 } }
    const turned = turnFrom(s, frameOf(s)!, [160, 104], 120, 144)
    // the corner (100, 100) goes a quarter round (120, 104): to (124, 84)
    expect([turned.pts[0].x, turned.pts[0].y].map(v => Math.round(v * 100) / 100)).toEqual([124, 84])
  })
})

// a link to a centre and an anchor on one go through a model file as they are
describe('a model file', () => {
  it('keeps links to centres and anchors on them', () => {
    let c = toCentre(two(), 'a', 1, 'b')
    const r = toggleCentreAnchor(shapeById(c, 'b')!)
    if (!r.ok) throw new Error(r.reason)
    c = withShape(c, 'b', () => r.shape)
    const back = parseModelFile(serializeModels([c])).models[0]
    expect(shapeById(back, 'a')!.pts[1].bind).toMatchObject({ kind: 'center', s: 'b' })
    expect(centreAnchorOf(shapeById(back, 'b')!)).toMatchObject({ c: true })
  })
})
