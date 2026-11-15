import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, blankContent, newGroup, shapeById } from '../modelContent'
import { apply } from './geometry'
import { mirrorLineMat, mirrorPoints, mirroredTurn } from './mirrorLine'
import { connectedSymmetric, defaultMirrorLine, keepCarried, makeMirror, mirrorLineOptions, originalPoint, originalSegment, reconcileMirrors, setMirrorLine } from './mirrors'
import { drawOrder } from './order'
import { breakPair } from './pairEdit'
import { solve } from './rig'
import { reflectAbout, enableSymmetry } from './symmetry'
import { moveShapeTo } from './zones'

// Mirrors (Z3): a twin reflected across the model's centre line or a symmetric shape's axis, drawn from its original as drawn; the default line is a connected symmetric
// shape's upright axis; detaching keeps the outline; a mirrored object keeps a mirror of each shape; copies travel with and are drawn just behind their original.

let n = 0
const make = (prefix: string) => `${prefix}_${++n}`
const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
const ok = <T extends { ok: boolean; content?: ModelContent; reason?: string }>(e: T): ModelContent => { if (!e.ok || !e.content) throw new Error(e.reason); return e.content }
// a chest whose axis leans (60 degrees), and a breast welded to it at its first point
function model(axisAngle = 90): ModelContent {
  const made = enableSymmetry(box('chest', 60, 40, 80, 80), { a: axisAngle, n: 1 }, 0, 60)
  if (!made.ok) throw new Error(made.reason)
  const chest = made.shape
  // the chest's point nearest the breast's top left corner (140, 40)
  const at = chest.pts.reduce((best, p, i) => (Math.hypot(p.x - 140, p.y - 40) < Math.hypot(chest.pts[best].x - 140, chest.pts[best].y - 40) ? i : best), 0)
  let c = addGroup(blankContent('M'), newGroup('g', 'Body'))
  c = addObject(c, 'g', { id: 'o', name: 'Torso', layer: 'body', shapes: [] })
  c = addShape(c, 'o', chest)
  const breast = box('breast', 140, 40, 20, 20)
  c = addShape(c, 'o', at >= 0 ? { ...breast, pts: breast.pts.map((p, i) => (i === 0 ? { ...p, bind: { kind: 'point' as const, s: 'chest', i: at, d: [0, 0] as [number, number], e: 0, t: 0, o: 0 } } : p)) } : breast)
  return { ...c, zones: [{ id: 'z', name: 'Torso', groups: ['g'] }] }
}
const drawn = (c: ModelContent, id: string) => solve(c).shapes[id].local.map(p => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100])
const sorted = (pts: number[][]) => [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])

describe('the line a mirror takes', () => {
  it('is the upright axis of a symmetric shape it is connected to, else the centre line', () => {
    const c = model()
    expect(connectedSymmetric(c, 'breast').map(s => s.id)).toEqual(['chest'])
    expect(defaultMirrorLine(c, 'breast')).toEqual({ shape: 'chest', k: 0 })
    expect(defaultMirrorLine(c, 'chest')).toBeNull()
  })

  it('is offered from the centre line and every symmetric shape\'s axes, connected ones first', () => {
    const options = mirrorLineOptions(model(), ['breast'])
    expect(options.map(o => o.name)).toEqual(["The model's centre line", 'chest, axis 1'])
  })

  it('falls back to the centre line when its shape is not symmetric or not there', () => {
    const c = model()
    const centre = reflectAbout(100, 0, 90)
    expect(mirrorLineMat(c, { shape: 'breast', k: 0 }, () => [1, 0, 0, 1, 0, 0])).toEqual(centre)
    expect(mirrorLineMat(c, { shape: 'gone', k: 0 }, () => [1, 0, 0, 1, 0, 0])).toEqual(centre)
    expect(mirrorLineMat(c, null, () => undefined)).toEqual(centre)
  })
})

describe('a mirror', () => {
  it('is its original reflected across a leaning axis of the chest', () => {
    const c0 = model(60)
    const r = makeMirror(c0, 'shape', 'breast', make)
    const c = ok(r.edit)
    const twin = shapeById(c, r.twinId!)!
    expect(twin.mirrorLine).toEqual({ shape: 'chest', k: 0 })
    // the chest's axis: through its middle (100, 80), at 60 degrees
    const R = reflectAbout(100, 80, 60)
    const want = drawn(c, 'breast').map(([x, y]) => apply(R, x, y).map(v => Math.round(v * 100) / 100))
    expect(sorted(drawn(c, twin.id))).toEqual(sorted(want))
  })

  it('follows its original, and takes another line', () => {
    let c = ok(makeMirror(model(), 'shape', 'breast', make).edit)
    const twinId = c.shapes.find(s => s.mirrorOf === 'breast')!.id
    // across the chest's upright axis x = 100: the breast at 140..160 is mirrored to 40..60
    expect(Math.min(...drawn(c, twinId).map(p => p[0]))).toBeCloseTo(40, 1)
    c = { ...c, shapes: c.shapes.map(s => (s.id === 'breast' ? { ...s, pts: s.pts.map(p => ({ ...p, x: p.x + 10 })) } : s)) }
    expect(Math.min(...drawn(c, twinId).map(p => p[0]))).toBeCloseTo(30, 1)
    // the centre line is x = 100 too here; a chest moved right moves its axis and the mirror with it
    const moved = { ...c, shapes: c.shapes.map(s => (s.id === 'chest' ? { ...s, pts: s.pts.map(p => ({ ...p, x: p.x + 20 })), sym: s.sym ? { ...s.sym, cx: s.sym.cx + 20 } : s.sym } : s)) }
    expect(Math.min(...drawn(moved, twinId).map(p => p[0]))).toBeCloseTo(70, 1)
    expect(Math.min(...drawn(setMirrorLine(moved, 'shape', twinId, null), twinId).map(p => p[0]))).toBeCloseTo(30, 1)
  })

  it('keeps its drawn outline when detached', () => {
    const c = ok(makeMirror(model(60), 'shape', 'breast', make).edit)
    const twinId = c.shapes.find(s => s.mirrorOf === 'breast')!.id
    const before = drawn(c, twinId)
    const free = ok(breakPair(c, 'shape', twinId))
    const t = shapeById(free, twinId)!
    expect(t.mirrorOf).toBeNull()
    expect(t.mirrorLine).toBeNull()
    expect(sorted(t.pts.map(p => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]))).toEqual(sorted(before))
  })

  it('is drawn just behind its original, and travels with it', () => {
    const c = ok(makeMirror(model(), 'shape', 'breast', make).edit)
    const twinId = c.shapes.find(s => s.mirrorOf === 'breast')!.id
    expect(drawOrder(c).map(s => s.id)).toEqual(['chest', twinId, 'breast'])
    let moved = addObject(c, 'g', { id: 'o2', name: 'Other', layer: 'body', shapes: [] })
    moved = ok(moveShapeTo(moved, 'breast', 'o2', null))
    expect(moved.objects.find(o => o.id === 'o2')!.shapes).toEqual([twinId, 'breast'])
    expect(moved.objects.find(o => o.id === 'o')!.shapes).toEqual(['chest'])
  })
})

describe('a mirrored object', () => {
  it('gets a mirror of each shape, and of a shape added to its original later', () => {
    let c = model()
    c = addObject(c, 'g', { id: 'arm', name: 'Arm', layer: 'body', shapes: [] })
    c = addShape(c, 'arm', box('upper', 150, 80, 10, 30))
    const r = makeMirror(c, 'object', 'arm', make)
    c = ok(r.edit)
    const twin = c.objects.find(o => o.id === r.twinId)!
    expect(twin.mirrorOf).toBe('arm')
    expect(twin.shapes).toHaveLength(1)
    c = addShape(c, 'arm', box('lower', 150, 110, 10, 30))
    c = reconcileMirrors(c, make)
    const after = c.objects.find(o => o.id === r.twinId)!
    expect(after.shapes.map(id => shapeById(c, id)!.mirrorOf).sort()).toEqual(['lower', 'upper'])
    // a line set on the object is its shapes' too
    const lined = setMirrorLine(c, 'object', r.twinId!, { shape: 'chest', k: 0 })
    expect(after.shapes.map(id => shapeById(lined, id)!.mirrorLine)).toEqual([{ shape: 'chest', k: 0 }, { shape: 'chest', k: 0 }])
  })
})

describe('edits on a mirror', () => {
  it('go back across the line, keeping what the points carried', () => {
    const R = reflectAbout(100, 0, 90)
    const twinPts = mirrorPoints(box('b', 140, 40, 20, 20).pts, R)
    // carried back, the run is the original's again
    expect(mirrorPoints(twinPts, R).map(p => [Math.round(p.x), Math.round(p.y)])).toEqual([[140, 40], [160, 40], [160, 60], [140, 60]])
    const original = box('b', 140, 40, 20, 20).pts.map((p, i) => (i === 0 ? { ...p, bind: { kind: 'point' as const, s: 'chest', i: 2, d: [0, 0] as [number, number], e: 0, t: 0, o: 0 } } : p))
    expect(keepCarried(original, mirrorPoints(twinPts, R))[0].bind?.s).toBe('chest')
    expect(originalPoint(4, 0)).toBe(3)
    expect(originalSegment(4, 0)).toBe(2)
    // an upright line: a turn the other way round, the frame kept upright
    expect(mirroredTurn(R, 30)).toBeCloseTo(-30, 5)
    expect(mirroredTurn(R, 0)).toBeCloseTo(0, 5)
  })
})
