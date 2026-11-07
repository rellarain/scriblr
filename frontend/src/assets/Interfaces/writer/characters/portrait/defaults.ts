import type { CharacterPortrait } from '../../../../../api/types'

// The default portrait, the ranges of the sliders and the repair of a portrait that was loaded, imported or made by another build. Everything here is the same as the server's
// (`CharacterPortrait` in `backend/app/storage/schema.py`, which a test reads): a bad value is put right, never refused.

export const PORTRAIT_VERSION = 1

// Each slider's lowest and highest value.
export const PORTRAIT_RANGES = {
  headWidth: [0.88, 1.12],
  eyeSize: [0.75, 1.3],
  eyeSpacing: [0.85, 1.18],
  eyeTilt: [-10, 10],
  noseSize: [0.75, 1.3],
  noseWidth: [0.75, 1.35],
  mouthSize: [0.8, 1.25],
} as const satisfies Record<string, readonly [number, number]>
export type SliderKey = keyof typeof PORTRAIT_RANGES

export function defaultPortrait(): CharacterPortrait {
  return {
    version: PORTRAIT_VERSION,
    age: 'adult', build: 'average', chest: 'average',
    headShape: 'oval', headWidth: 1, ears: 'average', skin: '#d9a07a', expression: 'neutral',
    eyes: 'almond', eyeColor: '#5a3a24', eyeSize: 1, eyeSpacing: 1, eyeTilt: 0,
    brows: 'soft', browColor: null,
    nose: 'straight', noseSize: 1, noseWidth: 1,
    mouth: 'medium', mouthSize: 1, lipColor: null,
    hairLength: 'short', hairTexture: '1B', hairStyle: 'plain', hairFront: 'none', hairline: 'rounded', hairlineHeight: 'average', hairEdges: 'none',
    hairColor: '#3a2a20', highlightColor: null, greying: 'auto',
    facialHair: 'none', facialHairColor: null,
    top: 'crew', topColor: '#2f4a5a', tileColor: '#e6d6c3',
  }
}

const ID_KEYS = [
  'age', 'build', 'chest', 'headShape', 'ears', 'expression', 'eyes', 'brows', 'nose', 'mouth', 'hairLength', 'hairTexture', 'hairStyle', 'hairFront', 'hairline',
  'hairlineHeight', 'hairEdges', 'greying', 'facialHair', 'top',
] as const
const COLOUR_KEYS = ['skin', 'eyeColor', 'hairColor', 'topColor', 'tileColor'] as const
const OPTIONAL_COLOUR_KEYS = ['browColor', 'lipColor', 'highlightColor', 'facialHairColor'] as const

const HEX = /^#[0-9a-fA-F]{6}$/

// The portrait the server would keep for `raw`: an id is a trimmed text of at most 40 characters (the default when it is not one; an id this build does not know is kept, and
// the library draws a default for it), a colour is #rrggbb, a slider is held to its range, and anything that is not a portrait is the default portrait.
export function normalizePortrait(raw: unknown): CharacterPortrait {
  const base = defaultPortrait()
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return base
  const src = raw as Record<string, unknown>
  const out: Record<string, unknown> = { ...base }
  for (const key of ID_KEYS) {
    const value = src[key]
    const text = typeof value === 'string' ? value.trim().slice(0, 40) : ''
    out[key] = text || base[key]
  }
  for (const key of COLOUR_KEYS) out[key] = typeof src[key] === 'string' && HEX.test(src[key] as string) ? src[key] : base[key]
  for (const key of OPTIONAL_COLOUR_KEYS) out[key] = typeof src[key] === 'string' && HEX.test(src[key] as string) ? src[key] : null
  for (const key of Object.keys(PORTRAIT_RANGES) as SliderKey[]) {
    const [low, high] = PORTRAIT_RANGES[key]
    const value = src[key]
    out[key] = typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : base[key]
  }
  const version = src.version
  out.version = typeof version === 'number' && Number.isInteger(version) && version >= 1 && version <= 999 ? version : PORTRAIT_VERSION
  return out as unknown as CharacterPortrait
}
