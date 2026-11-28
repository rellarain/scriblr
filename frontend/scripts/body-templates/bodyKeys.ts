// The body sliders of the templates (WUI slice 9f): body keys built from the six measured bodies, the sliders that drive them and the bodies a model can blend.
//
// Every template carries the same keys, each read in its own drawing: the other bodies' outlines are put on its points (by their share of the way round, where the
// number of points differs) and the keys are the differences the measured bodies show:
//   fem    = woman - man                                        (masc. to fem., 0..100)
//   fat    = heavier man - man                                  (body fat above the average for the sex; 14 points is the heavier body)
//   sits   = (heavier woman - woman) - (heavier man - man)       (where the fat sits: on a man it goes to the waist, on a woman to the hips)
//   muscle = athletic man - man + 6/14 of the fat key           (the athletic body also carries 6 points less fat)
//   age    = older woman - woman, its bust part apart (ageb)    (34 to 80 years)
// The fat a body carries sits as its sex carries it: `fat` drives the sits key scaled by the masc. to fem. slider (`by`), and a template whose own body is heavier or
// older has the rest of that product on the masc. to fem. slider, so each template draws exactly its own body at rest and the others where the sliders say. Height,
// the legs, the bust and the regions (shoulders, waist, hips, neck, head, arms) are keys of their own, drawn here from the guide's levels.
import type { ModelContent, ModelDrive, ModelPoint, ModelPreset, ModelRange, ModelShape } from '../../src/api/types'
import { build, flatten } from '../../src/assets/Interfaces/admin/characters/engine/geometry'

type V = [number, number]
export interface BodyLevels { chin: number; chest: number; waist: number; crotch: number; knees: number; soles: number }
export interface BodySource { id: string; content: ModelContent; levels: BodyLevels; heads: number; joints: Record<string, unknown> }

// where each template's own body sits on the sliders
interface Rests { fem: number; fat: number; muscle: number; age: number; height: number }
const RESTS: Record<string, Rests> = {
  man: { fem: 0, fat: 0, muscle: 40, age: 34, height: 175 },
  woman: { fem: 100, fat: 0, muscle: 40, age: 34, height: 162 },
  athletic: { fem: 0, fat: -6, muscle: 80, age: 34, height: 178 },
  heavyman: { fem: 0, fat: 14, muscle: 40, age: 34, height: 175 },
  heavywoman: { fem: 100, fat: 14, muscle: 40, age: 34, height: 162 },
  elder: { fem: 100, fat: 0, muscle: 40, age: 80, height: 158 },
}
const FAT_HEAVY = 14, MUSCLE_SPAN = 40, AGE_SPAN = 46, ATHLETIC_FAT = -6
// how fast the number of heads grows with height: the head grows as about the 0.35th power of height, so heads grow by 0.65 of a head-height per head-height
const HEADS_PER_HEAD = 0.65

const r1 = (v: number) => Math.round(v * 10) / 10
const sub = (a: V[], b: V[]): V[] => a.map((p, i) => [p[0] - b[i][0], p[1] - b[i][1]])
const add = (a: V[], b: V[], k = 1): V[] => a.map((p, i) => [p[0] + b[i][0] * k, p[1] + b[i][1] * k])

// Where each of these points lies on another body's outline, as a place along that outline's own points (a whole number on a point, between two between them). The
// two drawings place their points differently (the fitting chooses them), so the other outline is laid along this one by its share of the way round and turned to the
// start that fits best, their middles put together (the older body stands lower).
function correspond(src: V[], dst: V[], closed: boolean): number[] {
  const area = (q: V[]) => q.reduce((a, p, i) => { const n = q[(i + 1) % q.length]; return a + p[0] * n[1] - n[0] * p[1] }, 0)
  const flip = closed && Math.sign(area(src)) !== Math.sign(area(dst))
  const S = flip ? [...src].reverse() : src, n = S.length
  const shares = (q: V[]) => {
    const acc = [0], m = q.length
    for (let k = 1; k < (closed ? m + 1 : m); k++) { const a = q[(k - 1) % m], b = q[k % m]; acc.push(acc[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])) }
    const total = acc[acc.length - 1] || 1
    return acc.map(v => v / total)
  }
  const fS = shares(S), fD = shares(dst).slice(0, dst.length)
  const place = (f: number): { pos: V; u: number } => {
    const g = closed ? ((f % 1) + 1) % 1 : Math.min(1, Math.max(0, f))
    let k = 0
    while (k < fS.length - 2 && fS[k + 1] < g) k++
    const t = (g - fS[k]) / ((fS[k + 1] - fS[k]) || 1), a = S[k % n], b = S[(k + 1) % n]
    return { pos: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], u: k + t }
  }
  let best = 0
  if (closed) {
    const mid = (q: V[]): V => [q.reduce((a, p) => a + p[0], 0) / q.length, q.reduce((a, p) => a + p[1], 0) / q.length]
    const cS = mid(S), cD = mid(dst)
    const err = (o: number) => dst.reduce((e, p, i) => { const q = place(fD[i] + o).pos; return e + (q[0] - cS[0] - p[0] + cD[0]) ** 2 + (q[1] - cS[1] - p[1] + cD[1]) ** 2 }, 0)
    let bestErr = Infinity
    for (let k = 0; k < 360; k++) { const e = err(k / 360); if (e < bestErr) { bestErr = e; best = k / 360 } }
    for (let k = -10; k <= 10; k++) { const o = best + k / 3600, e = err(o); if (e < bestErr) { bestErr = e; best = o } }
  }
  return fD.map(f => { const u = place(f + best).u; return flip ? (n - u) % n : u })
}
// a list of points read at places along it (as `correspond` gives them)
const readAt = (q: V[], us: number[], closed: boolean): V[] => us.map(u => {
  const n = q.length, k = Math.floor(u), t = u - k, a = q[k % n], b = q[closed ? (k + 1) % n : Math.min(n - 1, k + 1)]
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
})
const xy = (pts: ModelPoint[]): V[] => pts.map(p => [p.x, p.y])

// a smooth bump: 1 at the middle, 0 from `half` away
const bump = (y: number, mid: number, half: number) => { const t = Math.min(1, Math.abs(y - mid) / half); return 1 - t * t * (3 - 2 * t) }
const ARM_GROUPS = new Set(['upperarmL', 'forearmL', 'handL'])

export function withBodyKeys(target: BodySource, all: BodySource[]): ModelContent {
  const c = target.content, r = RESTS[target.id]
  if (!r) throw new Error(`no body rests for ${target.id}`)
  const byId = new Map(all.map(b => [b.id, b]))
  // the men's bodies have a pectoral where the women's have a breast: each stands for the other
  const COUNTERPART: Record<string, string> = { pecL: 'breastL', breastL: 'pecL' }
  const shapeOf = (bodyId: string, id: string) => { const list = byId.get(bodyId)!.content.shapes; return list.find(s => s.id === id) ?? list.find(s => s.id === COUNTERPART[id]) }
  const groupOfShape = new Map<string, string>()
  for (const g of c.groups) for (const oid of g.objects) for (const sid of c.objects.find(o => o.id === oid)?.shapes ?? []) groupOfShape.set(sid, g.id)
  const L = target.levels, U = c.guide?.head ?? 56, axis = c.axis ?? 100
  const shoulderY = (target.joints.shoulder as V)[1]

  // the keys of one shape, in its own points
  function keysOf(s: ModelShape): Record<string, V[]> {
    const own: V[] = xy(s.pts)
    const isBreast = s.id === 'breastL' || s.id === 'pecL'
    // the measured keys: the bodies' differences, from the front and at each angle the shape is drawn at (`fem.a90`: the side view's own; the bake reads it there)
    const views: Array<{ suffix: string; mine: V[]; theirs: (o: ModelShape) => V[] | null }> = [{ suffix: '', mine: own, theirs: o => xy(o.pts) }]
    for (const a of s.turn?.angles ?? []) {
      if (a.pts.length !== s.pts.length) continue
      views.push({ suffix: `.a${a.at}`, mine: xy(a.pts), theirs: o => { const k = o.turn?.angles.find(x => x.at === a.at && x.tilt === a.tilt); return k && k.pts.length === o.pts.length ? xy(k.pts) : null } })
    }
    const out: Record<string, V[]> = {}
    const places = new Map<string, number[]>()
    const placesIn = (bodyId: string, o: ModelShape) => { let u = places.get(bodyId); if (!u) { u = correspond(xy(o.pts), own, s.closed); places.set(bodyId, u) } return u }
    for (const v of views) {
      const R = (bodyId: string): V[] | null => {
        if (bodyId === target.id) return v.mine
        const o = shapeOf(bodyId, s.id)
        if (!o) throw new Error(`${bodyId} has no ${s.id}`)
        const theirs = v.theirs(o)
        return theirs ? readAt(theirs, placesIn(bodyId, o), s.closed) : null
      }
      const man = R('man'), woman = R('woman'), heavyman = R('heavyman'), heavywoman = R('heavywoman'), athletic = R('athletic'), elder = R('elder')
      if (!man || !woman || !heavyman || !heavywoman || !athletic || !elder) continue
      const fat = sub(heavyman, man)
      out[`fem${v.suffix}`] = sub(woman, man)
      out[`fat${v.suffix}`] = fat
      out[`sits${v.suffix}`] = sub(sub(heavywoman, woman), fat)
      out[`muscle${v.suffix}`] = add(sub(athletic, man), fat, -ATHLETIC_FAT / FAT_HEAVY)
      out[`${isBreast ? 'ageb' : 'age'}${v.suffix}`] = sub(elder, woman)
    }
    const group = groupOfShape.get(s.id) ?? ''
    const arm = ARM_GROUPS.has(group)
    // height: a stretch downward, nothing above the chin, a third of a head over the torso and the rest over the legs (a head more at the full key)
    out.height = own.map(([, y]) => [0, y <= L.chin ? 0 : y <= L.crotch ? ((y - L.chin) / (L.crotch - L.chin)) * 0.35 * U : (0.35 + ((y - L.crotch) / (L.soles - L.crotch)) * 0.65) * U])
    // the legs half a head longer (the arms keep their length)
    out.legs = own.map(([, y]) => [0, arm || y <= L.crotch ? 0 : ((y - L.crotch) / (L.soles - L.crotch)) * 0.5 * U])
    // the bust fuller: the breast grows from high on the chest
    if (isBreast) {
      const xs = own.map(p => p[0]), ys = own.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, top = Math.min(...ys), h = Math.max(...ys) - top
      out.bust = own.map(([x, y]) => [(x - cx) * 0.3, (y - (top + h * 0.2)) * 0.35])
    }
    // the regions at the full key: shoulders broader by a tenth of a head each side, the waist and the hips wider, a thicker neck, a bigger head, longer arms
    out.shoulders = own.map(([x, y]) => [arm ? 0.11 * U : group === 'chest' ? Math.sign(x - axis) * 0.11 * U * bump(y, shoulderY, (L.chest - shoulderY) * 1.6) : 0, 0])
    out.waist = own.map(([x, y]) => [arm ? 0 : (group === 'chest' || group === 'pelvis') ? (x - axis) * 0.15 * bump(y, L.waist, 0.55 * U) : 0, 0])
    out.hips = own.map(([x, y]) => [arm ? 0 : (group === 'pelvis' || group === 'thighL') ? (x - axis) * 0.12 * bump(y, L.crotch - 0.25 * U, 0.75 * U) : 0, 0])
    if (group === 'neck') out.neck = own.map(([x]) => [(x - axis) * 0.25, 0])
    if (group === 'head') out.head = own.map(([x, y]) => [(x - axis) * 0.12, (y - L.chin) * 0.12])
    if (arm) out.arms = own.map(([, y]) => [0, Math.max(0, y - shoulderY) * 0.12])
    // in tenths, and a key that does not move this shape left out
    const kept: Record<string, V[]> = {}
    for (const [k, m] of Object.entries(out)) {
      const rounded = m.map(([dx, dy]): V => [r1(dx), r1(dy)])
      if (rounded.some(([dx, dy]) => Math.abs(dx) >= 0.1 || Math.abs(dy) >= 0.1)) kept[k] = rounded
    }
    return kept
  }
  const shapes = c.shapes.map(s => (s.mirrorOf || s.pts.length < 2 ? s : { ...s, morphs: keysOf(s) }))
  return { ...c, shapes, ranges: [...c.ranges, ...bodyRanges(r, target.heads)], presets: [...(c.presets ?? []), ...BODY_PRESETS] }
}

// ---- the sliders ----

const drive = (id: string, atMin: number, atMax: number, by?: ModelDrive['by']): ModelDrive => ({
  kind: 'morph', group: null, target: null, id, axis: 'xy', shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0,
  atMin: Math.round(atMin * 100) / 100, atMax: Math.round(atMax * 100) / 100, mirror: true, feature: null, prop: null, i: 0, ...(by ? { by } : {}),
})
interface Spec { id: string; name: string; min: number; max: number; rest: number; limit: [number, number] | null; unit?: '' | '%' }
const range = (s: Spec, drives: ModelDrive[]): ModelRange => ({
  id: `body-${s.id}`, name: s.name, scope: null, min: s.min, rest: s.rest, max: s.max, unit: s.unit ?? '', show: true, rand: null, limit: s.limit, role: `body-${s.id}`, drives,
})
// a key moved by `per` of itself for each step of the slider from its rest
const linear = (s: Spec, key: string, per: number, by?: ModelDrive['by']) => drive(key, -(s.rest - s.min) * per * 100, (s.max - s.rest) * per * 100, by)
// the same, but gentler below `floor` (the measured bodies end there: a slimmer or weaker body is the key run backwards, which folds outlines that differ a lot, so
// it goes at GENTLE of the pace past it)
const GENTLE = 0.6
const gentleBelow = (s: Spec, key: string, per: number, floor: number, by?: ModelDrive['by']) => {
  const down = Math.max(0, s.rest - floor) + GENTLE * (Math.min(s.rest, floor) - s.min)
  return drive(key, -down * per * 100, (s.max - s.rest) * per * 100, by)
}

function bodyRanges(r: Rests, heads: number): ModelRange[] {
  const fem: Spec = { id: 'fem', name: 'Masc. – fem.', min: 0, max: 100, rest: r.fem, limit: null }
  const height: Spec = { id: 'height', name: 'Height', min: 140, max: 210, rest: r.height, limit: [145, 200] }
  const legs: Spec = { id: 'legs', name: 'Legs', min: -50, max: 50, rest: 0, limit: [-25, 25] }
  const fat: Spec = { id: 'fat', name: 'Body fat', min: -8, max: 24, rest: r.fat, limit: [-7, 16], unit: '%' }
  const muscle: Spec = { id: 'muscle', name: 'Muscle', min: 0, max: 100, rest: r.muscle, limit: [15, 85] }
  const sits: Spec = { id: 'sits', name: 'Fat sits', min: -100, max: 100, rest: 0, limit: null }
  const bust: Spec = { id: 'bust', name: 'Bust', min: 0, max: 100, rest: 50, limit: [15, 85] }
  const age: Spec = { id: 'age', name: 'Age', min: 18, max: 90, rest: r.age, limit: [18, 85] }
  const region = (id: string, name: string): Spec => ({ id, name, min: -50, max: 50, rest: 0, limit: [-25, 25] })
  const byFem = { range: 'body-fem', at: 100 }, byFat = { range: 'body-fat', at: FAT_HEAVY }
  // a head's height in cm for this body, and how many heads a cm of height adds
  const headCm = r.height / heads
  return [
    range(height, [linear(height, 'height', HEADS_PER_HEAD / headCm)]),
    range(fem, [
      linear(fem, 'fem', 1 / 100),
      // the rest of what this body's own fat and age come to as the body turns more masculine or feminine
      ...(r.fat !== 0 ? [linear(fem, 'sits', r.fat / FAT_HEAVY / 100)] : []),
      ...(r.age !== 34 ? [linear(fem, 'ageb', (r.age - 34) / AGE_SPAN / 100)] : []),
    ]),
    range(legs, [linear(legs, 'legs', 1 / 50)]),
    range(fat, [gentleBelow(fat, 'fat', 1 / FAT_HEAVY, 0), gentleBelow(fat, 'sits', 1 / FAT_HEAVY, 0, byFem)]),
    range(muscle, [gentleBelow(muscle, 'muscle', 1 / MUSCLE_SPAN, 40)]),
    range(sits, [linear(sits, 'sits', 1 / 100, byFat)]),
    range(bust, [linear(bust, 'bust', 1 / 50)]),
    range(age, [linear(age, 'age', 1 / AGE_SPAN), linear(age, 'ageb', 1 / AGE_SPAN, byFem)]),
    ...([['shoulders', 'Shoulders'], ['waist', 'Waist'], ['hips', 'Hips'], ['neck', 'Neck'], ['head', 'Head size'], ['arms', 'Arm length']] as const)
      .map(([id, name]) => { const s = region(id, name); return range(s, [linear(s, id, 1 / 50)]) }),
  ]
}

// ---- the bodies a model blends (the Bodies section's chips): slider values, the same for either sex ----

const body = (id: string, name: string, v: Record<string, number>): ModelPreset => ({
  id: `body-${id}`, name, kind: 'body', hidden: [], values: Object.fromEntries(Object.entries(v).map(([k, x]) => [`body-${k}`, x])),
})
const BODY_PRESETS: ModelPreset[] = [
  body('average', 'Average', { fat: 0, muscle: 40, age: 34, sits: 0, bust: 50, shoulders: 0, waist: 0, hips: 0, neck: 0 }),
  body('athletic', 'Athletic', { fat: -6, muscle: 80, age: 30, sits: 0, bust: 50, shoulders: 10, waist: -10, hips: 0, neck: 10 }),
  body('heavy', 'Heavy', { fat: 14, muscle: 45, age: 40, sits: 0, bust: 60, shoulders: 0, waist: 0, hips: 0, neck: 0 }),
  body('slim', 'Slim', { fat: -7, muscle: 30, age: 28, sits: 0, bust: 35, shoulders: -5, waist: -5, hips: -5, neck: -5 }),
  body('broad', 'Broad', { fat: 2, muscle: 60, age: 36, sits: 0, bust: 50, shoulders: 25, waist: 5, hips: 5, neck: 15 }),
  body('curvy', 'Curvy', { fat: 6, muscle: 40, age: 32, sits: 60, bust: 75, shoulders: 0, waist: -15, hips: 20, neck: 0 }),
  body('elder', 'Elder', { fat: 4, muscle: 30, age: 78, sits: 0, bust: 45, shoulders: -5, waist: 5, hips: 0, neck: 0 }),
]
