import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup } from '../modelContent'
import { apply, build, flatten, reflectList } from './geometry'
import { solve } from './rig'
import { carryKey, isKeySpot, keyAngle, pickKeys, repairAngles, shiftOf, shifted, unbuild } from './turn'
import { turnCheck } from './rigCheck'
import { alignTurns, clearPointDepths, layerThick, setAngleOutline, setFormAngleOutline, setWrap, stepPointDepth, stepShapeDepth, stepThick } from './turnEdit'

// Phase A3: outlines drawn at key angles (the solver draws them, blends them and carries them to forms and twins) and the edits that make them.

const sharp = (pts: Array<[number, number]>): ModelPoint[] => pts.map(([x, y]) => ({ x, y, m: 's' as const }))
const square = (id: string, x: number, y: number, w: number, h: number, extra: Partial<ModelShape> = {}): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: sharp([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]), ...extra,
})
// A body in the middle (80..120) and an arm beside it on the picture's right (130..140).
function model(extra: { body?: Partial<ModelShape>; arm?: Partial<ModelShape> } = {}): ModelContent {
  let c = blank('Turning')
  c = addGroup(c, newGroup('gB', 'Body')); c = addGroup(c, newGroup('gA', 'Arm'))
  c = addObject(c, 'gB', { id: 'oB', name: 'Body', layer: 'body', shapes: [] }); c = addShape(c, 'oB', square('body', 80, 60, 40, 100, extra.body))
  c = addObject(c, 'gA', { id: 'oA', name: 'Arm', layer: 'body', shapes: [] }); c = addShape(c, 'oA', square('arm', 130, 70, 10, 60, extra.arm))
  return c
}
const turnWith = (angles: Array<{ at: number; tilt?: number; pts: ModelPoint[] }>) => ({ turn: { depth: 0, thick: null, dz: [], angles: angles.map(a => ({ tilt: 0, ...a })), seen: null } })
const xs = (c: ModelContent, view: number, id: string) => solve(c, {}, view).shapes[id].poly.map(p => Math.round(p[0] * 10) / 10)
const box = (c: ModelContent, view: number, id: string) => solve(c, {}, view).shapes[id].box

// a wider profile of the body: drawn 20 wide either side of its middle
const PROFILE = sharp([[70, 60], [130, 60], [130, 160], [70, 160]])

describe('the helpers', () => {
  it('takes a nodded key at the front and the back, never one seen level', () => {
    expect(keyAngle(0, 30)).toBe(0)
    expect(keyAngle(180, -15)).toBe(180)
    expect(keyAngle(0)).toBeNull()
    expect(repairAngles([{ at: 0, tilt: 30, pts: PROFILE }, { at: 0, tilt: 0, pts: PROFILE }], p => p as ModelPoint).map(a => [a.at, a.tilt])).toEqual([[0, 30]])
    expect(isKeySpot(0, 30)).toBe(true)
    expect(isKeySpot(0, 0)).toBe(false)
    expect(isKeySpot(45, 0)).toBe(true)
    expect(isKeySpot(50, 0)).toBe(false)
  })

  it('moves a key by what links and sliders move its points by, and back again', () => {
    const rest = sharp([[0, 0], [10, 0], [10, 10]]), drawn = sharp([[1, 0], [11, 2], [10, 10]])
    const shift = shiftOf([{ drawn, rest }], 3)
    expect(shift).toEqual([[1, 0], [1, 2], [0, 0]])
    const key = sharp([[5, 5], [6, 6], [7, 7]])
    const shown = shifted(key, shift)
    expect(shown.map(p => [p.x, p.y])).toEqual([[6, 5], [7, 8], [7, 7]])
    expect(shifted(shown, shift, true).map(p => [p.x, p.y])).toEqual([[5, 5], [6, 6], [7, 7]])
    expect(shiftOf([{ drawn, rest }], 4)).toBeNull()
  })

  it('carries a key to a form with as many points by what the form moves them by', () => {
    const base = sharp([[0, 0], [10, 0], [10, 10], [0, 10]]), form = sharp([[0, 0], [12, 0], [12, 10], [0, 10]])
    const key = sharp([[20, 0], [26, 0], [26, 10], [20, 10]])
    expect(carryKey(key, base, form, true).map(p => [p.x, p.y])).toEqual([[20, 0], [28, 0], [28, 10], [20, 10]])
    expect(carryKey(key, base, base, true)).toBe(key)
  })

  it('carries a key to a form with another number of points along the nearest edges', () => {
    const base = sharp([[0, 0], [10, 0], [10, 10], [0, 10]])
    const form = sharp([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]])         // a point put in half way along the top
    const key = sharp([[0, 0], [20, 0], [20, 10], [0, 10]])                   // the key is twice as wide
    const out = carryKey(key, base, form, true)
    expect(out).toHaveLength(5)
    expect(out[1].x).toBeCloseTo(10, 1)
    expect(out[1].y).toBeCloseTo(0, 1)
    expect(out[3].x).toBeCloseTo(20, 1)
  })

  it('turns a built outline back into points through the matrix it was drawn with', () => {
    const list: ModelPoint[] = [{ x: 0, y: 0, m: 'c' }, { x: 10, y: 0, m: 'c', hi: [-2, 0], ho: [2, 0] }, { x: 10, y: 10, m: 's' }]
    const m = [2, 0, 0, 2, 5, 7] as [number, number, number, number, number, number]
    const back = unbuild(build(list, true, m), m, list)
    expect(back.map(p => [p.x, p.y])).toEqual([[0, 0], [10, 0], [10, 10]])
    expect(back[0].hi).toBeNull()                                                  // a handle worked out is worked out again
    expect(back[1].hi).toEqual([-2, 0])                                            // its own is kept
  })

  it('picks the keys a yaw and a nod are drawn from', () => {
    const keys = [{ at: 45, tilt: 0, pts: PROFILE }, { at: 90, tilt: 0, pts: PROFILE }, { at: 45, tilt: 30, pts: PROFILE }]
    expect(pickKeys(keys, 90, 0).level).toMatchObject({ a: keys[1], b: null })
    const between = pickKeys(keys, 60, 0).level
    expect(between.a).toBe(keys[0]); expect(between.b).toBe(keys[1]); expect(between.w).toBeGreaterThan(0)
    expect(pickKeys(keys, 180, 0).level).toMatchObject({ a: null, b: null })      // more than 45 from every key: the turned outline
    const nod = pickKeys(keys, 45, 15)
    expect(nod.tilted?.pick.a).toBe(keys[2]); expect(nod.tilted?.w).toBeCloseTo(0.5)
  })
})

describe('the solver', () => {
  it('draws the key at its angle and leaves the front and the back as they were', () => {
    const plain = model(), keyed = model({ body: turnWith([{ at: 90, pts: PROFILE }]) })
    expect(xs(keyed, 0, 'body')).toEqual(xs(plain, 0, 'body'))
    expect(xs(keyed, 180, 'body')).toEqual(xs(plain, 180, 'body'))
    expect(box(keyed, 90, 'body').w).toBeCloseTo(60)                                // the drawn profile, not the turned cut-out
    expect(box(plain, 90, 'body').w).toBeLessThan(40)
  })

  it('blends the key in as the figure turns toward it, and two keys with each other', () => {
    const one = model({ body: turnWith([{ at: 90, pts: PROFILE }]) })
    const w = (v: number) => box(one, v, 'body').w, plainAt = (v: number) => box(model(), v, 'body').w
    expect(w(45)).toBeCloseTo(plainAt(45))                                         // 45 away: the turned outline still
    expect(w(70)).toBeGreaterThan(plainAt(70))
    expect(w(70)).toBeLessThan(60)
    const two = model({ body: turnWith([{ at: 45, pts: sharp([[75, 60], [125, 60], [125, 160], [75, 160]]) }, { at: 90, pts: PROFILE }]) })
    const mid = box(two, 60, 'body').w
    expect(mid).toBeGreaterThan(50); expect(mid).toBeLessThan(60)
  })

  it('draws a key about where the turned middle of the shape is', () => {
    const c = model({ arm: turnWith([{ at: 90, pts: sharp([[125, 70], [145, 70], [145, 130], [125, 130]]) }]) })
    const turned = box(model(), 90, 'arm'), keyed = box(c, 90, 'arm')
    expect(keyed.x + keyed.w / 2).toBeCloseTo(turned.x + turned.w / 2, 3)
    expect(keyed.w).toBeCloseTo(20)
  })

  it('gives a twin its original’s keys seen from the other side', () => {
    let c = model({ arm: turnWith([{ at: 90, pts: sharp([[125, 70], [145, 70], [145, 130], [125, 130]]) }]) })
    c = addGroup(c, { ...newGroup('gA2', 'Arm (twin)'), mirrorOf: 'gA' })
    c = addObject(c, 'gA2', { id: 'oA2', name: 'Arm (twin)', layer: 'body', shapes: [], mirrorOf: 'oA' })
    c = addShape(c, 'oA2', { ...square('arm2', 0, 0, 1, 1), pts: [], mirrorOf: 'arm' })
    expect(box(c, 270, 'arm2').w).toBeCloseTo(20)                                  // the original's 90, mirrored: the twin's 270
    expect(box(c, 90, 'arm2').w).toBeLessThan(15)
  })

  it('moves a key with the sliders that move its points', () => {
    let c = model({ body: turnWith([{ at: 90, pts: PROFILE }]) })
    c = { ...c, ranges: [{ id: 'wide', name: 'Wide', scope: null, min: 0, rest: 0, max: 10, unit: '', show: true, rand: null, drives: [{ kind: 'points', shape: 'body', moves: [{ i: 1, dx: 10, dy: 0, dx0: 0, dy0: 0 }, { i: 2, dx: 10, dy: 0, dx0: 0, dy0: 0 }], sym: false }] }] } as unknown as ModelContent
    const rest = solve(c, {}, 90).shapes.body.box.w, moved = solve(c, { wide: 10 }, 90).shapes.body.box.w
    expect(moved - rest).toBeCloseTo(10, 0)
  })

  it('carries a key drawn for the base to a form', () => {
    let c = model({ body: turnWith([{ at: 90, pts: PROFILE }]) })
    c = { ...c, objects: c.objects.map(o => (o.id !== 'oB' ? o : { ...o, axes: [{ id: 'build', name: 'Build', initial: 'avg', options: [{ id: 'avg', name: 'Average', ovr: [] }, { id: 'broad', name: 'Broad', ovr: [{ shape: 'body', pts: sharp([[80, 60], [130, 60], [130, 160], [80, 160]]) }] }] }] })) }
    const broad = solve(c, {}, 90, { forms: { 'oB.build': 'broad' } }).shapes.body.box.w
    expect(broad).toBeCloseTo(70)                                                   // the profile and the 10 the form adds on the right
  })

  it('tells the canvas what to edit at a key spot', () => {
    const c = model({ body: turnWith([{ at: 90, pts: PROFILE }]) })
    const at90 = solve(c, {}, 90, { edit: true }).shapes.body.angle!
    expect(at90).toMatchObject({ at: 90, tilt: 0, drawn: true })
    expect(at90.local.map(p => [p.x, p.y])).toEqual(PROFILE.map(p => [p.x, p.y]))
    const at45 = solve(c, {}, 45, { edit: true }).shapes.body
    expect(at45.angle).toMatchObject({ at: 45, drawn: false })
    // the outline to start from is the one drawn there now
    const drawnAgain = flatten(build(at45.angle!.local, true, at45.angle!.matrix), true)
    at45.poly.forEach((p, i) => { expect(drawnAgain[i][0]).toBeCloseTo(p[0], 1); expect(drawnAgain[i][1]).toBeCloseTo(p[1], 1) })
    expect(solve(c, {}, 50, { edit: true }).shapes.body.angle).toBeUndefined()      // between key spots
    expect(solve(c, {}, 90).shapes.body.angle).toBeUndefined()                      // only when asked
    expect(solve(c, {}, 90).shapes.body.seenAt).toEqual([90, 0])
  })

  it('stays finite with keys of another number of points', () => {
    const c = model({ body: turnWith([{ at: 90, pts: sharp([[70, 60], [130, 60], [130, 160]]) }]) })
    for (const v of [60, 75, 90, 120]) for (const p of solve(c, {}, v).shapes.body.poly) { expect(Number.isFinite(p[0])).toBe(true); expect(Number.isFinite(p[1])).toBe(true) }
  })
})

describe('the edits', () => {
  it('puts in and takes away an outline at a key angle', () => {
    const c = model()
    const put = setAngleOutline(c, 'body', 90, 0, PROFILE)
    expect(put.ok).toBe(true)
    const after = put.ok ? put.content : c
    expect(after.shapes.find(s => s.id === 'body')!.turn!.angles).toEqual([{ at: 90, tilt: 0, pts: PROFILE.map(p => ({ ...p, hi: null, ho: null })) }])
    const gone = setAngleOutline(after, 'body', 90, 0, null)
    expect(gone.ok && gone.content.shapes.find(s => s.id === 'body')!.turn).toBeNull()
    expect(setAngleOutline(c, 'body', 50, 0, PROFILE)).toMatchObject({ ok: false })
    expect(setAngleOutline(c, 'body', 0, 0, PROFILE)).toMatchObject({ ok: false })
    expect(setAngleOutline(c, 'body', 0, 30, PROFILE).ok).toBe(true)
    const twin = { ...c, shapes: [...c.shapes, { ...square('t', 0, 0, 1, 1), pts: [], mirrorOf: 'body' }] }
    expect(setAngleOutline(twin, 't', 90, 0, PROFILE)).toMatchObject({ ok: false })
  })

  it('stops at 16 outlines', () => {
    let c = model()
    const spots = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 195, 210, 225, 240, 255]
    for (const at of spots) { const e = setAngleOutline(c, 'body', at, 0, PROFILE); if (e.ok) c = e.content }
    expect(c.shapes.find(s => s.id === 'body')!.turn!.angles).toHaveLength(16)
    expect(setAngleOutline(c, 'body', 270, 0, PROFILE)).toMatchObject({ ok: false })
    expect(setAngleOutline(c, 'body', 90, 0, PROFILE).ok).toBe(true)                // one already there is replaced
  })

  it('draws a form’s outline at an angle', () => {
    let c = model()
    c = { ...c, objects: c.objects.map(o => (o.id !== 'oB' ? o : { ...o, axes: [{ id: 'build', name: 'Build', initial: 'avg', options: [{ id: 'avg', name: 'Average', ovr: [] }, { id: 'broad', name: 'Broad', ovr: [] }] }] })) }
    const e = setFormAngleOutline(c, 'oB', 'build', 'broad', 'body', 90, 0, PROFILE)
    expect(e.ok).toBe(true)
    const ov = e.ok ? e.content.objects.find(o => o.id === 'oB')!.axes![0].options[1].ovr[0] : null
    expect(ov?.pts).toHaveLength(4)                                                // given the shape's own outline
    expect(ov?.angles?.[0]).toMatchObject({ at: 90, tilt: 0 })
  })

  it('steps depth, roundness and point depths, and sets what an object lies on', () => {
    const c = model()
    const d = stepShapeDepth(c, 'body', 1, true)
    expect(d.ok && d.content.shapes[0].turn!.depth).toBe(10)
    const t = stepThick(c, 'body', 1, false)
    expect(t.ok && t.content.shapes[0].turn!.thick).toBeCloseTo(layerThick(c, 'body') + 0.05)
    const p = stepPointDepth(c, 'body', 2, -1, false)
    expect(p.ok && p.content.shapes[0].turn!.dz).toEqual([0, 0, -1, 0])
    const cleared = p.ok ? clearPointDepths(p.content, 'body') : p
    expect(cleared.ok && cleared.content.shapes[0].turn).toBeNull()
    expect(setWrap(c, 'oA', 'body')).toMatchObject({ ok: true })
    expect(setWrap(c, 'oA', 'arm')).toMatchObject({ ok: false })
  })

  it('keeps depths and key outlines in step when a point is put in', () => {
    const c = model({ body: { turn: { depth: 0, thick: null, dz: [1, 2, 3, 4], angles: [{ at: 90, tilt: 0, pts: PROFILE }], seen: null } } })
    const body = c.shapes.find(s => s.id === 'body')!
    const pts = [body.pts[0], { x: 100, y: 60, m: 's' as const }, ...body.pts.slice(1)]
    const next = alignTurns(c, { ...c, shapes: c.shapes.map(s => (s.id === 'body' ? { ...s, pts } : s)) })
    const t = next.shapes.find(s => s.id === 'body')!.turn!
    expect(t.dz).toHaveLength(5)
    expect(t.angles[0].pts).toHaveLength(5)
    expect(t.angles[0].pts[1].x).toBeCloseTo(100)                                   // half way along the profile's top
    expect(t.angles[0].pts[2]).toBe(PROFILE[1])
  })
})

describe('a key point stays under the pointer', () => {
  it('maps the canvas edit back to the key exactly', () => {
    const c = model({ body: turnWith([{ at: 90, pts: PROFILE }]) })
    const s = solve(c, {}, 90, { edit: true }).shapes.body
    const [x, y] = apply(s.angle!.matrix, s.angle!.local[1].x, s.angle!.local[1].y)
    expect(s.poly.some(p => Math.abs(p[0] - x) < 1e-6 && Math.abs(p[1] - y) < 1e-6)).toBe(true)
    expect(reflectList(PROFILE, 100)).toHaveLength(4)
  })
})

describe('the Check panel', () => {
  it('says when a key has another number of points, a shape is flat, or nothing has depth', () => {
    expect(turnCheck(model()).map(l => l.text)).toEqual([expect.stringMatching(/^Nothing in the model has depth yet/)])
    const c = model({ body: turnWith([{ at: 90, pts: sharp([[70, 60], [130, 60], [130, 160]]) }]), arm: { turn: { depth: 0, thick: 0, dz: [], angles: [], seen: null } } })
    const text = turnCheck(c).map(l => l.text)
    expect(text).toContainEqual(expect.stringMatching(/^body is drawn at 90° with 3 points and has 4/))
    expect(text).toContainEqual(expect.stringMatching(/^arm has no roundness/))
    expect(text.some(t => t.startsWith('Nothing in the model'))).toBe(false)
  })
})
