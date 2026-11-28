import type { ModelContent, ModelPreset, ModelRange } from '../../../../../api/types'
import { keyShares } from './morphs'
import { valueOf, type Values } from './rig'

// The body sliders (slice 9f): the sliders a model started from a body carries (role `body-…`), in the groups the Body section shows them in, the bodies it blends
// (presets of kind `body`), and how each value reads (a height in cm and heads, the fat as a share of the body for its sex, an age in years, where the fat sits).
// What the sliders are set to is the test character's (never saved). Pure.

export const BODY_GROUPS: Array<{ id: string; name: string; roles: string[]; note: string }> = [
  { id: 'frame', name: 'Frame · the skeleton', roles: ['body-height', 'body-fem', 'body-legs'],
    note: 'The head grows more slowly than the body, and height goes mostly into the legs. A feminine frame has narrower shoulders (2 to 1⅔ heads) and a wider pelvis; the width at the hips stays nearly the same.' },
  { id: 'soft', name: 'Soft tissue', roles: ['body-fat', 'body-muscle', 'body-sits', 'body-bust'],
    note: 'Fat sits anywhere from the hips and thighs to the waist, as the body carries it unless moved; muscle shows as fat falls.' },
  { id: 'age', name: 'Age', roles: ['body-age'],
    note: 'From 50 fat moves to the waist; from 30 muscle falls 3 to 5% a decade; the elderly lose 3 to 8 cm of height.' },
  { id: 'regions', name: 'By region', roles: ['body-shoulders', 'body-waist', 'body-hips', 'body-neck', 'body-head', 'body-arms'], note: '' },
]

export const isBodyRange = (r: ModelRange): boolean => !!r.role && r.role.startsWith('body-')
export const bodyRangesOf = (c: ModelContent): ModelRange[] => c.ranges.filter(isBodyRange)
export const hasBody = (c: ModelContent): boolean => c.ranges.some(isBodyRange)
export const bodyRange = (c: ModelContent, role: string): ModelRange | undefined => c.ranges.find(r => r.role === role)
export const bodiesOf = (c: ModelContent): ModelPreset[] => (c.presets ?? []).filter(p => p.kind === 'body')

// The span a slider moves in: its band (what writers may use, and what the measured people cover) unless the ranges are unlocked.
export function spanOf(r: ModelRange, unlocked: boolean): [number, number] {
  if (unlocked || !r.limit) return [r.min, r.max]
  return [Math.max(r.min, Math.min(r.limit[0], r.limit[1])), Math.min(r.max, Math.max(r.limit[0], r.limit[1]))]
}
// The body sliders held to their bands (when the ranges are locked again): only the values that change.
export function heldToBands(c: ModelContent, values: Values): Values {
  const out: Values = {}
  for (const r of bodyRangesOf(c)) {
    const v = valueOf(r, values), [lo, hi] = spanOf(r, false), held = Math.min(hi, Math.max(lo, v))
    if (held !== v) out[r.id] = held
  }
  return out
}

// ---- blending bodies ----

// The weights of up to three bodies at a place in the blend (a point on a segment for two, inside a triangle for three), each 0..1, adding up to 1.
export type Corner = [number, number]
export function cornersOf(n: number, w: number, h: number, pad: number): Corner[] {
  if (n <= 1) return [[w / 2, h / 2]]
  if (n === 2) return [[pad, h / 2], [w - pad, h / 2]]
  return [[w / 2, pad], [pad, h - pad], [w - pad, h - pad]]
}
export function weightsAt(p: Corner, corners: Corner[]): number[] {
  if (corners.length <= 1) return [1]
  if (corners.length === 2) {
    const [a, b] = corners, dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy || 1
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len))
    return [1 - t, t]
  }
  const [a, b, c] = corners
  const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]) || 1
  let wa = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / det
  let wb = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / det
  // outside the triangle: held to its edge
  wa = Math.max(0, wa); wb = Math.max(0, wb)
  let wc = Math.max(0, 1 - wa - wb)
  const sum = wa + wb + wc || 1
  wa /= sum; wb /= sum; wc /= sum
  return [wa, wb, wc]
}
export function pointOf(weights: number[], corners: Corner[]): Corner {
  let x = 0, y = 0
  corners.forEach((c, i) => { x += c[0] * (weights[i] ?? 0); y += c[1] * (weights[i] ?? 0) })
  return [x, y]
}
// The sliders the chosen bodies come to: each slider any of them sets, the weighted mean of what each sets it to (its resting value where one does not).
export function blendBodies(c: ModelContent, picks: Array<{ id: string; w: number }>): Values {
  const bodies = bodiesOf(c), chosen = picks.map(p => ({ body: bodies.find(b => b.id === p.id), w: p.w })).filter(x => x.body)
  const ids = new Set(chosen.flatMap(x => Object.keys(x.body!.values)))
  const out: Values = {}
  for (const id of ids) {
    const r = c.ranges.find(x => x.id === id)
    if (!r) continue
    const sum = chosen.reduce((a, x) => a + x.w, 0) || 1
    const v = chosen.reduce((a, x) => a + (x.body!.values[id] ?? r.rest) * x.w, 0) / sum
    out[id] = Math.round(Math.min(r.max, Math.max(r.min, v)) * 10) / 10
  }
  return out
}

// ---- how a value reads ----

// The average body fat for the sex (men 18%, women 28%, between them as the frame turns), and the body fat the slider comes to.
export function fatPercent(c: ModelContent, values: Values): number {
  const fat = bodyRange(c, 'body-fat'), fem = bodyRange(c, 'body-fem')
  const f = fem ? valueOf(fem, values) / 100 : 0
  return Math.round(18 + 10 * f + (fat ? valueOf(fat, values) : 0))
}
// How many heads tall the figure stands now: the guide's heads at rest and a head for each full height key.
export function headsNow(c: ModelContent, values: Values): number | null {
  const g = c.guide, soles = g?.lines.find(l => l.name === 'Soles')
  if (!g || !soles || !(g.head > 0)) return null
  return Math.round(((soles.y - g.top) / g.head + (keyShares(c, values).get('height') ?? 0)) * 10) / 10
}
export function valueText(c: ModelContent, r: ModelRange, values: Values): string {
  const v = valueOf(r, values), whole = Math.round(v)
  switch (r.role) {
    case 'body-height': return `${whole} cm`
    case 'body-age': return `${whole} yrs`
    case 'body-fat': return `${fatPercent(c, values)}%`
    case 'body-sits': return v <= -20 ? 'waist' : v >= 20 ? 'hips' : 'even'
    case 'body-legs': case 'body-shoulders': case 'body-waist': case 'body-hips': case 'body-neck': case 'body-head': case 'body-arms':
      return whole === 0 ? '±0' : whole > 0 ? `+${whole}` : `−${-whole}`
    default: return String(whole)
  }
}
