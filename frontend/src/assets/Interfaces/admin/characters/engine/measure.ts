import type { ModelContent, ModelShape } from '../../../../../api/types'
import { viewFor } from './angles'
import { bodyRange } from './bodySliders'
import { joinOf } from './joins'
import { bodied } from './morphs'
import { solve, valueOf, type Solved, type Values } from './rig'

// Measurements (slice 9f-2): the test character's body in cm, as a fashion designer takes it, read off the figure as the sliders draw it. A girth is the width of the
// body at a level from the front and its depth there from the side, taken as an ellipse (Ramanujan's perimeter); a length is between the guide's levels or the joints.
// The scale is the height slider over the figure's height from the crown to the soles. The levels are the guide's (Chin, Chest, Waist, Crotch, Knees, Soles), moved
// with the body; the torso is the body's join set without the arms (the Body set), a leg or an arm is its own side's shapes. Pure.

export interface Measures {
  height: number; neck: number; shoulders: number; bust: number; underbust: number; waist: number; highHip: number; hip: number; hipDepth: number
  arm: number; bicep: number; wrist: number; crotch: number; inseam: number; thigh: number; knee: number; calf: number; ankle: number
}
export type MeasureKey = keyof Measures

// each measurement, in the order the list shows it, and the body slider a typed value moves (none: read only)
export const MEASURES: Array<{ key: MeasureKey; name: string; slider: string | null }> = [
  { key: 'height', name: 'Height', slider: 'body-height' },
  { key: 'neck', name: 'Neck', slider: 'body-neck' },
  { key: 'shoulders', name: 'Shoulders', slider: 'body-shoulders' },
  { key: 'bust', name: 'Bust / chest', slider: 'body-bust' },
  { key: 'underbust', name: 'Underbust', slider: null },
  { key: 'waist', name: 'Natural waist', slider: 'body-waist' },
  { key: 'hip', name: 'Hip', slider: 'body-hips' },
  { key: 'hipDepth', name: 'Hip depth', slider: null },
  { key: 'arm', name: 'Arm length', slider: 'body-arms' },
  { key: 'bicep', name: 'Bicep', slider: null },
  { key: 'wrist', name: 'Wrist', slider: null },
  { key: 'crotch', name: 'Crotch depth', slider: null },
  { key: 'inseam', name: 'Inseam', slider: 'body-legs' },
  { key: 'thigh', name: 'Thigh', slider: null },
  { key: 'knee', name: 'Knee', slider: null },
  { key: 'calf', name: 'Calf', slider: null },
  { key: 'ankle', name: 'Ankle', slider: null },
]

type Poly = Array<[number, number]>
type Span = [number, number]

// Where a level crosses the outlines: the spans inside any of them, joined where they touch.
function spansAt(polys: Poly[], y: number): Span[] {
  const spans: Span[] = []
  for (const poly of polys) {
    const xs: number[] = []
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length]
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) spans.push([xs[k], xs[k + 1]])
  }
  spans.sort((p, q) => p[0] - q[0])
  const out: Span[] = []
  for (const s of spans) {
    const last = out[out.length - 1]
    if (last && s[0] <= last[1] + 0.01) last[1] = Math.max(last[1], s[1])
    else out.push([s[0], s[1]])
  }
  return out
}
// The width of the span at x (or the nearest one), or of the widest when x is null.
function widthAt(polys: Poly[], y: number, x: number | null): number {
  const spans = spansAt(polys, y)
  if (!spans.length) return 0
  if (x === null) return Math.max(...spans.map(s => s[1] - s[0]))
  const hit = spans.find(s => s[0] <= x && x <= s[1]) ?? spans.reduce((b, s) => (Math.abs((s[0] + s[1]) / 2 - x) < Math.abs((b[0] + b[1]) / 2 - x) ? s : b))
  return hit[1] - hit[0]
}
// A body's cross-section is fuller than an ellipse: the torso nearer a rounded rectangle, a limb nearly round.
const TORSO = 1.1, LIMB = 1.05
// The perimeter of an ellipse with these widths (Ramanujan).
export function ellipse(w: number, d: number): number {
  const a = w / 2, b = d / 2
  if (a <= 0 || b <= 0) return 2 * (w + d)
  const h = ((a - b) / (a + b)) ** 2
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
}

const ARM_GROUPS = ['upperarmL', 'forearmL', 'handL']
const LEG_GROUPS = ['thighL', 'shinL', 'footL']

export function measure(c: ModelContent, values: Values): Measures | null {
  const height = bodyRange(c, 'body-height')
  const b = bodied(c, values), g = b.guide
  const level = (name: string) => g?.lines.find(l => l.name === name)?.y
  const chin = level('Chin'), chest = level('Chest'), waist = level('Waist'), crotch = level('Crotch'), knees = level('Knees'), soles = level('Soles')
  if (!height || !g || chin === undefined || chest === undefined || waist === undefined || crotch === undefined || knees === undefined || soles === undefined) return null
  const cm = valueOf(height, values) / (soles - g.top), U = g.head
  const front = solve(c, values, 'front'), side = solve(c, values, viewFor(90))
  const groupOf = new Map<string, string>()
  for (const gr of b.groups) for (const oid of gr.objects) for (const sid of b.objects.find(o => o.id === oid)?.shapes ?? []) groupOf.set(sid, gr.id)
  const polysOf = (s: Solved, pick: (sh: ModelShape) => boolean): Poly[] => b.shapes.filter(pick).map(sh => s.shapes[sh.id]?.poly).filter((p): p is Poly => !!p && p.length > 2)
  const inBody = (sh: ModelShape) => joinOf(b, sh) === 'Body'
  const inGroups = (ids: string[]) => (sh: ModelShape) => ids.includes(groupOf.get(sh.id) ?? '')
  const inBust = (sh: ModelShape) => inBody(sh) || /^(breast|pec)L/.test((sh.mirrorOf ? b.shapes.find(o => o.id === sh.mirrorOf)?.id : sh.id) ?? '')
  const bodyFront = polysOf(front, inBody), bodySide = polysOf(side, inBody)
  const bustFront = polysOf(front, inBust), bustSide = polysOf(side, inBust)
  const neckFront = polysOf(front, inGroups(['neck'])), neckSide = polysOf(side, inGroups(['neck']))
  const armFront = polysOf(front, inGroups(ARM_GROUPS)), armSide = polysOf(side, inGroups(ARM_GROUPS))
  const legFront = polysOf(front, inGroups(LEG_GROUPS)), legSide = polysOf(side, inGroups(LEG_GROUPS))
  const axis = b.axis ?? 100
  const pivot = (id: string): [number, number] | null => b.groups.find(x => x.id === id)?.pivot ?? null
  const shoulder = pivot('upperarmL'), elbow = pivot('forearmL'), wrist = pivot('handL'), hipJoint = pivot('thighL')
  const legX = hipJoint ? hipJoint[0] : axis + U * 0.4
  const girth = (pf: Poly[], ps: Poly[], y: number, x: number | null, k: number) => ellipse(widthAt(pf, y, x), widthAt(ps, y, null)) * cm * k
  const torso = (y: number) => girth(bodyFront, bodySide, y, axis, TORSO)
  // the fullest hip between the waist and the crotch, and the fullest calf below the knee
  const steps = (y0: number, y1: number, n = 16) => Array.from({ length: n + 1 }, (_, k) => y0 + ((y1 - y0) * k) / n)
  const hipY = steps(waist + 0.2 * U, crotch - 0.1 * U).reduce((best, y) => (torso(y) > torso(best) ? y : best), crotch - 0.1 * U)
  const legGirth = (y: number) => girth(legFront, legSide, y, legX, LIMB)
  const calfY = steps(knees + 0.3 * U, soles - 1.2 * U, 10).reduce((best, y) => (legGirth(y) > legGirth(best) ? y : best), knees + 0.6 * U)
  const dist = (p: [number, number] | null, q: [number, number] | null) => (p && q ? Math.hypot(p[0] - q[0], p[1] - q[1]) * cm : 0)
  const armAt = (t: number, from: [number, number] | null, to: [number, number] | null) => {
    if (!from || !to) return 0
    const x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t
    return ellipse(widthAt(armFront, y, x), widthAt(armSide, y, null)) * cm * LIMB
  }
  const r = (v: number) => Math.round(v * 10) / 10
  return {
    height: r(valueOf(height, values)),
    neck: r(girth(neckFront, neckSide, chin + 0.25 * U, axis, LIMB)),
    // from shoulder point to shoulder point: the joints' distance and the shoulder points' reach beyond them
    shoulders: r(shoulder ? (Math.abs(shoulder[0] - (2 * axis - shoulder[0])) + 0.2 * U) * cm : 0),
    bust: r(girth(bustFront, bustSide, chest, axis, TORSO)),
    underbust: r(torso(chest + 0.25 * U)),
    waist: r(torso(waist)),
    highHip: r(torso((waist + hipY) / 2)),
    hip: r(torso(hipY)),
    hipDepth: r((hipY - waist) * cm),
    arm: r(dist(shoulder, elbow) + dist(elbow, wrist)),
    bicep: r(armAt(0.45, shoulder, elbow)),
    wrist: r(armAt(0.92, elbow, wrist)),
    crotch: r((crotch - waist) * cm),
    inseam: r((soles - crotch) * cm),
    thigh: r(legGirth(crotch + 0.15 * U)),
    knee: r(legGirth(knees)),
    calf: r(legGirth(calfY)),
    ankle: r(legGirth(soles - 0.4 * U)),
  }
}

// The shape class (FFIT, Lee, Istook and Nam 2007): threshold rules on the bust, waist, high hip and hip girths in inches, tested in order.
export type ShapeClass = 'hourglass' | 'bottom hourglass' | 'top hourglass' | 'spoon' | 'triangle' | 'inverted triangle' | 'rectangle' | 'oval'
export function shapeClass(m: Pick<Measures, 'bust' | 'waist' | 'highHip' | 'hip'>): ShapeClass {
  const B = m.bust / 2.54, W = m.waist / 2.54, HH = m.highHip / 2.54, H = m.hip / 2.54
  if (B - H <= 1 && H - B < 3.6 && (B - W >= 9 || H - W >= 10)) return 'hourglass'
  if (H - B >= 3.6 && H - B < 10 && H - W >= 9 && HH / W < 1.193) return 'bottom hourglass'
  if (B - H > 1 && B - H < 10 && B - W >= 9) return 'top hourglass'
  if (H - B > 2 && H - W >= 7 && HH / W >= 1.193) return 'spoon'
  if (H - B >= 3.6 && H - W < 9) return 'triangle'
  if (B - H >= 3.6 && B - W < 9) return 'inverted triangle'
  if (H - W < 0) return 'oval'
  return 'rectangle'
}

// The value of a body slider that brings a measurement to the one typed (as near as the span allows): the measurement is taken to grow or shrink with the slider all
// the way, and halved down to a tenth of a step.
export function sliderFor(c: ModelContent, values: Values, key: MeasureKey, target: number, span: [number, number], slider: string): number | null {
  const r = c.ranges.find(x => x.id === slider)
  if (!r) return null
  if (key === 'height') return Math.round(Math.min(span[1], Math.max(span[0], target)))
  const at = (v: number) => measure(c, { ...values, [slider]: v })?.[key] ?? 0
  let lo = span[0], hi = span[1]
  const mLo = at(lo), mHi = at(hi)
  if (!(Number.isFinite(mLo) && Number.isFinite(mHi)) || mLo === mHi) return null
  const rising = mHi > mLo
  if (rising ? target <= mLo : target >= mLo) return lo
  if (rising ? target >= mHi : target <= mHi) return hi
  for (let k = 0; k < 12 && hi - lo > 0.1; k++) {
    const mid = (lo + hi) / 2, m = at(mid)
    if ((m < target) === rising) lo = mid
    else hi = mid
  }
  return Math.round(((lo + hi) / 2) * 10) / 10
}
