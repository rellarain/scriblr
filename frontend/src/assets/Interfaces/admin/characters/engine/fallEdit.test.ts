import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelDrive, ModelGroup, ModelObject, ModelPoint, ModelRange, ModelShape } from '../../../../../api/types'
import { parseModelFile, serializeModels } from '../modelFile'
import { blankContent, newGroup, normalizeContent } from '../modelContent'
import { fadedBy, setFade, stepFade } from './fadeEdit'
import { addFall, addFallToObject, hangSummary, hangingShapes, stepFall, withWeight } from './fallEdit'
import { setLeaves, isBridge, bridgeBetween } from './bridgeEdit'
import { breakPair, makeTwin } from './pairEdit'
import { applyPreset, awayCount, isOn, restState, savePreset, saveStyle, updatePreset } from './presets'
import { previewSpecs, seededRng } from './previews'
import { rollLook } from './roll'
import { hangCheck } from './rigCheck'
import { removeRange, stepDrive } from './rigEdit'
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
const ok = <T extends { ok: boolean }>(e: T): Extract<T, { ok: true }> => { if (!e.ok) throw new Error(String((e as { reason?: string }).reason)); return e as Extract<T, { ok: true }> }
const ids = () => { let n = 0; return (prefix: string) => `${prefix}_t${++n}` }

// a head with a scarf (weighted points at its bottom) and a lock of hair, a slider that lets them fall and a slider that bends a joint
function hung(over: Partial<ModelContent> = {}): ModelContent {
  return {
    ...blankContent('Hung'),
    shapes: [
      rect('head', 80, 20, 120, 60),
      poly('scarf', [pt(95, 60), pt(105, 60), pt(120, 80, 1), pt(100, 105, 1), pt(80, 80, 1)]),
      poly('tail', [pt(100, 20), pt(110, 20), pt(110, 40, 0.5), pt(100, 40, 1)]),
      rect('crease', 90, 70, 110, 80),
    ],
    objects: [object('oHead', ['head']), object('oScarf', ['scarf', 'tail', 'crease'], { layer: 'clothing' })],
    groups: [group('gHead', null, ['oHead', 'oScarf'], { pivot: [100, 60] })],
    ranges: [range('fall', [drive({ kind: 'fall', shape: 'scarf', atMin: 0, atMax: 100 })]), range('bend', [], { min: -50, rest: 0, max: 50, unit: '°' })],
    ...over,
  }
}

describe('fading a shape with a slider', () => {
  it('starts hidden at the rest value and shown at the largest', () => {
    const c = ok(setFade(hung(), 'crease', 'bend')).content
    expect(c.shapes.find(s => s.id === 'crease')!.opBy).toEqual({ slider: 'bend', hidden: 0, shown: 50 })
    expect(fadedBy(c, 'bend').map(s => s.id)).toEqual(['crease'])
  })
  it('can be changed to another slider and taken off', () => {
    let c = ok(setFade(hung(), 'crease', 'bend')).content
    c = ok(setFade(c, 'crease', 'fall')).content
    expect(c.shapes.find(s => s.id === 'crease')!.opBy).toEqual({ slider: 'fall', hidden: 0, shown: 100 })
    c = ok(setFade(c, 'crease', null)).content
    expect(c.shapes.find(s => s.id === 'crease')!.opBy).toBeNull()
  })
  it('keeps its places when the same slider is chosen again', () => {
    let c = ok(setFade(hung(), 'crease', 'bend')).content
    c = stepFade(c, 'crease', 'hidden', 1)
    const again = ok(setFade(c, 'crease', 'bend')).content
    expect(again.shapes.find(s => s.id === 'crease')!.opBy).toEqual({ slider: 'bend', hidden: 1, shown: 50 })
  })
  it('refuses a twin, a missing slider and a missing shape', () => {
    const c = hung({ shapes: [...hung().shapes, poly('twin', [], { mirrorOf: 'crease' })] })
    expect(setFade(c, 'twin', 'bend').ok).toBe(false)
    expect(setFade(c, 'crease', 'gone').ok).toBe(false)
    expect(setFade(c, 'gone', 'bend').ok).toBe(false)
  })
  it('steps its two places inside the slider', () => {
    let c = ok(setFade(hung(), 'crease', 'bend')).content
    for (let i = 0; i < 80; i++) c = stepFade(c, 'crease', 'shown', 1)
    expect(c.shapes.find(s => s.id === 'crease')!.opBy!.shown).toBe(50)
    for (let i = 0; i < 80; i++) c = stepFade(c, 'crease', 'hidden', -1)
    expect(c.shapes.find(s => s.id === 'crease')!.opBy!.hidden).toBe(-50)
    c = stepFade(c, 'crease', 'shown', -1, true)
    expect(c.shapes.find(s => s.id === 'crease')!.opBy!.shown).toBe(45)
  })
  it('goes when its slider is deleted', () => {
    const c = ok(setFade(hung(), 'crease', 'bend')).content
    const e = ok(removeRange(c, 'bend'))
    expect(e.content.shapes.find(s => s.id === 'crease')!.opBy).toBeNull()
  })
  it('is kept by a twin that is broken away from its original', () => {
    let c = ok(setFade(hung(), 'crease', 'bend')).content
    c = ok(makeTwin(c, 'shape', 'crease', ids())).content
    const twin = c.shapes.find(s => s.mirrorOf === 'crease')!
    expect(twin.opBy ?? null).toBeNull()   // it follows the original
    expect(solve(c, { bend: 25 }).shapes[twin.id].fade).toBeCloseTo(0.5)
    c = ok(breakPair(c, 'shape', twin.id)).content
    expect(c.shapes.find(s => s.id === twin.id)!.opBy).toEqual({ slider: 'bend', hidden: 0, shown: 50 })
    expect(solve(c, { bend: 25 }).shapes[twin.id].fade).toBeCloseTo(0.5)
  })
})

describe('weights and falls', () => {
  it('put a weight on a point and take it off', () => {
    expect(withWeight(pt(1, 2), 0.5).w).toBe(0.5)
    expect('w' in withWeight(pt(1, 2, 1), 0)).toBe(false)
    expect(withWeight(pt(1, 2), 7).w).toBe(1)
  })
  it('list the shapes that can hang', () => {
    expect(hangingShapes(hung())).toEqual(['scarf', 'tail'])
    expect(hangSummary(hung().shapes[1].pts, true)).toEqual({ runs: 1, points: 3 })
  })
  it('add a Fall drive to a slider once', () => {
    const c = ok(addFall(hung(), 'bend', 'tail')).content
    expect(c.ranges.find(r => r.id === 'bend')!.drives.map(d => [d.kind, d.shape, d.atMin, d.atMax])).toEqual([['fall', 'tail', 0, 100]])
    expect(addFall(c, 'bend', 'tail').ok).toBe(false)
    expect(addFall(c, 'gone', 'tail').ok).toBe(false)
    expect(addFall(c, 'bend', 'gone').ok).toBe(false)
  })
  it('refuse a twin and a shape with no outline', () => {
    const c = hung({ shapes: [...hung().shapes, poly('twin', [], { mirrorOf: 'scarf' }), poly('empty', [])] })
    expect(addFall(c, 'bend', 'twin').ok).toBe(false); expect(addFall(c, 'bend', 'empty').ok).toBe(false)
  })
  it('add one to every weighted shape of an object, once each', () => {
    const e = ok(addFallToObject(hung(), 'bend', 'oScarf'))
    expect(e.added).toBe(2)
    expect(e.content.ranges.find(r => r.id === 'bend')!.drives.map(d => d.shape)).toEqual(['scarf', 'tail'])
    const again = addFallToObject(e.content, 'bend', 'oScarf')
    expect(again.ok).toBe(false)
    const none = addFallToObject(hung(), 'bend', 'oHead')
    expect(none.ok).toBe(false)
    if (!none.ok) expect(none.reason).toMatch(/Weights tool/)
  })
  it('step how far the fall goes at each end, from none to all', () => {
    let c = hung()
    for (let i = 0; i < 120; i++) c = stepFall(c, 'fall', 0, 'atMax', -1)
    expect(c.ranges[0].drives[0].atMax).toBe(0)
    c = stepFall(c, 'fall', 0, 'atMax', 1, true); expect(c.ranges[0].drives[0].atMax).toBe(5)
    for (let i = 0; i < 120; i++) c = stepFall(c, 'fall', 0, 'atMin', 1)
    expect(c.ranges[0].drives[0].atMin).toBe(100)
    expect(stepDrive(hung(), 'fall', 0, 'atMax', 1).ranges[0].drives[0].atMax).toBe(100)   // the generic stepper holds a fall to 100 too
  })
  it('is kept by a twin that is broken away from its original', () => {
    let c = ok(makeTwin(hung(), 'shape', 'scarf', ids())).content
    const twin = c.shapes.find(s => s.mirrorOf === 'scarf')!
    c = ok(breakPair(c, 'shape', twin.id)).content
    expect(c.ranges[0].drives.map(d => d.shape)).toEqual(['scarf', twin.id])
    const s = solve(c, { fall: 100 })
    expect(s.shapes[twin.id].local.every(p => Number.isFinite(p.x))).toBe(true)
  })
})

describe('the side things fall to, in presets', () => {
  const c = hung()
  it('is kept by a preset that is saved away from down, and applied again', () => {
    const left = { ...restState(c), fall: 'left' as const }
    const saved = ok(savePreset(c, left, 'Windy', 'Weather', ids()))
    const preset = saved.content.presets!.find(p => p.id === saved.presetId)!
    expect(preset.fall).toBe('left')
    const next = applyPreset(saved.content, restState(saved.content), preset)
    expect(next.fall).toBe('left'); expect(isOn(saved.content, next, preset)).toBe(true); expect(isOn(saved.content, restState(c), preset)).toBe(false)
  })
  it('keeps nothing when it is down, and leaves the side as it is', () => {
    const saved = ok(savePreset(c, restState(c), 'Calm', 'Weather', ids()))
    const preset = saved.content.presets!.find(p => p.id === saved.presetId)!
    expect(preset.fall ?? null).toBeNull()
    expect(applyPreset(saved.content, { ...restState(c), fall: 'right' }, preset).fall).toBe('right')
  })
  it('is put back to down by another preset of its kind that does not keep one', () => {
    let m = ok(savePreset(c, { ...restState(c), fall: 'left' }, 'Windy', 'Weather', ids())).content
    const calm = ok(savePreset(m, restState(m), 'Calm', 'Weather', ids()))
    m = calm.content
    const state = applyPreset(m, restState(m), m.presets!.find(p => p.name === 'Windy')!)
    expect(applyPreset(m, state, m.presets!.find(p => p.id === calm.presetId)!).fall).toBe('down')
  })
  it('is updated with the preset and counted as away from rest', () => {
    const saved = ok(savePreset(c, restState(c), 'W', 'Weather', ids()))
    const m = updatePreset(saved.content, saved.presetId!, { ...restState(c), fall: 'behind' })
    expect(m.presets![0].fall).toBe('behind')
    expect(awayCount(c, restState(c))).toBe(0); expect(awayCount(c, { ...restState(c), fall: 'right' })).toBe(1)
  })
  it('is kept by a style only when what it covers hangs', () => {
    const hangs = ok(saveStyle(c, { ...restState(c), fall: 'left' }, 'oScarf', 'Windy', 'Style', ids())).content.presets![0]
    const still = ok(saveStyle(c, { ...restState(c), fall: 'left' }, 'oHead', 'Calm', 'Style', ids())).content.presets![0]
    expect(hangs.fall).toBe('left'); expect(still.fall ?? null).toBeNull()
  })
})

describe('rolling and previews', () => {
  const input = { genre: null, locks: [] as string[], forms: {}, choices: {}, palette: [] }
  it('roll a side when something hangs, and keep it when what hangs is locked', () => {
    const c = hung()
    const sides = new Set<string>()
    for (let seed = 1; seed < 40; seed++) sides.add(rollLook(c, seededRng(seed), input).fall)
    expect(sides.size).toBeGreaterThan(1)
    for (let seed = 1; seed < 10; seed++) expect(rollLook(c, seededRng(seed), { ...input, locks: ['oScarf'], fall: 'left' }).fall).toBe('left')
  })
  it('leave a model with nothing that hangs as it was', () => {
    const c = hung({ ranges: [range('bend', [])] })
    expect(rollLook(c, seededRng(3), { ...input, fall: 'right' }).fall).toBe('right')
    expect(rollLook(c, seededRng(3), input).fall).toBe('down')
  })
  it('give every preview a side only when something hangs', () => {
    const c = hung()
    const specs = previewSpecs(5, 'rand', 12, c.ranges, c)
    expect(specs.every(s => ['down', 'left', 'right', 'behind'].includes(s.fall ?? ''))).toBe(true)
    expect(new Set(specs.map(s => s.fall)).size).toBeGreaterThan(1)
    expect(previewSpecs(5, 'min', 2, c.ranges, c).map(s => s.fall)).toEqual(['down', 'down'])
    const plain = hung({ ranges: [range('bend', [])] })
    expect(previewSpecs(5, 'rand', 4, plain.ranges, plain).every(s => s.fall === 'down' || s.fall === undefined)).toBe(true)
  })
})

describe('leaving along an edge', () => {
  const arm = (): ModelContent => ({
    ...blankContent('Arm'),
    shapes: [rect('upper', 45, 0, 55, 60), rect('fore', 45, 60, 55, 120)],
    objects: [object('oUpper', ['upper']), object('oFore', ['fore'])],
    groups: [group('gUpper', null, ['oUpper']), group('gFore', 'gUpper', ['oFore'], { pivot: [50, 60] })],
  })
  const bridged = () => ok(bridgeBetween(arm(), [{ shape: 'upper', e: 3, t: 0.8 }, { shape: 'fore', e: 3, t: 0.2 }, { shape: 'fore', e: 1, t: 0.2 }, { shape: 'upper', e: 1, t: 0.8 }], ids())).content
  it('is a bridge: four points, two on each part', () => {
    const c = bridged()
    expect(isBridge(c.shapes.find(s => s.id.startsWith('s_'))!)).toBe(true)
    expect(c.objects.find(o => o.id === 'oFore')!.shapes).toHaveLength(2)
    expect(c.shapes.find(s => s.id.startsWith('s_'))!.z).toBe(40)
  })
  it('accepts the other side in either order', () => {
    const e = bridgeBetween(arm(), [{ shape: 'upper', e: 3, t: 0.8 }, { shape: 'fore', e: 3, t: 0.2 }, { shape: 'upper', e: 1, t: 0.8 }, { shape: 'fore', e: 1, t: 0.2 }], ids())
    expect(e.ok && e.content.shapes.at(-1)!.pts.map(p => p.bind!.s)).toEqual(['upper', 'fore', 'fore', 'upper'])
  })
  it('can be set on any point locked to an edge, and off', () => {
    const c = bridged(), id = c.shapes.find(s => s.id.startsWith('s_'))!.id
    const off = ok(setLeaves(c, id, 0, false)).content
    expect(off.shapes.find(s => s.id === id)!.pts[0].bind!.tan).toBe(false)
    expect(isBridge(off.shapes.find(s => s.id === id)!)).toBe(true)   // the other side still runs on from edge to edge
    expect(isBridge(ok(setLeaves(off, id, 2, false)).content.shapes.find(s => s.id === id)!)).toBe(false)
    expect(ok(setLeaves(off, id, 0, true)).content.shapes.find(s => s.id === id)!.pts[0].bind!.tan).toBe(true)
    expect(setLeaves(c, id, 9, true).ok).toBe(false)
    const welded = { ...c, shapes: c.shapes.map(s => (s.id === id ? { ...s, pts: s.pts.map((p, i) => (i === 0 ? { ...p, bind: { ...p.bind!, kind: 'point' as const } } : p)) } : s)) }
    expect(setLeaves(welded, id, 0, true).ok).toBe(false)
    expect(setLeaves(arm(), 'upper', 0, true).ok).toBe(false)
  })
  it('gets a twin when both parts have twins', () => {
    let c = arm()
    c = ok(makeTwin(c, 'group', 'gUpper', ids())).content
    expect(bridgeBetween(c, [{ shape: 'upper', e: 3, t: 0.8 }, { shape: 'fore', e: 3, t: 0.2 }, { shape: 'fore', e: 1, t: 0.2 }, { shape: 'upper', e: 1, t: 0.8 }], ids()).ok).toBe(true)
  })
  it('refuses a twin part and a model with no room', () => {
    let c = arm()
    c = ok(makeTwin(c, 'group', 'gUpper', ids())).content
    const twinUpper = c.shapes.find(s => s.mirrorOf === 'upper')!.id
    expect(bridgeBetween(c, [{ shape: twinUpper, e: 3, t: 0.8 }, { shape: 'fore', e: 3, t: 0.2 }, { shape: 'fore', e: 1, t: 0.2 }, { shape: twinUpper, e: 1, t: 0.8 }], ids()).ok).toBe(false)
  })
})

describe('the hang check', () => {
  it('says what is probably a mistake, in plain words', () => {
    const noWeights = hung({ shapes: hung().shapes.map(s => (s.id === 'scarf' ? { ...s, pts: s.pts.map(p => ({ x: p.x, y: p.y, m: p.m })) } : s)) })
    expect(hangCheck(noWeights).map(l => l.text)).toContain('scarf is set to fall, but no point of it carries a weight: use the Weights tool to mark the points that hang.')
    expect(hangCheck(hung()).map(l => l.text)).toContain('tail has weighted points, but no slider lets it fall.')
    const allWeighted = hung({ shapes: hung().shapes.map(s => (s.id === 'scarf' ? { ...s, pts: s.pts.map(p => ({ ...p, w: 1 })) } : s)) })
    expect(hangCheck(allWeighted).map(l => l.text)).toContain('scarf is set to fall, but every point of it carries a weight, so nothing holds it up.')
    const same = ok(setFade(hung(), 'crease', 'bend')).content
    const flat = { ...same, shapes: same.shapes.map(s => (s.id === 'crease' ? { ...s, opBy: { slider: 'bend', hidden: 5, shown: 5 } } : s)) }
    expect(hangCheck(flat).map(l => l.text)).toContain('crease shows with a slider whose two ends are the same value: it switches on at once.')
  })
  it('says a flag with no partner does nothing', () => {
    const c: ModelContent = {
      ...hung(),
      shapes: [...hung().shapes, poly('loop', [{ ...pt(0, 0), bind: { kind: 'edge', s: 'head', i: 0, d: [0, 0], e: 0, t: 0.5, o: 0, tan: true } }, pt(10, 0), pt(10, 10), pt(0, 10)])],
    }
    expect(hangCheck(c).some(l => /^Point 1 of loop leaves along its edge/.test(l.text))).toBe(true)
  })
  it('has nothing to say about a model with none of it', () => {
    expect(hangCheck(blankContent('Plain'))).toEqual([])
  })
})

describe('what a model file keeps', () => {
  it('round-trips the flag, the fade, the fall and the side a preset keeps', () => {
    let c = hung()
    c = ok(setFade(c, 'crease', 'bend')).content
    c = { ...c, shapes: [...c.shapes, poly('b', [{ ...pt(0, 0), bind: { kind: 'edge', s: 'head', i: 0, d: [0, 0], e: 1, t: 0.5, o: 0, tan: true } }, pt(10, 0), pt(10, 10), pt(0, 10)])] }
    c = ok(savePreset(c, { ...restState(c), fall: 'right' }, 'Windy', 'Weather', ids())).content
    const back = parseModelFile(serializeModels([normalizeContent({ ...c, name: 'Hung' })])).models[0]
    expect(back.shapes.find(s => s.id === 'crease')!.opBy).toEqual({ slider: 'bend', hidden: 0, shown: 50 })
    expect(back.shapes.find(s => s.id === 'b')!.pts[0].bind!.tan).toBe(true)
    expect(back.shapes.find(s => s.id === 'scarf')!.pts[2].w).toBe(1)
    expect(back.ranges.find(r => r.id === 'fall')!.drives[0]).toMatchObject({ kind: 'fall', shape: 'scarf', atMin: 0, atMax: 100 })
    expect(back.presets![0].fall).toBe('right')
  })
  it('repairs a fall drive and a fade that are out of range', () => {
    const file = JSON.stringify({
      scriblrCharacterModels: 1,
      models: [{
        name: 'Odd', shapes: [{ id: 's1', name: 'S', pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], opBy: { slider: 'r1', hidden: 'x', shown: 1e9 } }], objects: [{ id: 'o1', shapes: ['s1'] }], groups: [{ id: 'g1', objects: ['o1'] }],
        ranges: [{ id: 'r1', min: 0, max: 100, rest: 0, drives: [{ kind: 'fall', shape: 's1', atMin: -9, atMax: 900 }, { kind: 'fall' }] }],
        presets: [{ id: 'p1', fall: 'upward' }],
      }],
    })
    const m = parseModelFile(file).models[0]
    expect(m.shapes[0].opBy).toEqual({ slider: 'r1', hidden: 0, shown: 1000 })
    expect(m.ranges[0].drives).toHaveLength(1); expect(m.ranges[0].drives[0]).toMatchObject({ atMin: 0, atMax: 100 })
    expect(m.presets![0].fall ?? null).toBeNull()
  })
})

describe('normalising', () => {
  it('holds a fade and a side to what the server keeps', () => {
    const c = normalizeContent({ ...hung(), name: 'N', shapes: hung().shapes.map(s => (s.id === 'crease' ? { ...s, opBy: { slider: 'bend', hidden: NaN, shown: 5000 } } : s)), presets: [{ id: 'p', name: 'P', kind: 'K', values: {}, hidden: [], fall: 'sideways' as never }] })
    expect(c.shapes.find(s => s.id === 'crease')!.opBy).toEqual({ slider: 'bend', hidden: 0, shown: 1000 })
    expect(c.presets![0].fall).toBeNull()
    expect(normalizeContent({ ...hung(), name: 'N', shapes: hung().shapes.map(s => (s.id === 'crease' ? { ...s, opBy: { slider: '', hidden: 0, shown: 1 } } : s)) }).shapes.find(s => s.id === 'crease')!.opBy).toBeNull()
  })
})
