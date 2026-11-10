import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup, shapeById } from '../modelContent'
import { advanceLock, crossingNear, crossingsOf, lockStage, segmentCrossing } from './crossings'
import { NEXT_MODE, cycleMode } from './edit'
import { solve } from './rig'
import type { Edit } from './rigEdit'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const sharp = (id: string, pts: Array<[number, number]>, over: Partial<ModelShape> = {}): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })), ...over })

// Two squares that overlap at a corner: A is 60..100 across and 100..140 down, B is 80..120 across and 120..160 down. Their outlines cross twice, at (100, 120) and (80, 140).
function overlapping(): ModelContent {
  return {
    ...blankContent('Cross'),
    shapes: [
      sharp('a', [[60, 100], [100, 100], [100, 140], [60, 140]]),
      sharp('b', [[80, 120], [120, 120], [120, 160], [80, 160]]),
    ],
    objects: [{ id: 'oA', name: 'A', layer: 'body', shapes: ['a'] }, { id: 'oB', name: 'B', layer: 'body', shapes: ['b'] }],
    groups: [newGroup('g', 'Group', null, ['oA', 'oB'])],
  }
}

describe('where two segments cross', () => {
  it('finds the place, and nothing when they miss or run side by side', () => {
    expect(segmentCrossing([[0, 0], [10, 10]], [[0, 10], [10, 0]])).toEqual([5, 5])
    expect(segmentCrossing([[0, 0], [10, 0]], [[0, 5], [10, 5]])).toBeNull()
    expect(segmentCrossing([[0, 0], [4, 0]], [[6, -3], [6, 3]])).toBeNull()
  })
})

describe('the crossings of a shape\'s outline', () => {
  it('lists every place it meets another drawn shape\'s outline', () => {
    const c = overlapping(), solved = solve(c)
    const found = crossingsOf(c, solved, 'a')
    expect(found).toHaveLength(2)
    expect(found.every(x => x.other === 'b')).toBe(true)
    const spots = found.map(x => [Math.round(x.x), Math.round(x.y)]).sort((p, q) => p[0] - q[0])
    expect(spots).toEqual([[80, 140], [100, 120]])
  })
  it('finds none for a shape that touches nothing, and leaves out shapes that are not drawn', () => {
    const apart: ModelContent = { ...overlapping(), shapes: [sharp('a', [[10, 10], [30, 10], [30, 30], [10, 30]]), sharp('b', [[80, 120], [120, 120], [120, 160], [80, 160]])] }
    expect(crossingsOf(apart, solve(apart), 'a')).toEqual([])
    const solved = solve(overlapping(), {}, 'front', { hidden: ['oB'] })
    expect(crossingsOf(overlapping(), solved, 'a')).toEqual([])
  })
  it('picks the crossing nearest a place, within reach', () => {
    const found = crossingsOf(overlapping(), solve(overlapping()), 'a')
    expect(crossingNear(found, 101, 121, 3)).toMatchObject({ other: 'b' })
    expect(Math.round(crossingNear(found, 101, 121, 3)!.x)).toBe(100)
    expect(crossingNear(found, 140, 20, 3)).toBeNull()
  })
})

describe('locking at a crossing', () => {
  const at = (c: ModelContent, i = 0) => {
    const solved = solve(c)
    const cr = crossingsOf(c, solved, 'a').find(x => Math.round(x.x) === 100)!
    return { solved, cr, i }
  }

  it('locks the selected shape onto the other, then welds them, then lets go', () => {
    let c = overlapping()
    let { solved, cr } = at(c)
    expect(lockStage(c, solved, 'a', cr)).toEqual({ stage: 0, index: null })

    // click 1: a point is put on A at the crossing and locked onto B's edge
    c = must(advanceLock(c, solved, 'a', cr))
    const a1 = shapeById(c, 'a')!
    expect(a1.pts).toHaveLength(5)
    const held = a1.pts.findIndex(p => p.bind)
    expect(a1.pts[held].bind).toMatchObject({ kind: 'edge', s: 'b' })
    expect(a1.pts[held].m).toBe('s')
    expect(a1.pts[held].x).toBeCloseTo(100, 1)
    expect(a1.pts[held].y).toBeCloseTo(120, 1)
    ;({ solved, cr } = at(c))
    expect(lockStage(c, solved, 'a', cr)).toEqual({ stage: 1, index: held })

    // click 2: B gets a point there too and the two are welded
    c = must(advanceLock(c, solved, 'a', cr))
    expect(shapeById(c, 'b')!.pts).toHaveLength(5)
    const a2 = shapeById(c, 'a')!
    expect(a2.pts[held].bind).toMatchObject({ kind: 'point', s: 'b', d: [0, 0] })
    ;({ solved, cr } = at(c))
    expect(lockStage(c, solved, 'a', cr)).toMatchObject({ stage: 2, index: held })

    // click 3: unlocked, and both points stay
    c = must(advanceLock(c, solved, 'a', cr))
    expect(shapeById(c, 'a')!.pts).toHaveLength(5)
    expect(shapeById(c, 'b')!.pts).toHaveLength(5)
    expect(shapeById(c, 'a')!.pts[held].bind ?? null).toBeNull()
    ;({ solved, cr } = at(c))
    expect(lockStage(c, solved, 'a', cr)).toMatchObject({ stage: 0, index: held })
  })

  it('keeps the locked point on the other shape\'s edge when that shape moves', () => {
    let c = overlapping()
    const { solved, cr } = at(c)
    c = must(advanceLock(c, solved, 'a', cr))
    const moved: ModelContent = { ...c, shapes: c.shapes.map(s => (s.id === 'b' ? { ...s, pts: s.pts.map(p => ({ ...p, y: p.y + 6 })) } : s)) }
    const a = solve(moved).shapes.a.pre.find((_p, i) => shapeById(moved, 'a')!.pts[i].bind)!
    expect(a.y).toBeCloseTo(126, 1)
  })

  it('refuses a twin, and a shape at the most points', () => {
    const twin: ModelContent = { ...overlapping(), shapes: [...overlapping().shapes, sharp('t', [], { mirrorOf: 'a' })], objects: overlapping().objects }
    const solved = solve(twin)
    const e = advanceLock(twin, solved, 't', { x: 100, y: 120, other: 'b' })
    expect(e.ok).toBe(false)
    // a square with 56 more points up its left side: 60 in all, and none near the crossing on its right side
    const left = Array.from({ length: 56 }, (_, i) => [60, 139 - i * 0.7] as [number, number])
    const many: ModelContent = { ...overlapping(), shapes: [sharp('a', [[60, 100], [100, 100], [100, 140], [60, 140], ...left]), overlapping().shapes[1]] }
    expect(many.shapes[0].pts).toHaveLength(60)
    const edit = advanceLock(many, solve(many), 'a', { x: 100, y: 120, other: 'b' })
    expect(edit.ok).toBe(false)
  })
})

describe('clicking a point steps its handles', () => {
  it('goes through none, both, the incoming one, the outgoing one and round again', () => {
    expect(NEXT_MODE).toEqual({ s: 'c', c: 'cs', cs: 'sc', sc: 's' })
    let s = sharp('p', [[0, 0], [10, 0], [10, 10]])
    const seen: string[] = [s.pts[1].m]
    for (let k = 0; k < 4; k++) { s = cycleMode(s, 1); seen.push(s.pts[1].m) }
    expect(seen).toEqual(['s', 'c', 'cs', 'sc', 's'])
  })
  it('leaves the shape it was given alone, and a point that is not there', () => {
    const s = sharp('p', [[0, 0], [10, 0], [10, 10]])
    const next = cycleMode(s, 0)
    expect(s.pts[0].m).toBe('s')
    expect(next.pts[0].m).toBe('c')
    expect(cycleMode(s, 9).pts).toHaveLength(3)
  })
  it('turns the mirrored point the other way while mirroring', () => {
    const s: ModelShape = { ...sharp('p', [[80, 0], [120, 0], [120, 40], [80, 40]]), pts: [{ x: 80, y: 0, m: 'c' }, { x: 120, y: 0, m: 'c' }, { x: 120, y: 40, m: 'c' }, { x: 80, y: 40, m: 'c' }] }
    const next = cycleMode(s, 0, { mirror: true, axis: 100 })
    expect(next.pts[0].m).toBe('cs')
    expect(next.pts[1].m).toBe('sc')
  })
})
