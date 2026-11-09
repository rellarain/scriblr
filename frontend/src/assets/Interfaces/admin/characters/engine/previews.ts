import type { ModelRange } from '../../../../../api/types'
import type { Box } from './geometry'

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
}

export const PREVIEW_RANGES = { scale: [0.35, 1.4], tilt: [-28, 28], skew: [-14, 14] } as const
export const PREVIEW_BACKGROUNDS = 4

// The values of the sliders for one preview: the stress previews put every slider at the end of its range; a random one draws each from the span the slider
// is meant to stay in (`rand`, else its whole range), mostly near the middle of it.
function sliderValues(ranges: ModelRange[], mode: PreviewMode, rng: Rng): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of ranges) {
    if (mode === 'min') out[r.id] = r.min
    else if (mode === 'max') out[r.id] = r.max
    else {
      const [lo, hi] = r.rand ?? [r.min, r.max]
      out[r.id] = Math.round((lo + (hi - lo) * ((rng() + rng() + rng()) / 3)) * 100) / 100
    }
  }
  return out
}

export function previewSpecs(seed: number, mode: PreviewMode, count = 6, ranges: ModelRange[] = []): PreviewSpec[] {
  const rng = seededRng(seed), out: PreviewSpec[] = []
  const [s0, s1] = PREVIEW_RANGES.scale, [t0, t1] = PREVIEW_RANGES.tilt, [k0, k1] = PREVIEW_RANGES.skew
  for (let i = 0; i < count; i++) {
    const bg = i % PREVIEW_BACKGROUNDS
    if (mode === 'min') out.push({ scale: s0, tilt: i % 2 ? t1 : t0, skew: i % 2 ? k1 : k0, flip: i % 3 === 0, bg, values: sliderValues(ranges, mode, rng) })
    else if (mode === 'max') out.push({ scale: s1, tilt: i % 2 ? t0 : t1, skew: i % 2 ? k0 : k1, flip: i % 3 === 1, bg, values: sliderValues(ranges, mode, rng) })
    else {
      // three draws averaged: most previews are ordinary, a few are extreme
      const pick = (lo: number, hi: number) => lo + (hi - lo) * ((rng() + rng() + rng()) / 3)
      out.push({ scale: Math.round(pick(0.5, 1.15) * 100) / 100, tilt: Math.round(pick(t0, t1) * 10) / 10, skew: Math.round(pick(k0, k1) * 10) / 10, flip: rng() < 0.25, bg, values: sliderValues(ranges, mode, rng) })
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
