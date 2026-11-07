import type { CharacterLook, CharacterProfile } from '../../../../api/types'
import { BROWS, EYES, FACIAL_HAIR, HAIR, HEAD_SHAPES, MOUTHS, NOSES, EXPRESSIONS, pick } from './art/library'
import { ACCESSORIES, AREAS, BOTTOMS, BUILDS, MARK_KINDS, OUTER, POSES, SHOES, TOPS } from './art/wardrobe'

// The look in words. A character's appearance is written down as text (the fields below, kept in the profile); this turns the numbers and choices of the look (what the art is
// drawn from) into a first draft of that text, so the author starts from something and changes it. Pure; the console only decides which fields it fills.

export const APPEARANCE_KEYS = ['height', 'build', 'skin', 'hair', 'eyes', 'face', 'voice', 'bearing', 'style', 'marks'] as const
export type AppearanceKey = (typeof APPEARANCE_KEYS)[number]
export type AppearanceField = AppearanceKey | 'appearance'
// The fields as the section shows them: a label, how many lines, and what to write in the empty one.
export const APPEARANCE_FIELDS: Array<{ key: AppearanceField; label: string; rows: number; hint: string }> = [
  { key: 'appearance', label: 'In a paragraph', rows: 5, hint: 'How a stranger would describe them on first sight.' },
  { key: 'height', label: 'Height', rows: 1, hint: 'tall, 1.82 m, a head shorter than her brother' },
  { key: 'build', label: 'Build', rows: 1, hint: 'wiry, broad through the shoulders' },
  { key: 'skin', label: 'Skin', rows: 1, hint: 'weathered brown, freckled across the nose' },
  { key: 'hair', label: 'Hair', rows: 2, hint: 'long, black, usually tied back' },
  { key: 'eyes', label: 'Eyes', rows: 1, hint: 'grey, set a little close' },
  { key: 'face', label: 'Face', rows: 2, hint: 'a long face, a nose broken once, a quick smile' },
  { key: 'voice', label: 'Voice', rows: 2, hint: 'low and dry; speaks slowly when angry' },
  { key: 'bearing', label: 'Bearing and mannerisms', rows: 2, hint: 'stands with the weight on one leg; taps the table when thinking' },
  { key: 'style', label: 'How they dress', rows: 2, hint: 'a salt-stained coat over a plain shirt' },
  { key: 'marks', label: 'Distinguishing marks', rows: 2, hint: 'a scar through the left brow, a tattoo of a heron on the wrist' },
]

// ---- colours in words ----
function hsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [0, 0, 0.5]
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

export type ColourKind = 'skin' | 'hair' | 'eye' | 'cloth'

// A colour as a word an author would use for skin, hair, eyes or cloth.
export function colourName(hex: string, kind: ColourKind): string {
  const [h, s, l] = hsl(hex)
  if (kind === 'skin') {
    if (l < 0.22) return 'deep brown'
    if (l < 0.34) return 'dark brown'
    if (l < 0.46) return 'brown'
    if (l < 0.58) return 'tan'
    if (l < 0.74) return 'light'
    if (l < 0.85) return 'fair'
    return 'pale'
  }
  if (s < 0.12) {
    if (l < 0.15) return 'black'
    if (l < 0.4) return 'dark grey'
    if (l < 0.7) return 'grey'
    if (l < 0.88) return kind === 'hair' ? 'silver' : 'light grey'
    return 'white'
  }
  if (l < 0.1) return 'black'
  if (h < 20 || h >= 340) {
    if (kind === 'cloth') return l > 0.7 ? 'pink' : l < 0.25 ? 'maroon' : 'red'
    return l < 0.2 ? 'dark brown' : s > 0.5 && l < 0.42 ? 'auburn' : s > 0.5 ? 'red' : 'brown'
  }
  if (h < 45) {
    if (kind === 'cloth') return l < 0.3 ? 'brown' : l > 0.7 ? 'cream' : 'tan'
    if (kind === 'eye') return l < 0.3 ? 'dark brown' : l < 0.45 ? 'brown' : 'amber'
    return l < 0.2 ? 'dark brown' : l < 0.35 ? 'brown' : l < 0.5 ? 'light brown' : l < 0.65 ? 'golden' : 'blond'
  }
  if (h < 70) {
    if (kind === 'cloth') return l > 0.7 ? 'pale yellow' : 'yellow'
    if (kind === 'eye') return 'hazel'
    return l > 0.55 ? 'blond' : 'golden brown'
  }
  if (h < 170) return l > 0.7 ? 'pale green' : 'green'
  if (h < 200) return 'teal'
  if (h < 260) return l > 0.7 ? 'pale blue' : l < 0.25 ? 'navy' : 'blue'
  if (h < 300) return l > 0.65 ? 'lilac' : 'purple'
  return l > 0.65 ? 'pink' : 'magenta'
}

const lower = (text: string) => text.toLowerCase()
const cap = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text)
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')
const listed = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

// ---- the parts in words ----
export function heightWords(height: number): string {
  if (height < 0.88) return 'short'
  if (height < 0.97) return 'a little under average height'
  if (height <= 1.04) return 'of average height'
  if (height <= 1.12) return 'tall'
  return 'very tall'
}

function buildWords(look: CharacterLook): string {
  const base = `${lower(pick(BUILDS, look.build).name)} build`
  const frame = look.width < 0.9 ? 'narrow' : look.width > 1.12 ? 'wide' : ''
  const shoulders = look.shoulders < 0.9 ? 'narrow shoulders' : look.shoulders > 1.1 ? 'broad shoulders' : ''
  return [frame ? `${frame}-framed` : '', base, shoulders ? `with ${shoulders}` : ''].filter(Boolean).join(' ').replace('build with', 'build, with')
}

function hairWords(look: CharacterLook): string {
  const style = pick(HAIR, look.hair)
  const beard = pick(FACIAL_HAIR, look.facialHair)
  const beardText = beard.id === 'none' ? '' : `${lower(beard.name)} in ${colourName(look.facialHairColor, 'hair')}`
  if (style.id === 'bald') return ['Bald', beardText].filter(Boolean).join('; ')
  const length = look.hairLength < 0.25 ? 'very short' : look.hairLength < 0.5 ? 'short' : look.hairLength < 0.75 ? 'shoulder-length' : 'long'
  const streak = look.streakColor && look.streakAmount > 0 ? `, with ${colourName(look.streakColor, 'hair')} streaks` : ''
  // A style named only for its length (short, long) adds nothing to the length already said.
  const styled = ['short', 'long'].includes(lower(style.name)) ? '' : `, in a ${lower(style.name)} style`
  const hair = `${cap(length)} ${colourName(look.hairColor, 'hair')} hair${streak}${styled}`
  return [hair, beardText].filter(Boolean).join('; ')
}

function eyesWords(look: CharacterLook): string {
  const size = look.eyeSize > 1.15 ? 'large ' : look.eyeSize < 0.85 ? 'small ' : ''
  const set = look.eyeSpacing > 1.12 ? ', set wide apart' : look.eyeSpacing < 0.9 ? ', set close together' : ''
  return `${cap(colourName(look.eyeColor, 'eye'))}, ${size}${lower(pick(EYES, look.eyes).name)} eyes${set}`
}

function faceWords(look: CharacterLook): string {
  const brows = `${lower(pick(BROWS, look.brows).name)}${look.browThickness > 1.2 ? ', heavy' : look.browThickness < 0.8 ? ', thin' : ''} brows`
  return `${cap(lower(pick(HEAD_SHAPES, look.headShape).name))} face with ${brows}, ${article(pick(NOSES, look.nose).name)} ${lower(pick(NOSES, look.nose).name)} nose and ${article(pick(MOUTHS, look.mouth).name)} ${lower(pick(MOUTHS, look.mouth).name)} mouth`
}

function styleWords(look: CharacterLook): string {
  const o = look.outfit
  const piece = (list: ReadonlyArray<{ id: string; name: string }>, id: string | null, slot: string) => {
    if (!id) return ''
    const name = lower(pick(list, id).name)
    const colour = o.colors[slot] ? `${colourName(o.colors[slot], 'cloth')} ` : ''
    // Trousers, boots and the like are plural: no article.
    return /s$/.test(name) && !/ss$/.test(name) ? `${colour}${name}` : `${article(colour || name)} ${colour}${name}`
  }
  const worn = [piece(TOPS, o.top, 'top'), piece(BOTTOMS, o.bottom, 'bottom'), piece(OUTER, o.outer, 'outer'), piece(SHOES, o.shoes, 'shoes')].filter(Boolean)
  const extras = o.accessories.map(id => lower(pick(ACCESSORIES, id).name))
  if (worn.length === 0 && extras.length === 0) return ''
  return `${worn.length > 0 ? `Wears ${listed(worn)}` : 'Dresses simply'}${extras.length > 0 ? `, with ${listed(extras)}` : ''}`
}

function marksWords(look: CharacterLook): string {
  const parts = look.marks.map(m => {
    const kind = lower(MARK_KINDS.find(k => k.id === m.kind)?.name ?? m.kind)
    const area = AREAS.find(a => a.id === m.area)
    return `${kind}${area ? ` (${lower(area.name)})` : ''}`
  })
  return parts.length === 0 ? '' : cap(listed(parts))
}

function bearingWords(look: CharacterLook): string {
  const expression = lower(pick(EXPRESSIONS, look.expression).name)
  const pose = lower(pick(POSES, look.pose).name)
  return `Usually looks ${expression}; most at ease ${pose === 'standing' ? 'standing' : `in a ${pose} stance`}`
}

// Every field of the look in words (an empty text where the look has nothing to say). `appearance` is the paragraph that joins the parts.
export function describeLook(look: CharacterLook): Record<AppearanceField, string> {
  const parts: Record<AppearanceKey, string> = {
    height: cap(heightWords(look.height)),
    build: cap(buildWords(look)),
    skin: `${cap(colourName(look.skin, 'skin'))} skin${look.marks.some(m => m.kind === 'freckles') ? ', freckled' : ''}`,
    hair: hairWords(look),
    eyes: eyesWords(look),
    face: faceWords(look),
    voice: '',
    bearing: bearingWords(look),
    style: styleWords(look),
    marks: marksWords(look),
  }
  const hair = lower(parts.hair.split(';')[0])
  const sentence = `${cap(`${heightWords(look.height)}, with a ${lower(parts.build)}`)}. ${cap(lower(parts.skin))}, ${hair}, and ${lower(parts.eyes)}.${parts.marks ? ` ${parts.marks}.` : ''}`
  return { appearance: sentence, ...parts }
}

// The appearance as one text: the paragraph the author wrote, or, when there is none, the pieces they wrote joined into sentences (empty when nothing is written).
export function appearanceText(profile: CharacterProfile): string {
  if (profile.appearance.trim()) return profile.appearance.trim()
  return APPEARANCE_KEYS.map(k => profile[k].trim()).filter(Boolean).map(t => (/[.!?]$/.test(t) ? t : `${t}.`)).join(' ')
}

// The fields that are empty in a profile (so a first draft can fill just those).
export const emptyAppearanceFields = (profile: CharacterProfile): AppearanceField[] => APPEARANCE_FIELDS.map(f => f.key).filter(k => profile[k].trim() === '')

// A profile with the fields in `keys` written from the look (the other fields as they are; a field the look has no words for is left alone).
export function writeFromLook(profile: CharacterProfile, look: CharacterLook, keys: AppearanceField[]): CharacterProfile {
  const words = describeLook(look)
  const next = { ...profile }
  for (const k of keys) if (words[k]) next[k] = words[k]
  return next
}
