import { PALETTE_KEYS, type ZonePalette } from './types'

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const round = (n: number) => Math.round(Number.isFinite(n) ? n : 0)

// Keep every hue a whole number in 0..360. Anything else in a stored palette
// (the saturation and brightness older versions saved) is dropped. Idempotent.
export function normalizePalette(pal: ZonePalette): ZonePalette {
  const out = {} as ZonePalette
  for (const key of PALETTE_KEYS) out[key] = { h: clamp(round(pal[key]?.h), 0, 360) }
  return out
}

export function editHue(pal: ZonePalette, key: keyof ZonePalette, h: number): ZonePalette {
  return normalizePalette({ ...pal, [key]: { h } })
}
