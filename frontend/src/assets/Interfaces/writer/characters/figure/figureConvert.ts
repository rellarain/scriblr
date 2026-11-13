import type { CharacterFigure, CharacterPortrait, FigureModel, ModelContent, ModelPreset, ModelSlot, ModelSwatch } from '../../../../../api/types'
import { hexHsl, hslHex, isHex, resolveColour, slotById, type SlotChoice, type SlotChoices } from '../../../admin/characters/engine/colour'
import { applyPreset, restState, type TestState } from '../../../admin/characters/engine/presets'
import { normalizePortrait } from '../portrait/defaults'
import { EDGES, FRONTS, HAIRLINE_HEIGHTS, HAIRLINES, LENGTHS, STYLES, TEXTURES } from '../portrait/library'
import { hexRgb } from '../portrait/colour'
import { drawnOf } from '../portrait/scene'
import { blankFigure, withTest } from './figureState'

// Convert (phase 6c-4): the figure the old portrait comes to on the basic model that comes with Scriblr, and what could not be carried over exactly. The old portrait's choices are the
// model's: every head shape, ear, eye, brow, nose and mouth, the ages, builds, expressions, tops, necklaces, facial hair and the fantasy parts have the same names in the model, so
// most of a portrait converts exactly; the colours become the model's default colours where a colour is one, and otherwise swatches of the character's own palette; the hair is the
// nearest of the model's hairstyles with the lengths and the texture of its sections set from the old length, texture and front (a figure holds choices over a shared copy of the
// model and cannot hold shapes of its own); a few things have no counterpart and are listed.

export interface ConvertNote {
  part: string
  text: string
  // A thing the model has no counterpart for (it is dropped), as against one it comes close to.
  lost: boolean
}
export interface Conversion { figure: CharacterFigure; notes: ConvertNote[] }

// Whether this model is the one the conversion is made for (the ids it maps to are the basic model's).
export const canConvertTo = (model: FigureModel): boolean => model.modelId === 'basic'

const NAME = (list: ReadonlyArray<{ id: string; name: string }>, id: string): string => list.find(o => o.id === id)?.name ?? id
const r1 = (v: number): number => Math.round(v * 10) / 10
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const dist = (a: string, b: string): number => { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) }

// The old hair length as the model's back lengths: the model's ready styles (bob, shoulder, long) are at about 62 for each head height of length, which goes on past the chest.
const CHEST = 1.95

interface Ctx {
  copy: ModelContent
  state: TestState
  notes: ConvertNote[]
}
const addNote = (notes: ConvertNote[], part: string, text: string, lost = false): void => { notes.push({ part, text, lost }) }
const note = (c: Ctx, part: string, text: string, lost = false): void => addNote(c.notes, part, text, lost)
const preset = (c: Ctx, id: string): ModelPreset | undefined => {
  const p = c.copy.presets?.find(x => x.id === id)
  if (p) c.state = applyPreset(c.copy, c.state, p)
  return p
}
const hasForm = (copy: ModelContent, key: string, id: string): boolean => {
  const at = key.lastIndexOf('.')
  return !!copy.objects.find(o => o.id === key.slice(0, at))?.axes?.find(a => a.id === key.slice(at + 1))?.options.some(f => f.id === id)
}
const form = (c: Ctx, key: string, id: string): void => { if (hasForm(c.copy, key, id)) c.state = { ...c.state, forms: { ...c.state.forms, [key]: id } } }
const rangeOf = (copy: ModelContent, id: string) => copy.ranges.find(r => r.id === id)
const value = (c: Ctx, id: string, v: number): void => {
  const r = rangeOf(c.copy, id)
  if (r) c.state = { ...c.state, values: { ...c.state.values, [id]: r1(clamp(v, r.min, r.max)) } }
}
const valueOf = (c: Ctx, id: string): number => c.state.values[id] ?? rangeOf(c.copy, id)?.rest ?? 0
// A slider the old portrait scaled the age's own size by (the age sets the size of the eyes, the nose and the mouth; the portrait's slider is a factor of it).
const scaled = (c: Ctx, id: string, factor: number): void => value(c, id, valueOf(c, id) * factor)

// ---- the face and the body ----

// The build goes over the age instead of replacing it: both set the width of the shoulders, the waist and the hips, and a preset of one kind puts back what the other set, so an infant of
// a broad build would be a broad adult. The build's values are factors of the age's (the old portrait's build was a factor of its age too); a slider that rests at 0 (the jaw) adds.
function buildOver(c: Ctx, id: string): void {
  const build = c.copy.presets?.find(x => x.id === id)
  if (!build) return
  const alone = applyPreset(c.copy, restState(c.copy), build)
  const values = { ...c.state.values }
  for (const key of Object.keys(build.values)) {
    const r = rangeOf(c.copy, key)
    if (!r) continue
    const age = c.state.values[key] ?? r.rest, mine = alone.values[key] ?? r.rest
    values[key] = r1(clamp(r.unit === '%' && r.rest > 0 ? (age * mine) / r.rest : age + mine - r.rest, r.min, r.max))
  }
  c.state = { ...c.state, values, forms: { ...c.state.forms, ...alone.forms }, hidden: [...new Set([...c.state.hidden, ...alone.hidden])] }
}

function convertFace(c: Ctx, p: CharacterPortrait): void {
  preset(c, `age_${p.age}`)
  buildOver(c, `build_${p.build === 'slight' ? 'slim' : p.build}`)
  preset(c, `exp_${p.expression}`)
  form(c, 'skull.headShape', p.headShape)
  form(c, 'ears.ears', p.ears)
  form(c, 'eyes.shape', p.eyes)
  form(c, 'brows.shape', p.brows)
  form(c, 'nose.shape', p.nose)
  form(c, 'mouth.shape', p.mouth)
  scaled(c, 'eyeSize', p.eyeSize)
  value(c, 'eyeSpacing', ((p.eyeSpacing - 1) / 0.17) * 3)
  value(c, 'eyeTilt', p.eyeTilt)
  scaled(c, 'noseSize', p.noseSize)
  scaled(c, 'mouthSize', p.mouthSize)
  scaled(c, 'shoulders', p.shoulderWidth)
  // the chest and the neck's width carry over (phase O8: the Chest form of the chest, the Neck width slider over the build's)
  form(c, 'chest.chest', p.chest)
  scaled(c, 'neckWidth', p.neckWidth)
  if (Math.abs(p.headWidth - 1) > 0.02) note(c, 'Head', 'The head width is not in the model: use another head shape for a wider or narrower head.', true)
  if (Math.abs(p.noseWidth - 1) > 0.03) note(c, 'Nose', 'The nose width is not in the model: the nose is as wide as its size makes it.', true)
  preset(c, `top_${p.top}`)
  if (p.facialHair !== 'none') preset(c, `facial_${p.facialHair}`)
  form(c, 'necklace.style', p.necklace)
}

// ---- the fantasy parts ----

const CROWN_OBJECT: Record<string, string> = { laurel: 'laurel', flowers: 'flowers' }

function convertFantasy(c: Ctx, p: CharacterPortrait): void {
  form(c, 'ears.fantasy', p.fantasyEars)
  form(c, 'horns.style', p.horns)
  if (p.eyeStyle === 'twocolour') note(c, 'Eyes', 'Two-coloured eyes are not in the model: both eyes have the eye colour.', true)
  else form(c, 'eyes.style', p.eyeStyle)
  if (p.eyeCount === 'one') note(c, 'Eyes', 'A single eye is not in the model: the figure has two.', true)
  else if (p.eyeCount !== 'two') form(c, 'extraEyes.count', p.eyeCount)
  if (p.crown !== 'none') form(c, `${CROWN_OBJECT[p.crown] ?? 'crown'}.style`, p.crown)
  form(c, 'hood.style', p.hood)
  if (p.heldItem !== 'none') {
    // the picture's right is the figure's left hand (the original side of the model); the item is held up beside the head, as the old portrait held it
    const hand = p.heldSide === 'left' ? 'R' : 'L'
    form(c, `item${hand}.item`, p.heldItem)
    preset(c, hand === 'L' ? 'pose_left_up' : 'pose_right_up')
  }
}

// ---- the hair ----

const cellsOf = (copy: ModelContent): string[] => copy.ranges.flatMap(r => { const m = /^len_(\w+?)_(\w+)$/.exec(r.id); return m ? [`${m[1]}_${m[2]}`] : [] })
// The old styles that have a ready hairstyle of the model, and the ones that are drawn as loose hair.
const STYLE_PRESET: Record<string, string> = { undercut: 'hair_undercut', fade: 'hair_undercut', shavedside: 'hair_shaved', mohawk: 'hair_mohawk', quiff: 'hair_pixie', triangle: 'hair_afro', puff: 'hair_afro', bantu: 'hair_afro' }
const LOOSE: ReadonlySet<string> = new Set(['onebraid', 'twobraids', 'boxbraids', 'trianglebraids', 'locs', 'twists', 'cornrows', 'topbun', 'lowbun', 'spacebuns', 'topknot', 'halfup', 'highpony', 'lowpony', 'pigtails', 'slicked'])

function hairPreset(p: CharacterPortrait, L: number): string {
  const styled = STYLE_PRESET[p.hairStyle]
  if (styled) return styled
  if (p.hairLength === 'bald') return 'hair_bald'
  if (p.hairLength === 'buzzed') return 'hair_buzz'
  if (L < 0.7) return 'hair_short'
  if (L < 1.25) return 'hair_bob'
  if (L < 1.7) return 'hair_shoulder'
  return 'hair_long'
}

function convertHair(c: Ctx, p: CharacterPortrait): void {
  const cells = cellsOf(c.copy)
  if (cells.length === 0) return
  const L = LENGTHS.find(l => l.id === p.hairLength)?.L ?? 0.45
  const id = hairPreset(p, L)
  preset(c, id)
  const bald = id === 'hair_bald'
  if (!bald) {
    // the sections of hair that hang grow on past the chest
    if (id === 'hair_long' && L > CHEST) {
      const factor = Math.pow(L / CHEST, 0.6)
      for (const cell of cells) {
        const plane = cell.split('_')[0]
        if (plane === 'back' || plane === 'nape' || plane === 'left' || plane === 'right') value(c, `len_${cell}`, valueOf(c, `len_${cell}`) * factor)
      }
    }
    // the texture is the same wave (0), curl (66) or coil (99) over every section that has hair; a style of the model with a texture of its own (afro, curls) keeps it
    const t = TEXTURES.findIndex(x => x.id === p.hairTexture)
    if (t >= 0 && !(id === 'hair_afro' || id === 'hair_buzz')) {
      const tex = t < 3 ? 0 : (99 * (t - 2)) / 9
      for (const cell of cells) if (!c.state.hidden.includes(`hair.${cell.replace('_', '.')}`)) value(c, `tex_${cell}`, tex)
    }
    // the front: a part changes nothing; the bangs are longer sections of the front
    const front = (side: string, f: (v: number) => number): void => { if (cells.includes(`front_${side}`)) value(c, `len_front_${side}`, f(valueOf(c, `len_front_${side}`))) }
    if (p.hairFront === 'back') for (const s of ['center', 'left', 'right']) front(s, v => v * 0.5)
    else if (p.hairFront === 'bangs') for (const s of ['center', 'left', 'right']) front(s, v => Math.max(v, 85))
    else if (p.hairFront === 'curtain') { front('center', v => Math.min(v, 45)); front('left', v => Math.max(v, 100)); front('right', v => Math.max(v, 100)) }
    else if (p.hairFront === 'sidebangs') { front('center', v => Math.max(v, 85)); front('left', v => Math.max(v, 105)) }
  }
  // what comes close, and what is dropped
  const style = STYLES.find(s => s.id === p.hairStyle)
  if (p.hairStyle !== 'plain' && (LOOSE.has(p.hairStyle) || p.hairStyle === 'quiff' || p.hairStyle === 'fade')) {
    const as = id === 'hair_undercut' ? 'an undercut' : id === 'hair_pixie' ? 'a pixie cut' : 'loose hair'
    note(c, 'Hair', `${style?.name ?? p.hairStyle} is not in the model: it is drawn as ${as}.`)
  } else if (p.hairStyle === 'bantu' || p.hairStyle === 'triangle' || p.hairStyle === 'puff') note(c, 'Hair', `${style?.name ?? p.hairStyle} is drawn as an afro.`)
  const lines: string[] = []
  if (p.hairline !== 'rounded') lines.push(NAME(HAIRLINES, p.hairline).toLowerCase())
  if (p.hairlineHeight !== 'average') lines.push(`${NAME(HAIRLINE_HEIGHTS, p.hairlineHeight).toLowerCase()} hairline`)
  if (p.hairEdges !== 'none') lines.push(NAME(EDGES, p.hairEdges).toLowerCase())
  if (lines.length > 0) note(c, 'Hair', `The hairline and the edges (${lines.join(', ')}) are not in the model.`, true)
  if (p.highlightColor) note(c, 'Hair', 'The highlight colour is not in the model.', true)
  if (!bald && p.hairFront !== 'none' && p.hairFront !== 'centre' && p.hairFront !== 'side') note(c, 'Hair', `${NAME(FRONTS, p.hairFront)} are set from the length of the front sections.`)
}

// ---- the colours ----

interface Want { slot: string; hex: string; label: string }
const MAX_SWATCHES = 10

// A colour for each slot: the model's default colour where the old colour is one, else a swatch of the character's own palette (hue and saturation of the old colour, its
// brightness inside the slot's range; close colours share a swatch), else, when the palette is full, the nearest default colour. A slot the portrait says nothing of (the
// trousers, the shoes) takes the first default colour of the slot.
export function colourise(copy: ModelContent, wants: Want[], notes: ConvertNote[]): { choices: SlotChoices; palette: ModelSwatch[] | null } {
  const palette: ModelSwatch[] = []
  const choices: SlotChoices = {}
  const nearest = (slot: ModelSlot, hex: string): SlotChoice | undefined => {
    const k = [...slot.colours].sort((a, b) => dist(a.hex, hex) - dist(b.hex, hex))[0]
    return k ? { src: 'colour', id: k.id } : undefined
  }
  for (const w of wants) {
    const slot = slotById(copy, w.slot)
    const hex = w.hex.toLowerCase()
    if (!slot || !isHex(hex) || choices[slot.id]) continue
    const same = slot.colours.find(k => k.hex.toLowerCase() === hex)
    let choice: SlotChoice | undefined = same ? { src: 'colour', id: same.id } : undefined
    if (!choice) {
      const [h0, s0, l0] = hexHsl(hex)
      const h = Math.round(h0) % 360, s = Math.round(s0)
      let sw = palette.find(x => Math.min(Math.abs(x.h - h), 360 - Math.abs(x.h - h)) <= 3 && Math.abs(x.s - s) <= 4)
      if (!sw && palette.length < MAX_SWATCHES) { sw = { id: `sw_${palette.length + 1}`, name: w.label.slice(0, 30), h, s }; palette.push(sw) }
      choice = sw ? { src: 'swatch', id: sw.id, l: r1(clamp(l0, slot.lMin, slot.lMax)) } : nearest(slot, hex)
    }
    if (!choice) continue
    choices[slot.id] = choice
    if (dist(resolveColour(slot, choice, palette).css, hex) > 18) addNote(notes, w.label, `The ${w.label.toLowerCase()} is the nearest colour the model allows.`)
  }
  for (const slot of copy.slots ?? []) if (!choices[slot.id] && slot.colours[0]) choices[slot.id] = { src: 'colour', id: slot.colours[0].id }
  return { choices, palette: palette.length > 0 ? palette : null }
}
function wantsOf(p: CharacterPortrait, notes: ConvertNote[]): Want[] {
  const d = drawnOf(p)
  const out: Want[] = [
    { slot: 'k_skin', hex: p.skin, label: 'Skin' }, { slot: 'k_hair', hex: d.hairColor, label: 'Hair' }, { slot: 'k_eye', hex: p.eyeColor, label: 'Eyes' },
    { slot: 'k_lip', hex: d.lipColor, label: 'Lips' }, { slot: 'k_cloth', hex: p.topColor, label: 'Top' },
  ]
  if (p.horns !== 'none') out.push({ slot: 'k_horn', hex: p.hornColor, label: 'Horns' })
  // the crown and the necklace are both metal, which is one colour of the model
  if (p.crown !== 'none') out.push({ slot: 'k_metal', hex: p.crownColor, label: 'Metal' })
  else if (p.necklace !== 'none') out.push({ slot: 'k_metal', hex: p.necklaceColor, label: 'Metal' })
  if (p.crown !== 'none' && p.necklace !== 'none' && dist(p.crownColor, p.necklaceColor) > 30) addNote(notes, 'Necklace', 'The necklace and the crown share one colour of metal in the model: the crown\'s.', true)
  if (p.hood !== 'none') out.push({ slot: 'k_hood', hex: p.hoodColor, label: 'Hood' })
  if (p.heldItem !== 'none') out.push({ slot: 'k_item', hex: p.itemColor, label: 'Held item' })
  if (p.browColor && dist(p.browColor, d.hairColor) > 40) addNote(notes, 'Brows', 'The brows take the colour of the hair in the model.', true)
  if (p.facialHair !== 'none' && p.facialHairColor && dist(p.facialHairColor, d.hairColor) > 40) addNote(notes, 'Facial hair', 'Facial hair takes the colour of the hair in the model.', true)
  return out
}

// ---- the whole ----

export function convertPortrait(portrait: CharacterPortrait, model: FigureModel): Conversion {
  const copy = model.content
  const p = normalizePortrait(portrait)
  const c: Ctx = { copy, state: restState(copy), notes: [] }
  convertFace(c, p)
  convertHair(c, p)
  convertFantasy(c, p)
  const { choices, palette } = colourise(copy, wantsOf(p, c.notes), c.notes)
  c.state = { ...c.state, colours: choices }
  const base = { ...blankFigure(model.id, copy), palette, tile: p.tileColor, converted: true as const }
  const figure = withTest(copy, base, c.state)
  // the forms the model has as its own are not kept in the figure
  const forms: Record<string, string> = {}
  for (const [key, id] of Object.entries(figure.forms)) {
    const at = key.lastIndexOf('.')
    const axis = copy.objects.find(o => o.id === key.slice(0, at))?.axes?.find(a => a.id === key.slice(at + 1))
    if (axis && axis.initial !== id) forms[key] = id
  }
  return { figure: { ...figure, forms }, notes: c.notes }
}

// The lines the preview lists: the things that come close first, then the things that are dropped.
export const convertLines = (c: Conversion): string[] => [...c.notes.filter(n => !n.lost), ...c.notes.filter(n => n.lost)].map(n => `${n.part}: ${n.text}`)
