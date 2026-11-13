import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup, normalizeContent } from '../modelContent'
import { applyDrape } from './fall'
import { DRAPE_STEP, drapeOf, hasWeights, stepDrape } from './drapeEdit'
import { addRange, addTurn, newRange, type Edit } from './rigEdit'
import { solve, type Values } from './rig'

// Drape (phase O6): a draped garment's weighted points hang back toward the way they were drawn when the body moves.
const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const P = (x: number, y: number, w = 0): ModelPoint => ({ x, y, m: 's', ...(w ? { w } : {}) })

// A skirt in the pelvis's group: its waist (no weight) and a hem that hangs (weights rising to the hem), and a slider that tilts the pelvis about the hips.
function skirt(drape: number, weights: [number, number] = [0.5, 1]): ModelContent {
  const s: ModelShape = { id: 'skirt', name: 'Skirt', closed: true, z: 30, op: 1, view: 'both', half: 0, template: null, pts: [P(80, 100), P(120, 100), P(124, 140, weights[0]), P(126, 180, weights[1]), P(74, 180, weights[1]), P(76, 140, weights[0])] }
  let c: ModelContent = {
    ...blankContent('Skirt'),
    shapes: [s], objects: [{ id: 'oSkirt', name: 'Skirt', layer: 'clothing', shapes: ['skirt'], drape }],
    groups: [{ ...newGroup('pelvis', 'Pelvis', null, ['oSkirt']), pivot: [100, 100] }],
  }
  c = must(addRange(c, { ...newRange('tilt', 'Hip tilt', 'turn', 'pelvis'), min: -30, rest: 0, max: 30 }))
  c = must(addTurn(c, 'tilt', 'pelvis'))
  return { ...c, ranges: c.ranges.map(r => ({ ...r, drives: r.drives.map(d => ({ ...d, atMin: -30, atMax: 30 })) })) }
}
const pts = (c: ModelContent, v: Values) => solve(c, v).shapes.skirt.pre
const down = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI   // 0 = straight down

describe('drape', () => {
  it('leaves a garment where the body takes it with no drape', () => {
    const tilted = pts(skirt(0), { tilt: 30 })
    // the side from the waist to the hem turns with the pelvis
    expect(Math.abs(down(tilted[1], tilted[3]) - down({ x: 120, y: 100 }, { x: 126, y: 180 }))).toBeGreaterThan(20)
  })
  it('hangs the hem back the way it was drawn when the hips tilt, from both sides of the waist, as one line', () => {
    // (every point below the waist free to hang: a weight of 1)
    const rest = pts(skirt(100, [1, 1]), {}), tilted = pts(skirt(100, [1, 1]), { tilt: 30 }), stiff = pts(skirt(0), { tilt: 30 })
    const off = (a: typeof rest, i: number, j: number) => Math.abs(down(a[i], a[j]) - down(rest[i], rest[j]))
    // the waist turns with the pelvis
    expect(tilted[1].y).not.toBeCloseTo(rest[1].y, 0)
    // each side hangs close to the way it was drawn (a stiff skirt turns the whole 30 degrees)
    for (const [i, j] of [[1, 2], [2, 3], [0, 5], [5, 4]]) {
      expect(off(tilted, i, j), `${i}-${j}`).toBeLessThan(8)
      expect(off(stiff, i, j), `${i}-${j} stiff`).toBeGreaterThan(25)
    }
    // the hem stays one line, near level, between the two sides
    expect(Math.abs(Math.atan2(tilted[4].y - tilted[3].y, tilted[3].x - tilted[4].x) * 180 / Math.PI)).toBeLessThan(8)
    // and the sides keep about their drawn length (the side under the hip that rose a little shorter, the other a little longer)
    const ratio = Math.hypot(tilted[3].x - tilted[1].x, tilted[3].y - tilted[1].y) / Math.hypot(rest[3].x - rest[1].x, rest[3].y - rest[1].y)
    expect(ratio).toBeGreaterThan(0.85); expect(ratio).toBeLessThan(1.15)
  })
  it('hangs part of the way with less drape or a lighter weight', () => {
    const angle = (c: ModelContent) => { const t = pts(c, { tilt: 30 }); return down(t[2], t[3]) }
    const drawn = down({ x: 124, y: 140 }, { x: 126, y: 180 })
    const none = angle(skirt(0)), half = angle(skirt(50)), full = angle(skirt(100))
    expect(Math.abs(full - drawn)).toBeLessThan(8)
    expect(Math.abs(half - drawn)).toBeGreaterThan(Math.abs(full - drawn) + 5)
    expect(Math.abs(half - drawn)).toBeLessThan(Math.abs(none - drawn) - 5)
    const lighter = angle(skirt(100, [0.25, 0.5]))
    expect(Math.abs(lighter - drawn)).toBeGreaterThan(Math.abs(full - drawn) + 3)
  })
  it('changes nothing at rest', () => {
    const plain = pts(skirt(0), {}), draped = pts(skirt(100), {})
    draped.forEach((p, i) => { expect(p.x).toBeCloseTo(plain[i].x, 6); expect(p.y).toBeCloseTo(plain[i].y, 6) })
  })
  it('keeps every point finite for any slider value', () => {
    const c = skirt(100)
    for (const v of [-1e9, -30, 0, 17.3, 30, 1e9, Number.NaN]) for (const p of pts(c, { tilt: v })) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
    const list = [P(0, 0), P(10, 0), P(10, 10, 1), P(0, 10, 1)]
    applyDrape(list, true, 1, [P(0, 0), P(10, 0), P(10, 10), P(0, 10)], () => [Number.NaN, Number.NaN])
    for (const p of list) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
  })
})

describe('the drape of an object', () => {
  it('steps by tenths between none and all, refused for a twin', () => {
    let c = skirt(0)
    c = must(stepDrape(c, 'oSkirt', 1))
    expect(drapeOf(c, c.objects[0])).toBe(DRAPE_STEP)
    c = must(stepDrape(c, 'oSkirt', 1, true))
    expect(drapeOf(c, c.objects[0])).toBe(35)
    for (let i = 0; i < 12; i++) c = must(stepDrape(c, 'oSkirt', 1))
    expect(drapeOf(c, c.objects[0])).toBe(100)
    for (let i = 0; i < 12; i++) c = must(stepDrape(c, 'oSkirt', -1))
    expect(drapeOf(c, c.objects[0])).toBe(0)
    const twinned: ModelContent = { ...c, objects: [{ ...c.objects[0], drape: 60 }, { id: 'oTwin', name: 'Twin', layer: 'clothing', shapes: [], mirrorOf: 'oSkirt' }] }
    expect(drapeOf(twinned, twinned.objects[1])).toBe(60)
    const e = stepDrape(twinned, 'oTwin', 1)
    expect(e.ok).toBe(false)
    expect(stepDrape(c, 'nothing', 1).ok).toBe(false)
  })
  it('knows whether anything in it can hang', () => {
    const c = skirt(100)
    expect(hasWeights(c, c.objects[0])).toBe(true)
    const bare: ModelContent = { ...c, shapes: c.shapes.map(s => ({ ...s, pts: s.pts.map(p => ({ ...p, w: 0 })) })) }
    expect(hasWeights(bare, bare.objects[0])).toBe(false)
  })
  it('is repaired to a whole percent between 0 and 100 when saved', () => {
    const c = skirt(0)
    const odd = (v: unknown) => normalizeContent({ ...c, objects: [{ ...c.objects[0], drape: v as number }] }).objects[0].drape
    expect([odd(42.6), odd(-5), odd(250), odd(Number.NaN), odd(undefined), odd('x')]).toEqual([43, 0, 100, 0, 0, 0])
  })
})
