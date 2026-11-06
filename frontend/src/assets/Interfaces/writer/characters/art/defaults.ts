import type { CharacterLook, CharacterMark } from '../../../../../api/types'
import { CHARACTER_MAX_ACCESSORIES, CHARACTER_MAX_MARKS } from '../../../../../api/types'
import { DEFAULT_MARK_COLORS } from './wardrobe'

// The look a new character starts with (the same as the server's), and the repair of a look read from a file or an older build: every field is given a value of its
// own kind (a slider held to its range, a colour that is #rrggbb, an id that is a text), so what is drawn from it never has to guess.

export const DEFAULT_COLORS: Record<string, string> = { top: '#4a6fa5', bottom: '#3b3f4a', shoes: '#4a3a30', outer: '#6b5b4a', accessory: '#c9a227' }

export function defaultLook(): CharacterLook {
  return {
    skin: '#e0b08a', build: 'average', height: 1, width: 1, shoulders: 1,
    headShape: 'oval', headWidth: 1, ears: 'small', earSize: 1,
    eyes: 'round', eyeColor: '#5b3a29', eyeSize: 1, eyeSpacing: 1, eyeTilt: 0,
    brows: 'soft', browColor: '#3b2a20', browThickness: 1, browTilt: 0,
    nose: 'straight', noseSize: 1, noseWidth: 1,
    mouth: 'medium', mouthSize: 1, lipColor: '#b5655a',
    facialHair: 'none', facialHairColor: '#3b2a20',
    hair: 'short', hairColor: '#3b2a20', hairLength: 0.5, streakColor: null, streakAmount: 0.3,
    expression: 'neutral', pose: 'standing', heldLeft: null, heldRight: null,
    outfit: { top: 'tee', bottom: 'trousers', shoes: 'shoes', outer: null, accessories: [], colors: { ...DEFAULT_COLORS } },
    marks: [],
  }
}

// The ranges of the sliders: [low, high] (the server holds the same).
export const RANGES = {
  height: [0.7, 1.3], width: [0.7, 1.4], shoulders: [0.8, 1.3], headWidth: [0.8, 1.2], earSize: [0.6, 1.6], eyeSize: [0.6, 1.5], eyeSpacing: [0.7, 1.4], eyeTilt: [-20, 20],
  browThickness: [0.5, 2], browTilt: [-20, 20], noseSize: [0.6, 1.5], noseWidth: [0.6, 1.5], mouthSize: [0.6, 1.5], hairLength: [0, 1], streakAmount: [0, 1],
} as const satisfies Record<string, readonly [number, number]>
export type SliderKey = keyof typeof RANGES

const HEX = /^#[0-9a-fA-F]{6}$/
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown, fallback: string): string => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 40) : fallback)
const maybeText = (v: unknown, fallback: string | null): string | null => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim().slice(0, 40)) : fallback)
const colour = (v: unknown, fallback: string): string => (typeof v === 'string' && HEX.test(v) ? v : fallback)
const maybeColour = (v: unknown): string | null => (typeof v === 'string' && HEX.test(v) ? v : null)
const slider = (v: unknown, key: SliderKey, fallback: number): number => {
  const [lo, hi] = RANGES[key]
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
}

function normalizeMark(raw: unknown, i: number): CharacterMark | null {
  if (!isRecord(raw)) return null
  const kinds = Object.keys(DEFAULT_MARK_COLORS)
  const kind = kinds.includes(raw.kind as string) ? (raw.kind as CharacterMark['kind']) : null
  if (!kind) return null
  const unit = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d)
  const strokes: Array<Array<[number, number]>> = []
  for (const st of Array.isArray(raw.strokes) ? raw.strokes : []) {
    const pts: Array<[number, number]> = []
    for (const p of Array.isArray(st) ? st : []) if (Array.isArray(p) && p.length === 2) pts.push([unit(p[0], 0.5), unit(p[1], 0.5)])
    if (pts.length >= 2) strokes.push(pts.slice(0, 48))
    if (strokes.length >= 12) break
  }
  return {
    id: text(raw.id, `m${i}`), kind, design: text(raw.design, ''), area: text(raw.area, 'cheeks'), x: unit(raw.x, 0.5), y: unit(raw.y, 0.5),
    size: typeof raw.size === 'number' && Number.isFinite(raw.size) ? Math.min(3, Math.max(0.2, raw.size)) : 1, color: maybeColour(raw.color), strokes,
  }
}

export function normalizeLook(raw: unknown): CharacterLook {
  const d = defaultLook()
  if (!isRecord(raw)) return d
  const o = isRecord(raw.outfit) ? raw.outfit : {}
  const colors: Record<string, string> = {}
  for (const [k, v] of Object.entries(isRecord(o.colors) ? o.colors : {})) if (k.length > 0 && k.length <= 20 && typeof v === 'string' && HEX.test(v) && Object.keys(colors).length < 12) colors[k] = v
  const accessories: string[] = []
  for (const a of Array.isArray(o.accessories) ? o.accessories : []) {
    const id = maybeText(a, null)
    if (id && !accessories.includes(id) && accessories.length < CHARACTER_MAX_ACCESSORIES) accessories.push(id)
  }
  const marks: CharacterMark[] = []
  const seen = new Set<string>()
  ;(Array.isArray(raw.marks) ? raw.marks : []).forEach((m, i) => {
    const mark = normalizeMark(m, i)
    if (mark && !seen.has(mark.id) && marks.length < CHARACTER_MAX_MARKS) { seen.add(mark.id); marks.push(mark) }
  })
  return {
    skin: colour(raw.skin, d.skin), build: text(raw.build, d.build), height: slider(raw.height, 'height', 1), width: slider(raw.width, 'width', 1), shoulders: slider(raw.shoulders, 'shoulders', 1),
    headShape: text(raw.headShape, d.headShape), headWidth: slider(raw.headWidth, 'headWidth', 1), ears: text(raw.ears, d.ears), earSize: slider(raw.earSize, 'earSize', 1),
    eyes: text(raw.eyes, d.eyes), eyeColor: colour(raw.eyeColor, d.eyeColor), eyeSize: slider(raw.eyeSize, 'eyeSize', 1), eyeSpacing: slider(raw.eyeSpacing, 'eyeSpacing', 1), eyeTilt: slider(raw.eyeTilt, 'eyeTilt', 0),
    brows: text(raw.brows, d.brows), browColor: colour(raw.browColor, d.browColor), browThickness: slider(raw.browThickness, 'browThickness', 1), browTilt: slider(raw.browTilt, 'browTilt', 0),
    nose: text(raw.nose, d.nose), noseSize: slider(raw.noseSize, 'noseSize', 1), noseWidth: slider(raw.noseWidth, 'noseWidth', 1),
    mouth: text(raw.mouth, d.mouth), mouthSize: slider(raw.mouthSize, 'mouthSize', 1), lipColor: colour(raw.lipColor, d.lipColor),
    facialHair: text(raw.facialHair, d.facialHair), facialHairColor: colour(raw.facialHairColor, d.facialHairColor),
    hair: text(raw.hair, d.hair), hairColor: colour(raw.hairColor, d.hairColor), hairLength: slider(raw.hairLength, 'hairLength', 0.5), streakColor: maybeColour(raw.streakColor), streakAmount: slider(raw.streakAmount, 'streakAmount', 0.3),
    expression: text(raw.expression, d.expression), pose: text(raw.pose, d.pose), heldLeft: maybeText(raw.heldLeft, null), heldRight: maybeText(raw.heldRight, null),
    outfit: {
      top: 'top' in o ? maybeText(o.top, null) : d.outfit.top, bottom: 'bottom' in o ? maybeText(o.bottom, null) : d.outfit.bottom,
      shoes: 'shoes' in o ? maybeText(o.shoes, null) : d.outfit.shoes, outer: 'outer' in o ? maybeText(o.outer, null) : null,
      accessories, colors: Object.keys(colors).length > 0 ? colors : { ...DEFAULT_COLORS },
    },
    marks,
  }
}
