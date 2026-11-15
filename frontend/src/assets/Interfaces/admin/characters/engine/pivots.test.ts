import { describe, expect, it } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup } from '../modelContent'
import { apply } from './geometry'
import { NEW_JOINT, jointAt, jointHolder, migrateJoints, needsJoints, poseOf, repairJoint, setJointSetting, toggleJoint } from './pivots'
import { solve } from './rig'
import { enableSymmetry } from './symmetry'

// Pivot points (joints J2): a linked point between shapes of two objects is toggled as a pivot; the object beyond it turns about it (within its limits) and carries what lies
// further out; a loop holds its pivots; old pivot circles are converted into pivot links once.

const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
const weld = (s: string, i: number): ModelBind => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0 })
const lock = (s: string, e: number, t: number): ModelBind => ({ kind: 'edge', s, i: 0, d: [0, 0], e, t, o: 0 })
const bind = (s: ModelShape, i: number, b: ModelBind): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind: b } : p)) })
const must = (r: ReturnType<typeof toggleJoint>): ModelContent => { if (!r.ok) throw new Error(r.reason); return r.content }
const drawn = (c: ModelContent, id: string) => { const s = solve(c).shapes[id]; return s.local.map(p => apply(s.matrix, p.x, p.y).map(v => Math.round(v * 100) / 100)) }

// a body (object ob, 40..80 across, 40..100 down) and an arm (object oa) hung below it: the arm's top left (80, 100) welded to the body's bottom right corner
function two(sameObject = false): ModelContent {
  let c = addGroup(blank('Pivots'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'ob', name: 'Body', layer: 'body', shapes: [] })
  c = addObject(c, 'g', { id: 'oa', name: 'Arm', layer: 'body', shapes: [] })
  c = addShape(c, 'ob', box('body', 40, 40, 40, 60))
  return addShape(c, sameObject ? 'ob' : 'oa', bind(box('arm', 80, 100, 10, 50), 0, weld('body', 2)))
}

describe('a pivot point', () => {
  it('is a linked point toggled on and off, from either end of the link', () => {
    let c = must(toggleJoint(two(), 'arm', 0))
    expect(jointAt(c, 'arm', 0)).toEqual(NEW_JOINT)
    // the body's point the arm is welded to finds the same link
    expect(jointHolder(c, 'body', 2)).toEqual({ shapeId: 'arm', i: 0 })
    expect(jointAt(c, 'body', 2)).toEqual(NEW_JOINT)
    c = must(toggleJoint(c, 'body', 2))
    expect(jointAt(c, 'arm', 0)).toBeNull()
  })

  it('joins two objects: a point that is not linked, or a link inside one object, is not one', () => {
    expect(toggleJoint(two(), 'arm', 1)).toMatchObject({ ok: false, reason: expect.stringMatching(/linked point/) })
    expect(toggleJoint(two(true), 'arm', 0)).toMatchObject({ ok: false, reason: expect.stringMatching(/one object/) })
  })

  it('on a symmetric shape is the link of the copy that holds it', () => {
    const made = enableSymmetry(box('chest', 40, 40, 80, 60), { a: 90, n: 1 }, 0, 60)
    if (!made.ok) throw new Error(made.reason)
    const at = made.shape.pts.findIndex(p => p.x === 40 && p.y === 40), twin = made.shape.pts.findIndex(p => p.x === 120 && p.y === 40)
    let c = addGroup(blank('Sym'), newGroup('g', 'Group'))
    c = addObject(c, 'g', { id: 'oc', name: 'Chest', layer: 'body', shapes: [] })
    c = addObject(c, 'g', { id: 'on', name: 'Neck', layer: 'body', shapes: [] })
    c = addShape(c, 'on', box('neck', 20, 20, 20, 20))
    c = addShape(c, 'oc', bind(made.shape, at, weld('neck', 2)))
    expect(jointHolder(c, 'chest', twin)).toEqual({ shapeId: 'chest', i: at })
    expect(jointAt(must(toggleJoint(c, 'chest', twin)), 'chest', at)).toEqual(NEW_JOINT)
  })

  it('keeps its turn inside its limits, and the limits round its rest', () => {
    let c = must(toggleJoint(two(), 'arm', 0))
    c = setJointSetting(c, 'arm', 0, 'hi', 30)
    c = setJointSetting(c, 'arm', 0, 'turn', 90)
    expect(jointAt(c, 'arm', 0)).toEqual({ turn: 30, lo: -180, hi: 30 })
    c = setJointSetting(c, 'arm', 0, 'lo', 20)
    expect(jointAt(c, 'arm', 0)!.lo).toBe(0)
    expect(repairJoint({ turn: 'x', lo: 9, hi: -400 })).toEqual({ turn: 0, lo: 0, hi: 0 })
    expect(repairJoint(null)).toBeNull()
  })

  it('turns the object beyond it about the linked point, carrying what lies further out', () => {
    const c = setJointSetting(must(toggleJoint(two(), 'arm', 0)), 'arm', 0, 'turn', 90)
    // the arm a quarter round (80, 100): its bottom left (80, 150) is now at (30, 100); the body holds still
    expect(drawn(c, 'arm')[3]).toEqual([30, 100])
    expect(drawn(c, 'body')[0]).toEqual([40, 40])
    expect(poseOf(c).points.get('arm:0')).toEqual([80, 100])
  })

  it('works on a lock onto a segment too, at its place along it', () => {
    let c = two()
    c = { ...c, shapes: c.shapes.map(s => (s.id === 'arm' ? bind(s, 0, { ...lock('body', 2, 0.5), pivot: { ...NEW_JOINT } }) : s)) }
    expect(poseOf(c).joints.get('arm:0')!.at).toEqual([60, 100])
  })

  it('does not turn when its two sides meet again', () => {
    let c = must(toggleJoint(two(), 'arm', 0))
    // the arm's top right welded to the body too, and made a pivot: a loop
    c = { ...c, shapes: c.shapes.map(s => (s.id === 'arm' ? bind(s, 1, { ...weld('body', 1), pivot: { ...NEW_JOINT } }) : s)) }
    expect(poseOf(c).blocked).toEqual(new Set(['arm:0', 'arm:1']))
  })
})

describe('an old model with pivot circles', () => {
  // a pivot p1 at (80, 100) with circle c1 (the body hangs on it) and c2 (the arm hangs on it, turned 30 from c1's 10)
  function old(): ModelContent {
    let c = two()
    const ring = (id: string, r: number, turn: number): ModelShape => ({ ...box(id, 80 - r, 100 - r, 2 * r, 2 * r), kind: 'pivot', pivot: { at: 'p1', turn, lo: -90, hi: 90 } })
    c = addShape(c, 'ob', ring('c1', 6, 10))
    c = addShape(c, 'oa', ring('c2', 9, 40))
    c = { ...c, pivots: [{ id: 'p1', name: 'Shoulder', x: 80, y: 100 }] }
    return {
      ...c,
      shapes: c.shapes.map(s => (s.id === 'body' ? bind(s, 2, lock('c1', 0, 0.5)) : s.id === 'arm' ? { ...bind(s, 0, lock('c2', 0, 0.5)), place: { dx: 1, dy: 2, turn: 0 } } : s)),
    }
  }

  it('is seen to need converting, and not once converted', () => {
    expect(needsJoints(old())).toBe(true)
    expect(needsJoints(migrateJoints(old(), solve(old())))).toBe(false)
  })

  it('has each shape hung on a circle linked to the shape on the first circle instead, as a pivot with the circle\'s turn and limits; the circles go', () => {
    const c = migrateJoints(old(), solve(old()))
    expect(c.shapes.map(s => s.id)).toEqual(['body', 'arm'])
    expect(c.pivots).toEqual([])
    expect(c.objects.find(o => o.id === 'ob')!.shapes).toEqual(['body'])
    // the body was the shape on the first circle: its own link to the ring is let go where it was drawn
    expect(c.shapes[0].pts[2].bind).toBeNull()
    const b = c.shapes[1].pts[0].bind!
    expect(b.s).toBe('body')
    expect(b.pivot).toEqual({ turn: 30, lo: -90, hi: 90 })
    // a figure's place kept on a shape is now its object's
    expect(c.objects.find(o => o.id === 'oa')!.place).toEqual({ dx: 1, dy: 2, turn: 0 })
    expect(c.shapes[1].place).toBeNull()
  })
})
