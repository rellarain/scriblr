// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelGroup, ModelObject, ModelPoint, ModelShape } from '../../../../../api/types'
import { ANGLES, angleName, angleOf, fromBehind, isFlat, nearestAngle, viewFor } from './angles'
import { viewBoxOf } from './frames'
import { build, flatten, type BuiltPoint } from './geometry'
import { defaultValues, solve } from './rig'
import { applySilhouette, facing, facingFade, handleDepths, inSeen, keyAngle, projectSurface, repairTurn, silhouetteMatrix, squash, surfaceAt, turnFaults, turningOf, viewZ } from './turn'

const seed: ModelContent = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../../backend/app/seed/basic_model.json'), 'utf-8'))
const pt = (x: number, y: number): ModelPoint => ({ x, y, m: 'c', hi: null, ho: null })
const box4 = (x0: number, y0: number, x1: number, y1: number): ModelPoint[] => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)].map(p => ({ ...p, m: 's' as const }))
const shape = (id: string, pts: ModelPoint[], over: Partial<ModelShape> = {}): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', pts, half: 0, ...over })
const object = (id: string, shapes: string[], over: Partial<ModelObject> = {}): ModelObject => ({ id, name: id, layer: 'body', shapes, ...over })
const group = (id: string, objects: string[], over: Partial<ModelGroup> = {}): ModelGroup => ({ id, name: id, parent: null, objects, pivot: null, attach: null, ...over })
function model(shapes: ModelShape[], objects: ModelObject[], groups: ModelGroup[]): ModelContent {
  return { name: 'm', description: '', shapes, objects, groups, axis: 100, ranges: [] } as unknown as ModelContent
}
const centreX = (s: { poly: Array<[number, number]> }): number => { const xs = s.poly.map(p => p[0]); return (Math.min(...xs) + Math.max(...xs)) / 2 }
const widthOf = (s: { poly: Array<[number, number]> }): number => { const xs = s.poly.map(p => p[0]); return Math.max(...xs) - Math.min(...xs) }

describe('the angles a figure is seen from', () => {
  it('names eight angles round the figure and reads any view as degrees', () => {
    expect(ANGLES.map(a => a.at)).toEqual([0, 45, 90, 135, 180, 225, 270, 315])
    expect(angleOf('front')).toBe(0)
    expect(angleOf('back')).toBe(180)
    expect(angleOf(-90)).toBe(270)
    expect(angleOf(450)).toBe(90)
    expect(angleOf(Number.NaN)).toBe(0)
    expect(isFlat('back')).toBe(true)
    expect(isFlat(45)).toBe(false)
    expect(fromBehind(135)).toBe(true)
    expect(fromBehind(90)).toBe(false)
    expect(angleName(90)).toBe('Right profile')
    expect(angleName(100)).toBe('100°')
    expect(nearestAngle(100).id).toBe('right')
    expect(viewFor(360)).toBe('front')
    expect(viewFor(180.2)).toBe('back')
    expect(viewFor(44.6)).toBe(45)
  })
})

describe('turning an outline', () => {
  it('is exact at the quarter turns, and a rounded outline is as wide as it is deep at the side', () => {
    const side = turningOf(90, 100)
    expect([side.cos, side.sin]).toEqual([0, 1])
    expect(squash(turningOf(0, 100), 0.5)).toBe(1)
    expect(squash(side, 0.5)).toBeCloseTo(0.5, 9)
    expect(squash(turningOf(180, 100), 0.5)).toBe(-1)
  })

  it('mirrors an outline about the axis at the back, as the back view always did', () => {
    const t = turningOf(180, 100), a = build(box4(120, 0, 140, 10), true)
    const m = silhouetteMatrix(t, 130, 0, 0.7), b = applySilhouette(a, m)
    b.forEach((p, i) => expect(p.x).toBeCloseTo(200 - a[i].x, 9))
  })

  it('moves a rounded outline with its middle: what stands toward the viewer swings across at the side', () => {
    const t = turningOf(90, 100), a = build(box4(130, 0, 150, 10), true)
    // a middle 40 from the axis comes to the axis at the side; 20 toward the viewer moves it 20 across
    const flatOn = applySilhouette(a, silhouetteMatrix(t, 140, 0, 1)), deep = applySilhouette(a, silhouetteMatrix(t, 140, 20, 1))
    expect((flatOn[0].x + flatOn[1].x) / 2).toBeCloseTo(100, 9)
    expect((deep[0].x + deep[1].x) / 2).toBeCloseTo(120, 9)
  })

  it('turns an outline with depths of its own point by point, the handles a third of the way to their neighbours', () => {
    const t = turningOf(90, 100)
    const a: BuiltPoint[] = build([pt(100, 0), pt(110, 10), pt(100, 20)], false)
    const d = handleDepths([0, 30, 0], false)
    expect(d.ho[0]).toBeCloseTo(10, 9)
    expect(d.hi[1]).toBeCloseTo(20, 9)
    const b = projectSurface(a, d, t)
    expect(b.map(p => p.x)).toEqual([100, 130, 100])
    expect(b[1].y).toBe(10)
  })

  it('reads depths off a rounded surface: deepest at its middle, its middle depth at its edge, facing the viewer in the middle', () => {
    const s = { box: { x: 80, y: 0, w: 40, h: 60 }, dc: 5, thick: 1 }
    const mid = surfaceAt(s, 100, 30), edge = surfaceAt(s, 120, 30)
    expect(mid.d).toBeCloseTo(25, 9)
    expect(edge.d).toBeCloseTo(5, 9)
    expect(mid.nz).toBeCloseTo(1, 9)
    expect(edge.nx).toBeCloseTo(1, 9)
  })

  it('fades a shape drawn for the front as it turns away, and keeps a shape to its own range of angles', () => {
    expect(facing(turningOf(0, 100), 0, 1)).toBe(1)
    expect(facing(turningOf(180, 100), 0, 1)).toBe(-1)
    expect(facingFade(1)).toBe(1)
    expect(facingFade(-0.2)).toBe(0)
    expect(facingFade(0.03)).toBeGreaterThan(0)
    expect(facingFade(0.03)).toBeLessThan(1)
    expect(inSeen([300, 60], 10)).toBe(true)
    expect(inSeen([300, 60], 90)).toBe(false)
  })

  it('draws a thing at its front depth from the front, its back depth from the back, and the near side in front in profile', () => {
    const front = turningOf(0, 100), back = turningOf(180, 100), side = turningOf(90, 100)
    expect(viewZ(front, 30, 50, 80)).toBe(30)
    expect(viewZ(back, 30, 50, 80)).toBe(50)
    // at 90 the character's right side (the picture's left at the front, x < 100) is toward the viewer
    expect(viewZ(side, 40, 40, 70)).toBeGreaterThan(viewZ(side, 40, 40, 130))
  })
})

describe('the data of a turn', () => {
  it('keeps key angles at multiples of 15 that are not the front or the back', () => {
    expect(keyAngle(90)).toBe(90)
    expect(keyAngle(-45)).toBe(315)
    expect(keyAngle(0)).toBeNull()
    expect(keyAngle(180)).toBeNull()
    expect(keyAngle(50)).toBeNull()
  })
  it('repairs a turn as the server does', () => {
    const t = repairTurn({ depth: 500, thick: 3, dz: [1, 'x'], angles: [{ at: 90, tilt: 37, pts: [pt(0, 0), pt(1, 0), pt(1, 1)] }, { at: 90, tilt: 30, pts: [] }], seen: [-30, 400] }, 3, p => p as ModelPoint)!
    expect(t.depth).toBe(200)
    expect(t.thick).toBe(2)
    expect(t.dz).toEqual([1, 0, 0])
    expect(t.angles.map(a => [a.at, a.tilt])).toEqual([[90, 30]])
    expect(t.seen).toEqual([330, 40])
    expect(repairTurn(null, 3, p => p as ModelPoint)).toBeNull()
  })
  it('refuses an object that lies on a shape that is not there, or on its own', () => {
    const c = model([shape('a', box4(0, 0, 1, 1))], [object('o', ['a'], { wrap: 'a' }), object('p', [], { wrap: 'nope' })], [])
    expect(turnFaults(c)).toEqual(['Object o lies on one of its own shapes.', 'Object p lies on a shape that does not exist.'])
  })
})

describe('solving a turned figure', () => {
  it('draws the back exactly as before, whichever way it is asked for', () => {
    const v = defaultValues(seed), a = solve(seed, v, 'back'), b = solve(seed, v, 180)
    expect(b.order).toEqual(a.order)
    for (const id of Object.keys(a.shapes)) expect(b.shapes[id].d).toBe(a.shapes[id].d)
    const f = solve(seed, v, 'front'), g = solve(seed, v, 360)
    for (const id of Object.keys(f.shapes)) expect(g.shapes[id].d).toBe(f.shapes[id].d)
  })

  it('moves a shape by the depth of its group and narrows it to its roundness at the side', () => {
    const c = model([shape('a', box4(130, 0, 150, 10)), shape('b', box4(130, 20, 150, 30), { turn: { depth: 0, thick: 0.5, dz: [], angles: [], seen: null } })],
      [object('o', ['a']), object('p', ['b'])], [group('g', ['o'], { depth: 20 }), group('h', ['p'])])
    const s = solve(c, {}, 90)
    expect(centreX(s.shapes.a)).toBeCloseTo(120, 6)
    expect(widthOf(s.shapes.a)).toBeCloseTo(20 * 0.8, 6)   // a body part with no roundness of its own: the layer's
    expect(centreX(s.shapes.b)).toBeCloseTo(100, 6)
    expect(widthOf(s.shapes.b)).toBeCloseTo(10, 6)
    expect(s.shapes.a.depth).toBeCloseTo(20 * 0 - 40 * 1, 6)
  })

  it('turns a shape with depths of its own point by point', () => {
    const c = model([shape('a', box4(100, 0, 110, 10), { turn: { depth: 0, thick: null, dz: [0, 0, 30, 30], angles: [], seen: null } })], [object('o', ['a'])], [group('g', ['o'])])
    const xs = solve(c, {}, 90).shapes.a.poly.map(p => p[0])
    expect(Math.max(...xs)).toBeCloseTo(130, 6)
  })

  it('slides what lies on a rounded shape round it, and hides it once it faces away', () => {
    const c = model(
      [shape('skull', box4(80, 0, 120, 60)), shape('eye', box4(110, 20, 114, 24), { view: 'front' })],
      [object('head', ['skull']), object('eyes', ['eye'], { wrap: 'skull' })], [group('g', ['head', 'eyes'])])
    const front = solve(c, {}, 'front'), quarter = solve(c, {}, 45), right = solve(c, {}, 90), left = solve(c, {}, 270)
    expect(centreX(front.shapes.eye)).toBeCloseTo(112, 6)
    // turned to show the character's right (the eye is on the picture's right: the character's left), the eye goes round the far side
    expect(centreX(quarter.shapes.eye)).toBeGreaterThan(centreX(quarter.shapes.skull))
    expect(right.shapes.eye.visible).toBe(false)
    expect(left.shapes.eye.visible).toBe(true)
    expect(left.shapes.eye.face).toBeGreaterThan(0.5)
  })

  it('turns a twin on its own: the near and the far side differ', () => {
    const c = model([shape('l', box4(120, 0, 130, 10)), shape('r', [], { mirrorOf: 'l' })], [object('o', ['l', 'r'])], [group('g', ['o'], { depth: 0 })])
    const s = solve(c, {}, 45)
    // the original is at x 125, the twin at 75: turned 45 degrees they come to 100 ± 25 cos 45
    expect(centreX(s.shapes.l)).toBeCloseTo(100 + 25 * Math.SQRT1_2, 6)
    expect(centreX(s.shapes.r)).toBeCloseTo(100 - 25 * Math.SQRT1_2, 6)
  })

  it('puts the near side in front of the far side in profile', () => {
    const c = model([shape('near', box4(60, 0, 80, 10)), shape('far', box4(120, 0, 140, 10))], [object('a', ['near']), object('b', ['far'])], [group('g', ['a', 'b'])])
    const s = solve(c, {}, 90)
    expect(s.order.indexOf('near')).toBeGreaterThan(s.order.indexOf('far'))
    expect(solve(c, {}, 270).order.indexOf('near')).toBeLessThan(solve(c, {}, 270).order.indexOf('far'))
  })

  it('draws every shape of the basic model at every named angle with no gaps in the numbers', () => {
    for (const a of ANGLES) {
      const s = solve(seed, defaultValues(seed), a.at)
      for (const sh of Object.values(s.shapes)) expect(sh.d.includes('NaN') || sh.d.includes('Infinity'), `${sh.id} at ${a.at}`).toBe(false)
      expect(s.order.length).toBeGreaterThan(100)
    }
  })

  it('takes a frame round with the figure', () => {
    const f = { x: 120, y: 0, w: 20, h: 20 }
    expect(viewBoxOf(f, 'back')).toEqual({ x: 60, y: 0, w: 20, h: 20 })
    expect(viewBoxOf(f, 90).x).toBeCloseTo(90, 6)
    expect(flatten(build(box4(0, 0, 1, 1), true), true).length).toBe(4)
  })
})
