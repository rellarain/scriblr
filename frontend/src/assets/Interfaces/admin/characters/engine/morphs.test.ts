import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelDrive, ModelRange, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup, normalizeContent } from '../modelContent'
import { apply } from './geometry'
import { alignMorphs, bodied, morphKeys } from './morphs'
import { makeTwin } from './pairEdit'
import { isPointDriven, solve, type Solved } from './rig'

// Body keys (slice 9f): a shape's points move by a share of a key as a body slider moves, a key may depend on a second slider, a twin moves as its original does, and the
// keys stay in step when points are put in or taken away.

const outline = (id: string, pts: Array<[number, number]>, morphs?: ModelShape['morphs']): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })), ...(morphs ? { morphs } : {}),
})
const morph = (id: string, extra: Partial<ModelDrive> = {}): ModelDrive => ({
  kind: 'morph', group: null, target: null, id, axis: 'xy', shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: -50, atMax: 100, mirror: true, ...extra,
})
const slider = (id: string, drives: ModelDrive[], span: Partial<ModelRange> = {}): ModelRange => ({ id, name: id, scope: null, min: -100, rest: 0, max: 100, unit: '', show: true, rand: null, drives, ...span })

// a body (60..140 by 40..100) whose 'fat' key widens it 10 each way, and whose 'hips' key widens its bottom by 4 more; an arm on the picture's right whose 'fat' key widens
// it 2 to the right, twinned
function figure(): ModelContent {
  let c = addGroup(blank('Keys'), newGroup('torso', 'Torso'))
  c = addObject(c, 'torso', { id: 'ob', name: 'Body', layer: 'body', shapes: [] })
  c = addShape(c, 'ob', outline('body', [[60, 40], [140, 40], [140, 100], [60, 100]], { fat: [[-10, 0], [10, 0], [10, 0], [-10, 0]], hips: [[0, 0], [0, 0], [4, 0], [-4, 0]] }))
  c = addGroup(c, { ...newGroup('arm', 'Arm'), parent: 'torso' })
  c = addObject(c, 'arm', { id: 'oa', name: 'Arm', layer: 'body', shapes: [] })
  c = addShape(c, 'oa', outline('upper', [[150, 40], [160, 40], [160, 100], [150, 100]], { fat: [[0, 0], [2, 0], [2, 0], [0, 0]] }))
  const twinned = makeTwin(c, 'group', 'arm', p => `${p}R`)
  if (!twinned.ok) throw new Error(twinned.reason)
  return {
    ...twinned.content,
    ranges: [slider('fat', [morph('fat'), morph('hips', { by: { range: 'fem', at: 100 } })]), slider('fem', [], { min: 0, rest: 0, max: 100 })],
  }
}
const drawn = (s: Solved, id: string) => s.shapes[id].local.map(p => apply(s.shapes[id].matrix, p.x, p.y).map(v => Math.round(v * 100) / 100))

describe('a body slider', () => {
  it('moves each point by its share of the key, the other way below rest', () => {
    const c = figure()
    expect(drawn(solve(c, {}), 'body')).toEqual([[60, 40], [140, 40], [140, 100], [60, 100]])
    expect(drawn(solve(c, { fat: 100 }), 'body')).toEqual([[50, 40], [150, 40], [150, 100], [50, 100]])
    // at the minimum, half the key the other way (atMin -50)
    expect(drawn(solve(c, { fat: -100 }), 'body')).toEqual([[65, 40], [135, 40], [135, 100], [65, 100]])
  })
  it('moves a key that depends on a second slider by that slider’s share of the way to where it counts in full', () => {
    const c = figure()
    expect(drawn(solve(c, { fat: 100, fem: 0 }), 'body')[2]).toEqual([150, 100])
    expect(drawn(solve(c, { fat: 100, fem: 50 }), 'body')[2]).toEqual([152, 100])
    expect(drawn(solve(c, { fat: 100, fem: 100 }), 'body')[2]).toEqual([154, 100])
    // with the second slider gone, the key it scales does nothing
    const gone = { ...c, ranges: c.ranges.filter(r => r.id !== 'fem') }
    expect(drawn(solve(gone, { fat: 100 }), 'body')[2]).toEqual([150, 100])
  })
  it('moves a twin as its original, the mirror way, and counts as driving both', () => {
    const c = figure(), twin = c.shapes.find(s => s.mirrorOf === 'upper')!.id
    expect(drawn(solve(c, { fat: 100 }), 'upper').map(p => p[0])).toEqual([150, 162, 162, 150])
    expect(drawn(solve(c, { fat: 100 }), twin).map(p => p[0]).sort((a, b) => a - b)).toEqual([38, 38, 50, 50])
    expect(isPointDriven(c, { fat: 40 }, 'upper')).toBe(true)
    expect(isPointDriven(c, { fat: 40 }, twin)).toBe(true)
    expect(isPointDriven(c, {}, twin)).toBe(false)
  })
})

describe('a body baked in', () => {
  it('moves the pivots and the guide as the points nearest them move, and is the model itself at rest', () => {
    const plain = figure()
    const c = { ...plain, groups: plain.groups.map(g => (g.id === 'arm' ? { ...g, pivot: [160, 40] as [number, number] } : g)), guide: { top: 40, head: 20, lines: [{ name: 'Waist', y: 100 }] } }
    expect(bodied(c, {})).toBe(c)
    expect(bodied(c, { fat: 0, fem: 100 })).toBe(c)
    const b = bodied(c, { fat: 100 })
    const pivot = b.groups.find(g => g.id === 'arm')!.pivot!
    expect(pivot[0]).toBeGreaterThan(161)
    expect(pivot[0]).toBeLessThan(162.1)
    expect(pivot[1]).toBeCloseTo(40)
    // nothing moves up or down here, so the guide stays
    expect(b.guide!.lines[0].y).toBeCloseTo(100)
    // its morph drives are gone (what they do is in the points)
    expect(b.ranges.flatMap(r => r.drives).some(d => d.kind === 'morph')).toBe(false)
    expect(bodied(c, { fat: 100 })).toBe(b)
  })
})

describe('the body keys of a shape', () => {
  it('stay in step when a point is put in or taken away', () => {
    const c = figure(), body = c.shapes.find(s => s.id === 'body')!
    // a point put in between the second and the third moves halfway between them
    const put = { ...c, shapes: c.shapes.map(s => (s.id === 'body' ? { ...s, pts: [s.pts[0], s.pts[1], { x: 140, y: 70, m: 's' as const }, s.pts[2], s.pts[3]] } : s)) }
    expect(alignMorphs(c, put).shapes.find(s => s.id === 'body')!.morphs).toEqual({ fat: [[-10, 0], [10, 0], [10, 0], [10, 0], [-10, 0]], hips: [[0, 0], [0, 0], [2, 0], [4, 0], [-4, 0]] })
    // a point taken away takes its moves with it
    const taken = { ...c, shapes: c.shapes.map(s => (s.id === 'body' ? { ...s, pts: [body.pts[0], body.pts[1], body.pts[3]] } : s)) }
    expect(alignMorphs(c, taken).shapes.find(s => s.id === 'body')!.morphs!.hips).toEqual([[0, 0], [0, 0], [-4, 0]])
    expect(morphKeys(c)).toEqual(['fat', 'hips'])
  })
  it('are repaired on load: a key of another length, an all-zero key and a twin’s keys are dropped', () => {
    const c = figure(), twin = c.shapes.find(s => s.mirrorOf === 'upper')!.id
    const messy = { ...c, shapes: c.shapes.map(s => (s.id === 'body' ? { ...s, morphs: { ...s.morphs, short: [[1, 1]] as Array<[number, number]>, zero: [[0, 0], [0, 0], [0, 0], [0, 0]] as Array<[number, number]>, 'bad key': [[1, 1], [1, 1], [1, 1], [1, 1]] as Array<[number, number]> } } : s.id === twin ? { ...s, morphs: { fat: [[1, 1]] as Array<[number, number]> } } : s)) }
    const n = normalizeContent(messy)
    expect(Object.keys(n.shapes.find(s => s.id === 'body')!.morphs!)).toEqual(['fat', 'hips'])
    expect(n.shapes.find(s => s.id === twin)!.morphs).toBeUndefined()
    expect(n.ranges[0].drives[1].by).toEqual({ range: 'fem', at: 100 })
    expect('by' in n.ranges[0].drives[0]).toBe(false)
  })
})
