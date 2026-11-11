import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelGroup, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup, publishFaults, removeGroup, removeShape, twinsOf } from '../modelContent'
import { apply } from './geometry'
import { LIMITS, limitNotes, linkCount } from './limits'
import { makeTwin, backPoints, breakPair, linkToEdge, linkToPoint, linksOf, mirrorAttach, moveInOrder, setBack, setLoose, stepLink, unlinkPoint } from './pairEdit'
import { solve, type Values } from './rig'
import { addRange, addTurn, attachGroup, newRange, reparent, removeRange, type Edit } from './rigEdit'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const sharp = (id: string, pts: Array<[number, number]>, over: Partial<ModelShape> = {}): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })), ...over })
const group = (c: ModelContent, id: string): ModelGroup => c.groups.find(g => g.id === id)!
const shape = (c: ModelContent, id: string): ModelShape => c.shapes.find(s => s.id === id)!

const CHEST: Array<[number, number]> = [[70, 86], [130, 86], [130, 160], [70, 160]]
const ARM: Array<[number, number]> = [[124, 90], [138, 90], [138, 140], [124, 140]]
const FORE: Array<[number, number]> = [[125, 140], [137, 140], [137, 186], [125, 186]]

// A torso (chest) with an arm anchored inside its right shoulder and a forearm hanging from the arm; sliders lean the torso, raise the arm, bend the elbow.
function body(): ModelContent {
  let c: ModelContent = {
    ...blankContent('Body'),
    shapes: [sharp('chest', CHEST), sharp('arm', ARM), sharp('fore', FORE)],
    objects: [
      { id: 'oChest', name: 'Chest', layer: 'body', shapes: ['chest'] },
      { id: 'oArm', name: 'Arm', layer: 'body', shapes: ['arm'] },
      { id: 'oFore', name: 'Forearm', layer: 'body', shapes: ['fore'] },
    ],
    groups: [newGroup('torso', 'Torso', null, ['oChest']), newGroup('gArm', 'Arm', 'torso', ['oArm']), newGroup('gFore', 'Forearm', 'gArm', ['oFore'])],
  }
  c = must(reparent(c, 'gFore', 'gArm'))
  c = must(attachGroup(c, 'gArm', { shape: 'chest', kind: 'inside', i: 0, t: 0, slider: null, rx: 1, ry: 0.1 }))
  c = must(attachGroup(c, 'gFore', { shape: 'arm', kind: 'inside', i: 0, t: 0, slider: null, rx: 0.5, ry: 1 }))
  for (const [id, group, lo, hi, atMin, atMax] of [['lean', 'torso', -10, 10, -8, 8], ['raise', 'gArm', 0, 90, 0, -80], ['elbow', 'gFore', 0, 130, 0, -100]] as const) {
    c = must(addRange(c, { ...newRange(id, id, 'turn', group), min: lo, max: hi, rest: 0 }))
    c = must(addTurn(c, id, group))
    // these tests are about a twin that follows its original, so the drives mirror (a new Turn drive moves only its own side)
    c = { ...c, ranges: c.ranges.map(r => (r.id === id ? { ...r, drives: r.drives.map(d => ({ ...d, atMin, atMax, mirror: true })) } : r)) }
  }
  return c
}

const corners = (c: ModelContent, id: string, values: Values = {}) => solve(c, values).shapes[id].pre.map((p): [number, number] => [p.x, p.y])
const sortPts = (a: Array<[number, number]>) => [...a].sort((p, q) => p[0] - q[0] || p[1] - q[1])
const mirror = (a: Array<[number, number]>, axis = 100): Array<[number, number]> => a.map(([x, y]) => [2 * axis - x, y])
function expectSame(a: Array<[number, number]>, b: Array<[number, number]>) {
  const [p, q] = [sortPts(a), sortPts(b)]
  expect(p.length).toBe(q.length)
  p.forEach((pt, i) => { expect(pt[0]).toBeCloseTo(q[i][0], 4); expect(pt[1]).toBeCloseTo(q[i][1], 4) })
}

describe('making a twin of a shape', () => {
  it('puts a derived twin right after the original, with no points of its own', () => {
    const c = must(makeTwin(body(), 'shape', 'arm', n => `${n}_tw`))
    const twin = c.shapes.find(s => s.mirrorOf === 'arm')!
    expect(twin).toMatchObject({ id: 's_tw', name: 'arm (twin)', pts: [], mirrorOf: 'arm', closed: true })
    expect(c.objects.find(o => o.id === 'oArm')!.shapes).toEqual(['arm', 's_tw'])
    expect(twinsOf(c, 'shape', 'arm')).toEqual(['s_tw'])
  })
  it('draws the mirror image of the original about the model\'s axis', () => {
    const c = must(makeTwin(body(), 'shape', 'arm', n => `${n}_tw`))
    const sets: Values[] = [{}, { elbow: 90 }]   // the elbow turns another group
    for (const values of sets) expectSame(corners(c, 's_tw', values), mirror(corners(c, 'arm', values)))
    expectSame(corners(must(makeTwin({ ...body(), axis: 110 }, 'shape', 'chest', n => `${n}_c2`)), 's_c2'), mirror(CHEST, 110))
  })
  it('turns with the group it is in, as a pair of eyes tilt with the head: mirrored in the group\'s own space', () => {
    const c = must(makeTwin(body(), 'shape', 'arm', n => `${n}_tw`))
    const solved = solve(c, { raise: 60 })
    expectSame(corners(c, 's_tw', { raise: 60 }), mirror(ARM).map(([x, y]) => apply(solved.mats.gArm, x, y)))
  })
  it('follows an edit of the original at once', () => {
    let c = must(makeTwin(body(), 'shape', 'arm', n => `${n}_tw`))
    c = { ...c, shapes: c.shapes.map(s => (s.id === 'arm' ? { ...s, pts: s.pts.map(p => ({ ...p, x: p.x + 5 })) } : s)) }
    expectSame(corners(c, 's_tw'), mirror(ARM.map(([x, y]): [number, number] => [x + 5, y])))
  })
  it('is refused for a twin, for a shape that has one, for a shape with no outline and for one in no object', () => {
    const c = must(makeTwin(body(), 'shape', 'arm', n => `${n}_tw`))
    expect(refused(makeTwin(c, 'shape', 's_tw'))).toMatch(/is a twin already/)
    expect(refused(makeTwin(c, 'shape', 'arm'))).toMatch(/already has a twin/)
    expect(refused(makeTwin({ ...body(), shapes: [...body().shapes, sharp('dot', [[1, 1], [2, 2]])], objects: body().objects.map(o => (o.id === 'oArm' ? { ...o, shapes: ['arm', 'dot'] } : o)) }, 'shape', 'dot'))).toMatch(/no outline yet/)
    expect(refused(makeTwin({ ...body(), shapes: [...body().shapes, sharp('loose', CHEST)] }, 'shape', 'loose'))).toMatch(/not in an object/)
    expect(refused(makeTwin(body(), 'shape', 'nope'))).toMatch(/no such shape/)
  })
  it('is refused past the number of shapes a model may hold', () => {
    const c = body()
    const many = Array.from({ length: LIMITS.shapesMax - c.shapes.length }, (_, i) => sharp(`x${i}`, CHEST))
    expect(refused(makeTwin({ ...c, shapes: [...c.shapes, ...many] }, 'shape', 'arm'))).toMatch(/at most 600 shapes/)
  })
  it('passes the publish checks', () => {
    expect(publishFaults(must(makeTwin(body(), 'shape', 'arm')))).toEqual([])
  })
})

describe('making a twin of an object or a group', () => {
  it('twins an object with its shapes, in the same group right after it', () => {
    const c = must(makeTwin(body(), 'object', 'oArm', n => `${n}_t`))
    const o = c.objects.find(x => x.mirrorOf === 'oArm')!
    expect(o).toMatchObject({ name: 'Arm (twin)', layer: 'body', mirrorOf: 'oArm' })
    expect(group(c, 'gArm').objects).toEqual(['oArm', o.id])
    expect(o.shapes).toHaveLength(1)
    expect(shape(c, o.shapes[0]).mirrorOf).toBe('arm')
    expect(refused(makeTwin(c, 'object', 'oArm'))).toMatch(/already has a twin/)
    expect(refused(makeTwin(c, 'shape', 'arm'))).toMatch(/already has a twin/)
  })
  it('twins a group with everything in it and under it, the twin of a child hanging from the twin of its parent', () => {
    let n = 0
    const c = must(makeTwin(body(), 'group', 'gArm', p => `${p}_${++n}`))
    const arm2 = c.groups.find(g => g.mirrorOf === 'gArm')!, fore2 = c.groups.find(g => g.mirrorOf === 'gFore')!
    expect(arm2.parent).toBe('torso')              // the same parent: the torso is not twinned
    expect(fore2.parent).toBe(arm2.id)             // the twin of the arm
    expect(arm2.pivot).toBeNull(); expect(arm2.attach).toBeNull()
    expect(c.objects.filter(o => o.mirrorOf).length).toBe(2)
    expect(c.shapes.filter(s => s.mirrorOf).map(s => s.mirrorOf).sort()).toEqual(['arm', 'fore'])
    expect(publishFaults(c)).toEqual([])
    expect(refused(makeTwin(c, 'group', 'gArm'))).toMatch(/already has a twin/)
  })
  it('is refused past the number of groups a model may hold', () => {
    const c = body()
    const extra = Array.from({ length: LIMITS.groupsMax - c.groups.length }, (_, i) => newGroup(`x${i}`, `x${i}`))
    expect(refused(makeTwin({ ...c, groups: [...c.groups, ...extra] }, 'group', 'gArm'))).toMatch(new RegExp(`at most ${LIMITS.groupsMax} groups`))
  })
})

describe('a twin group does what its original does, mirrored, from its own parent', () => {
  const twinned = () => must(makeTwin(body(), 'group', 'gArm', n => `${n}_${Math.random().toString(36).slice(2, 6)}`))
  const armTwin = (c: ModelContent) => c.shapes.find(s => s.mirrorOf === 'arm')!.id
  const foreTwin = (c: ModelContent) => c.shapes.find(s => s.mirrorOf === 'fore')!.id

  it('is the mirror image at rest and when the arm is raised and the elbow bent', () => {
    const c = twinned()
    const sets: Values[] = [{}, { raise: 60 }, { raise: 70, elbow: 100 }]
    for (const values of sets) {
      expectSame(corners(c, armTwin(c), values), mirror(corners(c, 'arm', values)))
      expectSame(corners(c, foreTwin(c), values), mirror(corners(c, 'fore', values)))
    }
  })
  it('moves with the torso, which both arms hang from, as the original does (a lean carries both alike)', () => {
    const c = twinned()
    const lean = { lean: 8 }, solved = solve(c, lean), rest = solve(c, {})
    // with the arm down, each arm is the torso's own turn applied to where the arm stood
    const torso = solved.mats.torso
    expectSame(corners(c, 'arm', lean), corners(c, 'arm', {}).map(([x, y]) => apply(torso, x, y)))
    expectSame(corners(c, armTwin(c), lean), mirror(ARM.map(([x, y]): [number, number] => [x, y])).map(([x, y]) => apply(torso, x, y)))
    expect(solved.mats.torso).not.toEqual(rest.mats.torso)
  })
  it('refuses to be turned, scaled or anchored by itself', () => {
    const c = twinned()
    const twinGroup = c.groups.find(g => g.mirrorOf === 'gArm')!.id
    expect(refused(addTurn(c, 'lean', twinGroup))).toMatch(/turn the original/)
    expect(refused(attachGroup(c, twinGroup, { shape: 'chest', kind: 'point', i: 0, t: 0, slider: null, rx: 0.5, ry: 0.5 }))).toMatch(/no anchor of its own/)
  })
  it('can have a group hung from it and anchored to its twin shape', () => {
    let c = twinned()
    const twinGroup = c.groups.find(g => g.mirrorOf === 'gArm')!.id
    c = { ...c, groups: [...c.groups, newGroup('cuff', 'Cuff', twinGroup, [])], shapes: [...c.shapes, sharp('cuffShape', [[60, 130], [80, 130], [80, 140], [60, 140]])], objects: [...c.objects, { id: 'oCuff', name: 'Cuff', layer: 'clothing', shapes: ['cuffShape'] }] }
    c = { ...c, groups: c.groups.map(g => (g.id === 'cuff' ? { ...g, objects: ['oCuff'] } : g)) }
    c = must(attachGroup(c, 'cuff', { shape: armTwin(c), kind: 'point', i: 2, t: 0, slider: null, rx: 0.5, ry: 0.5 }))
    expect(publishFaults(c)).toEqual([])
    const before = corners(c, 'cuffShape', {}), after = corners(c, 'cuffShape', { raise: 60 })
    expect(after[0][1]).not.toBeCloseTo(before[0][1], 1)   // it rides on the twin arm
  })
  it('is removed with its original, and takes its objects and shapes with it', () => {
    const c = twinned()
    const out = removeGroup(c, 'gArm')
    expect(out.groups.map(g => g.id)).toEqual(['torso', 'gFore'.length ? out.groups[1].id : ''].slice(0, 1).concat(out.groups.slice(1).map(g => g.id)))
    expect(out.groups.some(g => g.mirrorOf === 'gArm')).toBe(false)
    expect(out.shapes.some(s => s.mirrorOf === 'arm')).toBe(false)
    expect(out.objects.some(o => o.mirrorOf === 'oArm')).toBe(false)
    // the shape of the other twin still stands, so its twin stays too
    expect(out.shapes.some(s => s.mirrorOf === 'fore')).toBe(true)
  })
  it('is removed with a shape, and a shape alone takes only its own twin', () => {
    const c = must(makeTwin(body(), 'shape', 'arm', n => `${n}_tw`))
    const out = removeShape(c, 'arm')
    expect(out.shapes.map(s => s.id)).toEqual(['chest', 'fore'])
    expect(out.objects.find(o => o.id === 'oArm')!.shapes).toEqual([])
    expect(removeShape(c, 's_tw').shapes.map(s => s.id)).toEqual(['chest', 'arm', 'fore'])
  })
})

describe('breaking a pair', () => {
  const same = (a: ModelContent, b: ModelContent, ids: string[], values: Values) => ids.forEach(id => expectSame(corners(a, id, values), corners(b, id, values)))
  const sliders: Values[] = [{}, { raise: 60 }, { raise: 80, elbow: 110 }, { lean: 8, raise: 40, elbow: 60 }, { lean: -9, raise: 90 }]

  it('makes a twin shape an independent one that is drawn exactly as it was', () => {
    const paired = must(makeTwin(body(), 'shape', 'chest', n => `${n}_tw`))
    const broken = must(breakPair(paired, 'shape', 's_tw'))
    expect(shape(broken, 's_tw').mirrorOf).toBeNull()
    expect(shape(broken, 's_tw').pts).toHaveLength(4)
    same(paired, broken, ['s_tw'], {})
    // it no longer follows the original
    const moved = { ...broken, shapes: broken.shapes.map(s => (s.id === 'chest' ? { ...s, pts: s.pts.map(p => ({ ...p, y: p.y + 20 })) } : s)) }
    expectSame(corners(moved, 's_tw'), corners(paired, 's_tw'))
    expect(publishFaults(broken)).toEqual([])
  })
  it('copies the sliders that moved a shape, mirrored', () => {
    let c = must(makeTwin(body(), 'shape', 'arm', n => `${n}_tw`))
    c = must(addRange(c, { ...newRange('grow', 'Grow', 'points', 'arm'), min: 0, rest: 0, max: 100 }))
    c = { ...c, ranges: c.ranges.map(r => (r.id === 'grow' ? { ...r, drives: [{ kind: 'points', group: null, target: null, id: null, axis: 'xy', shape: 'arm', moves: [{ i: 1, dx: 6, dy: 2, dxMin: 0, dyMin: 0 }], sym: false, pivot: null, y0: 0, y1: 0, atMin: 0, atMax: 0, mirror: true }] } : r)) }
    const broken = must(breakPair(c, 'shape', 's_tw'))
    const sets: Values[] = [{}, { grow: 100 }, { grow: 50, raise: 30 }]
    for (const values of sets) expectSame(corners(c, 's_tw', values), corners(broken, 's_tw', values))
    expect(broken.ranges.find(r => r.id === 'grow')!.drives).toHaveLength(2)
    expect(publishFaults(broken)).toEqual([])
  })
  it('makes a twin group an independent group that moves just as it did', () => {
    let n = 0
    const paired = must(makeTwin(body(), 'group', 'gArm', p => `${p}_${++n}`))
    const twinArm = paired.groups.find(g => g.mirrorOf === 'gArm')!.id
    const ids = ['arm', 'fore', ...paired.shapes.filter(s => s.mirrorOf).map(s => s.id)]
    const broken = must(breakPair(paired, 'group', twinArm))
    expect(broken.groups.find(g => g.id === twinArm)!.mirrorOf).toBeNull()
    expect(broken.groups.find(g => g.id === twinArm)!.attach).not.toBeNull()
    expect(broken.shapes.every(s => !s.mirrorOf || s.mirrorOf === 'fore')).toBe(true)   // the forearm's twin is still a twin
    for (const values of sliders) same(paired, broken, ids, values)
  })
  it('breaks a whole twinned limb at once (the twin groups under it go with it), and it still moves as it did', () => {
    let n = 0
    const paired = must(makeTwin(body(), 'group', 'gArm', p => `${p}_${++n}`))
    const twinArm = paired.groups.find(g => g.mirrorOf === 'gArm')!.id
    const ids = paired.shapes.filter(s => s.mirrorOf).map(s => s.id)
    const broken = must(breakPair(paired, 'group', twinArm))
    expect(broken.groups.some(g => g.mirrorOf)).toBe(false)
    expect(broken.objects.some(o => o.mirrorOf)).toBe(false)
    expect(broken.shapes.some(s => s.mirrorOf)).toBe(false)
    for (const values of sliders) same(paired, broken, ids, values)
    // now the two arms can be raised separately: the twin has sliders of its own
    expect(broken.ranges.find(r => r.id === 'raise')!.drives.some(d => d.group === twinArm)).toBe(true)
    expect(publishFaults(broken)).toEqual([])
  })
  it('can break the forearm\'s pair first and the arm\'s after', () => {
    let n = 0
    const paired = must(makeTwin(body(), 'group', 'gArm', p => `${p}_${++n}`))
    const twinArm = paired.groups.find(g => g.mirrorOf === 'gArm')!.id, twinFore = paired.groups.find(g => g.mirrorOf === 'gFore')!.id
    const ids = paired.shapes.filter(s => s.mirrorOf).map(s => s.id)
    const half = must(breakPair(paired, 'group', twinFore))
    expect(half.groups.find(g => g.id === twinArm)!.mirrorOf).toBe('gArm')
    for (const values of sliders) same(paired, half, ids, values)
    const broken = must(breakPair(half, 'group', twinArm))
    for (const values of sliders) same(paired, broken, ids, values)
  })
  it('breaks an object of twin shapes', () => {
    const paired = must(makeTwin(body(), 'object', 'oArm', n => `${n}_t`))
    const twinObject = paired.objects.find(o => o.mirrorOf)!
    const broken = must(breakPair(paired, 'object', twinObject.id))
    expect(broken.objects.some(o => o.mirrorOf)).toBe(false)
    expect(broken.shapes.some(s => s.mirrorOf)).toBe(false)
    same(paired, broken, twinObject.shapes, { raise: 50 })
  })
  it('refuses what is not a twin', () => {
    expect(refused(breakPair(body(), 'shape', 'arm'))).toMatch(/not a twin/)
    expect(refused(breakPair(body(), 'group', 'gArm'))).toMatch(/not a twin/)
  })
  it('mirrors an anchor onto the twin of its shape, or onto the mirror place of a symmetric one', () => {
    const c = must(makeTwin(body(), 'shape', 'arm', n => `${n}_tw`))
    expect(mirrorAttach(c, { shape: 'chest', kind: 'inside', i: 0, t: 0, slider: null, rx: 1, ry: 0.1 })).toMatchObject({ shape: 'chest', rx: 0, ry: 0.1 })
    expect(mirrorAttach(c, { shape: 'chest', kind: 'point', i: 1, t: 0, slider: null, rx: 0, ry: 0 })).toMatchObject({ shape: 'chest', i: 0 })
    expect(mirrorAttach(c, { shape: 'chest', kind: 'edge', i: 1, t: 0.25, slider: null, rx: 0, ry: 0 })).toMatchObject({ shape: 'chest', i: 3, t: 0.75 })
    expect(mirrorAttach(c, { shape: 'arm', kind: 'point', i: 0, t: 0, slider: null, rx: 0, ry: 0 })).toMatchObject({ shape: 's_tw', i: 3 })
    expect(mirrorAttach(c, { shape: 'arm', kind: 'edge', i: 0, t: 0.25, slider: null, rx: 0, ry: 0 })).toMatchObject({ shape: 's_tw', i: 2, t: 0.75 })
    expect(mirrorAttach(c, { shape: 'gone', kind: 'point', i: 0, t: 0, slider: null, rx: 0, ry: 0 })).toBeNull()
  })
})

// ---- point links ----

// A body (a square at 60..140 x 60..160) in one group and a shirt in another, so a link has to cross groups; a slider turns the body.
function dressed(): ModelContent {
  let c: ModelContent = {
    ...blankContent('Dressed'),
    shapes: [sharp('body', [[60, 60], [140, 60], [140, 160], [60, 160]]), sharp('shirt', [[50, 50], [150, 50], [150, 170], [50, 170]])],
    objects: [{ id: 'oBody', name: 'Body', layer: 'body', shapes: ['body'] }, { id: 'oShirt', name: 'Shirt', layer: 'clothing', shapes: ['shirt'] }],
    groups: [newGroup('gBody', 'Body', null, ['oBody']), newGroup('gShirt', 'Shirt', null, ['oShirt'])],
  }
  c = must(addRange(c, { ...newRange('spin', 'Spin', 'turn', 'gBody'), min: -45, max: 45 }))
  c = must(addTurn(c, 'spin', 'gBody'))
  c = { ...c, ranges: c.ranges.map(r => (r.id === 'spin' ? { ...r, drives: r.drives.map(d => ({ ...d, atMin: -45, atMax: 45 })) } : r)) }
  return c
}
const pointOf = (c: ModelContent, id: string, i: number, values: Values = {}): [number, number] => { const p = solve(c, values).shapes[id].pre[i]; return [p.x, p.y] }
const distance = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])
// the distance from a place to the outline of a square shape in the model's space
function toOutline(c: ModelContent, id: string, at: [number, number], values: Values = {}): number {
  const pre = solve(c, values).shapes[id].pre
  let best = Infinity
  for (let i = 0; i < pre.length; i++) {
    const p = pre[i], q = pre[(i + 1) % pre.length], dx = q.x - p.x, dy = q.y - p.y, len2 = dx * dx + dy * dy
    const t = Math.max(0, Math.min(1, ((at[0] - p.x) * dx + (at[1] - p.y) * dy) / len2))
    best = Math.min(best, Math.hypot(p.x + dx * t - at[0], p.y + dy * t - at[1]))
  }
  return best
}

describe('welding and following a point', () => {
  it('puts the point on the point of the other shape nearest the place, and keeps it there when that shape turns', () => {
    const c = must(linkToPoint(dressed(), 'shirt', 0, 'body', 62, 58, 'weld'))
    const bind = shape(c, 'shirt').pts[0].bind!
    expect(bind).toMatchObject({ kind: 'point', s: 'body', i: 0, d: [0, 0] })
    const sets: Values[] = [{}, { spin: 30 }, { spin: -45 }]
    for (const values of sets) expect(distance(pointOf(c, 'shirt', 0, values), pointOf(c, 'body', 0, values))).toBeLessThan(1e-6)
    expect(linksOf(c, 'shirt')).toEqual([{ index: 0, bind }])
    expect(linkCount(c)).toBe(1)
  })
  it('keeps the point where it is when it follows, and moves with the other shape from there', () => {
    const c = must(linkToPoint(dressed(), 'shirt', 0, 'body', 62, 58, 'follow'))
    expect(shape(c, 'shirt').pts[0].bind!.d).toEqual([-10, -10])
    expect(pointOf(c, 'shirt', 0)).toEqual([50, 50])
    const turned = pointOf(c, 'shirt', 0, { spin: 30 }), body0 = pointOf(c, 'body', 0, { spin: 30 })
    expect(distance(turned, body0)).toBeCloseTo(Math.hypot(10, 10), 4)   // the same distance from the body's corner as at rest
  })
  it('is cut with unlink, and the point stays where it was drawn', () => {
    let c = must(linkToPoint(dressed(), 'shirt', 0, 'body', 62, 58, 'weld'))
    const where = pointOf(c, 'shirt', 0, { spin: 30 })
    c = unlinkPoint(c, 'shirt', 0)
    expect(shape(c, 'shirt').pts[0].bind).toBeNull()
    expect(pointOf(c, 'shirt', 0, { spin: 30 })).toEqual(pointOf(c, 'shirt', 0))   // no longer follows
    expect(distance(pointOf(c, 'shirt', 0), [60, 60])).toBeLessThan(1e-6)
    expect(where).not.toEqual([60, 60])
  })
  it('steps the offset of a follow, a unit at a time and five when big', () => {
    let c = must(linkToPoint(dressed(), 'shirt', 0, 'body', 62, 58, 'follow'))
    c = stepLink(c, 'shirt', 0, 'dx', 1)
    c = stepLink(c, 'shirt', 0, 'dy', -1, true)
    expect(shape(c, 'shirt').pts[0].bind!.d).toEqual([-9, -15])
  })
  it('is refused to its own shape, to a twin, in a circle, and over the limit', () => {
    const c = dressed()
    expect(refused(linkToPoint(c, 'shirt', 0, 'shirt', 0, 0, 'weld'))).toMatch(/own shape/)
    expect(refused(linkToPoint(c, 'shirt', 9, 'body', 0, 0, 'weld'))).toMatch(/no such point/)
    expect(refused(linkToPoint(c, 'shirt', 0, 'gone', 0, 0, 'weld'))).toMatch(/outline/)
    const welded = must(linkToPoint(c, 'shirt', 0, 'body', 60, 60, 'weld'))
    expect(refused(linkToPoint(welded, 'body', 1, 'shirt', 140, 50, 'weld'))).toMatch(/circle/)
    const twinned = must(makeTwin(c, 'shape', 'shirt', n => `${n}_tw`))
    expect(refused(linkToPoint(twinned, 's_tw', 0, 'body', 0, 0, 'weld'))).toMatch(/twin has no points/)
    const full: ModelContent = { ...c, shapes: c.shapes.map(s => (s.id === 'shirt' ? { ...s, pts: Array.from({ length: LIMITS.linksMax }, () => ({ x: 1, y: 1, m: 's' as const, bind: { kind: 'point' as const, s: 'body', i: 0, d: [0, 0] as [number, number], e: 0, t: 0, o: 0 } })) } : s)) }
    expect(refused(linkToPoint({ ...full, shapes: [...full.shapes.filter(s => s.id !== 'body'), sharp('body', [[1, 1], [2, 1], [2, 2]]), sharp('other', [[1, 1], [2, 1], [2, 2]])] }, 'other', 0, 'body', 0, 0, 'weld'))).toMatch(/at most 1200 point links/)
  })
  it('is cut when the shape it points at goes', () => {
    const c = must(linkToPoint(dressed(), 'shirt', 0, 'body', 60, 60, 'weld'))
    const out = removeShape(c, 'body')
    expect(shape(out, 'shirt').pts[0].bind).toBeNull()
    expect(publishFaults(out).filter(f => /linked/.test(f))).toEqual([])
  })
})

describe('locking a point to the edge of another shape', () => {
  it('keeps the point on the edge, as far outward as it was placed, however the shape turns', () => {
    const c = must(linkToEdge(dressed(), 'shirt', 0, 'body', 100, 52))   // 8 units above the top edge
    const bind = shape(c, 'shirt').pts[0].bind!
    expect(bind).toMatchObject({ kind: 'edge', s: 'body', e: 0 })
    expect(Math.abs(bind.o)).toBeCloseTo(8, 1)
    const sets: Values[] = [{}, { spin: 30 }, { spin: -45 }]
    for (const values of sets) expect(toOutline(c, 'body', pointOf(c, 'shirt', 0, values), values)).toBeCloseTo(8, 1)
    expect(pointOf(c, 'shirt', 0)[0]).toBeCloseTo(100, 1)
  })
  it('steps along the edge and outward', () => {
    let c = must(linkToEdge(dressed(), 'shirt', 0, 'body', 100, 52))
    const before = pointOf(c, 'shirt', 0)
    c = stepLink(c, 'shirt', 0, 't', 1)
    expect(pointOf(c, 'shirt', 0)[0]).toBeCloseTo(before[0] + 0.02 * 80, 1)
    c = stepLink(c, 'shirt', 0, 'o', 1)
    expect(toOutline(c, 'body', pointOf(c, 'shirt', 0))).toBeCloseTo(9, 1)
  })
  it('follows a looseness slider: the distance outward grows and shrinks with it', () => {
    let c = must(linkToEdge(dressed(), 'shirt', 0, 'body', 100, 52))
    c = must(addRange(c, { ...newRange('fit', 'Fit', 'scale'), min: 0, rest: 100, max: 200, unit: '%' }))
    c = must(setLoose(c, ['shirt'], 'fit'))
    expect(shape(c, 'shirt').loose).toBe('fit')
    expect(toOutline(c, 'body', pointOf(c, 'shirt', 0, { fit: 100 }), { fit: 100 })).toBeCloseTo(8, 1)
    expect(toOutline(c, 'body', pointOf(c, 'shirt', 0, { fit: 200 }), { fit: 200 })).toBeCloseTo(16, 1)
    expect(toOutline(c, 'body', pointOf(c, 'shirt', 0, { fit: 0 }), { fit: 0 })).toBeCloseTo(0, 1)
    expect(refused(setLoose(c, ['shirt'], 'gone'))).toMatch(/no such slider/)
    // deleting the slider lets the shape go
    expect(shape(must(removeRange(c, 'fit')), 'shirt').loose).toBeNull()
  })
  it('passes the publish checks, and fails them when the edge is not there any more', () => {
    const c = must(linkToEdge(dressed(), 'shirt', 0, 'body', 100, 52))
    expect(publishFaults({ ...c, name: 'Dressed' })).toEqual([])
    const cut = { ...c, shapes: c.shapes.map(s => (s.id === 'body' ? { ...s, pts: s.pts.slice(0, 3) } : s)) }
    expect(publishFaults(cut)).toEqual([])        // the edge from point 0 is still there
    const bad = { ...c, shapes: c.shapes.map(s => (s.id === 'shirt' ? { ...s, pts: s.pts.map(p => (p.bind ? { ...p, bind: { ...p.bind, e: 9 } } : p)) } : s)) }
    expect(publishFaults(bad)).toContain('Shape shirt has a point linked to an edge that does not exist.')
  })
})

describe('the checks and notes about pairs and links', () => {
  const named = (c: ModelContent): ModelContent => ({ ...c, name: 'M' })
  it('name a twin of nothing, of a twin and of itself, in the words the server uses', () => {
    let c = must(makeTwin(body(), 'group', 'gArm', n => `${n}_${Math.random().toString(36).slice(2, 6)}`))
    const tw = c.shapes.find(s => s.mirrorOf === 'arm')!
    c = { ...c, shapes: c.shapes.map(s => (s.id === tw.id ? { ...s, mirrorOf: 'gone' } : s)), objects: c.objects.map(o => (o.mirrorOf === 'oArm' ? { ...o, mirrorOf: 'gone' } : o)), groups: c.groups.map(g => (g.mirrorOf === 'gArm' ? { ...g, mirrorOf: 'gone' } : g)) }
    const faults = publishFaults(named(c))
    expect(faults).toContain(`Shape ${tw.name} is a twin of a shape that does not exist.`)
    expect(faults.some(f => /^Object .* is a twin of an object that does not exist\.$/.test(f))).toBe(true)
    expect(faults.some(f => /^Group .* is a twin of a group that does not exist\.$/.test(f))).toBe(true)
    const twice = { ...body(), shapes: [...body().shapes, sharp('a2', [], { mirrorOf: 'arm' }), sharp('a3', [], { mirrorOf: 'a2' })] }
    expect(publishFaults(named(twice))).toContain('Shape a3 is a twin of a twin.')
    expect(publishFaults(named({ ...body(), shapes: [...body().shapes, sharp('me', [], { mirrorOf: 'me' })] }))).toContain('Shape me is a twin of itself.')
  })
  it('allow a slider to turn a twin group (the two sides are posed apart)', () => {
    let c = must(makeTwin(body(), 'group', 'gArm', n => `${n}_${Math.random().toString(36).slice(2, 6)}`))
    const twinGroup = c.groups.find(g => g.mirrorOf === 'gArm')!.id
    c = { ...c, ranges: c.ranges.map(r => (r.id === 'raise' ? { ...r, drives: [...r.drives, { ...r.drives[0], group: twinGroup }] } : r)) }
    expect(publishFaults(named(c)).join(' ')).not.toMatch(/turns a group that is a twin/)
  })
  it('say a link points at something that is not there, or goes round in a circle', () => {
    const base = must(linkToPoint(dressed(), 'shirt', 0, 'body', 60, 60, 'weld'))
    const point = (c: ModelContent, mutate: (b: NonNullable<ModelShape['pts'][number]['bind']>) => void): ModelContent => ({ ...c, shapes: c.shapes.map(s => (s.id === 'shirt' ? { ...s, pts: s.pts.map(p => { if (p.bind) { const b = { ...p.bind }; mutate(b); return { ...p, bind: b } } return p }) } : s)) })
    expect(publishFaults(named(point(base, b => { b.s = 'gone' })))).toContain('Shape shirt has a point linked to a shape that does not exist.')
    expect(publishFaults(named(point(base, b => { b.s = 'shirt' })))).toContain('Shape shirt has a point linked to its own shape.')
    expect(publishFaults(named(point(base, b => { b.i = 7 })))).toContain('Shape shirt has a point linked to a point that does not exist.')
    const circle = { ...base, shapes: base.shapes.map(s => (s.id === 'body' ? { ...s, pts: s.pts.map((p, i) => (i === 0 ? { ...p, bind: { kind: 'point' as const, s: 'shirt', i: 1, d: [0, 0] as [number, number], e: 0, t: 0, o: 0 } } : p)) } : s)) }
    expect(publishFaults(named(circle))).toContain('The point links of shape body go round in a circle.')
    expect(publishFaults(named({ ...base, shapes: base.shapes.map(s => (s.id === 'shirt' ? { ...s, loose: 'gone', back: [s.pts[0]] } : s)) }))).toEqual(expect.arrayContaining(['Shape shirt takes its looseness from a slider that does not exist.', 'Shape shirt has a back outline of fewer than 3 points.']))
  })
  it('count links and warn above the warning level and stop above the limit', () => {
    const many = (n: number): ModelContent => ({ ...dressed(), shapes: dressed().shapes.map(s => (s.id === 'shirt' ? { ...s, pts: Array.from({ length: n }, () => ({ x: 1, y: 1, m: 's' as const, bind: { kind: 'point' as const, s: 'body', i: 0, d: [0, 0] as [number, number], e: 0, t: 0, o: 0 } })) } : s)) })
    expect(limitNotes(many(LIMITS.linksWarn)).filter(n => /point links/.test(n.text))).toEqual([])
    expect(limitNotes(many(LIMITS.linksWarn + 20)).find(n => /point links/.test(n.text))).toMatchObject({ level: 'warn' })
    expect(limitNotes(many(LIMITS.linksMax + 1)).find(n => /point links/.test(n.text))).toMatchObject({ level: 'stop' })
    expect(publishFaults(named(many(LIMITS.linksMax + 1)))).toContain(`A model may have at most ${LIMITS.linksMax} point links.`)
  })
})

// ---- the back view ----

describe('the back view', () => {
  const withBack = (): ModelContent => {
    const c = dressed()
    return must(setBack(c, 'shirt', [{ x: 40, y: 50, m: 's' }, { x: 160, y: 50, m: 's' }, { x: 160, y: 180, m: 's' }, { x: 40, y: 180, m: 's' }]))
  }
  it('draws the front outline seen from behind, flipped about the axis', () => {
    const c = dressed()
    const front = solve(c, {}, 'front').shapes.body, back = solve(c, {}, 'back').shapes.body
    expect(back.box.x).toBeCloseTo(200 - (front.box.x + front.box.w), 3)
    expect(back.box.w).toBeCloseTo(front.box.w, 3)
  })
  it('draws an outline of its own in the back view and the front one in the front view', () => {
    const c = withBack()
    expect(solve(c, {}, 'front').shapes.shirt.box.w).toBeCloseTo(100, 3)
    expect(solve(c, {}, 'back').shapes.shirt.box.w).toBeCloseTo(120, 3)
    expect(solve(c, {}, 'back').shapes.shirt.local).toHaveLength(4)
    expect(publishFaults({ ...c, name: 'M' })).toEqual([])
  })
  it('keeps the rig the same in both views: an anchor reads the front outline', () => {
    let c = withBack()
    c = { ...c, groups: [...c.groups, newGroup('badge', 'Badge', 'gShirt', [])], shapes: [...c.shapes, sharp('badgeShape', [[90, 100], [100, 100], [100, 110], [90, 110]])], objects: [...c.objects, { id: 'oBadge', name: 'Badge', layer: 'clothing', shapes: ['badgeShape'] }] }
    c = { ...c, groups: c.groups.map(g => (g.id === 'badge' ? { ...g, objects: ['oBadge'] } : g)) }
    c = must(attachGroup(c, 'badge', { shape: 'shirt', kind: 'point', i: 1, t: 0, slider: null, rx: 0, ry: 0 }))
    const f = solve(c, {}, 'front'), b = solve(c, {}, 'back')
    expect(b.anchors.badge).toEqual(f.anchors.badge)
    expect(b.mats.badge).toEqual(f.mats.badge)
  })
  it('mirrors a twin\'s back outline from its original\'s', () => {
    const c = must(makeTwin(withBack(), 'shape', 'shirt', n => `${n}_tw`))
    const orig = solve(c, {}, 'back').shapes.shirt, twin = solve(c, {}, 'back').shapes.s_tw
    expect(twin.box.w).toBeCloseTo(orig.box.w, 3)
    expect(twin.box.x).toBeCloseTo(200 - (orig.box.x + orig.box.w), 3)
  })
  it('breaks the pair with the back outline mirrored too', () => {
    const paired = must(makeTwin(withBack(), 'shape', 'shirt', n => `${n}_tw`))
    const broken = must(breakPair(paired, 'shape', 's_tw'))
    expect(shape(broken, 's_tw').back).toHaveLength(4)
    expect(solve(broken, {}, 'back').shapes.s_tw.box).toEqual(solve(paired, {}, 'back').shapes.s_tw.box)
  })
  it('sets and clears an outline, and refuses what is not one', () => {
    const c = withBack()
    expect(shape(c, 'shirt').back).toHaveLength(4)
    expect(shape(must(setBack(c, 'shirt', null)), 'shirt').back).toBeNull()
    expect(refused(setBack(c, 'shirt', [{ x: 1, y: 1, m: 's' }]))).toMatch(/at least 3 points/)
    expect(refused(setBack(must(makeTwin(c, 'shape', 'shirt', n => `${n}_tw`)), 's_tw', null))).toMatch(/twin has no outline/)
    expect(backPoints(shape(dressed(), 'shirt'))).toHaveLength(4)
    expect(backPoints(shape(c, 'shirt'))[0].x).toBe(40)
  })
  it('hides a shape of the other view, and sorts by the depth of the view', () => {
    let c = dressed()
    c = { ...c, shapes: c.shapes.map(s => (s.id === 'body' ? { ...s, view: 'front' as const } : s)) }
    expect(solve(c, {}, 'back').shapes.body.visible).toBe(false)
    expect(solve(c, {}, 'front').order).toEqual(['body', 'shirt'])      // the body is under the clothes
    c = { ...dressed(), shapes: dressed().shapes.map(s => (s.id === 'body' ? { ...s, zBack: 90 } : s)) }
    expect(solve(c, {}, 'front').order).toEqual(['body', 'shirt'])
    expect(solve(c, {}, 'back').order).toEqual(['shirt', 'body'])
    expect(solve(c, {}, 'back').shapes.body.z).toBe(90)
  })
  it('moves a shape in front of or behind its neighbour in one view only', () => {
    const c = dressed()
    const front = must(moveInOrder(c, 'body', 'front', 1))
    expect(solve(front, {}, 'front').order).toEqual(['shirt', 'body'])
    expect(solve(front, {}, 'back').order).toEqual(['shirt', 'body'])           // the back follows the front until it has a depth of its own
    const back = must(moveInOrder(c, 'shirt', 'back', -1))
    expect(solve(back, {}, 'back').order).toEqual(['shirt', 'body'])
    expect(solve(back, {}, 'front').order).toEqual(['body', 'shirt'])           // the front is untouched
    expect(refused(moveInOrder(c, 'shirt', 'front', 1))).toMatch(/in front already/)
    expect(refused(moveInOrder(c, 'body', 'front', -1))).toMatch(/at the back already/)
    expect(refused(moveInOrder(c, 'gone', 'front', 1))).toMatch(/not shown/)
  })
})
