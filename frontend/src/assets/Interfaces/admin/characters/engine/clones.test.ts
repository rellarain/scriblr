import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, blankContent, cloneFaults, newGroup, objectById, removeShape, shapeById } from '../modelContent'
import { carryPoints, cloneAtOf, cloneMat, cloneTurn, middleOf } from './cloneAt'
import { CLONE_STEP, cloneEdit, detachClone, makeClone, reconcileClones, rigidChange, setCloneAt } from './clones'
import { drawOrder } from './order'
import { solve } from './rig'
import { flipShape, rotOf, setSize, setTurn } from './transform'

// Clones (Z4): a copy of a shape or an object with a place of its own (where its middle stands, a turn, a flip). A move, turn or flip of a clone places it; any other edit
// goes to its original, so every clone changes; detaching keeps the outline as drawn; a clone object keeps a clone of each shape of its original.

let n = 0
const make = (prefix: string) => `${prefix}_${++n}`
const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
// a right triangle: not the same when flipped across
const wedge = (id: string): ModelShape => ({ ...box(id, 0, 0, 0, 0), pts: [[60, 40], [80, 40], [60, 60]].map(([x, y]) => ({ x, y, m: 's' as const })) })
function model(...shapes: ModelShape[]): ModelContent {
  let c = addGroup(blankContent('Clones'), newGroup('g', 'Body'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  for (const s of shapes) c = addShape(c, 'o', s)
  return c
}
const done = (e: { ok: boolean; content?: ModelContent; reason?: string }): ModelContent => { if (!e.ok || !e.content) throw new Error(e.reason); return e.content }
function cloned(c: ModelContent, kind: 'shape' | 'object', id: string): [ModelContent, string] {
  const r = makeClone(c, kind, id, make)
  return [done(r.edit), r.cloneId!]
}
const r2 = (v: number) => Math.round(v * 100) / 100
const drawn = (c: ModelContent, id: string) => solve(c).shapes[id].local.map(p => [r2(p.x), r2(p.y)])
const sorted = (pts: number[][]) => [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
const area = (pts: readonly ModelPoint[]) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y }, 0) / 2
// the clone as the panel and the canvas see it: its outline as drawn and its frame turned by its place
function asDrawn(c: ModelContent, id: string): ModelShape {
  const s = shapeById(c, id)!, o = shapeById(c, s.cloneOf!)!, at = s.cloneAt ?? c.objects.find(x => x.shapes.includes(id))!.cloneAt!
  return { ...s, pts: solve(c).shapes[id].local, rot: cloneTurn(at, rotOf(o)), cloneOf: null }
}
const localOf = (c: ModelContent) => { const sv = solve(c); return (sid: string) => sv.shapes[sid]?.local }

describe('the place of a clone', () => {
  it('turns into a matrix and back', () => {
    for (const at of [{ x: 30, y: 40, turn: 0, flip: false }, { x: -5, y: 12.5, turn: 90, flip: false }, { x: 7, y: 8, turn: -135, flip: true }]) {
      expect(cloneAtOf(cloneMat(at, 10, 20), 10, 20)).toEqual(at)
    }
  })

  it('carries an outline over, the same way round when flipped', () => {
    const pts = wedge('w').pts, flipped = carryPoints(pts, cloneMat({ x: 70, y: 50, turn: 0, flip: true }, 70, 50))
    expect(Math.sign(area(flipped))).toBe(Math.sign(area(pts)))
    expect(sorted(flipped.map(p => [p.x, p.y]))).toEqual(sorted([[80, 40], [60, 40], [80, 60]]))
  })

  it('turns the frame by the place, the other way round when flipped', () => {
    expect(cloneTurn({ x: 0, y: 0, turn: 30, flip: false }, 10)).toBe(40)
    expect(cloneTurn({ x: 0, y: 0, turn: 30, flip: true }, 10)).toBe(20)
  })
})

describe('a clone of a shape', () => {
  it('is made a little right of and below its original, with no points of its own, drawn just behind it', () => {
    const [c, id] = cloned(model(box('hand', 60, 40, 20, 20)), 'shape', 'hand')
    const s = shapeById(c, id)!
    expect(s.pts).toEqual([])
    expect(s.cloneOf).toBe('hand')
    expect(s.cloneAt).toEqual({ x: 70 + CLONE_STEP, y: 50 + CLONE_STEP, turn: 0, flip: false })
    expect(sorted(drawn(c, id))).toEqual(sorted([[70, 50], [90, 50], [90, 70], [70, 70]]))
    expect(objectById(c, 'o')!.shapes).toEqual(['hand', id])
    expect(cloneFaults(c)).toEqual([])
    // with zones, the tree gives the order: a copy just behind its original
    const order = drawOrder({ ...c, zones: [{ id: 'z', name: 'Body', groups: ['g'] }] }).map(s => s.id)
    expect(order.indexOf(id)).toBe(order.indexOf('hand') - 1)
  })

  it('is turned and flipped about its own middle', () => {
    const [c0, id] = cloned(model(wedge('w')), 'shape', 'w')
    const turned = setCloneAt(c0, 'shape', id, { x: 70, y: 50, turn: 90, flip: false })
    expect(sorted(drawn(turned, id))).toEqual(sorted([[80, 40], [80, 60], [60, 40]]))
    const flipped = setCloneAt(c0, 'shape', id, { x: 70, y: 50, turn: 0, flip: true })
    expect(sorted(drawn(flipped, id))).toEqual(sorted([[80, 40], [60, 40], [80, 60]]))
  })

  it('follows every edit of its original', () => {
    const [c0, id] = cloned(model(box('hand', 60, 40, 20, 20)), 'shape', 'hand')
    const hand = shapeById(c0, 'hand')!
    const c = { ...c0, shapes: c0.shapes.map(s => (s.id === 'hand' ? { ...hand, pts: hand.pts.map((p, i) => (i === 1 ? { ...p, x: 100 } : p)) } : s)) }
    // the original is now 60..100 wide, middle (80, 50): the clone is it about (80, 60)
    expect(sorted(drawn(c, id))).toEqual(sorted([[60, 50], [100, 50], [80, 70], [60, 70]]))
  })

  it('is placed by a move, a turn or a flip, and nothing else changes', () => {
    const [c, id] = cloned(model(wedge('w')), 'shape', 'w')
    const shape = asDrawn(c, id)
    const moved = cloneEdit(c, shapeById(c, id)!, shape.pts, shape.pts.map(p => ({ ...p, x: p.x + 5, y: p.y - 3 })), localOf(c))
    expect(moved).toEqual({ kind: 'place', owner: 'shape', id, at: { x: 85, y: 57, turn: 0, flip: false } })
    const turned = cloneEdit(c, shapeById(c, id)!, shape.pts, setTurn(shape, 30).pts, localOf(c))
    expect(turned?.kind === 'place' && turned.at.turn).toBeCloseTo(30, 1)
    const flipped = cloneEdit(c, shapeById(c, id)!, shape.pts, flipShape(shape, 'across').pts, localOf(c))
    expect(flipped?.kind === 'place' && flipped.at.flip).toBe(true)
    expect(rigidChange(shape.pts, shape.pts.map((p, i) => (i === 0 ? { ...p, x: p.x - 4 } : p)))).toBeNull()
  })

  it('gives a change of its outline to its original, which keeps its middle, so every clone changes', () => {
    const [c1, a] = cloned(model(box('hand', 60, 40, 20, 20)), 'shape', 'hand')
    const [c2, b] = cloned(c1, 'shape', 'hand')
    const c = setCloneAt(c2, 'shape', b, { x: 150, y: 150, turn: 90, flip: true })
    // the first clone made twice as wide
    const shape = asDrawn(c, a), wider = setSize(shape, 'w', 40, false)
    const e = cloneEdit(c, shapeById(c, a)!, shape.pts, wider.pts, localOf(c))
    expect(e?.kind).toBe('outline')
    if (e?.kind !== 'outline') return
    expect(e.id).toBe('hand')
    const next = { ...c, shapes: c.shapes.map(s => (s.id === 'hand' ? { ...s, pts: e.pts } : s)) }
    expect(sorted(drawn(next, 'hand'))).toEqual(sorted([[50, 40], [90, 40], [90, 60], [50, 60]]))
    expect(sorted(drawn(next, a))).toEqual(sorted([[60, 50], [100, 50], [100, 70], [60, 70]]))
    // the other clone, turned a quarter and flipped, is 40 tall now
    const ys = drawn(next, b).map(p => p[1])
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(40, 1)
  })

  it('moves a point of its original back through its place, a flipped one the right way round', () => {
    const [c0, id] = cloned(model(wedge('w')), 'shape', 'w')
    const c = setCloneAt(c0, 'shape', id, { x: 70, y: 50, turn: 0, flip: true })
    const shape = asDrawn(c, id)
    // the clone's right angle is at (80, 40); dragged down to (80, 44) it is the wedge's (60, 40) at (60, 44), and the wedge keeps its middle
    const at = shape.pts.findIndex(p => r2(p.x) === 80 && r2(p.y) === 40)
    const e = cloneEdit(c, shapeById(c, id)!, shape.pts, shape.pts.map((p, i) => (i === at ? { ...p, y: 44 } : p)), localOf(c))
    expect(e?.kind).toBe('outline')
    if (e?.kind !== 'outline') return
    expect(Math.sign(area(e.pts))).toBe(Math.sign(area(wedge('w').pts)))
    expect(e.pts.length).toBe(3)
    expect(middleOf(e.pts, true)).toEqual([70, 50])
    expect(sorted(e.pts.map(p => [r2(p.x), r2(p.y)]))).toEqual(sorted([[60, 44], [80, 40], [60, 60]]))
  })

  it('is detached as it is drawn', () => {
    const [c0, id] = cloned(model(box('hand', 60, 40, 20, 20)), 'shape', 'hand')
    const c = done(detachClone(c0, 'shape', id))
    const s = shapeById(c, id)!
    expect(s.cloneOf).toBeNull()
    expect(s.cloneAt).toBeNull()
    expect(sorted(s.pts.map(p => [r2(p.x), r2(p.y)]))).toEqual(sorted([[70, 50], [90, 50], [90, 70], [70, 70]]))
  })

  it('goes with its original', () => {
    const [c, id] = cloned(model(box('hand', 60, 40, 20, 20)), 'shape', 'hand')
    expect(shapeById(removeShape(c, 'hand'), id)).toBeUndefined()
  })

  it('cannot be cloned itself, nor can a mirror or a pivot circle', () => {
    const [c, id] = cloned(model(box('hand', 60, 40, 20, 20)), 'shape', 'hand')
    expect(makeClone(c, 'shape', id).edit).toEqual({ ok: false, reason: 'A clone cannot be cloned: clone its original.' })
    const twin = { ...box('twin', 0, 0, 0, 0), pts: [], mirrorOf: 'hand' }
    expect(makeClone(addShape(c, 'o', twin), 'shape', 'twin').edit.ok).toBe(false)
    const ring = { ...box('ring', 10, 10, 10, 10), kind: 'pivot' as const }
    expect(makeClone(addShape(c, 'o', ring), 'shape', 'ring').edit.ok).toBe(false)
  })

  it('outside a clone object needs a place of its own', () => {
    const [c, id] = cloned(model(box('hand', 60, 40, 20, 20)), 'shape', 'hand')
    expect(cloneFaults(setCloneAt(c, 'shape', id, null as never))).toEqual(['Shape hand (clone) is a clone with no place of its own outside a clone object.'])
  })
})

describe('a clone of an object', () => {
  const two = () => model(box('hand', 60, 40, 20, 20), box('foot', 100, 40, 20, 20))

  it('has a clone of each of its shapes, placed by the object', () => {
    const [c, id] = cloned(two(), 'object', 'o')
    const o = objectById(c, id)!
    expect(o.cloneOf).toBe('o')
    // the two boxes together are 60..120 by 40..60: their middle (90, 50) goes to (100, 60)
    expect(o.cloneAt).toEqual({ x: 100, y: 60, turn: 0, flip: false })
    expect(o.shapes.map(s => shapeById(c, s)!.cloneOf)).toEqual(['hand', 'foot'])
    expect(o.shapes.map(s => shapeById(c, s)!.cloneAt)).toEqual([null, null])
    expect(sorted(drawn(c, o.shapes[1]))).toEqual(sorted([[110, 50], [130, 50], [130, 70], [110, 70]]))
    expect(cloneFaults(c)).toEqual([])
  })

  it('is turned as a whole about the middle of its original', () => {
    const [c0, id] = cloned(two(), 'object', 'o')
    const c = setCloneAt(c0, 'object', id, { x: 90, y: 50, turn: 180, flip: false })
    // turned half round about (90, 50), the foot (100..120) lands on 60..80
    expect(sorted(drawn(c, objectById(c, id)!.shapes[1]))).toEqual(sorted([[60, 40], [80, 40], [80, 60], [60, 60]]))
  })

  it('gets a clone of a shape its original gains', () => {
    const [c0, id] = cloned(two(), 'object', 'o')
    const c = reconcileClones(addShape(c0, 'o', box('toe', 130, 40, 5, 5)), make)
    expect(objectById(c, id)!.shapes.map(s => shapeById(c, s)!.cloneOf)).toEqual(['hand', 'foot', 'toe'])
  })

  it('places itself when one of its shapes is moved', () => {
    const [c, id] = cloned(two(), 'object', 'o')
    const sid = objectById(c, id)!.shapes[0], shape = asDrawn(c, sid)
    const e = cloneEdit(c, shapeById(c, sid)!, shape.pts, shape.pts.map(p => ({ ...p, x: p.x + 2 })), localOf(c))
    expect(e).toEqual({ kind: 'place', owner: 'object', id, at: { x: 102, y: 60, turn: 0, flip: false } })
  })

  it('is detached with its shapes as they are drawn', () => {
    const [c0, id] = cloned(two(), 'object', 'o')
    const c = done(detachClone(c0, 'object', id))
    const o = objectById(c, id)!
    expect(o.cloneOf).toBeNull()
    expect(o.shapes.every(s => !shapeById(c, s)!.cloneOf && shapeById(c, s)!.pts.length === 4)).toBe(true)
  })
})
