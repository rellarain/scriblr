import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelDrive, ModelGroup, ModelRange, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup } from '../modelContent'
import { apply, rotate, scale as scaleMat } from './geometry'
import { seededRng } from './previews'
import { amount, chainDepth, chainOf, defaultValues, descendantsOf, groupOrder, isPointDriven, pointDrivers, solve, subtreeHeight, valueOf } from './rig'

const poly = (id: string, pts: Array<[number, number]>, over: Partial<ModelShape> = {}): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })), ...over,
})
const drive = (over: Partial<ModelDrive>): ModelDrive => ({
  kind: 'turn', group: null, target: null, id: null, axis: 'xy', shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: 0, atMax: 0, mirror: true, ...over,
})
const range = (id: string, drives: ModelDrive[], over: Partial<ModelRange> = {}): ModelRange => ({
  id, name: id, scope: null, min: -20, rest: 0, max: 20, unit: '°', show: true, rand: null, drives, ...over,
})
const group = (id: string, parent: string | null, objects: string[], over: Partial<ModelGroup> = {}): ModelGroup => ({ ...newGroup(id, id, parent, objects), ...over })

// A torso with a neck, a head hung from the neck's top edge (its pivot sits on that edge's middle) and hair hung from the head.
function figure(over: Partial<ModelContent> = {}): ModelContent {
  return {
    ...blankContent('Fig'),
    shapes: [
      poly('neck', [[90, 60], [110, 60], [110, 90], [90, 90]]),
      poly('head', [[80, 20], [120, 20], [120, 60], [80, 60]]),
      poly('hair', [[78, 10], [122, 10], [122, 24], [78, 24]]),
    ],
    objects: [
      { id: 'oNeck', name: 'Neck', layer: 'body', shapes: ['neck'] },
      { id: 'oHead', name: 'Head', layer: 'body', shapes: ['head'] },
      { id: 'oHair', name: 'Hair', layer: 'hair', shapes: ['hair'] },
    ],
    groups: [
      group('torso', null, ['oNeck'], { pivot: [100, 150] }),
      group('headG', 'torso', ['oHead'], { pivot: [100, 60], attach: { shape: 'neck', kind: 'edge', i: 0, t: 0.5, slider: null, rx: 0.5, ry: 0.5 } }),
      group('hairG', 'headG', ['oHair'], { pivot: [100, 24] }),
    ],
    ranges: [range('tilt', [drive({ kind: 'turn', group: 'headG', atMin: -12, atMax: 12 })])],
    ...over,
  }
}
const close = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits)
const pointOf = (c: ModelContent, values: Record<string, number>, sid: string, i: number) => {
  const s = solve(c, values).shapes[sid]
  return apply(s.matrix, s.local[i].x, s.local[i].y)
}

describe('the amount of a drive', () => {
  const r = range('r', [], { min: -20, rest: 0, max: 20 })
  const d = drive({ atMin: -12, atMax: 12 })
  it('is 0 at rest, the end amounts at the ends and in a straight line between', () => {
    close(amount(r, d, 0), 0); close(amount(r, d, 20), 12); close(amount(r, d, -20), -12); close(amount(r, d, 10), 6); close(amount(r, d, -10), -6)
  })
  it('works when rest is not in the middle', () => {
    const lop = range('r', [], { min: 0, rest: 25, max: 100 })
    close(amount(lop, d, 62.5), 6); close(amount(lop, d, 12.5), -6); close(amount(lop, d, 0), -12)
  })
  it('works when rest is an end', () => {
    const end = range('r', [], { min: 0, rest: 0, max: 60 })
    close(amount(end, d, 30), 6); close(amount(end, d, 0), 0)
  })
  it('scales from 100 percent', () => {
    const s = drive({ kind: 'scale', atMin: 80, atMax: 120 })
    close(amount(r, s, 20, 100), 120); close(amount(r, s, -20, 100), 80); close(amount(r, s, 0, 100), 100); close(amount(r, s, 10, 100), 110)
  })
  it('holds a value to the range and takes a missing or bad one as rest', () => {
    const q = range('q', [], { min: 10, rest: 40, max: 50 })
    expect(valueOf(q, { q: 999 })).toBe(50); expect(valueOf(q, { q: -5 })).toBe(10); expect(valueOf(q, {})).toBe(40); expect(valueOf(q, { q: NaN })).toBe(40)
  })
})

describe('groups at rest', () => {
  it('stand where they were drawn when each pivot sits on its anchor', () => {
    const s = solve(figure(), defaultValues(figure()))
    for (const id of ['torso', 'headG', 'hairG']) s.mats[id].forEach((v, i) => close(v, [1, 0, 0, 1, 0, 0][i], 6))
    expect(s.shapes.head.d).toMatch(/^M/)
    expect(s.order).toHaveLength(3)
  })
  it('lists the groups parents first, even from a muddled list, and cuts a circle', () => {
    const c = figure({ groups: [group('c', 'b', []), group('a', null, []), group('b', 'a', [])] })
    expect(groupOrder(c).map(g => g.id)).toEqual(['a', 'b', 'c'])
    const loop = figure({ groups: [group('a', 'b', []), group('b', 'a', [])] })
    expect(groupOrder(loop).map(g => g.id).sort()).toEqual(['a', 'b'])
    expect(() => solve(loop, {})).not.toThrow()
  })
  it('knows the chain, the depth, the descendants and the height of a subtree', () => {
    const c = figure()
    expect(chainOf(c, 'hairG')).toEqual(['torso', 'headG', 'hairG'])
    expect(chainDepth(c, 'torso')).toBe(1); expect(chainDepth(c, 'nope')).toBe(0)
    expect([...descendantsOf(c, 'torso')].sort()).toEqual(['hairG', 'headG'])
    expect(subtreeHeight(c, 'torso')).toBe(3); expect(subtreeHeight(c, 'hairG')).toBe(1)
  })
})

describe('turning', () => {
  it('turns a group about its pivot by the slider\'s amount', () => {
    const c = figure(), s = solve(c, { tilt: 10 })
    const m = rotate(6, 100, 60)
    s.mats.headG.forEach((v, i) => close(v, m[i], 6))
    const [x, y] = pointOf(c, { tilt: 10 }, 'head', 0)
    const [ex, ey] = apply(m, 80, 20)
    close(x, ex); close(y, ey)
  })
  it('turns the children with their parent', () => {
    const c = figure()
    const [hx, hy] = pointOf(c, { tilt: 20 }, 'hair', 0)
    const [ex, ey] = apply(rotate(12, 100, 60), 78, 10)
    close(hx, ex); close(hy, ey)
  })
  it('adds the turns of the sliders that turn the same group', () => {
    const c = figure({ ranges: [range('a', [drive({ kind: 'turn', group: 'headG', atMax: 10 })]), range('b', [drive({ kind: 'turn', group: 'headG', atMax: 5 })])] })
    const s = solve(c, { a: 20, b: 20 })
    s.mats.headG.forEach((v, i) => close(v, rotate(15, 100, 60)[i], 6))
  })
  it('turns the other way at the other end', () => {
    const c = figure(), a = pointOf(c, { tilt: 20 }, 'head', 1), b = pointOf(c, { tilt: -20 }, 'head', 1)
    expect(a[1]).not.toBeCloseTo(b[1])
    const [ex] = apply(rotate(-12, 100, 60), 120, 20)
    close(b[0], ex)
  })
  it('leaves the pivot where it is', () => {
    const s = solve(figure(), { tilt: 20 })
    expect(s.pivots.headG[0]).toBeCloseTo(100); expect(s.pivots.headG[1]).toBeCloseTo(60)
  })
})

describe('scaling', () => {
  it('scales a group about its pivot, on one axis or both', () => {
    const both = figure({ ranges: [range('s', [drive({ kind: 'scale', target: 'group', id: 'headG', atMax: 150 })], { min: 50, rest: 100, max: 150, unit: '%' })] })
    const [x, y] = pointOf(both, { s: 150 }, 'head', 0)
    const [ex, ey] = apply(scaleMat(1.5, 1.5, 100, 60), 80, 20)
    close(x, ex); close(y, ey)
    const xOnly = figure({ ranges: [range('s', [drive({ kind: 'scale', target: 'group', id: 'headG', axis: 'x', atMax: 150 })], { min: 50, rest: 100, max: 150, unit: '%' })] })
    const [xx, xy] = pointOf(xOnly, { s: 150 }, 'head', 0)
    close(xx, 100 + (80 - 100) * 1.5); close(xy, 20)
  })
  it('scales a shape about its own middle', () => {
    const c = figure({ ranges: [range('s', [drive({ kind: 'scale', target: 'shape', id: 'head', atMax: 200 })], { min: 50, rest: 100, max: 200, unit: '%' })] })
    const s = solve(c, { s: 200 })
    close(s.shapes.head.box.w, 80); close(s.shapes.head.box.h, 80)
    close(s.shapes.head.box.x + s.shapes.head.box.w / 2, 100)
  })
  it('scales the whole model about its feet', () => {
    const c = figure({ ranges: [range('h', [drive({ kind: 'scale', target: 'model', atMin: 50, atMax: 100 })], { min: 50, rest: 100, max: 100, unit: '%' })] })
    const rest = solve(c, { h: 100 }).shapes.neck.box, small = solve(c, { h: 50 }).shapes.neck.box
    close(small.h, rest.h / 2); close(small.y + small.h, 392 - (392 - (rest.y + rest.h)) / 2)
  })
  it('never collapses a shape to nothing', () => {
    const c = figure({ ranges: [range('s', [drive({ kind: 'scale', target: 'group', id: 'headG', atMin: 5, atMax: 5 })], { min: 0, rest: 100, max: 200 })] })
    const s = solve(c, { s: 0 })
    expect(s.shapes.head.box.w).toBeGreaterThan(0)
  })
})

describe('moving points', () => {
  const moved = (over: Partial<ModelDrive>) => figure({ ranges: [range('w', [drive({ kind: 'points', shape: 'neck', ...over })], { min: -10, rest: 0, max: 10, unit: '' })] })
  it('moves the recorded points by the share of the way to the end', () => {
    const c = moved({ moves: [{ i: 1, dx: 6, dy: -2, dxMin: -4, dyMin: 1 }] })
    close(pointOf(c, { w: 5 }, 'neck', 1)[0], 110 + 3); close(pointOf(c, { w: 5 }, 'neck', 1)[1], 60 - 1)
    close(pointOf(c, { w: -10 }, 'neck', 1)[0], 110 - 4); close(pointOf(c, { w: -10 }, 'neck', 1)[1], 61)
    close(pointOf(c, { w: 0 }, 'neck', 1)[0], 110)
    close(pointOf(c, { w: 5 }, 'neck', 0)[0], 90)
  })
  it('moves the mirror twin the other way when the drive is symmetric', () => {
    const c = moved({ sym: true, moves: [{ i: 1, dx: 6, dy: 0, dxMin: 0, dyMin: 0 }] })
    close(pointOf(c, { w: 10 }, 'neck', 1)[0], 116); close(pointOf(c, { w: 10 }, 'neck', 0)[0], 84)
  })
  it('ignores a point that is not there', () => {
    const c = moved({ moves: [{ i: 99, dx: 6, dy: 0, dxMin: 0, dyMin: 0 }] })
    expect(solve(c, { w: 10 }).shapes.neck.visible).toBe(true)
  })
})

describe('bending', () => {
  it('leaves what is above the start still and turns what is below the end fully', () => {
    const c = figure({
      shapes: [poly('leg', [[90, 100], [110, 100], [110, 300], [90, 300]])], objects: [{ id: 'oLeg', name: 'Leg', layer: 'body', shapes: ['leg'] }],
      groups: [group('legG', null, ['oLeg'], { pivot: [100, 200] })],
      ranges: [range('knee', [drive({ kind: 'bend', shape: 'leg', pivot: [100, 200], y0: 200, y1: 260, atMax: 40 })], { min: 0, rest: 0, max: 75 })],
    })
    const top = pointOf(c, { knee: 75 }, 'leg', 0), bottom = pointOf(c, { knee: 75 }, 'leg', 2)
    close(top[0], 90); close(top[1], 100)
    const [ex, ey] = apply(rotate(40 * (75 / 75), 100, 200), 110, 300)
    close(bottom[0], ex); close(bottom[1], ey)
  })
})

describe('anchors', () => {
  const attachedTo = (att: Partial<NonNullable<ModelGroup['attach']>>, pivot: [number, number] = [100, 60], over: Partial<ModelContent> = {}) =>
    figure({
      groups: [group('torso', null, ['oNeck'], { pivot: [100, 150] }), group('headG', 'torso', ['oHead'], { pivot, attach: { shape: 'neck', kind: 'point', i: 0, t: 0, slider: null, rx: 0.5, ry: 0.5, ...att } }), group('hairG', 'headG', ['oHair'], { pivot: [100, 24] })],
      ...over,
    })
  it('fixes the pivot on a point of the parent\'s shape, so a pivot elsewhere makes the group move there', () => {
    const s = solve(attachedTo({ kind: 'point', i: 0 }), {})
    expect(s.anchors.headG).toEqual([90, 60])
    close(s.mats.headG[4], -10); close(s.mats.headG[5], 0)
  })
  it('fixes it at a spot along an edge', () => {
    const s = solve(attachedTo({ kind: 'edge', i: 0, t: 0.25 }), {})
    expect(s.anchors.headG).toEqual([95, 60])
  })
  it('fixes it inside the shape by relative place', () => {
    const s = solve(attachedTo({ kind: 'inside', rx: 0.5, ry: 0 }), {})
    close(s.anchors.headG![0], 100); close(s.anchors.headG![1], 60)
  })
  it('slides it along an edge with a slider', () => {
    const c = attachedTo({ kind: 'range', i: 0, slider: 'slide' }, [100, 60], { ranges: [range('slide', [], { min: 0, rest: 50, max: 100, unit: '%' })] })
    close(solve(c, { slide: 50 }).anchors.headG![0], 100)
    close(solve(c, { slide: 100 }).anchors.headG![0], 110)
    close(solve(c, { slide: 0 }).anchors.headG![0], 90)
    close(solve(c, { slide: 100 }).mats.headG[4], 10)
  })
  it('leaves the group where it is when the anchor cannot be found', () => {
    const s = solve(attachedTo({ shape: 'missing' }), {})
    expect(s.anchors.headG).toBeNull()
    s.mats.headG.forEach((v, i) => close(v, [1, 0, 0, 1, 0, 0][i]))
  })
  it('follows the parent as it turns', () => {
    const c = attachedTo({ kind: 'edge', i: 0, t: 0.5 }, [100, 60], { ranges: [range('bend', [drive({ kind: 'turn', group: 'torso', atMax: 10 })])] })
    const s = solve(c, { bend: 20 }), m = rotate(10, 100, 150), want = apply(m, 100, 60)
    close(s.anchors.headG![0], want[0]); close(s.anchors.headG![1], want[1])
  })
})

describe('the back view', () => {
  it('turns the figure round about the mirror line and shows what belongs to the back', () => {
    const c = figure({ shapes: [poly('a', [[80, 20], [90, 20], [90, 30]], { view: 'front' }), poly('b', [[70, 20], [80, 20], [80, 30]], { view: 'back' }), poly('c', [[60, 20], [70, 20], [70, 30]])], objects: [{ id: 'o', name: 'o', layer: 'body', shapes: ['a', 'b', 'c'] }], groups: [] })
    const front = solve(c, {}, 'front'), back = solve(c, {}, 'back')
    expect(front.order.sort()).toEqual(['a', 'c']); expect(back.order.sort()).toEqual(['b', 'c'])
    close(back.shapes.c.box.x, 130); close(back.shapes.c.box.w, 10)
  })
  it('uses the model\'s own mirror line', () => {
    const c = figure({ axis: 90, shapes: [poly('c', [[60, 20], [70, 20], [70, 30]])], objects: [{ id: 'o', name: 'o', layer: 'body', shapes: ['c'] }], groups: [] })
    close(solve(c, {}, 'back').shapes.c.box.x, 2 * 90 - 70)
  })
})

describe('what the canvas needs to know', () => {
  it('says which shapes a slider changes the points of', () => {
    const c = figure({ ranges: [range('w', [drive({ kind: 'points', shape: 'neck', moves: [{ i: 1, dx: 1, dy: 0, dxMin: 0, dyMin: 0 }] })]), range('tilt', [drive({ kind: 'turn', group: 'headG', atMax: 5 })])] })
    expect(pointDrivers(c, 'neck').map(r => r.id)).toEqual(['w'])
    expect(pointDrivers(c, 'head')).toEqual([])
    expect(isPointDriven(c, { w: 0 }, 'neck')).toBe(false)
    expect(isPointDriven(c, { w: 5 }, 'neck')).toBe(true)
    expect(isPointDriven(c, { tilt: 20 }, 'head')).toBe(false)
  })
  it('keeps the draw order: z first, then the tree', () => {
    const c = figure({ shapes: figure().shapes.map(s => (s.id === 'hair' ? { ...s, z: 10 } : s)) })
    expect(solve(c, {}).order[0]).toBe('hair')
    expect(solve(figure(), {}).order).toEqual(['neck', 'head', 'hair'])
  })
})

describe('any content, any values', () => {
  it('always gives finite numbers, whatever the content points at', () => {
    const rng = seededRng(7)
    const pick = <T,>(xs: T[]): T => xs[Math.floor(rng() * xs.length)]
    const ids = ['torso', 'headG', 'hairG', 'neck', 'head', 'hair', 'ghost']
    for (let round = 0; round < 60; round++) {
      const c = figure({
        axis: 40 + rng() * 120,
        groups: [
          group('torso', pick([null, 'hairG', 'headG']), ['oNeck'], { pivot: pick([null, [rng() * 200, rng() * 400]]) }),
          group('headG', pick(['torso', 'hairG', 'ghost', null]), ['oHead'], {
            pivot: pick([null, [100, 60]]),
            attach: pick([null, { shape: pick(ids), kind: pick(['point', 'edge', 'range', 'inside'] as const), i: Math.floor(rng() * 80), t: rng(), slider: pick([null, 'r0', 'zz']), rx: rng(), ry: rng() }]),
          }),
          group('hairG', pick(['headG', 'torso', null]), ['oHair']),
        ],
        ranges: [0, 1, 2].map(k => range(`r${k}`, [
          drive({ kind: 'turn', group: pick(ids), atMin: (rng() - 0.5) * 900, atMax: (rng() - 0.5) * 900 }),
          drive({ kind: 'scale', target: pick(['group', 'shape', 'model'] as const), id: pick(ids), atMin: rng() * 500, atMax: rng() * 500, axis: pick(['xy', 'x', 'y'] as const) }),
          drive({ kind: 'points', shape: pick(ids), sym: rng() < 0.5, moves: [{ i: Math.floor(rng() * 8), dx: (rng() - 0.5) * 400, dy: (rng() - 0.5) * 400, dxMin: rng() * 50, dyMin: rng() * 50 }] }),
          drive({ kind: 'bend', shape: pick(ids), pivot: [rng() * 200, rng() * 400], y0: rng() * 200, y1: 200 + rng() * 200, atMin: (rng() - 0.5) * 300, atMax: (rng() - 0.5) * 300 }),
        ], { min: -rng() * 50, rest: 0, max: rng() * 50 + 1 })),
      })
      for (const view of ['front', 'back'] as const) {
        const values: Record<string, number> = {}
        for (const r of c.ranges) values[r.id] = pick([r.min, r.max, r.rest, (rng() - 0.5) * 400, NaN])
        const s = solve(c, values, view)
        for (const sh of Object.values(s.shapes)) {
          expect(sh.matrix.every(Number.isFinite)).toBe(true)
          expect(sh.d).not.toMatch(/NaN|Infinity/)
          expect([sh.box.x, sh.box.y, sh.box.w, sh.box.h].every(Number.isFinite)).toBe(true)
        }
        for (const m of Object.values(s.mats)) expect(m.every(Number.isFinite)).toBe(true)
        expect(s.order.length).toBeLessThanOrEqual(c.shapes.length)
      }
    }
  })
})
