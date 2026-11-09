import { describe, expect, it } from 'vitest'
import type { ModelBone, ModelContent, ModelDrive, ModelGroup, ModelObject, ModelRange, ModelShape } from '../../../../../api/types'
import { FRAME_BIGGEST, FRAME_MIN, TILE_DEFAULT, blankContent, newGroup, normalizeContent } from '../modelContent'
import { addBone, boneLength, figureHeight, headHeights, measures, removeBone, renameBone, restLength, setBoneEnd, setBoneStart, setHeadBone } from './bones'
import { FIT_MODES, fitOf, setFit, stretchTargets } from './fitEdit'
import { FRAME_HANDLES, addFrame, boxOfFrame, fitBox, framesOf, hiddenThrough, movedBox, nudgeFrame, removeFrame, renameFrame, resizedBox, setFrameBox, setTile, tileOf, toggleFrameHide, viewBoxOf } from './frames'
import { LIMITS } from './limits'
import { breakPair, makeTwin } from './pairEdit'
import { previewSpecs, seededRng } from './previews'
import { solve } from './rig'
import { addLength, clearLimit, fitLimit, stepBound, stepDrive, stepLimit } from './rigEdit'
import { proportionCheck } from './rigCheck'

const poly = (id: string, pts: Array<[number, number]>, over: Partial<ModelShape> = {}): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })), ...over,
})
const rect = (id: string, x0: number, y0: number, x1: number, y1: number, over: Partial<ModelShape> = {}) => poly(id, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], over)
const drive = (over: Partial<ModelDrive>): ModelDrive => ({
  kind: 'turn', group: null, target: null, id: null, axis: 'xy', shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: 0, atMax: 0, mirror: true, ...over,
})
const range = (id: string, drives: ModelDrive[], over: Partial<ModelRange> = {}): ModelRange => ({
  id, name: id, scope: null, min: -50, rest: 0, max: 50, unit: '%', show: true, rand: null, drives, ...over,
})
const group = (id: string, parent: string | null, objects: string[], over: Partial<ModelGroup> = {}): ModelGroup => ({ ...newGroup(id, id, parent, objects), ...over })
const object = (id: string, shapes: string[], over: Partial<ModelObject> = {}): ModelObject => ({ id, name: id, layer: 'body', shapes, ...over })
const bone = (id: string, start: string, end: ModelBone['end']): ModelBone => ({ id, name: id, start, end })
const close = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits)
const ids = () => { let n = 0; return (prefix: string) => `${prefix}_t${++n}` }

// A torso with an arm hung from it: the upper arm turns about the shoulder (60, 60), the forearm hangs from it with its elbow at (60, 140); a bone runs along the
// upper arm and a slider lengthens it from 80 percent (at -50) to 120 (at 50).
function arm(over: Partial<ModelContent> = {}): ModelContent {
  return {
    ...blankContent('Arm'),
    shapes: [rect('torso', 80, 40, 120, 120), rect('upper', 55, 60, 65, 140), rect('fore', 55, 140, 65, 220)],
    objects: [object('oTorso', ['torso']), object('oUpper', ['upper']), object('oFore', ['fore'])],
    groups: [group('gTorso', null, ['oTorso'], { pivot: [100, 80] }), group('gUpper', 'gTorso', ['oUpper'], { pivot: [60, 60] }), group('gFore', 'gUpper', ['oFore'], { pivot: [60, 140] })],
    bones: [bone('bUpper', 'gUpper', { kind: 'group', id: 'gFore', i: 0 })],
    ranges: [range('len', [drive({ kind: 'length', id: 'bUpper', atMin: 80, atMax: 120 })])],
    ...over,
  }
}

describe('a Length drive', () => {
  it('stretches the bone to its percent at the slider ends and leaves it alone at rest', () => {
    const c = arm()
    const at = (v: number) => solve(c, { len: v })
    close(boneLength(at(0), c.bones![0])!, 80); close(boneLength(at(50), c.bones![0])!, 96); close(boneLength(at(-50), c.bones![0])!, 64)
    close(boneLength(at(25), c.bones![0])!, 88)
    close(restLength(c, c.bones![0])!, 80)
    expect(at(50).pivots.gFore[0]).toBeCloseTo(60); close(at(50).pivots.gFore[1], 60 + 96)
  })
  it('stretches everything that hangs from the bone, and nothing across it', () => {
    const c = arm()
    const s = solve(c, { len: 50 })
    close(s.shapes.upper.box.h, 96); close(s.shapes.upper.box.w, 10)
    close(s.shapes.fore.box.y, 60 + 96); close(s.shapes.fore.box.h, 96); close(s.shapes.fore.box.w, 10)
    close(s.shapes.torso.box.h, 80)   // the parent is not touched
  })
  it('goes along a tilted bone', () => {
    const c = arm({ groups: arm().groups.map(g => (g.id === 'gFore' ? { ...g, pivot: [100, 100] as [number, number] } : g)) })
    const s = solve(c, { len: 50 })
    close(s.pivots.gFore[0], 60 + 40 * 1.2); close(s.pivots.gFore[1], 60 + 40 * 1.2)
    close(boneLength(s, c.bones![0])!, Math.hypot(40, 40) * 1.2)
  })
  it('follows the group when it turns, and when the parent turns', () => {
    const turned = arm({ ranges: [...arm().ranges, range('turn', [drive({ kind: 'turn', group: 'gUpper', atMin: -90, atMax: 90 })])] })
    const a = solve(turned, { len: 50, turn: 50 })
    close(boneLength(a, turned.bones![0])!, 96)
    const parent = arm({ ranges: [...arm().ranges, range('lean', [drive({ kind: 'turn', group: 'gTorso', atMin: -90, atMax: 90 })])] })
    const b = solve(parent, { len: 50, lean: 50 })
    close(boneLength(b, parent.bones![0])!, 96)
  })
  it('does nothing for a bone that is gone, whose start is gone, or that has no length', () => {
    for (const c of [
      arm({ bones: [] }),
      arm({ bones: [bone('bUpper', 'ghost', { kind: 'group', id: 'gFore', i: 0 })] }),
      arm({ bones: [bone('bUpper', 'gUpper', { kind: 'group', id: 'gUpper', i: 0 })] }),
    ]) {
      const s = solve(c, { len: 50 })
      close(s.shapes.fore.box.y, 140)
      close(s.shapes.upper.box.h, 80)
    }
  })
  it('stretches the group its bone starts at, whichever group that is', () => {
    const c = arm({ bones: [bone('bUpper', 'gTorso', { kind: 'group', id: 'gFore', i: 0 })] })
    const s = solve(c, { len: 50 })
    expect(s.shapes.torso.box.h).toBeGreaterThan(80)   // the torso is the group that is lengthened now, and the arm hangs from it
    expect(s.shapes.fore.box.y).toBeGreaterThan(140)
  })
  it('lengthens a twin group by the same share', () => {
    const made = makeTwin(arm(), 'group', 'gUpper', ids())
    if (!made.ok) throw new Error(made.reason)
    const c = made.content
    const twinFore = c.groups.find(g => g.mirrorOf === 'gFore')!
    const s = solve(c, { len: 50 })
    close(s.pivots[twinFore.id][0], 200 - 60); close(s.pivots[twinFore.id][1], 60 + 96)
    const twinShape = c.shapes.find(x => x.mirrorOf === 'fore')!
    close(s.shapes[twinShape.id].box.h, 96)
  })
  it('breaking the pair gives the twin its own bone and its own Length drive', () => {
    const made = makeTwin(arm(), 'group', 'gUpper', ids())
    if (!made.ok) throw new Error(made.reason)
    const twinUpper = made.content.groups.find(g => g.mirrorOf === 'gUpper')!
    const twinFore = made.content.groups.find(g => g.mirrorOf === 'gFore')!
    const broke = breakPair(made.content, 'group', twinUpper.id)
    if (!broke.ok) throw new Error(broke.reason)
    const c = broke.content
    const twinBone = c.bones!.find(b => b.start === twinUpper.id)!
    expect(twinBone.end).toEqual({ kind: 'group', id: twinFore.id, i: 0 })
    const drives = c.ranges[0].drives.filter(d => d.kind === 'length')
    expect(drives.map(d => d.id).sort()).toEqual(['bUpper', twinBone.id].sort())
    const s = solve(c, { len: 50 })
    close(boneLength(s, twinBone)!, 96)
  })
})

describe('measuring the skeleton', () => {
  it('reads the length, the percent of rest and the head heights as the sliders move', () => {
    const c = arm({ headBone: 'bUpper' })
    const rest = solve(c, {})
    close(figureHeight(rest), 220 - 40)
    close(headHeights(c, rest)!, (220 - 40) / 80)
    const m0 = measures(c, rest)[0]
    expect([m0.length, m0.rest, m0.percent, m0.heads]).toEqual([80, 80, 100, 1])
    const long = solve(c, { len: 50 }), m1 = measures(c, long)[0]
    close(m1.percent!, 120); close(m1.length!, 96)
    close(headHeights(c, long)!, (252 - 40) / 96)
  })
  it('does not change with the whole-model Height', () => {
    const c = arm({ headBone: 'bUpper', ranges: [...arm().ranges, range('height', [drive({ kind: 'scale', target: 'model', atMin: 70, atMax: 150 })])] })
    close(figureHeight(solve(c, { height: 50 })), 180)
    close(headHeights(c, solve(c, { height: 50 }))!, headHeights(c, solve(c, {}))!)
    close(measures(c, solve(c, { height: 50 }))[0].length!, 80)
  })
  it('has no head heights without a head bone, and a bone ending at a shape point measures to it', () => {
    const c = arm({ bones: [bone('b2', 'gUpper', { kind: 'point', id: 'fore', i: 2 })] })
    expect(headHeights(c, solve(c, {}))).toBeNull()
    close(restLength(c, c.bones![0])!, Math.hypot(65 - 60, 220 - 60))
    close(boneLength(solve(c, {}), c.bones![0])!, Math.hypot(5, 160))
  })
  it('gives null for a bone it cannot find', () => {
    const c = arm({ bones: [bone('b', 'gUpper', { kind: 'group', id: 'nope', i: 0 })] })
    expect(boneLength(solve(c, {}), c.bones![0])).toBeNull()
    expect(restLength(c, c.bones![0])).toBeNull()
    expect(measures(c, solve(c, {}))[0].percent).toBeNull()
  })
})

describe('editing the bones', () => {
  it('adds a bone between two groups or from a group to a point', () => {
    const c = arm({ bones: [] })
    const a = addBone(c, 'gUpper', { kind: 'group', id: 'gFore', i: 0 }, 'Upper arm', ids())
    expect(a.ok && a.content.bones).toEqual([{ id: 'b_t1', name: 'Upper arm', start: 'gUpper', end: { kind: 'group', id: 'gFore', i: 0 } }])
    const b = addBone(c, 'gUpper', { kind: 'point', id: 'fore', i: 2 }, ' Lower ', ids())
    expect(b.ok && b.content.bones![0]).toMatchObject({ name: 'Lower', end: { kind: 'point', id: 'fore', i: 2 } })
  })
  it('refuses a bone with nothing to measure', () => {
    const c = arm({ bones: [] })
    const refused = (start: string, end: ModelBone['end']) => { const e = addBone(c, start, end); return e.ok ? '' : e.reason }
    expect(refused('nope', { kind: 'group', id: 'gFore', i: 0 })).toMatch(/not there/)
    expect(refused('gUpper', { kind: 'group', id: 'nope', i: 0 })).toMatch(/not there/)
    expect(refused('gUpper', { kind: 'group', id: 'gUpper', i: 0 })).toMatch(/two places/)
    expect(refused('gUpper', { kind: 'point', id: 'nope', i: 0 })).toMatch(/not there/)
    expect(refused('gUpper', { kind: 'point', id: 'fore', i: 9 })).toMatch(/not there/)
    const twin = makeTwin(c, 'group', 'gUpper', ids())
    if (!twin.ok) throw new Error(twin.reason)
    const twinGroup = twin.content.groups.find(g => g.mirrorOf === 'gUpper')!
    const e = addBone(twin.content, twinGroup.id, { kind: 'group', id: 'gFore', i: 0 })
    expect(!e.ok && e.reason).toMatch(/twin/)
  })
  it('refuses a second bone between the same two places, and one past the limit', () => {
    const c = arm()
    const dup = addBone(c, 'gUpper', { kind: 'group', id: 'gFore', i: 0 })
    expect(!dup.ok && dup.reason).toMatch(/already/)
    const full = arm({ bones: Array.from({ length: LIMITS.bonesMax }, (_, i) => bone(`b${i}`, 'gUpper', { kind: 'point', id: 'fore', i: i % 4 })) })
    const over = addBone(full, 'gTorso', { kind: 'group', id: 'gUpper', i: 0 })
    expect(!over.ok && over.reason).toMatch(/at most/)
  })
  it('notes a bone whose two places are on top of each other', () => {
    const c = arm({ bones: [], groups: arm().groups.map(g => (g.id === 'gFore' ? { ...g, pivot: [60, 60] as [number, number] } : g)) })
    const e = addBone(c, 'gUpper', { kind: 'group', id: 'gFore', i: 0 })
    expect(e.ok && e.note).toMatch(/no length/)
  })
  it('renames, moves the ends, and refuses what the add refuses', () => {
    const c = arm()
    expect(renameBone(c, 'bUpper', '  Humerus ').bones![0].name).toBe('Humerus')
    const moved = setBoneEnd(c, 'bUpper', { kind: 'point', id: 'fore', i: 1 })
    expect(moved.ok && moved.content.bones![0].end).toEqual({ kind: 'point', id: 'fore', i: 1 })
    const bad = setBoneEnd(c, 'bUpper', { kind: 'group', id: 'gUpper', i: 0 })
    expect(bad.ok).toBe(false)
    expect(setBoneEnd(c, 'nope', { kind: 'group', id: 'gFore', i: 0 }).ok).toBe(false)
    const start = setBoneStart(c, 'bUpper', 'gTorso')
    expect(start.ok && start.content.bones![0].start).toBe('gTorso')
    expect(setBoneStart(c, 'bUpper', 'gFore').ok).toBe(false)   // it would start where it ends
  })
  it('sets the head bone to a bone that exists', () => {
    const c = arm()
    const e = setHeadBone(c, 'bUpper')
    expect(e.ok && e.content.headBone).toBe('bUpper')
    expect(setHeadBone(c, 'nope').ok).toBe(false)
    const cleared = setHeadBone(c, null)
    expect(cleared.ok && cleared.content.headBone).toBeNull()
  })
  it('deleting a bone takes its Length drives and the head mark with it', () => {
    const c = arm({ headBone: 'bUpper' })
    const { content, sliders } = removeBone(c, 'bUpper')
    expect(content.bones).toEqual([]); expect(content.headBone).toBeNull()
    expect(content.ranges[0].drives).toEqual([]); expect(sliders).toEqual(['len'])
    const other = removeBone(arm({ headBone: 'bUpper', bones: [...arm().bones!, bone('b2', 'gTorso', { kind: 'group', id: 'gUpper', i: 0 })] }), 'b2')
    expect(other.content.headBone).toBe('bUpper'); expect(other.sliders).toEqual([])
    expect(other.content.ranges[0].drives).toHaveLength(1)
  })
})

describe('the Length drive as an edit', () => {
  it('adds a drive with 80 to 120 percent to begin with, and steps it in percents', () => {
    const c = arm({ ranges: [range('r', [])] })
    const e = addLength(c, 'r', 'bUpper')
    if (!e.ok) throw new Error(e.reason)
    expect(e.content.ranges[0].drives[0]).toMatchObject({ kind: 'length', id: 'bUpper', atMin: 80, atMax: 120 })
    expect(stepDrive(e.content, 'r', 0, 'atMax', 1).ranges[0].drives[0].atMax).toBe(121)
    expect(stepDrive(e.content, 'r', 0, 'atMin', -1, true).ranges[0].drives[0].atMin).toBe(75)
    let s = e.content
    for (let i = 0; i < 300; i++) s = stepDrive(s, 'r', 0, 'atMin', -1, true)
    expect(s.ranges[0].drives[0].atMin).toBe(5)
  })
  it('refuses a missing bone, a missing slider, and a bone that starts at a twin', () => {
    const c = arm()
    expect(addLength(c, 'len', 'nope').ok).toBe(false)
    expect(addLength(c, 'nope', 'bUpper').ok).toBe(false)
    const twin = makeTwin(c, 'group', 'gUpper', ids())
    if (!twin.ok) throw new Error(twin.reason)
    const g = twin.content.groups.find(x => x.mirrorOf === 'gUpper')!
    expect(addLength({ ...twin.content, bones: [bone('bT', g.id, { kind: 'group', id: 'gFore', i: 0 })] }, 'len', 'bT').ok).toBe(false)
  })
  it('gives the pivot a place when the group has none', () => {
    const c = arm({ ranges: [range('r', [])], groups: arm().groups.map(g => (g.id === 'gUpper' ? { ...g, pivot: null } : g)) })
    const e = addLength(c, 'r', 'bUpper')
    expect(e.ok && e.content.groups.find(g => g.id === 'gUpper')!.pivot).not.toBeNull()
  })
})

describe('a writer\'s limit', () => {
  const r = (over: Partial<ModelRange> = {}) => range('r', [], { min: -20, rest: 0, max: 20, unit: '°', ...over })
  const model = (over: Partial<ModelRange> = {}) => ({ ...blankContent('m'), ranges: [r(over)] })
  it('starts from the whole slider, and is dropped when it reaches both ends again', () => {
    const a = stepLimit(model(), 'r', 'hi', -1)
    expect(a.ranges[0].limit).toEqual([-20, 19])
    const b = stepLimit(a, 'r', 'hi', 1)
    expect(b.ranges[0].limit).toBeNull()
  })
  it('keeps the resting value allowed', () => {
    let c = model()
    for (let i = 0; i < 10; i++) c = stepLimit(c, 'r', 'lo', 1, true)
    expect(c.ranges[0].limit).toEqual([0, 20])
    for (let i = 0; i < 10; i++) c = stepLimit(c, 'r', 'hi', -1, true)
    expect(c.ranges[0].limit).toEqual([0, 0])
  })
  it('stays inside the slider and in order', () => {
    expect(fitLimit({ min: -20, rest: 0, max: 20, limit: [30, -30] })).toBeNull()
    expect(fitLimit({ min: -20, rest: 0, max: 20, limit: [10, 5] })).toEqual([0, 10])
    expect(fitLimit({ min: -20, rest: 0, max: 20, limit: [-5, 5] })).toEqual([-5, 5])
    expect(fitLimit({ min: -20, rest: 0, max: 20, limit: null })).toBeNull()
  })
  it('follows the slider when its ends or rest move', () => {
    let c = model({ limit: [-5, 5] })
    for (let i = 0; i < 3; i++) c = stepBound(c, 'r', 'min', 1, true)
    expect(c.ranges[0].min).toBe(-5); expect(c.ranges[0].limit).toEqual([-5, 5])
    c = stepBound(c, 'r', 'min', 1, true)
    expect(c.ranges[0].min).toBe(0); expect(c.ranges[0].limit).toEqual([0, 5])
  })
  it('can be cleared', () => {
    expect(clearLimit(model({ limit: [-5, 5] }), 'r').ranges[0].limit).toBeNull()
  })
  it('is the span random previews stay in when the slider has no span of its own', () => {
    const limited = r({ limit: [-4, 6] })
    for (const spec of previewSpecs(11, 'rand', 40, [limited])) { expect(spec.values.r).toBeGreaterThanOrEqual(-4); expect(spec.values.r).toBeLessThanOrEqual(6) }
    const own = r({ limit: [-4, 6], rand: [10, 12] })
    for (const spec of previewSpecs(11, 'rand', 40, [own])) { expect(spec.values.r).toBeGreaterThanOrEqual(10); expect(spec.values.r).toBeLessThanOrEqual(12) }
    expect(previewSpecs(11, 'max', 1, [limited])[0].values.r).toBe(20)
  })
})

// A square group with a slider that scales it to 200 percent and one that turns it 45 degrees; the square is 40 wide and its group turns about its middle.
function square(fit: ModelObject['fit'], over: Partial<ModelContent> = {}): ModelContent {
  return {
    ...blankContent('Sq'),
    shapes: [rect('sq', 80, 80, 120, 120)],
    objects: [object('o', ['sq'], { fit })],
    groups: [group('g', null, ['o'], { pivot: [100, 100] })],
    ranges: [
      range('big', [drive({ kind: 'scale', target: 'group', id: 'g', atMin: 50, atMax: 200 })]),
      range('turn', [drive({ kind: 'turn', group: 'g', atMin: -45, atMax: 45 })]),
    ],
    ...over,
  }
}

describe('an object that keeps its size', () => {
  it('is not scaled by its group, but is still turned and moved by it', () => {
    const plain = solve(square('scale'), { big: 50 }).shapes.sq
    close(plain.box.w, 80)
    const kept = solve(square('keep'), { big: 50 }).shapes.sq
    close(kept.box.w, 40); close(kept.box.h, 40); close(kept.box.x, 80); close(kept.box.y, 80)
    const turned = solve(square('keep'), { big: 50, turn: 30 / 45 * 50 }).shapes.sq
    close(turned.box.w, 40 * (Math.cos(Math.PI / 6) + Math.sin(Math.PI / 6)), 5)
    close(turned.box.x + turned.box.w / 2, 100, 5); close(turned.box.y + turned.box.h / 2, 100, 5)
  })
  it('stays put at its group\'s pivot while a group above it is scaled', () => {
    const c: ModelContent = {
      ...square('keep'),
      groups: [group('top', null, [], { pivot: [100, 200] }), group('g', 'top', ['o'], { pivot: [100, 100] })],
      ranges: [range('big', [drive({ kind: 'scale', target: 'group', id: 'top', atMin: 50, atMax: 200 })])],
    }
    const kept = solve(c, { big: 50 }).shapes.sq
    close(kept.box.w, 40); close(kept.box.h, 40)
    // the group's pivot has moved with the group above; the square is centred on it as before
    const pivot = solve(c, { big: 50 }).pivots.g
    close(kept.box.x + kept.box.w / 2, pivot[0], 5); close(kept.box.y + kept.box.h / 2, pivot[1], 5)
    close(pivot[1], 200 - 100 * 2, 5)
  })
  it('is carried to where its group puts it, though its size is kept', () => {
    // the square lies above its group's pivot, so scaling the group to 200 percent carries it up; kept, it is carried there at its own size
    const c = square('keep', { groups: [group('g', null, ['o'], { pivot: [100, 200] })] })
    const kept = solve(c, { big: 50 }).shapes.sq, scaled = solve(square('scale', { groups: [group('g', null, ['o'], { pivot: [100, 200] })] }), { big: 50 }).shapes.sq
    close(kept.box.w, 40); close(scaled.box.w, 80)
    close(kept.box.x + kept.box.w / 2, 100); close(kept.box.y + kept.box.h / 2, 0)
    close(scaled.box.x + scaled.box.w / 2, 100); close(scaled.box.y + scaled.box.h / 2, 0)
  })
  it('does not change the outline that anchors and links read', () => {
    const s = solve(square('keep'), { big: 50 }).shapes.sq
    close(s.frame[0], 2); close(s.frame[3], 2)   // the group's own matrix still scales
    close(s.pre[0].x, 60); close(s.pre[2].x, 140)
  })
  it('is drawn the same whatever the mode when nothing scales the group', () => {
    const a = solve(square('keep'), {}).shapes.sq, b = solve(square('scale'), {}).shapes.sq
    expect(a.d).toBe(b.d)
  })
  it('gives a twin the mirror image, size and all', () => {
    const c: ModelContent = { ...square('keep'), shapes: [rect('sq', 40, 80, 80, 120)], groups: [group('g', null, ['o'], { pivot: [60, 100] })] }
    const made = makeTwin(c, 'group', 'g', ids())
    if (!made.ok) throw new Error(made.reason)
    const t = made.content.shapes.find(s => s.mirrorOf === 'sq')!
    const s = solve(made.content, { big: 50 })
    close(s.shapes.sq.box.w, 40); close(s.shapes[t.id].box.w, 40)
    close(s.shapes[t.id].box.x, 200 - (s.shapes.sq.box.x + s.shapes.sq.box.w))
  })
  it('is kept by the twin that is broken away', () => {
    const c: ModelContent = { ...square('keep'), shapes: [rect('sq', 40, 80, 80, 120)], groups: [group('g', null, ['o'], { pivot: [60, 100] })] }
    const made = makeTwin(c, 'object', 'o', ids())
    if (!made.ok) throw new Error(made.reason)
    const twinObject = made.content.objects.find(o => o.mirrorOf === 'o')!
    const broke = breakPair(made.content, 'object', twinObject.id)
    if (!broke.ok) throw new Error(broke.reason)
    expect(broke.content.objects.find(o => o.id === twinObject.id)).toMatchObject({ fit: 'keep', fitTo: null })
  })
  it('is plain when asked for plain', () => {
    const s = solve(square('keep'), { big: 50 }, 'front', { plain: true }).shapes.sq
    close(s.box.w, 80)
  })
})

// A head that grows with a slider (its group scales to 150 percent about the neck) and a hat in another group that follows the head's box.
function hatted(fit: ModelObject['fit'], fitTo: string | null, over: Partial<ModelContent> = {}): ModelContent {
  return {
    ...blankContent('Hat'),
    shapes: [rect('torso', 70, 90, 130, 200), rect('head', 80, 20, 120, 60), rect('hat', 80, 10, 120, 20)],
    objects: [object('oTorso', ['torso']), object('oHead', ['head']), object('oHat', ['hat'], { fit, fitTo })],
    groups: [group('gTorso', null, ['oTorso'], { pivot: [100, 150] }), group('gHead', 'gTorso', ['oHead'], { pivot: [100, 60] }), group('gHat', 'gTorso', ['oHat'], { pivot: [100, 15] })],
    ranges: [range('grow', [drive({ kind: 'scale', target: 'group', id: 'gHead', atMin: 50, atMax: 150 })])],
    ...over,
  }
}

describe('an object that stretches to a shape', () => {
  it('is the same size at rest', () => {
    const s = solve(hatted('stretch', 'head'), {}).shapes.hat
    close(s.box.x, 80); close(s.box.y, 10); close(s.box.w, 40); close(s.box.h, 10)
  })
  it('grows and moves as the shape\'s box does', () => {
    const head = solve(hatted('stretch', 'head'), { grow: 50 }).shapes.head
    close(head.box.x, 70); close(head.box.y, 0); close(head.box.w, 60); close(head.box.h, 60)
    const hat = solve(hatted('stretch', 'head'), { grow: 50 }).shapes.hat
    close(hat.box.x, 70); close(hat.box.w, 60)
    close(hat.box.h, 10 * 60 / 40); close(hat.box.y, 0 + (10 - 20) * (60 / 40))
  })
  it('does not turn with the shape', () => {
    const c = hatted('stretch', 'head', { ranges: [...hatted('stretch', 'head').ranges, range('tilt', [drive({ kind: 'turn', group: 'gHead', atMin: -45, atMax: 45 })])] })
    const flat = solve(c, {}).shapes.hat, tilted = solve(c, { tilt: 50 }).shapes.hat
    expect(flat.matrix.slice(1, 3)).toEqual([0, 0]); expect(tilted.matrix.slice(1, 3)).toEqual([0, 0])
  })
  it('scales with its group when it has no target, when the target is gone, in its own object, or when drawing plain', () => {
    const scaledHat = solve(hatted('scale', null, { ranges: [range('grow', [drive({ kind: 'scale', target: 'group', id: 'gHat', atMin: 50, atMax: 150 })])] }), { grow: 50 }).shapes.hat
    for (const c of [hatted('stretch', null), hatted('stretch', 'nope'), hatted('stretch', 'hat')]) {
      const hat = solve(c, { grow: 50 }).shapes.hat
      close(hat.box.x, 80); close(hat.box.w, 40); close(hat.box.h, 10)   // the hat's own group does not scale
    }
    close(solve(hatted('stretch', 'head'), { grow: 50 }, 'front', { plain: true }).shapes.hat.box.w, 40)
    expect(scaledHat.box.w).toBeGreaterThan(40)
  })
  it('follows a shape that a form or a slider changes, and the rig still reads the plain outline', () => {
    const hat = solve(hatted('stretch', 'head'), { grow: 50 }).shapes.hat
    close(hat.pre[0].x, 80)   // the group has not moved the hat: the anchors read what the group holds
    close(hat.frame[0], 1)
  })
})

describe('setting how an object fits', () => {
  it('sets keep and stretch, and clears the target when the mode changes', () => {
    const c = hatted('scale', null)
    const keep = setFit(c, 'oHat', 'keep')
    expect(keep.ok && keep.content.objects.find(o => o.id === 'oHat')).toMatchObject({ fit: 'keep', fitTo: null })
    const stretch = setFit(c, 'oHat', 'stretch', 'head')
    expect(stretch.ok && stretch.content.objects.find(o => o.id === 'oHat')).toMatchObject({ fit: 'stretch', fitTo: 'head' })
    const back = setFit(stretch.ok ? stretch.content : c, 'oHat', 'scale')
    expect(back.ok && back.content.objects.find(o => o.id === 'oHat')).toMatchObject({ fit: 'scale', fitTo: null })
  })
  it('remembers the shape it stretched to when only the mode comes back', () => {
    const c = hatted('stretch', 'head')
    const e = setFit(c, 'oHat', 'stretch')
    expect(e.ok && e.content.objects.find(o => o.id === 'oHat')!.fitTo).toBe('head')
  })
  it('says a stretching object has nothing to stretch to yet', () => {
    const e = setFit(hatted('scale', null), 'oHat', 'stretch')
    expect(e.ok && e.note).toMatch(/Pick the shape/)
  })
  it('refuses a missing object, a missing shape, a shape of its own, and a twin', () => {
    const c = hatted('scale', null)
    expect(setFit(c, 'nope', 'keep').ok).toBe(false)
    expect(setFit(c, 'oHat', 'stretch', 'nope').ok).toBe(false)
    expect(setFit(c, 'oHat', 'stretch', 'hat').ok).toBe(false)
    const twin = makeTwin(c, 'object', 'oHat', ids())
    if (!twin.ok) throw new Error(twin.reason)
    const t = twin.content.objects.find(o => o.mirrorOf === 'oHat')!
    expect(setFit(twin.content, t.id, 'keep').ok).toBe(false)
  })
  it('lists the shapes of other objects as targets', () => {
    expect(stretchTargets(hatted('scale', null), 'oHat')).toEqual(['torso', 'head'])
    expect(stretchTargets(hatted('scale', null), 'nope')).toEqual([])
  })
  it('reads a missing or odd mode as the default', () => {
    expect(fitOf({})).toBe('scale'); expect(fitOf({ fit: 'keep' })).toBe('keep'); expect(fitOf({ fit: 'wobble' as never })).toBe('scale')
    expect(FIT_MODES).toEqual(['scale', 'keep', 'stretch'])
  })
})

describe('frames', () => {
  const model = () => ({ ...arm(), frames: [] as NonNullable<ModelContent['frames']> })
  it('adds a frame around a box, held inside the model and to the sizes a frame may have', () => {
    const e = addFrame(model(), { x: 20, y: 0, w: 160, h: 110 }, ' Bust ', ids())
    if (!e.ok) throw new Error(e.reason)
    expect(e.content.frames).toEqual([{ id: 'f_t1', name: 'Bust', x: 20, y: 0, w: 160, h: 110, hide: [] }])
    expect(fitBox({ x: 9999, y: -999, w: 1, h: 99999 })).toEqual({ x: 250, y: -50, w: FRAME_MIN, h: FRAME_BIGGEST })
    expect(fitBox({ x: NaN, y: NaN, w: NaN, h: NaN })).toEqual({ x: 0, y: 0, w: 100, h: 100 })
  })
  it('refuses a frame past the limit', () => {
    let c: ModelContent = model()
    for (let i = 0; i < LIMITS.framesMax; i++) { const e = addFrame(c, { x: 0, y: 0, w: 50, h: 50 }, `F${i}`, ids()); if (!e.ok) throw new Error(e.reason); c = e.content; c = { ...c, frames: c.frames!.map((f, k) => ({ ...f, id: `f${k}` })) } }
    const over = addFrame(c, { x: 0, y: 0, w: 50, h: 50 })
    expect(!over.ok && over.reason).toMatch(/at most/)
  })
  it('renames, moves, resizes by dragging a handle, nudges and removes', () => {
    const c = addFrame(model(), { x: 20, y: 20, w: 100, h: 100 }, 'A', ids())
    if (!c.ok) throw new Error(c.reason)
    const id = c.frameId!
    expect(framesOf(renameFrame(c.content, id, '  Face ')).map(f => f.name)).toEqual(['Face'])
    expect(boxOfFrame(framesOf(setFrameBox(c.content, id, movedBox({ x: 20, y: 20, w: 100, h: 100 }, 30, -5)))[0])).toEqual({ x: 50, y: 15, w: 100, h: 100 })
    expect(boxOfFrame(framesOf(nudgeFrame(c.content, id, 1, 0))[0])).toEqual({ x: 21, y: 20, w: 100, h: 100 })
    expect(boxOfFrame(framesOf(nudgeFrame(c.content, id, 5, -5, true))[0])).toEqual({ x: 20, y: 20, w: 105, h: 95 })
    expect(nudgeFrame(c.content, 'nope', 1, 1)).toBe(c.content)
    expect(framesOf(removeFrame(c.content, id))).toEqual([])
  })
  it('resizes from any handle with the opposite side where it was, never below the smallest size', () => {
    const b = { x: 20, y: 30, w: 100, h: 80 }
    expect(resizedBox(b, 'e', 10, 99)).toEqual({ x: 20, y: 30, w: 110, h: 80 })
    expect(resizedBox(b, 'w', 10, 99)).toEqual({ x: 30, y: 30, w: 90, h: 80 })
    expect(resizedBox(b, 'n', 99, -10)).toEqual({ x: 20, y: 20, w: 100, h: 90 })
    expect(resizedBox(b, 'se', 5, 5)).toEqual({ x: 20, y: 30, w: 105, h: 85 })
    expect(resizedBox(b, 'nw', -10, -10)).toEqual({ x: 10, y: 20, w: 110, h: 90 })
    expect(resizedBox(b, 'e', -500, 0)).toEqual({ x: 20, y: 30, w: FRAME_MIN, h: 80 })
    expect(resizedBox(b, 'w', 500, 0)).toEqual({ x: 20 + 100 - FRAME_MIN, y: 30, w: FRAME_MIN, h: 80 })
    expect(FRAME_HANDLES).toHaveLength(8)
  })
  it('leaves things out of a frame\'s view, or puts them back', () => {
    const c = addFrame(model(), { x: 0, y: 0, w: 100, h: 100 }, 'A', ids())
    if (!c.ok) throw new Error(c.reason)
    const hidden = toggleFrameHide(c.content, c.frameId!, 'gUpper')
    expect(hidden.ok && framesOf(hidden.content)[0].hide).toEqual(['gUpper'])
    const objectToo = toggleFrameHide(hidden.ok ? hidden.content : c.content, c.frameId!, 'oFore')
    expect(objectToo.ok && framesOf(objectToo.content)[0].hide).toEqual(['gUpper', 'oFore'])
    const back = toggleFrameHide(objectToo.ok ? objectToo.content : c.content, c.frameId!, 'gUpper')
    expect(back.ok && framesOf(back.content)[0].hide).toEqual(['oFore'])
    expect(toggleFrameHide(c.content, c.frameId!, 'nope').ok).toBe(false)
    expect(toggleFrameHide(c.content, 'nope', 'gUpper').ok).toBe(false)
    const crowded = { ...c.content, frames: [{ ...framesOf(c.content)[0], hide: Array.from({ length: LIMITS.frameHideMax }, (_, i) => `x${i}`) }] }
    expect(toggleFrameHide(crowded, c.frameId!, 'gUpper').ok).toBe(false)
  })
  it('hides what the test state hides and what the frame leaves out', () => {
    const frame = { id: 'f', name: 'F', x: 0, y: 0, w: 10, h: 10, hide: ['a', 'b'] }
    expect(hiddenThrough(frame, ['b', 'c']).sort()).toEqual(['a', 'b', 'c'])
    expect(hiddenThrough(undefined, ['c'])).toEqual(['c'])
  })
  it('draws what the frame leaves out as hidden', () => {
    const frame = { id: 'f', name: 'F', x: 0, y: 0, w: 10, h: 10, hide: ['gFore'] }
    const s = solve(arm(), {}, 'front', { hidden: hiddenThrough(frame, []) })
    expect(s.shapes.fore.visible).toBe(false); expect(s.shapes.upper.visible).toBe(true)
  })
  it('looks through the same part of the body from the back', () => {
    expect(viewBoxOf({ x: 20, y: 5, w: 50, h: 60 }, 'front')).toEqual({ x: 20, y: 5, w: 50, h: 60 })
    expect(viewBoxOf({ x: 20, y: 5, w: 50, h: 60 }, 'back')).toEqual({ x: 130, y: 5, w: 50, h: 60 })
    expect(viewBoxOf({ x: 20, y: 5, w: 50, h: 60 }, 'back', 90)).toEqual({ x: 110, y: 5, w: 50, h: 60 })
  })
  it('has a card tile colour, the default until one is chosen', () => {
    expect(tileOf(model())).toBe(TILE_DEFAULT)
    expect(tileOf({ tile: '#ABCDEF' })).toBe('#abcdef'); expect(tileOf({ tile: 'blue' })).toBe(TILE_DEFAULT)
    expect(setTile(model(), '#AABBCC').tile).toBe('#aabbcc')
    const c = model()
    expect(setTile(c, 'nope')).toBe(c)
  })
})

describe('what the Check panel says about proportions', () => {
  it('says nothing for a plain model', () => {
    expect(proportionCheck(arm())).toEqual([])
  })
  it('says what a fit mode changes, a bone with no length, and a slider with no choice', () => {
    const c = hatted('keep', null, {
      bones: [bone('b', 'gHead', { kind: 'group', id: 'gHead', i: 0 }), bone('ok', 'gHead', { kind: 'group', id: 'gTorso', i: 0 })],
      ranges: [range('grow', [], { limit: [0, 0] })],
    })
    const lines = proportionCheck(c).map(l => l.text)
    expect(lines.some(l => /oHat keeps its size/.test(l))).toBe(true)
    expect(lines.some(l => /Bone b has no length/.test(l))).toBe(true)
    expect(lines.some(l => /Slider grow lets a writer choose only/.test(l))).toBe(true)
    expect(lines.some(l => /Bone ok/.test(l))).toBe(false)
    expect(proportionCheck(hatted('stretch', 'head')).map(l => l.text)[0]).toMatch(/stretches to head/)
  })
})

describe('any content, any values', () => {
  it('stays finite with bones, Length drives and fit modes pointing anywhere', () => {
    const rng = seededRng(21)
    const pick = <T,>(xs: T[]): T => xs[Math.floor(rng() * xs.length)]
    const groups = ['gTorso', 'gHead', 'gHat', 'ghost'], shapes = ['torso', 'head', 'hat', 'ghost'], boneIds = ['b0', 'b1', 'b2', 'ghost']
    for (let round = 0; round < 80; round++) {
      const c = hatted(pick(['scale', 'keep', 'stretch'] as const), pick([null, ...shapes]), {
        bones: [0, 1, 2].map(k => bone(`b${k}`, pick(groups), pick([{ kind: 'group' as const, id: pick(groups), i: 0 }, { kind: 'point' as const, id: pick(shapes), i: Math.floor(rng() * 8) }]))),
        ranges: [0, 1, 2].map(k => range(`r${k}`, [
          drive({ kind: 'length', id: pick(boneIds), atMin: rng() * 600 - 50, atMax: rng() * 600 - 50 }),
          drive({ kind: 'scale', target: pick(['group', 'model'] as const), id: pick(groups), atMin: rng() * 500, atMax: rng() * 500 }),
          drive({ kind: 'turn', group: pick(groups), atMin: (rng() - 0.5) * 900, atMax: (rng() - 0.5) * 900 }),
        ])),
        objects: hatted('scale', null).objects.map(o => (o.id === 'oHat' ? { ...o, fit: pick(['scale', 'keep', 'stretch'] as const), fitTo: pick([null, ...shapes]) } : o)),
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
        for (const m of measures(c, s)) for (const v of [m.length, m.rest, m.percent, m.heads]) expect(v == null || Number.isFinite(v)).toBe(true)
        const heads = headHeights(c, s)
        expect(heads == null || Number.isFinite(heads)).toBe(true)
      }
    }
  })
})

describe('the content a save keeps', () => {
  it('normalizes a model with proportions without losing any of it', () => {
    const c: ModelContent = {
      ...hatted('stretch', 'head'), bones: [bone('b', 'gHead', { kind: 'group', id: 'gTorso', i: 0 })], headBone: 'b', tile: '#ABCDEF',
      frames: [{ id: 'f', name: 'Face', x: 70, y: 0, w: 60, h: 70, hide: ['gTorso'] }],
      ranges: [range('r', [drive({ kind: 'length', id: 'b', atMin: 90, atMax: 110 })], { limit: [-10, 10] })],
    }
    const n = normalizeContent(c)
    expect(n.bones).toEqual(c.bones); expect(n.headBone).toBe('b'); expect(n.tile).toBe('#abcdef'); expect(n.frames).toEqual(c.frames)
    expect(n.ranges[0].limit).toEqual([-10, 10]); expect(n.ranges[0].drives[0]).toMatchObject({ kind: 'length', id: 'b', atMin: 90, atMax: 110 })
    expect(n.objects.find(o => o.id === 'oHat')).toMatchObject({ fit: 'stretch', fitTo: 'head' })
  })
})
