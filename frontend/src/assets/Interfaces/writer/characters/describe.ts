import type { CharacterPortrait, CharacterProfile } from '../../../../api/types'
import { optionName } from './portrait/registry'
import { drawnOf } from './portrait/scene'

// The portrait in words. A character's appearance is written down as text (the fields below, kept in the profile); this turns the choices of the portrait (what the card is drawn
// from) into a first draft of that text, so the author starts from something and changes it. The height, the voice and the distinguishing marks are the author's own: the
// portrait has nothing to say about them. Pure; the console only decides which fields it fills.

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
  // A very light colour with only a trace of tint (hair greyed to white) is white, not blond.
  if (s < 0.12 || (l > 0.88 && s < 0.4)) {
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
const AGE_WORDS: Record<string, string> = {
  infant: 'an infant', toddler: 'a toddler', child: 'a child', teen: 'a teenager', young: 'a young adult', adult: 'an adult', middle: 'a middle-aged person', older: 'an older person',
  elderly: 'an elderly person',
}
const BUILD_WORDS: Record<string, string> = { slight: 'slight build', average: 'average build', broad: 'broad build, broad through the shoulders', heavy: 'heavy build with a thick neck' }
const LENGTH_WORDS: Record<string, string> = {
  buzzed: 'buzzed', short: 'short', chin: 'chin-length', shoulder: 'shoulder-length', chest: 'chest-length', stomach: 'stomach-length', hip: 'hip-length', knee: 'knee-length',
  body: 'body-length', rapunzel: 'Rapunzel-length',
}
const TEXTURE_WORDS: Record<string, string> = {
  '1A': 'fine straight', '1B': 'straight', '1C': 'coarse straight', '2A': 'fine wavy', '2B': 'wavy', '2C': 'coarse wavy', '3A': 'fine curly', '3B': 'curly', '3C': 'tightly curled',
  '4A': 'fine coily', '4B': 'coily', '4C': 'tightly coiled',
}
const STYLE_WORDS: Record<string, string> = {
  plain: '', onebraid: 'in one braid', twobraids: 'in two braids', boxbraids: 'in full braids', trianglebraids: 'in triangle-part braids', locs: 'in locs', twists: 'in two-strand twists',
  cornrows: 'in cornrows', bantu: 'in Bantu knots', triangle: 'cut in a triangle shape', puff: 'in a puff', topbun: 'in a top bun', lowbun: 'in a low bun', spacebuns: 'in space buns',
  topknot: 'in a top knot', halfup: 'worn half up', highpony: 'in a high ponytail', lowpony: 'in a low ponytail', pigtails: 'in pigtails', undercut: 'in an undercut',
  shavedside: 'with one side shaved', mohawk: 'in a mohawk', fade: 'in a fade', quiff: 'in a quiff', slicked: 'slicked back',
}
const FRONT_WORDS: Record<string, string> = { none: '', centre: 'with a centre part', side: 'with a side part', back: 'swept back', bangs: 'with straight bangs', curtain: 'with curtain bangs', sidebangs: 'with side-swept bangs' }
const HAIRLINE_WORDS: Record<string, string> = {
  widow: 'a widow\u2019s peak', mshape: 'an M-shaped hairline', uneven: 'an uneven hairline', mature: 'a mature hairline', receding: 'a receding hairline', deep: 'a deeply receding hairline',
  thinning: 'thinning on top',
}
const EXPRESSION_WORDS: Record<string, string> = {
  neutral: 'calm', soft: 'gently amused', smile: 'cheerful', grin: 'delighted', laugh: 'ready to laugh', smirk: 'smug', stern: 'stern', angry: 'angry', sad: 'sad', worried: 'worried',
  surprised: 'surprised', sleepy: 'sleepy', thoughtful: 'thoughtful',
}

const buildWords = (p: CharacterPortrait): string => BUILD_WORDS[p.build] ?? `${lower(optionName('build', p.build))} build`

const skinWords = (p: CharacterPortrait): string => `${cap(colourName(p.skin, 'skin'))} skin${p.age === 'older' || p.age === 'elderly' ? ', lined with age' : ''}`

function hairWords(p: CharacterPortrait): string {
  const drawn = drawnOf(p)
  const young = ['infant', 'toddler', 'child'].includes(p.age)
  const beard = p.facialHair === 'none' || young ? '' : `${article(optionName('facialHair', p.facialHair))} ${lower(optionName('facialHair', p.facialHair))}`
  if (p.hairLength === 'bald') return ['Bald', beard].filter(Boolean).join('; ')
  const colour = colourName(drawn.hairColor, 'hair')
  const length = LENGTH_WORDS[p.hairLength] ?? lower(optionName('hairLength', p.hairLength))
  const texture = p.hairLength === 'buzzed' ? '' : `${TEXTURE_WORDS[p.hairTexture] ?? lower(optionName('hairTexture', p.hairTexture))} `
  const extras = [
    STYLE_WORDS[p.hairStyle] ?? '', FRONT_WORDS[p.hairFront] ?? '', HAIRLINE_WORDS[p.hairline] ?? '',
    p.highlightColor ? `${colourName(p.highlightColor, 'hair')} highlights` : '',
  ].filter(Boolean)
  // The length, the texture and the colour are one phrase; the style, the front and the hairline follow it ("Chest-length wavy black hair, in two braids, with a side part").
  const hair = `${cap(length)} ${texture}${colour} hair${extras.length > 0 ? `, ${extras.join(', ')}` : ''}`
  return [hair, beard].filter(Boolean).join('; ')
}

function eyesWords(p: CharacterPortrait): string {
  const size = p.eyeSize > 1.12 ? 'large ' : p.eyeSize < 0.88 ? 'small ' : ''
  const set = p.eyeSpacing > 1.08 ? ', set wide apart' : p.eyeSpacing < 0.92 ? ', set close together' : ''
  return `${cap(colourName(p.eyeColor, 'eye'))}, ${size}${lower(optionName('eyes', p.eyes))} eyes${set}`
}

function faceWords(p: CharacterPortrait): string {
  const head = optionName('headShape', p.headShape)
  const brows = p.brows === 'none' ? 'no brows' : `${lower(optionName('brows', p.brows))} brows`
  const nose = lower(optionName('nose', p.nose)), mouth = lower(optionName('mouth', p.mouth))
  const ears = p.ears === 'protruding' ? '; ears that stick out' : ''
  return `${cap(head === 'Pointed chin' ? 'pointed-chin' : lower(head))} face with ${brows}, ${article(nose)} ${nose} nose and ${article(mouth)} ${mouth} mouth${ears}`
}

function styleWords(p: CharacterPortrait): string {
  const colour = colourName(p.topColor, 'cloth')
  return `Wears ${article(colour)} ${colour} ${lower(optionName('top', p.top))}${p.top === 'turtle' ? '' : ' top'}`
}

const bearingWords = (p: CharacterPortrait): string => `Usually looks ${EXPRESSION_WORDS[p.expression] ?? lower(optionName('expression', p.expression))}`

// Every field of the portrait in words (an empty text where the portrait has nothing to say). `appearance` is the paragraph that joins the parts.
export function describePortrait(p: CharacterPortrait): Record<AppearanceField, string> {
  const parts: Record<AppearanceKey, string> = {
    height: '',
    build: cap(buildWords(p)),
    skin: skinWords(p),
    hair: hairWords(p),
    eyes: eyesWords(p),
    face: faceWords(p),
    voice: '',
    bearing: bearingWords(p),
    style: styleWords(p),
    marks: '',
  }
  const hair = lower(parts.hair.split(';')[0])
  const sentence = `${cap(AGE_WORDS[p.age] ?? 'a person')}, with a ${lower(parts.build)}. ${parts.skin}, ${hair}, and ${lower(parts.eyes)}.`
  return { appearance: sentence, ...parts }
}

// The appearance as one text: the paragraph the author wrote, or, when there is none, the pieces they wrote joined into sentences (empty when nothing is written).
export function appearanceText(profile: CharacterProfile): string {
  if (profile.appearance.trim()) return profile.appearance.trim()
  return APPEARANCE_KEYS.map(k => profile[k].trim()).filter(Boolean).map(t => (/[.!?]$/.test(t) ? t : `${t}.`)).join(' ')
}

// The fields that are empty in a profile (so a first draft can fill just those).
export const emptyAppearanceFields = (profile: CharacterProfile): AppearanceField[] => APPEARANCE_FIELDS.map(f => f.key).filter(k => profile[k].trim() === '')

// A profile with the fields in `keys` written from the portrait (the other fields as they are; a field the portrait has no words for is left alone).
export function writeFromPortrait(profile: CharacterProfile, portrait: CharacterPortrait, keys: AppearanceField[]): CharacterProfile {
  const words = describePortrait(portrait)
  const next = { ...profile }
  for (const k of keys) if (words[k]) next[k] = words[k]
  return next
}
