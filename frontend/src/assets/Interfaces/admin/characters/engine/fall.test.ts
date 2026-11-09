import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelDrive, ModelGroup, ModelObject, ModelPoint, ModelRange, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup, normalizeContent, publishFaults } from '../modelContent'
import { WEIGHT_STEPS, applyFall, cycleWeight, fallRuns, hangDirection, hangs, stepWeight } from './fall'
import { bridgeBetween } from './bridgeEdit'
import { solve } from './rig'

const pt = (x: number, y: number, w?: number, m: ModelPoint['m'] = 's'): ModelPoint => ({ x, y, m, ...(w ? { w } : {}) })
const poly = (id: string, pts: ModelPoint[], over: Partial<ModelShape> = {}): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts, ...over })
const rect = (id: string, x0: number, y0: number, x1: number, y1: number, over: Partial<ModelShape> = {}) => poly(id, [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)], over)
const drive = (over: Partial<ModelDrive>): ModelDrive => ({
  kind: 'turn', group: null, target: null, id: null, axis: 'xy', shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: 0, atMax: 0, mirror: true, ...over,
})
const range = (id: string, drives: ModelDrive[], over: Partial<ModelRange> = {}): ModelRange => ({ id, name: id, scope: null, min: 0, rest: 0, max: 100, unit: '%', show: true, rand: null, drives, ...over })
const group = (id: string, parent: string | null, objects: string[], over: Partial<ModelGroup> = {}): ModelGroup => ({ ...newGroup(id, id, parent, objects), ...over })
const object = (id: string, shapes: string[], over: Partial<ModelObject> = {}): ModelObject => ({ id, name: id, layer: 'body', shapes, ...over })
const close = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits)
const seg = (a: ModelPoint, b: ModelPoint) => Math.hypot(b.x - a.x, b.y - a.y)

// a strip hung from its top edge: two roots (no weight) and two weighted points at the bottom
const strip = (): ModelPoint[] => [pt(0, 0), pt(10, 0), pt(10, 20, 1), pt(0, 20, 1)]
// a lock of hair that sticks out sideways, then down: a polyline root -> a -> b -> c
const lock = (): ModelPoint[] => [pt(0, 0), pt(10, 0, 1), pt(20, 0, 1), pt(30, 0, 1)]

describe('weights', () => {
  it('step up and down in quarters and stay at the ends', () => {
    expect(WEIGHT_STEPS).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(stepWeight(0, 1)).toBe(0.25); expect(stepWeight(0.25, 1)).toBe(0.5); expect(stepWeight(1, 1)).toBe(1)
    expect(stepWeight(0.5, -1)).toBe(0.25); expect(stepWeight(0, -1)).toBe(0); expect(stepWeight(null, 1)).toBe(0.25)
    expect(stepWeight(0.3, 1)).toBe(0.5)   // an odd value is first read as the nearest quarter
  })
  it('go round when clicked: none, a quarter, half, three quarters, full, none again', () => {
    expect([0, 0.25, 0.5, 0.75, 1].map(cycleWeight)).toEqual([0.25, 0.5, 0.75, 1, 0])
    expect(cycleWeight(undefined)).toBe(0.25)
  })
})

describe('the runs of weighted points', () => {
  it('find nothing in an outline with no weight, with all weight, or too few points', () => {
    expect(fallRuns([pt(0, 0), pt(1, 0), pt(1, 1)], true)).toEqual([])
    expect(fallRuns([pt(0, 0, 1), pt(1, 0, 1), pt(1, 1, 1)], true)).toEqual([])
    expect(fallRuns([pt(0, 0, 1), pt(1, 0)], true)).toEqual([])
    expect(hangs(strip(), true)).toBe(true); expect(hangs([pt(0, 0), pt(1, 0), pt(1, 1)], true)).toBe(false)
  })
  it('share a run between the two roots that hold it, so both sides of a strip hang', () => {
    const [run] = fallRuns(strip(), true)
    expect(run).toEqual({ rootA: 1, rootB: 0, forward: [2], backward: [3] })
  })
  it('hang a run of an open path from the point before it, and a run at the start from the point after it', () => {
    expect(fallRuns(lock(), false)).toEqual([{ rootA: 0, rootB: -1, forward: [1, 2, 3], backward: [] }])
    const start = [pt(0, 0, 1), pt(5, 0, 1), pt(10, 0)]
    expect(fallRuns(start, false)).toEqual([{ rootA: -1, rootB: 2, forward: [], backward: [1, 0] }])
  })
  it('wrap round the end of a closed outline', () => {
    const wrapped = [pt(0, 0, 1), pt(5, 0), pt(10, 0), pt(10, 5, 1)]
    const [run] = fallRuns(wrapped, true)
    expect(run.rootA).toBe(2); expect(run.rootB).toBe(1); expect([...run.forward, ...run.backward].sort()).toEqual([0, 3])
  })
  it('find a run on each side of a root that stands alone', () => {
    const runs = fallRuns([pt(0, 0), pt(1, 0, 1), pt(2, 0), pt(3, 0, 1), pt(4, 0)], false)
    expect(runs.map(r => [r.rootA, r.rootB, r.forward, r.backward])).toEqual([[0, 2, [1], []], [2, 4, [3], []]])
  })
})

describe('the fall of an outline', () => {
  it('keeps the length of every segment of a chain', () => {
    const list = lock()
    applyFall(list, false, 1, hangDirection('down'))
    for (let i = 1; i < list.length; i++) close(seg(list[i - 1], list[i]), 10)
    // fully weighted and fully pulled: it hangs straight down from the root
    list.forEach((p, i) => { close(p.x, 0); close(p.y, i * 10) })
  })
  it('does nothing at no strength, and moves part of the way at part of the strength', () => {
    const none = lock(); applyFall(none, false, 0, [0, 1]); expect(none).toEqual(lock())
    const half = lock(); applyFall(half, false, 0.5, [0, 1])
    for (let i = 1; i < half.length; i++) close(seg(half[i - 1], half[i]), 10)
    expect(half[3].y).toBeGreaterThan(0); expect(half[3].y).toBeLessThan(30); expect(half[3].x).toBeGreaterThan(0)
  })
  it('leaves the root where it is and a point with no weight in step with the chain before it', () => {
    const list = [pt(0, 0), pt(10, 0, 1), pt(20, 0), pt(30, 0)]
    applyFall(list, false, 1, [0, 1])
    expect(list[0]).toMatchObject({ x: 0, y: 0 })
    close(list[1].x, 0); close(list[1].y, 10)
    // the points after the run are not part of it
    expect(list[2]).toMatchObject({ x: 20, y: 0 }); expect(list[3]).toMatchObject({ x: 30, y: 0 })
  })
  it('turns a point by its own weight', () => {
    const list = [pt(0, 0), pt(10, 0, 0.25), pt(20, 0, 1)]
    applyFall(list, false, 1, [0, 1])
    const first = Math.atan2(list[1].y, list[1].x), second = Math.atan2(list[2].y - list[1].y, list[2].x - list[1].x)
    close(first, (Math.PI / 2) * 0.25); close(second, Math.PI / 2)
  })
  it('lets the two sides of a strip hang and keeps its width', () => {
    const list = strip()
    applyFall(list, true, 1, [0, 1])
    // both sides were already hanging: nothing changes
    list.forEach((p, i) => { close(p.x, strip()[i].x); close(p.y, strip()[i].y) })
    const side = [pt(0, 0), pt(10, 0), pt(30, 0, 1), pt(20, 10, 1)]
    applyFall(side, true, 1, [0, 1])
    close(seg(side[1], side[2]), 20); close(seg(side[0], side[3]), Math.hypot(20, 10))
    close(side[2].x, 10); close(side[2].y, 20)
    close(side[3].x, 0)
  })
  it('swings to the picture\'s left or right, and turns round in the back view', () => {
    const [lx, ly] = hangDirection('left'), [rx] = hangDirection('right')
    expect(lx).toBeLessThan(0); expect(rx).toBeGreaterThan(0); expect(ly).toBeGreaterThan(0)
    close(hangDirection('down')[0], 0); close(hangDirection('down')[1], 1)
    expect(hangDirection('left', true)[0]).toBeGreaterThan(0)
    expect(hangDirection('behind')).toEqual(hangDirection('down'))
    const list = [pt(0, 0), pt(0, 10, 1), pt(0, 20, 1)]
    applyFall(list, false, 1, hangDirection('left'))
    expect(list[2].x).toBeLessThan(0)
    for (let i = 1; i < list.length; i++) close(seg(list[i - 1], list[i]), 10)
  })
  it('narrows what hangs when it falls behind', () => {
    const list = [pt(0, 0), pt(6, 8, 1), pt(12, 16, 1)]
    applyFall(list, false, 1, [0, 1], 0.3)
    expect(Math.abs(list[2].x)).toBeLessThan(12 * 0.5)
    expect(list[2].y).toBeGreaterThan(10)
  })
  it('turns the handles of a curve point with the segment it hangs', () => {
    const list = [pt(0, 0), { ...pt(10, 0, 1, 'c'), hi: [-3, 0] as [number, number], ho: [3, 0] as [number, number] }, pt(20, 0, 1)]
    applyFall(list, false, 1, [0, 1])
    close(list[1].hi![0], 0); close(list[1].hi![1], -3); close(list[1].ho![0], 0); close(list[1].ho![1], 3)
  })
  it('stays finite for any input', () => {
    const list = [pt(0, 0), { x: 5, y: 5, m: 's' as const, w: 1 }, { x: 5, y: 5, m: 's' as const, w: 1 }, pt(NaN, 1, 1)]
    applyFall(list, false, 7, [0, 1]); applyFall(list, false, 1, [0, 0]); applyFall(list, false, NaN, [0, 1]); applyFall(list, false, 1, [NaN, 1])
    expect(list.slice(0, 3).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
  })
})

// a scarf hung from a head: it hangs from its top edge, and a slider lets it fall
function scarf(over: Partial<ModelContent> = {}): ModelContent {
  return {
    ...blankContent('Scarf'),
    shapes: [rect('head', 80, 20, 120, 60), poly('scarf', [pt(95, 60), pt(105, 60), pt(120, 80, 1), pt(110, 100, 1), pt(100, 105, 1), pt(90, 100, 1), pt(80, 80, 1)])],
    objects: [object('oHead', ['head']), object('oScarf', ['scarf'], { layer: 'clothing' })],
    groups: [group('gHead', null, ['oHead', 'oScarf'], { pivot: [100, 60] })],
    ranges: [range('fall', [drive({ kind: 'fall', shape: 'scarf', atMin: 0, atMax: 100 })])],
    ...over,
  }
}
const lengths = (pts: ModelPoint[]) => pts.map((p, i) => seg(p, pts[(i + 1) % pts.length]))

describe('a Fall drive', () => {
  it('leaves the shape as drawn at rest and hangs it with the slider', () => {
    const c = scarf()
    expect(solve(c, { fall: 0 }).shapes.scarf.local.map(p => [p.x, p.y])).toEqual(c.shapes[1].pts.map(p => [p.x, p.y]))
    const s = solve(c, { fall: 100 }).shapes.scarf
    // the right side hangs from (105, 60): (120, 80), (110, 100) and the left side from (95, 60)
    close(s.local[2].x, 105); close(s.local[2].y, 60 + Math.hypot(15, 20))
    expect(solve(c, { fall: 50 }).shapes.scarf.local[2].x).toBeGreaterThan(105)
    expect(solve(c, { fall: 50 }).shapes.scarf.local[2].x).toBeLessThan(120)
  })
  it('keeps each side of the strip the same length as it was drawn', () => {
    const c = scarf()
    const was = c.shapes[1].pts, now = solve(c, { fall: 100 }).shapes.scarf.local
    close(seg(now[1], now[2]), seg(was[1], was[2])); close(seg(now[0], now[6]), seg(was[0], was[6]))
    close(seg(now[2], now[3]), seg(was[2], was[3]), 5)
  })
  it('uses the side that is chosen and reads it as the picture\'s side in the back view', () => {
    const c = scarf()
    const left = solve(c, { fall: 100 }, 'front', { fall: 'left' }).shapes.scarf.local, right = solve(c, { fall: 100 }, 'front', { fall: 'right' }).shapes.scarf.local
    expect(left[3].x).toBeLessThan(right[3].x)
    const back = solve(c, { fall: 100 }, 'back', { fall: 'left' }).shapes.scarf
    // in the back view the figure is turned round: the local outline leans toward the model's right, which is the picture's left once turned
    expect(back.local[3].x).toBeGreaterThan(left[3].x)
  })
  it('reads the way things fall as a direction in the picture, whatever the group does', () => {
    const turned = scarf({ ranges: [...scarf().ranges, range('turn', [drive({ kind: 'turn', group: 'gHead', atMin: -90, atMax: 90 })], { min: -50, rest: 0, max: 50 })] })
    const s = solve(turned, { fall: 100, turn: 50 }).shapes.scarf
    // the group is turned a quarter turn, but the strip still hangs straight down on the canvas
    const pts = s.poly
    const ys = pts.map(p => p[1]), xs = pts.map(p => p[0])
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs))
  })
  it('adds up two sliders and holds the total to all of the way', () => {
    const c = scarf({ ranges: [range('a', [drive({ kind: 'fall', shape: 'scarf', atMin: 0, atMax: 60 })]), range('b', [drive({ kind: 'fall', shape: 'scarf', atMin: 0, atMax: 60 })])] })
    const both = solve(c, { a: 100, b: 100 }).shapes.scarf.local, full = solve(scarf(), { fall: 100 }).shapes.scarf.local
    both.forEach((p, i) => { close(p.x, full[i].x, 5); close(p.y, full[i].y, 5) })
  })
  it('does nothing to a shape with no weight', () => {
    const c = scarf({ shapes: [rect('head', 80, 20, 120, 60), poly('scarf', scarf().shapes[1].pts.map(p => ({ x: p.x, y: p.y, m: p.m })))] })
    expect(solve(c, { fall: 100 }).shapes.scarf.local.map(p => [p.x, p.y])).toEqual(c.shapes[1].pts.map(p => [p.x, p.y]))
  })
  it('is followed by a twin, mirrored', () => {
    const base = scarf()
    const c = { ...base, shapes: [...base.shapes, poly('twin', [], { mirrorOf: 'scarf' })], objects: base.objects.map(o => (o.id === 'oScarf' ? { ...o, shapes: ['scarf', 'twin'] } : o)) }
    const s = solve(c, { fall: 100 }, 'front', { fall: 'left' })
    const a = s.shapes.scarf.local[3], b = s.shapes.twin.local[3]
    close(a.y, b.y); close(a.x + b.x, 200)
  })
  it('is finite for any slider value and side', () => {
    const c = scarf()
    for (const side of ['down', 'left', 'right', 'behind'] as const) for (const v of [-500, 0, 33, 100, 1e9, NaN]) {
      const s = solve(c, { fall: v }, 'front', { fall: side }).shapes.scarf
      expect(s.local.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
      expect(s.d).not.toMatch(/NaN|undefined/)
    }
  })
  it('counts as a slider that changes the points of the shape', async () => {
    const { isPointDriven } = await import('./rig')
    const c = scarf()
    expect(isPointDriven(c, { fall: 40 }, 'scarf')).toBe(true); expect(isPointDriven(c, { fall: 0 }, 'scarf')).toBe(false); expect(isPointDriven(c, { fall: 40 }, 'head')).toBe(false)
  })
  it('keeps the segment lengths with the curve handles of a seeded random outline', () => {
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let k = 0; k < 40; k++) {
      const list: ModelPoint[] = [pt(0, 0)]
      for (let i = 1; i < 6; i++) list.push(pt(list[i - 1].x + rnd() * 20 - 10, list[i - 1].y + rnd() * 20 - 4, rnd() < 0.8 ? 0.25 * Math.ceil(rnd() * 4) : 0))
      const was = list.map(p => ({ ...p }))
      applyFall(list, false, rnd(), hangDirection('right'))
      for (const run of fallRuns(was, false)) for (const chain of [run.forward]) {
        let prev = run.rootA
        for (const i of chain) { close(seg(list[prev], list[i]), seg(was[prev], was[i]), 6); prev = i }
      }
      expect(list.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
    }
  })
})

describe('a fade', () => {
  const crease = (over: Partial<ModelShape> = {}) => {
    const base = scarf()
    return { ...base, shapes: [...base.shapes, rect('crease', 90, 70, 110, 80, { opBy: { slider: 'fall', hidden: 10, shown: 60 }, ...over })], objects: base.objects.map(o => (o.id === 'oScarf' ? { ...o, shapes: ['scarf', 'crease'] } : o)) }
  }
  it('is 1 for a shape that does not fade', () => {
    expect(solve(scarf(), {}).shapes.scarf.fade).toBe(1)
  })
  it('goes from none at one end to all at the other, in proportion', () => {
    const c = crease()
    const at = (v: number) => solve(c, { fall: v }).shapes.crease.fade
    close(at(0), 0); close(at(10), 0); close(at(35), 0.5); close(at(60), 1); close(at(100), 1)
  })
  it('may fade out as the slider rises, and a slider whose ends are the same is a step', () => {
    const out = crease({ opBy: { slider: 'fall', hidden: 60, shown: 10 } })
    close(solve(out, { fall: 0 }).shapes.crease.fade, 1); close(solve(out, { fall: 35 }).shapes.crease.fade, 0.5); close(solve(out, { fall: 80 }).shapes.crease.fade, 0)
    const step = crease({ opBy: { slider: 'fall', hidden: 40, shown: 40 } })
    expect(solve(step, { fall: 39 }).shapes.crease.fade).toBe(0); expect(solve(step, { fall: 40 }).shapes.crease.fade).toBe(1)
  })
  it('is followed by a twin and by a shape that follows a pattern, unless they fade on their own', () => {
    const c = crease()
    const withTwin = { ...c, shapes: [...c.shapes, poly('twin', [], { mirrorOf: 'crease' }), poly('own', [], { mirrorOf: 'crease', opBy: { slider: 'fall', hidden: 0, shown: 100 } })] }
    const s = solve(withTwin, { fall: 35 })
    close(s.shapes.twin.fade, 0.5); close(s.shapes.own.fade, 0.35)
  })
  it('does not fade a shape whose slider is gone', () => {
    expect(solve(crease({ opBy: { slider: 'gone', hidden: 0, shown: 1 } }), { fall: 0 }).shapes.crease.fade).toBe(1)
  })
  it('still draws the shape: it is only faint', () => {
    const s = solve(crease(), { fall: 0 }).shapes.crease
    expect(s.visible).toBe(true); expect(s.d).not.toBe('')
  })
})

describe('the faults', () => {
  it('say so for a crease with a missing slider and a fall drive on a missing shape or a twin', () => {
    const c = normalizeContent({ ...scarf(), name: 'Scarf', shapes: [...scarf().shapes, rect('crease', 0, 0, 1, 1, { opBy: { slider: 'gone', hidden: 0, shown: 1 } }), poly('twin', [], { mirrorOf: 'scarf' })] })
    const faults = publishFaults({ ...c, objects: [...c.objects, object('oX', ['crease', 'twin'])], groups: c.groups.map(g => ({ ...g, objects: [...g.objects, 'oX'] })), ranges: [range('gone2', [drive({ kind: 'fall', shape: 'nothing' }), drive({ kind: 'fall', shape: 'twin' })], { name: 'Wind' })] })
    expect(faults).toContain('Shape crease fades with a slider that does not exist.')
    expect(faults).toContain('Slider Wind moves a shape that does not exist.')
    expect(faults).toContain('Slider Wind moves a shape that is a twin; move the original instead.')
  })
})

describe('a bridge', () => {
  // two parts side by side: the upper arm ends at y=60 and the forearm starts at y=60 (touching), both 10 wide; a bridge joins their edges
  function arm(over: Partial<ModelContent> = {}): ModelContent {
    const base: ModelContent = {
      ...blankContent('Arm'),
      shapes: [rect('upper', 45, 0, 55, 60), rect('fore', 45, 60, 55, 120)],
      objects: [object('oUpper', ['upper']), object('oFore', ['fore'])],
      groups: [group('gUpper', null, ['oUpper']), group('gFore', 'gUpper', ['oFore'], { pivot: [50, 60] })],
      ranges: [range('bend', [drive({ kind: 'turn', group: 'gFore', atMin: 0, atMax: 90 })])],
      ...over,
    }
    return base
  }
  const bridged = (): ModelContent => {
    const c = arm()
    // the left side of the upper arm (edge 3, from (45,60) up to (45,0): t=0.2 is 12 units up), then the same on the forearm; the right sides too
    const e = bridgeBetween(c, [{ shape: 'upper', e: 3, t: 0.8 }, { shape: 'fore', e: 3, t: 0.2 }, { shape: 'fore', e: 1, t: 0.2 }, { shape: 'upper', e: 1, t: 0.8 }], () => 'bridge')
    if (!e.ok) throw new Error(e.reason)
    return e.content
  }

  it('is made of four points locked to the edges of the two parts, in an order that does not cross', () => {
    const c = bridged()
    const b = c.shapes.find(s => s.id === 'bridge')!
    expect(b.pts).toHaveLength(4)
    expect(b.pts.map(p => p.bind?.s)).toEqual(['upper', 'fore', 'fore', 'upper'])
    expect(b.pts.every(p => p.bind?.kind === 'edge' && p.bind.tan === true)).toBe(true)
    expect(b.pts.map(p => p.m)).toEqual(['sc', 'cs', 'sc', 'cs'])
  })
  it('lets its sides leave and arrive along the edges of the parts', () => {
    const c = bridged()
    const s = solve(c, { bend: 0 }).shapes.bridge
    // the parts line up, so the sides are straight and the handles lie along them
    const [a, b] = [s.local[0], s.local[1]]
    expect(a.ho).toBeDefined(); expect(b.hi).toBeDefined()
    close(a.ho![0], 0, 3); expect(Math.abs(a.ho![1])).toBeGreaterThan(0)
    expect(a.ho![1] * (b.y - a.y)).toBeGreaterThan(0)   // it leaves toward the other part
    expect(b.hi![1] * (a.y - b.y)).toBeGreaterThan(0)   // and arrives from it
  })
  it('runs on smoothly through a bend', () => {
    const c = bridged()
    const bent = solve(c, { bend: 100 }).shapes.bridge
    // the forearm is turned a quarter turn: the side leaves the upper arm downward and arrives at the forearm along ITS edge, now sideways
    // (the handles are in the bridge's own space: the forearm's turn carries them, so they are read in the picture)
    const f = bent.frame, world = (h: [number, number]): [number, number] => [f[0] * h[0] + f[2] * h[1], f[1] * h[0] + f[3] * h[1]]
    const a = bent.local[0], b = bent.local[1], wa = world(a.ho!), wb = world(b.hi!)
    expect(Math.abs(wa[1])).toBeGreaterThan(Math.abs(wa[0]) * 3)
    expect(Math.abs(wb[0])).toBeGreaterThan(Math.abs(wb[1]) * 3)
    expect(bent.d).not.toMatch(/NaN|undefined/)
  })
  it('does not shape the sides between points locked to the same part', () => {
    const c = bridged()
    const s = solve(c, { bend: 0 }).shapes.bridge
    // points 1 and 2 are on the forearm: the cap between them keeps its own (automatic) handles
    expect(s.local[1].ho == null).toBe(true); expect(s.local[2].hi == null).toBe(true)
  })
  it('keeps its handles when the points have no flag', () => {
    const c = bridged()
    const plain = { ...c, shapes: c.shapes.map(s => (s.id === 'bridge' ? { ...s, pts: s.pts.map(p => ({ ...p, bind: p.bind ? { ...p.bind, tan: false } : p.bind })) } : s)) }
    const s = solve(plain, { bend: 0 }).shapes.bridge
    expect(s.local[0].ho == null).toBe(true)
  })
  it('is refused with the picks in a wrong place', () => {
    const c = arm()
    const same = bridgeBetween(c, [{ shape: 'upper', e: 3, t: 0.8 }, { shape: 'upper', e: 1, t: 0.8 }, { shape: 'upper', e: 1, t: 0.2 }, { shape: 'upper', e: 3, t: 0.2 }], () => 'x')
    expect(same.ok).toBe(false)
    expect(bridgeBetween(c, [{ shape: 'upper', e: 3, t: 0.8 }, { shape: 'fore', e: 3, t: 0.2 }], () => 'x').ok).toBe(false)
    expect(bridgeBetween(c, [{ shape: 'upper', e: 3, t: 0.8 }, { shape: 'fore', e: 3, t: 0.2 }, { shape: 'gone', e: 1, t: 0.2 }, { shape: 'upper', e: 1, t: 0.8 }], () => 'x').ok).toBe(false)
  })
  it('stays finite when a part is missing from the model', () => {
    const c = bridged()
    const orphan = { ...c, shapes: c.shapes.filter(s => s.id !== 'fore') }
    const s = solve(orphan, { bend: 50 }).shapes.bridge
    expect(s.local.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
  })
  void lengths
})
