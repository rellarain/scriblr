// The cloth of the seed model's clothes (phase O6): one-light shading, folds at the bends, and hems that hang. Light comes from the upper left, as on the skin and the
// face: each garment's body has a shadow down its far side (the picture's right), each sleeve and trouser leg one down its inside (as the arms and legs under them do).
// Folds are thin tapered ribbons (the engine's taper tool, taperOutline) in a darker tone of the garment: two at each elbow, knee and side of the waist, one for each way
// the joint bends, that fade in as it bends (opBy on the slider), and a few that hang down a skirt, a dress and a coat. The skirt, the dress and the coat drape: the
// points below the hips carry a weight that rises to the hem, and the garment's drape turns them back toward the way they were drawn when the hips tilt. Every point
// follows the skin under it (as the garments' own points do), so the shading and the folds go where the cloth goes.
import type { ModelContent, ModelFade, ModelForm, ModelPoint, ModelShape } from '../../src/api/types'
import { taperOutline, type SpinePoint, type TaperSpec } from '../../src/assets/Interfaces/admin/characters/engine/taper'
import { anchorsOfShapes, followNearest, type Anchor } from './body'
import { mirrored } from './clothes'

type XY = [number, number]
const r2 = (v: number): number => Math.round(v * 100) / 100

// ---- the shapes ----

interface Made { shape: ModelShape; object: string; right?: { id: string; name: string; opBy?: ModelFade | null } }
const bound = (anchors: Anchor[], pts: Array<XY | ModelPoint>): ModelPoint[] => pts.map(p => (Array.isArray(p) ? followNearest(anchors, p[0], p[1], 'c') : followNearest(anchors, p.x, p.y, p.m)))
const base = (id: string, name: string, z: number, slot: string, pts: ModelPoint[], over: Partial<ModelShape>): ModelShape =>
  ({ id, name, closed: true, z, op: 1, view: 'both', pts, half: 0, template: null, slot, gray: null, ...over })

// A shadow kept inside the garment it is in (a shading shape: the garment's colour a little darker, clipped to the shapes of its object).
const band = (id: string, name: string, z: number, slot: string, anchors: Anchor[], pts: XY[], t = 0.1): ModelShape =>
  base(id, name, z, slot, bound(anchors, pts), { shade: { kind: 'shadow', t } })
// A fold: a thin ribbon along a spine, pointed at both ends, a darker tone of the garment's colour (a fold of one garment lies inside its outline, so it is not clipped).
const FOLD: TaperSpec = { w0: 0.3, wm: 1.5, w1: 0.3, side: 0, pointed: true }
function fold(id: string, name: string, z: number, slot: string, anchors: Anchor[], spine: SpinePoint[], over: Partial<ModelShape> = {}, spec: Partial<TaperSpec> = {}, t = 0.18): ModelShape {
  const pts = taperOutline(spine, { ...FOLD, ...spec })
  if (!pts) throw new Error(`the fold ${id} has no spine`)
  return base(id, name, z, slot, bound(anchors, pts), { derive: { kind: 'shadow', t }, ...over })
}
// Shown as the slider bends one way: from nothing at `from` to fully at `to` (negative ends for the other way).
const bends = (slider: string, from: number, to: number): ModelFade => ({ slider, hidden: from, shown: to })
const other = (f: ModelFade | null | undefined): ModelFade | null => (f ? { ...f, slider: `${f.slider}R` } : null)

// The elbow folds of a sleeve (left arm): on the outside of the elbow when the forearm swings out (a positive bend), on the inside when it comes in across the body.
function elbowFolds(prefix: string, label: string, z: number, slot: string, arm: Anchor[], object: string, dx = 0): Made[] {
  const outer: SpinePoint[] = [[151.6 + dx, 139.5], [153.4 + dx, 144.5], [151.8 + dx, 149.5]], inner: SpinePoint[] = [[139.8 - dx, 140], [138.2 - dx, 145], [140 - dx, 150]]
  const make = (id: string, name: string, spine: SpinePoint[], opBy: ModelFade): Made => ({ shape: fold(`${id}L`, `${name} (left)`, z, slot, arm, spine, { opBy }), object, right: { id: `${id}R`, name: `${name} (right)`, opBy: other(opBy) } })
  return [
    make(`${prefix}ElbowOut`, `${label}: fold at the elbow, outside`, outer, bends('elbow', 10, 70)),
    make(`${prefix}ElbowIn`, `${label}: fold at the elbow, inside`, inner, bends('elbow', -10, -70)),
  ]
}
// The shadow down the inside of a sleeve (left arm), on the upper arm and on the forearm, a little inside the sleeve's own edge.
function sleeveShades(prefix: string, label: string, z: number, slot: string, arm: Anchor[], object: string, inset: number): Made[] {
  const x = (v: number) => r2(v - inset)
  return [
    { shape: band(`${prefix}ShadeUpL`, `${label}: shadow inside the upper arm (left)`, z, slot, arm, [[x(135.2), 92], [x(139), 94], [x(140.2), 120], [x(140), 145], [x(135.6), 145], [x(135), 120]]), object, right: { id: `${prefix}ShadeUpR`, name: `${label}: shadow inside the upper arm (right)` } },
    { shape: band(`${prefix}ShadeForeL`, `${label}: shadow inside the forearm (left)`, z, slot, arm, [[x(137.6), 147], [x(141), 147], [x(141.6), 168], [x(144), 193], [x(141.6), 194], [x(139.8), 183], [x(138.2), 168]]), object, right: { id: `${prefix}ShadeForeR`, name: `${label}: shadow inside the forearm (right)` } },
  ]
}
// The folds at the sides of the waist (both sides at once, the figure's own: the side the trunk bends toward closes).
function waistFolds(prefix: string, label: string, z: number, slot: string, trunk: Anchor[], object: string, out = 0): Made[] {
  const left: SpinePoint[] = [[67.5 - out, 135], [72 - out, 140.5], [74.5 - out, 147]], right: SpinePoint[] = left.map(([x, y]) => [200 - x, y] as SpinePoint)
  return [
    // a positive Waist bend leans the chest to the picture's left: the waist closes on that side
    { shape: fold(`${prefix}WaistR`, `${label}: fold at the waist (right)`, z, slot, trunk, left, { opBy: bends('waistBend', 4, 22) }), object },
    { shape: fold(`${prefix}WaistL`, `${label}: fold at the waist (left)`, z, slot, trunk, right, { opBy: bends('waistBend', -4, -22) }), object },
  ]
}

// ---- the hems that hang ----

// The weight of a point at height y: none above the hips, rising to all of it at the hem, in quarters (the steps the Weights tool gives).
function weightAt(y: number, top: number, hem: number): number {
  const t = Math.min(1, Math.max(0, (y - top) / Math.max(1, hem - top)))
  return Math.round(t * 4) / 4
}
const weigh = (pts: ModelPoint[], top: number): ModelPoint[] => {
  const hem = Math.max(...pts.map(p => p.y))
  return pts.map(p => { const w = weightAt(p.y, top, hem); return w > 0 ? { ...p, w } : p })
}
// A garment drapes: every outline of its object (and of each of its forms) carries weights below `top`, and the object its drape.
function drape(c: ModelContent, objectId: string, top: number, amount = 100): ModelContent {
  const o = c.objects.find(x => x.id === objectId)
  if (!o) throw new Error(`there is no garment ${objectId}`)
  const mine = new Set(o.shapes)
  return {
    ...c,
    shapes: c.shapes.map(s => (mine.has(s.id) && !s.helper ? { ...s, pts: weigh(s.pts, top) } : s)),
    objects: c.objects.map(x => (x.id !== objectId ? x : {
      ...x, drape: amount,
      axes: x.axes?.map(a => ({ ...a, options: a.options.map((f): ModelForm => ({ ...f, ovr: f.ovr.map(v => (v.pts.length > 0 && !c.shapes.find(s => s.id === v.shape)?.helper ? { ...v, pts: weigh(v.pts, top) } : v)) })) })),
    })),
  }
}

// ---- the whole of it ----

export function clothShading(c: ModelContent): ModelContent {
  const trunk = anchorsOfShapes(c.shapes, ['chest', 'pelvis']), pelvis = anchorsOfShapes(c.shapes, ['pelvis']), arm = anchorsOfShapes(c.shapes, ['uarmL']), leg = anchorsOfShapes(c.shapes, ['legL'])
  const made: Made[] = [
    // the shirt and its sleeves (the sleeves' folds only show with the long sleeve: see below)
    { shape: band('shirtShade', 'Shirt: shadow down the far side', 30.05, 'k_cloth', trunk, [[134, 97], [146, 92], [146, 190], [133, 191], [130, 176], [127.5, 158], [126.5, 146], [128, 130], [131.5, 113]]), object: 'shirt' },
    ...waistFolds('shirt', 'Shirt', 30.07, 'k_cloth', trunk, 'shirt'),
    ...sleeveShades('sleeve', 'Sleeve', 32.05, 'k_cloth', arm, 'sleeves', 0),
    ...elbowFolds('sleeve', 'Sleeve', 32.07, 'k_cloth', arm, 'sleeves'),
    // the trousers: the far side of the hips, the inside of each leg, and the folds at the knee
    { shape: band('trouserShade', 'Trousers: shadow down the far side of the hips', 28.22, 'k_trouser', pelvis, [[134.5, 151], [142, 151], [143, 185], [139.5, 197], [133, 196], [134.5, 178], [132.5, 160]]), object: 'trousers' },
    { shape: band('trouserShadeL', 'Trousers: shadow inside the leg (left)', 28.22, 'k_trouser', leg, [[99.2, 202], [104, 202], [105.5, 250], [105, 300], [106, 340], [106.5, 369], [102.6, 369], [101, 330], [100, 290], [99.4, 240]]), object: 'trousers', right: { id: 'trouserShadeR', name: 'Trousers: shadow inside the leg (right)' } },
    { shape: fold('trouserKneeOutL', 'Trousers: fold at the knee, outside (left)', 28.23, 'k_trouser', leg, [[124.6, 278], [126.6, 285], [124.8, 292]], { opBy: bends('knee', 10, 70) }), object: 'trousers', right: { id: 'trouserKneeOutR', name: 'Trousers: fold at the knee, outside (right)', opBy: bends('kneeR', 10, 70) } },
    { shape: fold('trouserKneeInL', 'Trousers: fold at the knee, inside (left)', 28.23, 'k_trouser', leg, [[102.4, 278], [100.8, 285], [102.4, 292]], { opBy: bends('knee', -10, -70) }), object: 'trousers', right: { id: 'trouserKneeInR', name: 'Trousers: fold at the knee, inside (right)', opBy: bends('kneeR', -10, -70) } },
    // the skirt: the far side, and two folds that hang from the hips (kept inside it whatever its length)
    { shape: band('skirtShade', 'Skirt: shadow down the far side', 28.82, 'k_trouser', trunk, [[133, 158], [160, 158], [178, 362], [154, 364], [143, 300], [136, 230], [131.5, 175]]), object: 'skirt' },
    { shape: band('skirtFold1', 'Skirt: fold', 28.83, 'k_trouser', trunk, taperXY([[117, 174], [120, 230], [123, 300], [125, 362]], { w0: 0.4, wm: 2, w1: 0.8, pointed: false }), 0.12), object: 'skirt' },
    { shape: band('skirtFold2', 'Skirt: fold', 28.83, 'k_trouser', trunk, taperXY([[85, 176], [81, 236], [77, 300], [74, 362]], { w0: 0.4, wm: 1.6, w1: 0.7, pointed: false }), 0.1), object: 'skirt' },
    // the dress: the far side, two folds down its skirt, and the folds at the waist
    { shape: band('dressShade', 'Dress: shadow down the far side', 30.25, 'k_cloth', trunk, [[134, 92], [150, 88], [150, 168], [159, 205], [161, 263], [148, 266], [145, 212], [135, 172], [131.5, 145], [132, 120]]), object: 'dress' },
    { shape: band('dressFold1', 'Dress: fold', 30.26, 'k_cloth', trunk, taperXY([[119, 176], [123, 216], [127, 266]], { w0: 0.4, wm: 1.8, w1: 0.8, pointed: false }), 0.12), object: 'dress' },
    { shape: band('dressFold2', 'Dress: fold', 30.26, 'k_cloth', trunk, taperXY([[84, 178], [80, 220], [76, 266]], { w0: 0.4, wm: 1.5, w1: 0.7, pointed: false }), 0.1), object: 'dress' },
    ...waistFolds('dress', 'Dress', 30.27, 'k_cloth', trunk, 'dress', -1.5),
    // the jacket: the far side of its body, the inside of its sleeves, the folds at the elbow and at the waist
    { shape: band('jacketShade', 'Jacket: shadow down the far side', 34.05, 'k_outer', trunk, [[137, 98], [152, 92], [152, 206], [141, 207], [138.5, 182], [134, 156], [132.5, 146], [134, 128]]), object: 'jacket' },
    ...sleeveShades('jacketSleeve', 'Jacket sleeve', 35.05, 'k_outer', arm, 'jacket', 2.2),
    ...elbowFolds('jacketSleeve', 'Jacket sleeve', 35.07, 'k_outer', arm, 'jacket', 2.4),
    ...waistFolds('jacket', 'Jacket', 34.07, 'k_outer', trunk, 'jacket', 2.6),
    // the coat: the far side of its body, two folds down its skirts, the inside of its sleeves and the folds at the elbow
    { shape: band('coatShade', 'Coat: shadow down the far side', 36.05, 'k_outer', trunk, [[138, 98], [153, 92], [157, 250], [151, 264], [142, 263], [140.5, 222], [134.5, 156], [133, 146], [134.5, 128]]), object: 'coat' },
    { shape: band('coatFold1', 'Coat: fold', 36.06, 'k_outer', trunk, taperXY([[119, 176], [123, 220], [128, 263]], { w0: 0.4, wm: 1.8, w1: 0.9, pointed: false }), 0.12), object: 'coat' },
    { shape: band('coatFold2', 'Coat: fold', 36.06, 'k_outer', trunk, taperXY([[83, 178], [78, 222], [73, 263]], { w0: 0.4, wm: 1.6, w1: 0.8, pointed: false }), 0.1), object: 'coat' },
    ...sleeveShades('coatSleeve', 'Coat sleeve', 37.05, 'k_outer', arm, 'coat', 2.6),
    ...elbowFolds('coatSleeve', 'Coat sleeve', 37.07, 'k_outer', arm, 'coat', 2.9),
  ]
  // the right-hand pieces of the limbs: the left one's mirror image, following the twin of the skin the left one follows, fading in with the right-hand slider
  let shapes = [...c.shapes, ...made.map(m => m.shape)]
  const extra = new Map<string, string[]>()
  const add = (object: string, id: string) => extra.set(object, [...(extra.get(object) ?? []), id])
  for (const m of made) {
    add(m.object, m.shape.id)
    if (!m.right) continue
    const right: ModelShape = { ...m.shape, id: m.right.id, name: m.right.name, pts: mirrored({ ...c, shapes }, m.shape.pts), ...(m.right.opBy !== undefined ? { opBy: m.right.opBy } : {}) }
    shapes = [...shapes, right]
    add(m.object, right.id)
  }
  // the folds of a sleeve's elbow show only on a long sleeve, and those of the outer layers only while they are worn
  const sleeveFolds = (extra.get('sleeves') ?? []).filter(id => id.includes('Elbow'))
  const hide = (ids: string[]) => ids.map(shape => ({ shape, pts: [] as ModelPoint[] }))
  let next: ModelContent = {
    ...c, shapes,
    objects: c.objects.map(o => {
      const ids = extra.get(o.id)
      if (!ids) return o
      return {
        ...o, shapes: [...o.shapes, ...ids],
        axes: o.axes?.map(a => ({
          ...a,
          options: a.options.map((f): ModelForm => {
            if (o.id === 'sleeves' && (f.id === 'none' || f.id === 'short')) return { ...f, ovr: [...f.ovr, ...hide(sleeveFolds)] }
            if ((o.id === 'jacket' || o.id === 'coat' || o.id === 'skirt' || o.id === 'dress') && f.id === 'none') return { ...f, ovr: [...f.ovr, ...hide(ids)] }
            return f
          }),
        })),
      }
    }),
  }
  // the skirt, the dress and the coat drape from the hips
  next = drape(next, 'skirt', 172)
  next = drape(next, 'dress', 172)
  next = drape(next, 'coat', 170)
  return next
}

// A ribbon's outline as plain points (for a fold that is a shading shape).
function taperXY(spine: SpinePoint[], spec: Partial<TaperSpec>): XY[] {
  const pts = taperOutline(spine, { ...FOLD, ...spec })
  if (!pts) throw new Error('a fold has no spine')
  return pts.map(p => [p.x, p.y])
}
