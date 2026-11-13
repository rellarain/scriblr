// The clothes of the seed model (phase 6c-3b, refitted to the realistic body in phase O4b): a shirt with a neckline cut out of it and a collar, sleeves, trousers and shoes, each point
// of which follows a point of the body's skin (so a garment is draped on whatever body the sliders make, and bends with the skin at the joints), with a looseness slider for the top and
// the trousers. The shirt, the sleeves, the trousers and the shoes are drawn as offsets of the skins; the necklines (the old portrait's fifteen), the openings of the jacket and the
// coat, the skirt, the dress and the underwear were drawn on the mockup's body and are carried over to this one (`remapNeck`, `remapBody`). One hole is cut out of the shirt (a form
// of it for each neckline, every point of it locked to the chest), with a collar round it and the few things a neckline brings (the buttons of a henley, the flaps of a polo shirt,
// the drape of a cowl, the roll of a turtleneck). The left-hand pieces are built here; the right-hand ones are mirrored from them once the body has its twins (`finishClothes`), each
// locked to the twin of the body part it follows.
import type { ModelBind, ModelContent, ModelForm, ModelObject, ModelPoint, ModelPointMode, ModelPreset, ModelRange, ModelShape } from '../../src/api/types'
import { build, flatten } from '../../src/assets/Interfaces/admin/characters/engine/geometry'
import { ARM, CHEST_HALF, LEG, PELVIS_HALF, range, shapeOf } from './body'

const r2 = (v: number): number => Math.round(v * 100) / 100
const SWAP: Record<ModelPointMode, ModelPointMode> = { c: 'c', s: 's', cs: 'sc', sc: 'cs' }
type HP = [number, number] | [number, number, ModelPointMode]

export const CLOTH_SLOT = 'k_cloth'
export const TROUSER_SLOT = 'k_trouser'

// A point of the body shapes a garment may follow: where it is and which it is.
interface Anchor { s: string; i: number; x: number; y: number }
const anchorsOf = (shapes: ModelShape[], ids: string[]): Anchor[] => ids.flatMap(sid => shapes.find(x => x.id === sid)!.pts.map((q, i) => ({ s: sid, i, x: q.x, y: q.y })))

// ---- from the mockup's body to this one (phase O4b) ----

// Heights on the mockup's body and the same places on this one: the crown, the chin, the base of the neck, the shoulders, the waist, the crotch, the knees, the ankles, the soles.
const HEIGHTS: Array<[number, number]> = [[8, -13], [62, 41], [75, 55], [86, 65.3], [150, 147], [198, 190], [264, 284], [356, 376], [398, 398]]
const mapY = (y: number): number => {
  if (y <= HEIGHTS[0][0]) return y + HEIGHTS[0][1] - HEIGHTS[0][0]
  for (let k = 1; k < HEIGHTS.length; k++) {
    const [a0, b0] = HEIGHTS[k - 1], [a1, b1] = HEIGHTS[k]
    if (y <= a1) return b0 + ((y - a0) * (b1 - b0)) / (a1 - a0)
  }
  return y
}
// Round the neck: down by the neck's difference and a little wider (the realistic neck is wider), less so out toward the shoulders.
export function remapNeck([x, y, m]: HP): HP {
  const dx = x - 100, k = 1.06 - 0.09 * Math.min(1, Math.max(0, (Math.abs(dx) - 20) / 20))
  return m ? [r2(100 + dx * k), r2(y - 20), m] : [r2(100 + dx * k), r2(y - 20)]
}
// The half width of a body at a height, from the outlines of its parts (the widest of them there, to the right of the middle).
const polysOf = (shapes: ModelShape[]): Array<Array<[number, number]>> => shapes.map(x => flatten(build(x.pts, true), true))
function halfAt(polys: Array<Array<[number, number]>>, y: number): number {
  let x1 = 0
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) x1 = Math.max(x1, a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]) - 100)
    }
  }
  return x1
}
// A garment of the trunk drawn on the mockup's body, carried to this one: each height to the same place, each width by how much wider or narrower the body is there.
let widthRatio: (y: number) => number = () => 1
export function setBodies(mock: any, body: ModelShape[]): void {
  const old = polysOf(['neck', 'chest', 'abdomen', 'pelvis', 'trapL', 'oblL', 'hipL', 'legL'].map(id => shapeOf(mock, id)))
  const now = polysOf(body.filter(x => ['neck', 'chest', 'pelvis', 'legL'].includes(x.id)))
  const table = new Map<number, number>()
  for (let y = 60; y <= 400; y += 2) {
    const o = halfAt(old, y), n = halfAt(now, mapY(y))
    table.set(y, o > 4 && n > 4 ? Math.min(1.25, Math.max(0.8, n / o)) : 1)
  }
  widthRatio = (y: number) => {
    let sum = 0, count = 0
    for (let k = -6; k <= 6; k += 2) { const v = table.get(Math.round(Math.min(400, Math.max(60, y + k)) / 2) * 2); if (v) { sum += v; count++ } }
    return count ? sum / count : 1
  }
}
export function remapBody([x, y, m]: HP): HP {
  if (y <= 88) return remapNeck(m ? [x, y, m] : [x, y])
  const k = widthRatio(y), out: HP = [r2(100 + (x - 100) * k), r2(mapY(y))]
  return m ? [out[0], out[1], m] : out
}

// ---- garments drawn as offsets of the skins ----

type XY3 = [number, number, ModelPointMode?]
// Points of a skin's outline moved t outward (away from the middle of the outline), as garment points.
function offsetPoints(outline: XY3[], idx: number[], t: number): HP[] {
  const n = outline.length, cx = outline.reduce((a, q) => a + q[0], 0) / n, cy = outline.reduce((a, q) => a + q[1], 0) / n
  return idx.map(i => {
    const a = outline[(i + n - 1) % n], b = outline[(i + 1) % n], q = outline[i]
    let nx = b[1] - a[1], ny = -(b[0] - a[0])
    const len = Math.hypot(nx, ny) || 1
    nx /= len; ny /= len
    if (nx * (q[0] - cx) + ny * (q[1] - cy) < 0) { nx = -nx; ny = -ny }
    return [r2(q[0] + nx * t), r2(q[1] + ny * t)] as HP
  })
}
const range0 = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, k) => a + k)
// The whole chest and pelvis as one closed outline (right halves, top to bottom), for offsets across the two.
const CHEST_FULL: XY3[] = [...CHEST_HALF, ...CHEST_HALF.slice(1, -1).reverse().map(([x, y]) => [200 - x, y] as XY3)]
const PELVIS_FULL: XY3[] = [...PELVIS_HALF, ...PELVIS_HALF.slice(1, -1).reverse().map(([x, y]) => [200 - x, y] as XY3)]

// A point at (x, y) that follows the nearest of the anchors, at the offset it has from it at rest.
function followNearest(anchors: Anchor[], x: number, y: number, mode: ModelPointMode = 'c'): ModelPoint {
  let best = anchors[0], bd = Infinity
  for (const a of anchors) {
    const d = Math.hypot(a.x - x, a.y - y)
    if (d < bd - 1e-9) { bd = d; best = a }
  }
  const bind: ModelBind = { kind: 'point', s: best.s, i: best.i, d: [r2(x - best.x), r2(y - best.y)], e: 0, t: 0, o: 0 }
  return { x: r2(x), y: r2(y), m: mode, hi: null, ho: null, bind }
}

// A symmetric outline from its right half (from the top of the axis to the bottom of it), every point following the body.
const fromHalf = (anchors: Anchor[], half: HP[]): ModelPoint[] => {
  const right = half.map(([x, y, m]) => followNearest(anchors, x, y, m ?? 'c'))
  const left: ModelPoint[] = []
  for (let k = half.length - 2; k >= 1; k--) { const [x, y, m] = half[k]; left.push(followNearest(anchors, 200 - x, y, SWAP[m ?? 'c'])) }
  return [...right, ...left]
}
const polygon = (anchors: Anchor[], list: HP[]): ModelPoint[] => list.map(([x, y, m]) => followNearest(anchors, x, y, m ?? 'c'))

// ---- the necklines ----

interface Neckline {
  id: string; name: string
  hole: HP[]                       // the right half of the hole, from the top to the bottom of the axis
  band?: boolean                   // a band of cloth round the edge of the hole
  extras?: string[]                // the shapes this neckline shows besides the hole and the collar
  sleeves?: 'none'                 // the sleeves that go with it (strapless has none)
}
const TINY: HP[] = [[100, 75], [107, 76], [106, 79], [100, 81]]
const NECKLINES: Neckline[] = [
  { id: 'crew', name: 'Crew neck', hole: [[100, 75], [110.5, 76], [110, 84], [100, 91]], band: true },
  { id: 'vneck', name: 'V-neck', hole: [[100, 75], [110.5, 76], [106.5, 88], [100, 102, 's']], band: true },
  { id: 'deepv', name: 'Deep V', hole: [[100, 75], [111, 76], [106, 96], [100, 120, 's']], band: true },
  { id: 'scoop', name: 'Scoop neck', hole: [[100, 75], [114, 76], [113.5, 90], [100, 100]], band: true },
  { id: 'widescoop', name: 'Wide scoop', hole: [[100, 75], [122, 77], [120, 94], [100, 104]], band: true },
  { id: 'boat', name: 'Boat neck', hole: [[100, 75], [128, 79], [126, 85], [100, 89]] },
  { id: 'square', name: 'Square neck', hole: [[100, 75], [120, 76, 's'], [120, 96, 's'], [100, 96, 's']], band: true },
  { id: 'sweetheart', name: 'Sweetheart', hole: [[100, 75], [122, 77], [120, 87], [114.5, 91], [107, 89], [103, 86], [100, 98, 's']], band: true },
  { id: 'henley', name: 'Henley', hole: [[100, 75], [111.5, 76], [111, 84], [100, 92]], band: true, extras: ['placket', 'button1', 'button2', 'button3'] },
  { id: 'polo', name: 'Polo collar', hole: [[100, 75], [113, 76], [106, 86], [100, 98, 's']], extras: ['flapL', 'flapR', 'poloPlacket', 'poloButton1', 'poloButton2'] },
  { id: 'mock', name: 'Mock neck', hole: TINY, extras: ['mockCollar'] },
  { id: 'turtle', name: 'Turtleneck', hole: TINY, extras: ['turtleCollar'] },
  { id: 'cowl', name: 'Cowl neck', hole: [[100, 75], [117, 77], [116, 90], [100, 103]], extras: ['cowl'] },
  { id: 'offshoulder', name: 'Off the shoulder', hole: [[100, 70], [158, 70, 's'], [158, 97, 's'], [100, 97, 's']], sleeves: 'none' },
  { id: 'strapless', name: 'Strapless', hole: [[100, 70], [158, 70, 's'], [158, 116, 's'], [100, 116, 's']], sleeves: 'none' },
]
export const NECKLINE_IDS = NECKLINES.map(n => n.id)

// The band that runs along the lower edge of a hole: its edge and the same edge a little further out (outward from the middle of the hole), as a closed outline.
function collarHalf(hole: HP[]): HP[] {
  const edge = hole.slice(1), cy = (hole[0][1] + hole[hole.length - 1][1]) / 2, cx = 100
  const outer = edge.map(([x, y, m], k) => {
    const a = edge[Math.max(0, k - 1)], b = edge[Math.min(edge.length - 1, k + 1)]
    let nx = b[1] - a[1], ny = -(b[0] - a[0])
    const len = Math.hypot(nx, ny) || 1
    nx /= len; ny /= len
    if (nx * (x - cx) + ny * (y - cy) < 0) { nx = -nx; ny = -ny }
    const t = 3 + k * 0.2
    return [x + nx * t, y + ny * t, m] as HP
  })
  return [...edge.slice().reverse(), ...outer]
}

// ---- what the shirt has besides its hole ----

const dark = { kind: 'shadow', t: 0.14 } as const
function extraShapes(anchors: Anchor[], neck: Anchor[]): ModelShape[] {
  const shape = (id: string, name: string, z: number, pts: ModelPoint[], over: Partial<ModelShape> = {}): ModelShape => ({ id, name, closed: true, z, op: 1, view: 'front', pts, half: 0, slot: CLOTH_SLOT, gray: null, loose: 'looseTop', ...over })
  const circle = (cx: number, cy: number, r: number): HP[] => [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]]
  const rect = (x: number, y0: number, y1: number): HP[] => [[100 - x, y0, 's'], [100 + x, y0, 's'], [100 + x, y1, 's'], [100 - x, y1, 's']]
  const flapR: HP[] = [[102, 94, 's'], [115.5, 75, 's'], [123.5, 81.5], [113, 99]]
  const flapL: HP[] = flapR.slice().reverse().map(([x, y, m]) => [200 - x, y, SWAP[m ?? 'c']] as HP)
  const cowl: HP[] = [[118, 78], [109, 84.5], [100, 85.8], [91, 84.5], [82, 78], [85, 85], [92, 93], [100, 98], [108, 93], [115, 85]]
  const turtle = (top: number): HP[] => [[100 + 11, top, 's'], [100 + 11, top + 10, 'c'], [114.5, 79], [100, 83, 'c'], [85.5, 79], [100 - 11, top + 10, 'c'], [100 - 11, top, 's']]
  return [
    shape('placket', 'Placket', 30.6, polygon(anchors, rect(2.3, 83, 111).map(remapNeck)), { derive: { kind: 'shadow', t: 0.09 } }),
    ...[11, 19, 27].map((dy, k) => shape(`button${k + 1}`, `Button ${k + 1}`, 30.7, polygon(anchors, circle(100, 80 + dy, 1.1).map(remapNeck)), { derive: dark })),
    shape('flapR', 'Collar flap (left)', 31, polygon(anchors, flapR.map(remapNeck)), { tone: 1, loose: 'looseTop' }),
    shape('flapL', 'Collar flap (right)', 31, polygon(anchors, flapL.map(remapNeck)), { tone: 1, loose: 'looseTop' }),
    shape('poloPlacket', 'Polo placket', 30.6, polygon(anchors, rect(2.1, 95, 109).map(remapNeck)), { derive: { kind: 'shadow', t: 0.09 } }),
    ...[100, 106].map((y, k) => shape(`poloButton${k + 1}`, `Polo button ${k + 1}`, 30.7, polygon(anchors, circle(100, y, 1).map(remapNeck)), { derive: dark })),
    shape('cowl', 'Cowl drape', 31, polygon(anchors, cowl.map(remapNeck)), { tone: -1 }),
    shape('mockCollar', 'Mock neck collar', 31, polygon(neck, turtle(69).map(remapNeck)), { tone: 1 }),
    shape('turtleCollar', 'Turtleneck collar', 31, polygon(neck, turtle(58).map(remapNeck)), { tone: 1 }),
  ]
}

// ---- the outfit ----

const hidden = (id: string): { shape: string; pts: ModelPoint[] } => ({ shape: id, pts: [] })

export interface Clothes {
  shapes: ModelShape[]
  objects: ModelObject[]
  ranges: ModelRange[]
  presets: ModelPreset[]
}

export function clothesParts(mock: any, body: ModelShape[]): Clothes {
  setBodies(mock, body)
  const chest = anchorsOf(body, ['chest']), neck = anchorsOf(body, ['neck', 'chest'])
  const trunk = anchorsOf(body, ['chest', 'pelvis']), arm = anchorsOf(body, ['uarmL']), legs = anchorsOf(body, ['pelvis', 'legL']), foot = anchorsOf(body, ['instepL', 'toesL'])
  const extras = extraShapes(chest, neck)
  const extraIds = extras.map(e => e.id)
  const holeOf = (n: Neckline): HP[] => n.hole.map(remapNeck)
  const sh = (id: string, name: string, z: number, pts: ModelPoint[], over: Partial<ModelShape> = {}): ModelShape => ({ id, name, closed: true, z, op: 1, view: 'both', pts, half: 0, template: null, slot: CLOTH_SLOT, gray: null, ...over })

  // the shirt: over the shoulders along the trapezius, down the sides to the hips; its hole and its collar
  const shirtHalf: HP[] = [
    // (straight from the shoulder to the side under the arm, past the armpit's notch in the chest)
    [100, 55], ...offsetPoints(CHEST_FULL, [1, 2, 3, 4, 7, 8, 9, 10], 2.2), ...offsetPoints(PELVIS_FULL, [2, 3, 4], 2.8), [141.5, 188, 's'], [100, 190, 's'],
  ]
  const shirt = sh('shirt', 'Shirt', 30, fromHalf(trunk, shirtHalf), { cut: ['neckHole'], loose: 'looseTop' })
  const base = NECKLINES[0]
  const hole: ModelShape = sh('neckHole', 'Neckline opening', 30.5, fromHalf(chest, holeOf(base)), { helper: true })
  const collar: ModelShape = sh('collar', 'Collar', 31, fromHalf(chest, collarHalf(holeOf(base))), { tone: 1, loose: 'looseTop' })
  const necklineForms: ModelForm[] = NECKLINES.map(n => {
    const ovr: ModelForm['ovr'] = []
    if (n.id !== base.id) ovr.push({ shape: 'neckHole', pts: fromHalf(chest, holeOf(n)) })
    if (n.band) { if (n.id !== base.id) ovr.push({ shape: 'collar', pts: fromHalf(chest, collarHalf(holeOf(n))) }) } else ovr.push(hidden('collar'))
    for (const id of extraIds) if (!(n.extras ?? []).includes(id)) ovr.push(hidden(id))
    return { id: n.id, name: n.name, ovr }
  })
  const shirtObject: ModelObject = {
    id: 'shirt', name: 'Shirt', layer: 'clothing', shapes: ['shirt', 'neckHole', 'collar', ...extraIds],
    axes: [{ id: 'neckline', name: 'Neckline', initial: base.id, options: necklineForms }],
  }

  // the sleeves (offsets of the arm's skin, so they bend at the elbow with it): short to begin with; none or long
  const A = ARM as XY3[], off = (idx: number[]) => offsetPoints(A, idx, 2.2)
  const upShortPts = polygon(arm, [...off([0, 1, 2, 3, 4, 5, 6]), [154.8, 121, 's'], [133.8, 121, 's'], ...off([22, 23, 24])])
  const upLong = polygon(arm, [...off([0, 1, 2, 3, 4, 5, 6, 7, 8]), [154.2, 146, 's'], [136.6, 145, 's'], ...off([20, 21, 22, 23, 24])])
  const foreLong = polygon(arm, [[154.2, 141], ...off([9, 10, 11, 12]), [157.6, 194.5, 's'], [141.4, 195, 's'], ...off([16, 17, 18, 19]), [136.6, 141]])
  const upShort = sh('sleeveUpL', 'Sleeve, upper arm (left)', 32, upShortPts, { loose: 'looseTop' })
  const fore: ModelShape = sh('sleeveForeL', 'Sleeve, forearm (left)', 32, foreLong, { loose: 'looseTop' })
  const sleeves: ModelObject = {
    id: 'sleeves', name: 'Sleeves', layer: 'clothing', shapes: ['sleeveUpL', 'sleeveUpR', 'sleeveForeL', 'sleeveForeR'],
    axes: [{
      id: 'length', name: 'Sleeve length', initial: 'short', options: [
        { id: 'none', name: 'Sleeveless', ovr: [hidden('sleeveUpL'), hidden('sleeveForeL')] },
        { id: 'short', name: 'Short', ovr: [hidden('sleeveForeL')] },
        { id: 'long', name: 'Long', ovr: [{ shape: 'sleeveUpL', pts: upLong }] },
      ],
    }],
  }

  // the trousers: from just under the navel over the hips (an offset of the pelvis), and a leg each (an offset of the leg's skin) to the ankle
  const hipHalf: HP[] = [[100, 150], [134, 150], ...offsetPoints(PELVIS_FULL, [2, 3, 4, 5], 2.4), [119, 199.5], [105, 194.5], [100, 193.5]]
  const trouserHip = sh('trouserHip', 'Trousers, hips', 28.2, fromHalf(legs, hipHalf), { slot: TROUSER_SLOT, loose: 'looseBottom' })
  const G = LEG as XY3[]
  const trouserLeg = polygon(legs, [[G[0][0], G[0][1]], [G[1][0], G[1][1]], ...offsetPoints(G, range0(2, 12), 2.6), [123.2, 371, 's'], [101.8, 371, 's'], ...offsetPoints(G, range0(18, 25), 2.6)])
  const trouserL = sh('trouserL', 'Trouser leg (left)', 28.2, trouserLeg, { slot: TROUSER_SLOT, loose: 'looseBottom' })
  const trousers: ModelObject = { id: 'trousers', name: 'Trousers', layer: 'clothing', shapes: ['trouserHip', 'trouserL', 'trouserR'] }
  // the shoes: the foot a little bigger all round, up to the ankle
  const FOOTPTS: XY3[] = [[104.5, 370], [119, 370], [121.5, 379], [123.5, 387], [121.5, 392], [104.5, 392.5], [102, 388], [102.5, 379]]
  const shoePts = offsetPoints(FOOTPTS, range0(0, 7), 1.6).map(([x, y], k) => (k < 2 ? [x, y - 1.5] as HP : [x, y] as HP))
  const shoeL = sh('shoeL', 'Shoe (left)', 28.21, polygon(foot, shoePts), { slot: 'k_shoe' })
  const shoes: ModelObject = { id: 'shoes', name: 'Shoes', layer: 'clothing', shapes: ['shoeL', 'shoeR'] }

  const ranges = [
    range('looseTop', 'Top: how loose', 'shirt', 0, 100, 200, '%', []),
    range('looseBottom', 'Trousers: how loose', 'trousers', 0, 100, 200, '%', []),
  ]
  const presets: ModelPreset[] = NECKLINES.map(n => ({
    id: `top_${n.id}`, name: n.name, kind: 'Top', values: {}, hidden: [],
    forms: { 'shirt.neckline': n.id, ...(n.sleeves ? { 'sleeves.length': n.sleeves } : {}) },
  }))
  const shapes = [shirt, hole, collar, ...extras, upShort, fore, trouserHip, trouserL, shoeL]
  return { shapes, objects: [shirtObject, sleeves, trousers, shoes], ranges, presets }
}
// (the trunk's anchors are made once the body has its twins, in addLayers)

// ---- the right-hand pieces ----

// The twin of a shape of the body: the shape that mirrors it (a shape that is its own mirror, like the chest, has none: it is its own twin).
const twinOf = (c: ModelContent, id: string): string => c.shapes.find(s => s.mirrorOf === id)?.id ?? id

// A list of points the other way round: the right-hand piece of a left-hand garment, every point following the twin of the body point it follows.
function mirrored(c: ModelContent, list: ModelPoint[]): ModelPoint[] {
  const sizeOf = (id: string): number => c.shapes.find(s => s.id === id)!.pts.length
  const out: ModelPoint[] = []
  for (let k = list.length - 1; k >= 0; k--) {
    const p = list[k]
    const q: ModelPoint = { x: r2(200 - p.x), y: p.y, m: SWAP[p.m], hi: p.ho ? [-p.ho[0], p.ho[1]] : null, ho: p.hi ? [-p.hi[0], p.hi[1]] : null }
    if (p.w != null) q.w = p.w
    const b = p.bind
    if (b) {
      const s = twinOf(c, b.s), n = sizeOf(b.s)
      q.bind = b.kind === 'point'
        ? { ...b, s, i: s === b.s ? b.i : n - 1 - b.i, d: [-b.d[0], b.d[1]] }
        : { ...b, s, e: s === b.s ? b.e : (2 * n - 2 - b.e) % n, t: r2(1 - b.t) }
    }
    out.push(q)
  }
  return out
}

const PAIRS: Array<[string, string, string, string]> = [   // left, right, the object that has them, the name of the right-hand one
  ['sleeveUpL', 'sleeveUpR', 'sleeves', 'Sleeve, upper arm (right)'], ['sleeveForeL', 'sleeveForeR', 'sleeves', 'Sleeve, forearm (right)'],
  ['trouserL', 'trouserR', 'trousers', 'Trouser leg (right)'], ['shoeL', 'shoeR', 'shoes', 'Shoe (right)'],
]

// The garments follow the body parts that have twins now: the right-hand pieces are made, and what the garments that cross the middle follow on the right is the twin of the
// bridge it follows on the left (the mockup called them oblR and hipR).
export function finishClothes(c: ModelContent): ModelContent {
  return addLayers(mirrorSides(c))
}

function mirrorSides(c: ModelContent): ModelContent {
  let shapes = c.shapes
  const withShapes: ModelContent = { ...c, shapes }
  for (const [left, right, , name] of PAIRS) {
    const src = shapes.find(s => s.id === left)!
    shapes = [...shapes, { ...src, id: right, name, pts: mirrored(withShapes, src.pts) }]
  }
  const done: ModelContent = { ...c, shapes }
  const objects = c.objects.map(o => ({
    ...o,
    axes: o.axes?.map(a => ({
      ...a,
      options: a.options.map(f => ({
        ...f,
        ovr: f.ovr.flatMap(ov => {
          const pair = PAIRS.find(p => p[0] === ov.shape && p[2] === o.id)
          return pair ? [ov, { shape: pair[1], pts: ov.pts.length ? mirrored(done, ov.pts) : [] }] : [ov]
        }),
      })),
    })),
  }))
  return { ...done, objects }
}

// ---- the outer layer and the other garments (new designs, drawn on the same body) ----

const anchorsOfContent = (c: ModelContent, ids: string[]): Anchor[] => ids.flatMap(sid => c.shapes.find(s => s.id === sid)!.pts.map((p, i) => ({ s: sid, i, x: p.x, y: p.y })))

// An outline a little further out from the body all round (outward from its middle), a hem further down, a flare wider: the garment over another, as a copy of its outline. The
// points keep following the body part they followed, at the new offset.
function thicker(pts: ModelPoint[], t: number, lowerFrom = Infinity, lowerBy = 0, flare = 0): ModelPoint[] {
  const n = pts.length, cx = pts.reduce((a, p) => a + p.x, 0) / n, cy = pts.reduce((a, p) => a + p.y, 0) / n
  return pts.map((p, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n]
    let nx = b.y - a.y, ny = -(b.x - a.x)
    const len = Math.hypot(nx, ny) || 1
    nx /= len; ny /= len
    if (nx * (p.x - cx) + ny * (p.y - cy) < 0) { nx = -nx; ny = -ny }
    let dx = nx * t, dy = ny * t
    if (p.y >= lowerFrom) { dy += lowerBy; dx += Math.sign(p.x - 100) * flare }
    const q: ModelPoint = { ...p, x: r2(p.x + dx), y: r2(p.y + dy) }
    if (p.bind?.kind === 'point') q.bind = { ...p.bind, d: [r2(p.bind.d[0] + dx), r2(p.bind.d[1] + dy)] }
    else if (p.bind?.kind === 'edge') q.bind = { ...p.bind, o: r2(p.bind.o + t) }
    return q
  })
}

const shapeBase = (id: string, name: string, z: number, slot: string, pts: ModelPoint[], over: Partial<ModelShape> = {}): ModelShape =>
  ({ id, name, closed: true, z, op: 1, view: 'both', pts, half: 0, slot, gray: null, loose: 'looseTop', ...over })

// What an outer garment (a jacket, a coat) is made of: its body, the opening in front of it (a hole cut out of it) and the lapels round the opening, and long sleeves.
interface Outer { id: string; name: string; slot: string; z: number; thick: number; lowerFrom: number; lowerBy: number; flare: number; open: HP[]; shut: HP[] }
const OUTER: Outer[] = [
  { id: 'jacket', name: 'Jacket', slot: 'k_outer', z: 34, thick: 2.8, lowerFrom: 165, lowerBy: 12, flare: 0, open: [[100, 72], [112.5, 73], [109, 95], [100, 150, 's']], shut: [[100, 72], [111, 73], [107, 86], [100, 112, 's']] },
  { id: 'coat', name: 'Coat', slot: 'k_outer', z: 36, thick: 3.4, lowerFrom: 163, lowerBy: 70, flare: 6, open: [[100, 72], [113, 73], [109, 96], [100, 170, 's']], shut: [[100, 72], [111.5, 73], [107, 88], [100, 124, 's']] },
]

const SKIRT_LENGTHS: Array<[string, string, number]> = [['mini', 'Mini', 218], ['knee', 'Knee-length', 248], ['midi', 'Midi', 292], ['maxi', 'Maxi', 336]]
const skirtHalf = (hem: number): HP[] => [[100, 161, 's'], [136, 160, 's'], [140, 176], [136 + (hem - 160) * 0.17, hem - 26], [138 + (hem - 160) * 0.24, hem, 's'], [100, hem + 4, 's']]
const DRESS_NECKS = ['crew', 'vneck', 'scoop', 'square', 'boat']

function addLayers(c: ModelContent): ModelContent {
  const torso = anchorsOfContent(c, ['chest', 'pelvis']), chest = anchorsOfContent(c, ['chest'])
  const shirt = c.shapes.find(s => s.id === 'shirt')!
  const shapeById = (id: string) => c.shapes.find(s => s.id === id)!
  const extraShapes: ModelShape[] = [], objects: ModelObject[] = [], presets: ModelPreset[] = []
  const hideAll = (ids: string[]): ModelForm['ovr'] => ids.map(hidden)
  const pairList: Array<[string, string, string]> = []   // left, right, the name of the right-hand one

  // ---- jacket and coat ----
  for (const o of OUTER) {
    const body = shapeBase(`${o.id}Body`, o.name, o.z, o.slot, thicker(shirt.pts, o.thick, o.lowerFrom, o.lowerBy, o.flare), { cut: [`${o.id}Hole`] })
    const hole: ModelShape = { ...shapeBase(`${o.id}Hole`, `${o.name} opening`, o.z + 0.1, o.slot, fromHalf(chest, o.open.map(remapBody)), { loose: undefined }), helper: true }
    const lapel = shapeBase(`${o.id}Lapel`, `${o.name} lapels`, o.z + 0.2, o.slot, fromHalf(chest, collarHalf(o.open.map(remapBody))), { tone: -1 })
    // the sleeve of a jacket is long: the upper arm of the sleeves' long form, the forearm of the base outline of the forearm sleeve
    const upLong = c.objects.find(ob => ob.id === 'sleeves')!.axes![0].options.find(f => f.id === 'long')!.ovr.find(v => v.shape === 'sleeveUpL')!.pts
    const up = shapeBase(`${o.id}SleeveUpL`, `${o.name} sleeve, upper arm (left)`, o.z + 1, o.slot, thicker(upLong, o.thick - 0.2))
    const fore = shapeBase(`${o.id}SleeveForeL`, `${o.name} sleeve, forearm (left)`, o.z + 1, o.slot, thicker(shapeById('sleeveForeL').pts, o.thick - 0.2))
    const ids = [body.id, hole.id, lapel.id, up.id, `${o.id}SleeveUpR`, fore.id, `${o.id}SleeveForeR`]
    extraShapes.push(body, hole, lapel, up, fore)
    pairList.push([up.id, `${o.id}SleeveUpR`, `${o.name} sleeve, upper arm (right)`], [fore.id, `${o.id}SleeveForeR`, `${o.name} sleeve, forearm (right)`])
    objects.push({
      id: o.id, name: o.name, layer: 'clothing', shapes: ids,
      axes: [{
        id: 'style', name: o.name, initial: 'none', roll: 0, options: [
          { id: 'none', name: 'Not worn', ovr: hideAll(ids) },
          { id: 'open', name: 'Open', ovr: [] },
          { id: 'shut', name: 'Buttoned', ovr: [{ shape: hole.id, pts: fromHalf(chest, o.shut.map(remapBody)) }, { shape: lapel.id, pts: fromHalf(chest, collarHalf(o.shut.map(remapBody))) }] },
        ],
      }],
    })
    presets.push({ id: `outfit_${o.id}`, name: o.name, kind: 'Outfit', values: {}, hidden: [], forms: { [`${o.id}.style`]: 'open', 'sleeves.length': 'long' } })
  }

  // ---- a skirt: a waist at the hips and a hem at a length ----
  const skirtForms: ModelForm[] = [{ id: 'none', name: 'Not worn', ovr: [hidden('skirtBody')] }, ...SKIRT_LENGTHS.map(([id, name, hem]) => ({ id, name, ovr: id === 'knee' ? [] : [{ shape: 'skirtBody', pts: fromHalf(torso, skirtHalf(hem).map(remapBody)) }] }))]
  extraShapes.push(shapeBase('skirtBody', 'Skirt', 28.8, TROUSER_SLOT, fromHalf(torso, skirtHalf(248).map(remapBody)), { loose: 'looseBottom' }))
  objects.push({ id: 'skirt', name: 'Skirt', layer: 'clothing', shapes: ['skirtBody'], axes: [{ id: 'length', name: 'Skirt', initial: 'none', roll: 0, options: skirtForms }] })
  presets.push({ id: 'outfit_skirt', name: 'Skirt and top', kind: 'Outfit', values: {}, hidden: ['trousers'], forms: { 'skirt.length': 'knee' } })

  // ---- a dress: a top and a skirt in one, with a neckline of its own ----
  const dressHalf: HP[] = [[100, 76], [114.5, 76], [134.8, 77.7], [149, 87], [146.5, 106.6], [141.3, 130], [140, 146], [142, 172], [150, 208], [156, 246, 's'], [100, 250, 's']]
  const dressNecks = NECKLINES.filter(n => DRESS_NECKS.includes(n.id))
  // (under the arms, so a sleeveless dress shows the arm in front of it)
  extraShapes.push(shapeBase('dressBody', 'Dress', 30.2, CLOTH_SLOT, fromHalf(torso, dressHalf.map(remapBody)), { cut: ['dressHole'] }))
  extraShapes.push({ ...shapeBase('dressHole', 'Dress neckline opening', 30.3, CLOTH_SLOT, fromHalf(chest, NECKLINES[0].hole.map(remapNeck)), { loose: undefined }), helper: true })
  objects.push({
    id: 'dress', name: 'Dress', layer: 'clothing', shapes: ['dressBody', 'dressHole'],
    axes: [{ id: 'style', name: 'Dress', initial: 'none', roll: 0, options: [{ id: 'none', name: 'Not worn', ovr: hideAll(['dressBody', 'dressHole']) }, ...dressNecks.map(n => ({ id: n.id, name: n.name, ovr: n.id === 'crew' ? [] : [{ shape: 'dressHole', pts: fromHalf(chest, n.hole.map(remapNeck)) }] }))] }],
  })
  presets.push({ id: 'outfit_dress', name: 'Dress', kind: 'Outfit', values: {}, hidden: ['shirt', 'trousers'], forms: { 'dress.style': 'crew' } })

  // ---- underwear: worn under the clothes, bare where there are none ----
  extraShapes.push(shapeBase('briefs', 'Briefs', 27.6, 'k_under', fromHalf(torso, ([[100, 166, 's'], [137, 163], [139, 182], [127, 199, 's'], [100, 205, 's']] as HP[]).map(remapBody)), { loose: undefined }))
  extraShapes.push(shapeBase('bandeau', 'Chest band', 27.6, 'k_under', fromHalf(chest, ([[100, 101, 's'], [129, 103], [131, 117], [100, 121, 's']] as HP[]).map(remapBody)), { loose: undefined }))
  objects.push({ id: 'briefs', name: 'Underwear (bottom)', layer: 'clothing', shapes: ['briefs'], under: ['trousers', 'skirt', 'dress', 'coat'] })
  objects.push({ id: 'bandeau', name: 'Underwear (top)', layer: 'clothing', shapes: ['bandeau'], under: ['shirt', 'dress', 'jacket', 'coat'] })
  presets.push({ id: 'outfit_underwear', name: 'Underwear only', kind: 'Outfit', values: {}, hidden: ['shirt', 'sleeves', 'trousers', 'shoes'], forms: {} })
  presets.unshift({ id: 'outfit_everyday', name: 'Everyday', kind: 'Outfit', values: {}, hidden: [], forms: {} })

  // a shirt and its sleeves never show outside a jacket or a coat
  const patched = c.objects.map(o => (o.id === 'shirt' || o.id === 'sleeves' ? { ...o, under: ['jacket', 'coat'] } : o))
  let shapes = [...c.shapes, ...extraShapes]
  // the right-hand sleeves of the outer layers, mirrored from the left ones
  for (const [left, right, name] of pairList) {
    const src = shapes.find(s => s.id === left)!
    shapes = [...shapes, { ...src, id: right, name, pts: mirrored({ ...c, shapes }, src.pts) }]
  }
  return {
    ...c, shapes, objects: [...patched, ...objects], presets: [...(c.presets ?? []), ...presets],
    groups: c.groups.map(g => (g.id === 'torso' ? { ...g, objects: [...g.objects, ...objects.map(o => o.id)] } : g)),
  }
}
