import type { ModelContent, ModelFallSide, ModelRange, ModelSwatch } from '../../../../../api/types'
import { FALL_SIDES } from '../modelContent'
import { paletteOf, randomPalette, rollChoices, slotsOf, type SlotChoices } from './colour'
import { axesFor, classKey, classesOf, formKey, membersOf, presetsOf } from './forms'
import type { Box } from './geometry'
import { applyPreset, type TestState } from './presets'

// The preview strip: the thing being designed shown several times at random sizes, tilts and backgrounds, so the admin sees how it holds up
// before publishing. 'rand' stays inside a sensible range; 'min' and 'max' are the stress previews (every value at the end of its range).
export type PreviewMode = 'rand' | 'min' | 'max'
export type Rng = () => number

// A small seeded generator (mulberry32), so a preview can be repeated and tested.
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface PreviewSpec {
  // How much of the cell the thing fills (1 = fits the cell with a margin).
  scale: number
  // Degrees.
  tilt: number
  skew: number
  flip: boolean
  // Which background of the strip's set it sits on.
  bg: number
  // Where each slider of the model stands in this preview (empty when the model has none).
  values: Record<string, number>
  // The form each axis shows ("objectId.axisId" to form id) and the things switched off (empty when the model has none).
  forms: Record<string, string>
  hidden: string[]
  // The side hanging things fall to in this preview (down when absent), and the order a style draws an object's shapes in (phase D3a).
  fall?: ModelFallSide
  order?: Record<string, string[]>
  // the styles applied that set nothing of the look (they only hold parts of a colour)
  on?: string[]
  // The colouring of this preview: its own palette and the colour chosen for each slot (empty when the model has no slots: the figure is gray).
  palette: ModelSwatch[]
  choices: SlotChoices
}

export const PREVIEW_RANGES = { scale: [0.35, 1.4], tilt: [-28, 28], skew: [-14, 14] } as const
export const PREVIEW_BACKGROUNDS = 4

// The values of the sliders for one preview: the stress previews put every slider at the end of its range; a random one draws each from the span the slider
// is meant to stay in (`rand`, else the span a writer may choose within, else its whole range), mostly near the middle of it.
function sliderValues(ranges: ModelRange[], mode: PreviewMode, rng: Rng): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of ranges) {
    if (mode === 'min') out[r.id] = r.min
    else if (mode === 'max') out[r.id] = r.max
    else {
      const [lo, hi] = r.rand ?? r.limit ?? [r.min, r.max]
      out[r.id] = Math.round((lo + (hi - lo) * ((rng() + rng() + rng()) / 3)) * 100) / 100
    }
  }
  return out
}

// The forms and switched-off things for one preview: the stress previews take the first or the last form of every axis; a random one draws a form for each
// axis and, 60% of the time per kind, one random preset of the kind (which sets sliders and switches things off over the drawn values).
// What the looks of a preview come to: besides the spec's own fields, the default colours a variant picked (they replace the colours drawn for those slots).
type Looks = Pick<PreviewSpec, 'values' | 'forms' | 'hidden' | 'fall' | 'order' | 'on'> & { colours?: SlotChoices }
function looks(c: ModelContent | undefined, mode: PreviewMode, rng: Rng, values: Record<string, number>): Looks {
  if (!c) return { values, forms: {}, hidden: [] }
  const forms: Record<string, string> = {}
  const pickOf = (n: number) => (mode === 'min' ? 0 : mode === 'max' ? n - 1 : Math.min(n - 1, Math.floor(rng() * n)))
  for (const o of c.objects) {
    for (const a of axesFor(c, o)) if (a.options.length > 0) forms[formKey(o.id, a.id)] = a.options[pickOf(a.options.length)].id
  }
  // the member of a family that is shown
  for (const k of classesOf(c)) {
    const members = membersOf(c, k.id)
    if (k.exclusive && members.length > 0) forms[classKey(k.id)] = members[pickOf(members.length)].id
  }
  let state: TestState = { values, forms, hidden: [], fall: 'down' }
  if (mode === 'rand') {
    // one random preset of each slot (a kind within its scope), 60% of the time
    const slots = new Map<string, ReturnType<typeof presetsOf>>()
    for (const p of presetsOf(c)) { const key = `${p.kind.trim().toLowerCase()}|${p.scope ?? ''}`; slots.set(key, [...(slots.get(key) ?? []), p]) }
    for (const list of slots.values()) if (rng() < 0.6) state = applyPreset(c, state, list[Math.min(list.length - 1, Math.floor(rng() * list.length))])
  }
  // a model with something that hangs draws a side too (a stress preview takes the first side or the last; nothing is drawn for a model with nothing that hangs)
  if (c.ranges.some(r => r.drives.some(d => d.kind === 'fall'))) state = { ...state, fall: mode === 'min' ? 'down' : mode === 'max' ? 'behind' : FALL_SIDES[Math.min(FALL_SIDES.length - 1, Math.floor(rng() * FALL_SIDES.length))] }
  return state
}

// A preview's spec from its size, its looks and its colouring.
function compose(shape: Pick<PreviewSpec, 'scale' | 'tilt' | 'skew' | 'flip' | 'bg'>, l: Looks, col: Pick<PreviewSpec, 'palette' | 'choices'>): PreviewSpec {
  const { colours, ...rest } = l
  return { ...shape, ...rest, ...col, choices: { ...col.choices, ...(colours ?? {}) } }
}

// The test state a preview stands for (what styles are asked whether they are on).
export const specState = (spec: PreviewSpec): TestState => ({ values: spec.values, forms: spec.forms, hidden: spec.hidden, fall: spec.fall ?? 'down', colours: spec.choices, order: spec.order, on: spec.on })

// The colouring of one preview, from a stream of its own so the sizes, tilts and sliders of a seed stay as they were: a random one has a palette of its own and a
// random default colour or swatch for every slot; the stress previews use the model's palette (else a random one) with brightness and opacity at the smallest or
// the largest of each range.
function colouring(c: ModelContent | undefined, mode: PreviewMode, rng: Rng): Pick<PreviewSpec, 'palette' | 'choices'> {
  if (!c || slotsOf(c).length === 0) return { palette: [], choices: {} }
  const palette = mode === 'rand' || paletteOf(c).length === 0 ? randomPalette(rng) : paletteOf(c)
  return { palette, choices: rollChoices(c, rng, palette, {}, { extreme: mode === 'min' ? 'min' : mode === 'max' ? 'max' : null }) }
}

export function previewSpecs(seed: number, mode: PreviewMode, count = 6, ranges: ModelRange[] = [], content?: ModelContent): PreviewSpec[] {
  const rng = seededRng(seed), crng = seededRng((seed ^ 0x9e3779b9) >>> 0), out: PreviewSpec[] = []
  const [s0, s1] = PREVIEW_RANGES.scale, [t0, t1] = PREVIEW_RANGES.tilt, [k0, k1] = PREVIEW_RANGES.skew
  for (let i = 0; i < count; i++) {
    const bg = i % PREVIEW_BACKGROUNDS
    if (mode === 'min') out.push(compose({ scale: s0, tilt: i % 2 ? t1 : t0, skew: i % 2 ? k1 : k0, flip: i % 3 === 0, bg }, looks(content, mode, rng, sliderValues(ranges, mode, rng)), colouring(content, mode, crng)))
    else if (mode === 'max') out.push(compose({ scale: s1, tilt: i % 2 ? t0 : t1, skew: i % 2 ? k0 : k1, flip: i % 3 === 1, bg }, looks(content, mode, rng, sliderValues(ranges, mode, rng)), colouring(content, mode, crng)))
    else {
      // three draws averaged: most previews are ordinary, a few are extreme
      const pick = (lo: number, hi: number) => lo + (hi - lo) * ((rng() + rng() + rng()) / 3)
      const scale = Math.round(pick(0.5, 1.15) * 100) / 100, tilt = Math.round(pick(t0, t1) * 10) / 10, skew = Math.round(pick(k0, k1) * 10) / 10, flip = rng() < 0.25
      out.push(compose({ scale, tilt, skew, flip, bg }, looks(content, mode, rng, sliderValues(ranges, mode, rng)), colouring(content, mode, crng)))
    }
  }
  return out
}

// The SVG transform that puts a box into a 100 x 100 cell: scaled to fit (with a margin), then skewed, tilted and flipped about the cell's middle.
export function previewTransform(box: Box, spec: PreviewSpec): string {
  const fit = 78 / Math.max(box.w, box.h, 1e-6), k = fit * spec.scale
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2
  const r = (v: number) => Math.round(v * 1000) / 1000
  return `translate(50 50) rotate(${r(spec.tilt)}) skewX(${r(spec.skew)}) scale(${r(spec.flip ? -k : k)} ${r(k)}) translate(${r(-cx)} ${r(-cy)})`
}
