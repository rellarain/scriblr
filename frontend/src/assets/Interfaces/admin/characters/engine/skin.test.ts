// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelDrive, ModelGroup, ModelPoint, ModelRange, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup, normalizeContent, publishFaults, removeGroup } from '../modelContent'
import { apply } from './geometry'
import { seededRng } from './previews'
import { defaultValues, isPointDriven, solve, type Values } from './rig'
import { breakPair } from './pairEdit'
import { parseModelFile, serializeModels } from '../modelFile'
import { alignSkins, autoWeights, copiedSkin, mirrorWeights, paintWeights, setWeights, skinFaults, smoothWeights, stepSkin, weightsOf, withPoints } from './skin'

const pt = (x: number, y: number, over: Partial<ModelPoint> = {}): ModelPoint => ({ x, y, m: 's', ...over })
const drive = (over: Partial<ModelDrive>): ModelDrive => ({
  kind: 'turn', group: null, target: null, id: null, axis: 'xy', shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: 0, atMax: 0, mirror: true, ...over,
})
const range = (id: string, drives: ModelDrive[], over: Partial<ModelRange> = {}): ModelRange => ({ id, name: id, scope: null, min: -150, rest: 0, max: 150, unit: '°', show: true, rand: null, drives, ...over })
const group = (id: string, parent: string | null, objects: string[], over: Partial<ModelGroup> = {}): ModelGroup => ({ ...newGroup(id, id, parent, objects), ...over })

// The rows of an arm, shoulder to wrist: the elbow is at y 100. Each row has a point on the left (x 90) and one on the right (x 110), so the outline runs down the left side and
// back up the right one.
const ROWS = [20, 60, 90, 100, 110, 140, 180]
const ELBOW_ROW = ROWS.indexOf(100)
const armPts = (): ModelPoint[] => [...ROWS.map(y => pt(90, y)), ...[...ROWS].reverse().map(y => pt(110, y))]
// The weight each point gives the forearm: none above the elbow's reach, half at the elbow, all below.
const rowWeight = (y: number) => (y <= 90 ? 0 : y >= 110 ? 1 : 0.5)
const armWeights = () => armPts().map(p => rowWeight(p.y))
const left = (row: number) => row
const right = (row: number) => 2 * ROWS.length - 1 - row

function arm(over: Partial<ModelShape> = {}, extra: Partial<ModelContent> = {}): ModelContent {
  const shape: ModelShape = { id: 'arm', name: 'Arm', closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: armPts(), skin: [{ g: 'fore', w: armWeights() }], ...over }
  return {
    ...blankContent('Arm'),
    shapes: [shape],
    objects: [{ id: 'oArm', name: 'Arm', layer: 'body', shapes: ['arm'] }, { id: 'oFore', name: 'Forearm', layer: 'body', shapes: [] }],
    groups: [group('up', null, ['oArm'], { pivot: [100, 20] }), group('fore', 'up', ['oFore'], { pivot: [100, 100] })],
    ranges: [range('elbow', [drive({ kind: 'turn', group: 'fore', atMin: -150, atMax: 150 })])],
    ...extra,
  }
}
const canvas = (c: ModelContent, values: Values, sid: string, i: number): [number, number] => {
  const s = solve(c, values).shapes[sid]
  return apply(s.matrix, s.local[i].x, s.local[i].y)
}
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('a skinned outline', () => {
  it('is exactly the drawn outline at rest', () => {
    const c = arm()
    const s = solve(c, defaultValues(c)).shapes.arm
    expect(s.local.map(p => [p.x, p.y])).toEqual(armPts().map(p => [p.x, p.y]))
  })

  it('follows the other group fully where the weight is 1 and its own where it is 0', () => {
    const c = arm()
    const s = solve(c, { elbow: 90 })
    const fore = s.mats.fore
    for (const row of [5, 6]) {
      const [x, y] = canvas(c, { elbow: 90 }, 'arm', left(row))
      const [fx, fy] = apply(fore, 90, ROWS[row])
      expect(x).toBeCloseTo(fx, 6); expect(y).toBeCloseTo(fy, 6)
    }
    for (const row of [0, 1, 2]) {
      const [x, y] = canvas(c, { elbow: 90 }, 'arm', left(row))
      expect(x).toBeCloseTo(90, 6); expect(y).toBeCloseTo(ROWS[row], 6)
    }
  })

  it('keeps the elbow at least nine tenths as thick when it bends 150 degrees either way', () => {
    const c = arm()
    for (const v of [150, -150, 90, -60]) {
      const w = dist(canvas(c, { elbow: v }, 'arm', left(ELBOW_ROW)), canvas(c, { elbow: v }, 'arm', right(ELBOW_ROW)))
      expect(w, `at ${v} degrees`).toBeGreaterThanOrEqual(18)
    }
  })

  it('shares out weights that add up to more than 1', () => {
    const extra = { groups: [group('up', null, ['oArm'], { pivot: [100, 20] }), group('fore', 'up', ['oFore'], { pivot: [100, 100] }), group('fore2', 'up', [], { pivot: [100, 100] })] }
    const over = arm({ skin: [{ g: 'fore', w: armPts().map(() => 0.8) }, { g: 'fore2', w: armPts().map(() => 0.8) }] }, extra)
    const half = arm({ skin: [{ g: 'fore', w: armPts().map(() => 0.5) }, { g: 'fore2', w: armPts().map(() => 0.5) }] }, extra)
    const a = canvas(over, { elbow: 60 }, 'arm', 3), b = canvas(half, { elbow: 60 }, 'arm', 3)
    expect(a[0]).toBeCloseTo(b[0], 6); expect(a[1]).toBeCloseTo(b[1], 6)
  })

  it('is finite whatever the weights, groups and sliders are', () => {
    const rng = seededRng(3)
    for (let n = 0; n < 40; n++) {
      const groups = ['up', 'fore', 'nowhere', 'up']
      const c = arm({ skin: [{ g: groups[Math.floor(rng() * 4)], w: armPts().map(() => rng() * 1.5) }, { g: 'fore', w: armPts().map(() => rng()) }] })
      const d = solve(c, { elbow: -200 + rng() * 400 }).shapes.arm.d
      expect(d).not.toMatch(/NaN|undefined|Infinity/)
    }
  })

  it('is drawn in the back view from the same points as in the front', () => {
    const c = arm()
    const front = solve(c, { elbow: 70 }, 'front').shapes.arm, back = solve(c, { elbow: 70 }, 'back').shapes.arm
    expect(back.local.map(p => [p.x, p.y])).toEqual(front.local.map(p => [p.x, p.y]))
  })

  it('makes the shape driven while the joint is bent, so it is shown and not edited', () => {
    const c = arm()
    expect(isPointDriven(c, { elbow: 0 }, 'arm')).toBe(false)
    expect(isPointDriven(c, { elbow: 40 }, 'arm')).toBe(true)
    expect(isPointDriven(arm({ skin: [] }), { elbow: 40 }, 'arm')).toBe(false)
  })

  it('takes the weights of the nearest point for a form with a number of points of its own', () => {
    const formPts = [pt(90, 20), pt(90, 100), pt(90, 180), pt(110, 180), pt(110, 100), pt(110, 20)]
    const c = arm({}, {
      objects: [{ id: 'oArm', name: 'Arm', layer: 'body', shapes: ['arm'], axes: [{ id: 'ax', name: 'Shape', initial: 'base', options: [{ id: 'base', name: 'Base', ovr: [] }, { id: 'thin', name: 'Thin', ovr: [{ shape: 'arm', pts: formPts }] }] }] }, { id: 'oFore', name: 'Forearm', layer: 'body', shapes: [] }],
    })
    const s = solve(c, { elbow: 90 }, 'front', { forms: { 'oArm.ax': 'thin' } })
    const tip = apply(s.shapes.arm.matrix, s.shapes.arm.local[2].x, s.shapes.arm.local[2].y)
    const [fx, fy] = apply(s.mats.fore, 90, 180)
    expect(tip[0]).toBeCloseTo(fx, 6); expect(tip[1]).toBeCloseTo(fy, 6)
  })

  it('lets the points hang after the skin has moved them', () => {
    // the last two points of the left side hang (weights) from a forearm bent level: the first from the point before it, the second from the point after it (the run is
    // shared between its two roots), each straight down the picture from where the skin has put its root
    const pts = armPts().map((p, i) => (i >= 5 && i <= 6 ? { ...p, w: 1 } : p))
    const c = arm({ pts }, { ranges: [range('elbow', [drive({ kind: 'turn', group: 'fore', atMin: -150, atMax: 150 })]), range('fall', [drive({ kind: 'fall', shape: 'arm', atMin: 0, atMax: 100 })], { min: 0, rest: 0, max: 100, unit: '%' })] })
    const at = (i: number) => canvas(c, { elbow: 90, fall: 100 }, 'arm', i)
    for (const [root, hung] of [[4, 5], [7, 6]]) {
      const r = at(root), h = at(hung)
      expect(Math.abs(h[0] - r[0]), `point ${hung}`).toBeLessThan(1e-6)
      expect(h[1], `point ${hung}`).toBeGreaterThan(r[1])
    }
  })
})

describe('a twin of a skinned shape', () => {
  // the left arm and its twin on the right: both elbows turn with one slider, unless they are posed apart (the left one's own drive does not mirror, the right one has its own)
  function pair(apart: boolean): ModelContent {
    const c = arm()
    return {
      ...c,
      shapes: [...c.shapes, { id: 'arm2', name: 'Arm (twin)', closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: [], mirrorOf: 'arm' }],
      objects: [...c.objects, { id: 'oArm2', name: 'Arm (twin)', layer: 'body', shapes: ['arm2'], mirrorOf: 'oArm' }, { id: 'oFore2', name: 'Forearm (twin)', layer: 'body', shapes: [], mirrorOf: 'oFore' }],
      groups: [...c.groups, group('up2', null, ['oArm2'], { mirrorOf: 'up' }), group('fore2', 'up2', ['oFore2'], { mirrorOf: 'fore' })],
      ranges: apart
        ? [range('elbow', [drive({ kind: 'turn', group: 'fore', atMin: -150, atMax: 150, mirror: false })]), range('elbowR', [drive({ kind: 'turn', group: 'fore2', atMin: -150, atMax: 150 })])]
        : c.ranges,
      axis: 140,
    }
  }
  const mirrorOf = (p: [number, number], axis = 140): [number, number] => [2 * axis - p[0], p[1]]

  it('is the mirror image of the original when the two sides are posed alike', () => {
    const c = pair(false)
    for (let i = 0; i < 14; i++) {
      const a = mirrorOf(canvas(c, { elbow: 80 }, 'arm', i)), b = canvas(c, { elbow: 80 }, 'arm2', 13 - i)
      expect(b[0]).toBeCloseTo(a[0], 6); expect(b[1]).toBeCloseTo(a[1], 6)
    }
  })

  it('bends with its own forearm when the two sides are posed apart', () => {
    const c = pair(true)
    const s = solve(c, { elbow: 0, elbowR: 90 })
    // the right arm's wrist row follows the right forearm; the left arm stays straight
    const i = 13 - left(6)
    const tip = apply(s.shapes.arm2.matrix, s.shapes.arm2.local[i].x, s.shapes.arm2.local[i].y)
    const [fx, fy] = apply(s.mats.fore2, 2 * 140 - 90, 180)
    expect(tip[0]).toBeCloseTo(fx, 6); expect(tip[1]).toBeCloseTo(fy, 6)
    const straight = canvas(c, { elbow: 0, elbowR: 90 }, 'arm', left(6))
    expect(straight[0]).toBeCloseTo(90, 6); expect(straight[1]).toBeCloseTo(180, 6)
    // and the elbow keeps its thickness
    expect(dist(canvas(c, { elbowR: 90 }, 'arm2', 13 - left(ELBOW_ROW)), canvas(c, { elbowR: 90 }, 'arm2', 13 - right(ELBOW_ROW)))).toBeGreaterThanOrEqual(18)
  })
})

describe('a skinned shape kept elsewhere', () => {
  it('a twin whose pair is broken keeps the weights of its original, on the twin groups, in the order of its own outline', () => {
    const c = arm()
    const paired: ModelContent = {
      ...c,
      shapes: [...c.shapes, { id: 'arm2', name: 'Arm (twin)', closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: [], mirrorOf: 'arm' }],
      objects: [...c.objects, { id: 'oArm2', name: 'Arm (twin)', layer: 'body', shapes: ['arm2'], mirrorOf: 'oArm' }],
      groups: [...c.groups, group('up2', null, ['oArm2'], { mirrorOf: 'up' }), group('fore2', 'up2', [], { mirrorOf: 'fore' })],
    }
    const e = breakPair(paired, 'shape', 'arm2')
    expect(e.ok).toBe(true)
    const twin = e.ok ? e.content.shapes.find(s => s.id === 'arm2')! : null
    expect(twin?.skin).toEqual([{ g: 'fore2', w: [...armWeights()].reverse() }])
  })

  it('a model file keeps the weights, held to 0..1 and fitted to the points', () => {
    const c = arm({ skin: [{ g: 'fore', w: armWeights() }] })
    const back = parseModelFile(serializeModels([c]))
    expect(back.models[0].shapes[0].skin).toEqual([{ g: 'fore', w: armWeights() }])
    const odd = JSON.parse(serializeModels([c]))
    odd.models[0].shapes[0].skin = [{ g: 'fore', w: [2, -1, 'x'] }, { g: 'bad id!', w: [] }]
    expect(parseModelFile(JSON.stringify(odd)).models[0].shapes[0].skin).toEqual([{ g: 'fore', w: [1, 0, 0, ...armPts().slice(3).map(() => 0)] }])
  })
})

describe('a point linked to a skinned shape', () => {
  // a sleeve in the upper arm's group: its first point sits on the arm's wrist point (left side), its second 3 units to the right of it, its third is locked to the arm's
  // left edge below the elbow, 2 units outward
  function sleeved(): ModelContent {
    const c = arm()
    const sleeve: ModelShape = {
      id: 'sleeve', name: 'Sleeve', closed: true, z: 41, op: 1, view: 'both', half: 0, template: null,
      pts: [
        pt(90, 180, { bind: { kind: 'point', s: 'arm', i: left(6), d: [0, 0], e: 0, t: 0, o: 0 } }),
        pt(93, 180, { bind: { kind: 'point', s: 'arm', i: left(6), d: [3, 0], e: 0, t: 0, o: 0 } }),
        pt(88, 160, { bind: { kind: 'edge', s: 'arm', i: 0, d: [0, 0], e: left(5), t: 0.5, o: 2 } }),
      ],
    }
    return { ...c, shapes: [...c.shapes, sleeve], objects: [{ ...c.objects[0], shapes: ['arm', 'sleeve'] }, c.objects[1]] }
  }

  it('stays on the point it is linked to as the joint bends', () => {
    const c = sleeved()
    for (const v of [0, 60, 150, -120]) {
      const a = canvas(c, { elbow: v }, 'sleeve', 0), b = canvas(c, { elbow: v }, 'arm', left(6))
      expect(a[0], `at ${v}`).toBeCloseTo(b[0], 6); expect(a[1], `at ${v}`).toBeCloseTo(b[1], 6)
    }
  })

  it('keeps its offset, turned with the part it is on', () => {
    const c = sleeved()
    const a = canvas(c, { elbow: 90 }, 'sleeve', 1), b = canvas(c, { elbow: 90 }, 'arm', left(6))
    expect(dist(a, b)).toBeCloseTo(3, 6)
    // at rest the offset points right (+x); the forearm turned a quarter, so it no longer does
    expect(Math.abs(a[1] - b[1])).toBeGreaterThan(2.9)
  })

  it('locked to an edge, stays the same way out from it', () => {
    const c = sleeved()
    const rest = canvas(c, {}, 'sleeve', 2)
    expect(rest[0]).toBeCloseTo(88, 6); expect(rest[1]).toBeCloseTo(160, 6)
    const s = solve(c, { elbow: 90 })
    const p = canvas(c, { elbow: 90 }, 'sleeve', 2), [ex, ey] = apply(s.mats.fore, 90, 160)
    expect(dist(p, [ex, ey])).toBeCloseTo(2, 6)
  })
})

describe('editing skin weights', () => {
  const shape = (): ModelShape => arm().shapes[0]

  it('sets, paints, steps and smooths weights, held to 0..1 in hundredths', () => {
    expect(weightsOf(shape(), 'fore')).toEqual(armWeights())
    expect(weightsOf(shape(), 'other')).toEqual(armPts().map(() => 0))
    expect(paintWeights([0, 0, 0], [0, 2, 5], 0.333)).toEqual([0.33, 0, 0.33])
    expect([stepSkin(0.5, 1), stepSkin(0.95, 1), stepSkin(0.05, -1)]).toEqual([0.6, 1, 0])
    expect(smoothWeights([0, 1, 0], false)).toEqual([0.25, 0.5, 0.25])
    expect(smoothWeights([0, 1, 0, 0], true)).toEqual([0.25, 0.5, 0.25, 0])
  })

  it('adds a group when there is room and drops one left with no weight', () => {
    let s: ModelShape | null = shape()
    s = setWeights(s, 'g2', armPts().map(() => 0.2))!
    s = setWeights(s, 'g3', armPts().map(() => 0.2))!
    expect(s.skin!.map(k => k.g)).toEqual(['fore', 'g2', 'g3'])
    expect(setWeights(s, 'g4', armPts().map(() => 0.2))).toBeNull()
    expect(setWeights(s, 'g2', armPts().map(() => 0))!.skin!.map(k => k.g)).toEqual(['fore', 'g3'])
  })

  it('makes weights that rise smoothly across a joint along the bone', () => {
    const w = autoWeights(armPts(), [100, 100], [0, 1], 10)
    expect(w[left(0)]).toBe(0); expect(w[left(ELBOW_ROW)]).toBe(0.5); expect(w[left(6)]).toBe(1)
    for (let r = 1; r < ROWS.length; r++) expect(w[left(r)]).toBeGreaterThanOrEqual(w[left(r - 1)])
  })

  it('copies weights to the other side of a symmetric outline', () => {
    const pts = [pt(80, 0), pt(100, -5), pt(120, 0), pt(120, 20), pt(80, 20)]
    expect(mirrorWeights(pts, [0.3, 0.9, 0, 0, 0.7], [0, 0, 0, 0, 0], -1, 100)).toEqual([0, 0, 0.3, 0.7, 0])
  })

  it('copies the groups of the shape under it, counting that shape\'s own group', () => {
    const sleeve: ModelShape = { ...shape(), id: 'sleeve', pts: [pt(89, 20), pt(89, 180)], skin: [] }
    const k = copiedSkin(sleeve, 'torso', shape(), 'up')
    expect(k).toEqual([{ g: 'up', w: [1, 0] }, { g: 'fore', w: [0, 1] }].sort((a, b) => (a.g === 'fore' ? 1 : -1) - (b.g === 'fore' ? 1 : -1)))
    // the shape's own group drops out
    expect(copiedSkin(sleeve, 'up', shape(), 'up')).toEqual([{ g: 'fore', w: [0, 1] }])
  })

  it('keeps the weights with their points when points are added or taken away', () => {
    const s = shape()
    const added = withPoints(s, [...s.pts.slice(0, 6), pt(90, 175), ...s.pts.slice(6)])
    expect(added.skin![0].w).toEqual([...armWeights().slice(0, 6), 1, ...armWeights().slice(6)])
    const gone = withPoints(s, s.pts.filter((_, i) => i !== 3))
    expect(gone.skin![0].w).toEqual(armWeights().filter((_, i) => i !== 3))
    // through a whole edit of the content
    const c = arm(), next = { ...c, shapes: [{ ...c.shapes[0], pts: c.shapes[0].pts.filter((_, i) => i !== 3) }] }
    expect(alignSkins(c, next).shapes[0].skin![0].w).toEqual(armWeights().filter((_, i) => i !== 3))
  })

  it('forgets a group that is gone, and a save fits the weights to the points', () => {
    const c = arm()
    expect(removeGroup(c, 'fore').shapes[0].skin).toEqual([])
    const short = arm({ skin: [{ g: 'fore', w: [0.25, 1.4, -1] }, { g: 'fore', w: [1] }] })
    expect(normalizeContent(short).shapes[0].skin).toEqual([{ g: 'fore', w: [0.25, 1, 0, ...armPts().slice(3).map(() => 0)] }])
  })
})

describe('the checks skin weights must pass to publish', () => {
  it('say the same as the server', () => {
    expect(skinFaults(arm())).toEqual([])
    expect(publishFaults(arm()).filter(f => f.includes('skinned'))).toEqual([])
    expect(skinFaults(arm({ skin: [{ g: 'gone', w: armWeights() }] }))).toEqual(['Shape Arm is skinned to a group that does not exist.'])
    expect(skinFaults(arm({ skin: [{ g: 'up', w: armWeights() }] }))).toEqual(['Shape Arm is skinned to its own group.'])
    expect(skinFaults(arm({ mirrorOf: 'other', pts: [] }))).toEqual(['Shape Arm is a twin and has skin weights of its own: skin the original instead.'])
    const hung = arm({}, { groups: [group('up', null, ['oArm'], { pivot: [100, 20] }), group('fore', 'up', ['oFore'], { pivot: [100, 100], attach: { shape: 'arm', kind: 'point', i: 3, t: 0, slider: null, rx: 0.5, ry: 0.5 } })] })
    expect(skinFaults(hung)).toEqual(['Shape Arm is skinned to a group that hangs from it.'])
  })
})
