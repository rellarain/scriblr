import type { ModelColour, ModelContent, ModelGenre, ModelShape, ModelSlot, ModelSwatch } from '../../../../../api/types'
import { fromHsl, toHsl } from '../../../writer/characters/portrait/colour'
import { NAME_MAX, SWATCH_NAME_MAX, shapeById, type MakeId, randomId } from '../modelContent'
import { freshFormId } from './formEdit'
import { LIMITS } from './limits'
import { done, fail, type Edit } from './rigEdit'
import { standardGenres, standardSlots, starterPalette } from './standardColours'

// Colour. A shape is painted from a colour SLOT (Skin, Hair, Eye...), or has a fixed gray, or neither (the neutral gray every uncoloured model is drawn in). A slot
// holds the admin's default colours and how bright and how opaque a colour in it may be. What a character wears is a choice per slot: a default colour, or a swatch
// of its palette (hue and saturation from the swatch, brightness inside the slot's range). The designer works on a test character whose choices are never saved;
// no choice at all is gray, so a model as saved is a plain grayscale figure. Everything here is pure.

// The choice made for one slot: a default colour of the slot (`colour`) or a swatch of the palette (`swatch`), and optionally the brightness (`l`) and opacity (`a`),
// 0..100, it is set to inside the slot's range.
export interface SlotChoice { src: 'colour' | 'swatch'; id: string; l?: number; a?: number }
export type SlotChoices = Record<string, SlotChoice>
// The palette in use and what is chosen from it: what colours a shape is drawn with.
export interface Colouring { palette: ModelSwatch[]; choices: SlotChoices }
export interface ResolvedColour { h: number; s: number; l: number; a: number; css: string }
export interface Paint { fill: string; opacity: number }

export const NEUTRAL_GRAY = 50
export const NO_COLOURING: Colouring = { palette: [], choices: {} }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round2 = (v: number) => Math.round(v * 100) / 100

export const slotsOf = (c: ModelContent): ModelSlot[] => c.slots ?? []
export const genresOf = (c: ModelContent): ModelGenre[] => c.genres ?? []
export const paletteOf = (c: ModelContent): ModelSwatch[] => c.palette ?? []
export const slotById = (c: ModelContent, id: string | null | undefined): ModelSlot | undefined => (id ? slotsOf(c).find(s => s.id === id) : undefined)
export const colourById = (slot: ModelSlot, id: string): ModelColour | undefined => slot.colours.find(k => k.id === id)

// A colour as hue (0..360), saturation and lightness (0..100).
export function hexHsl(hex: string): [number, number, number] {
  const [h, s, l] = toHsl(hex)
  return [Math.round(h * 3600) / 10, Math.round(s * 1000) / 10, Math.round(l * 1000) / 10]
}
export const hslHex = (h: number, s: number, l: number): string => fromHsl(((h % 360) + 360) % 360 / 360, clamp(s, 0, 100) / 100, clamp(l, 0, 100) / 100)
export const grayHex = (l: number): string => hslHex(0, 0, l)
export const isHex = (v: string): boolean => /^#[0-9a-fA-F]{6}$/.test(v)
// A colour drawn from a swatch at a brightness: for the pickers (which show a swatch at an even 50).
export const swatchHex = (sw: ModelSwatch, l = 50): string => hslHex(sw.h, sw.s, l)
// Whether a colour fits a genre (none chosen: every colour fits; a colour with no genres fits every genre).
export const fitsGenre = (k: ModelColour, genre: string | null): boolean => genre === null || k.genres.length === 0 || k.genres.includes(genre)

// What a choice comes to for a slot: hue, saturation, lightness, opacity and the colour as #rrggbb. A default colour keeps its own lightness unless the
// brightness is set; a swatch is at the slot's resting brightness unless it is. Brightness and opacity are held to the slot's ranges. No choice, or a choice
// whose colour or swatch is gone, is a gray at the slot's resting brightness.
export function resolveColour(slot: ModelSlot, choice: SlotChoice | undefined, palette: ModelSwatch[]): ResolvedColour {
  const a = clamp(choice?.a ?? slot.aRest, slot.aMin, slot.aMax) / 100
  const gray = (): ResolvedColour => ({ h: 0, s: 0, l: slot.lRest, a, css: grayHex(slot.lRest) })
  if (!choice) return gray()
  if (choice.src === 'colour') {
    const k = colourById(slot, choice.id)
    if (!k) return gray()
    const [h, s, own] = hexHsl(k.hex)
    if (choice.l === undefined) return { h, s, l: own, a, css: k.hex.toLowerCase() }
    const l = clamp(choice.l, slot.lMin, slot.lMax)
    return { h, s, l, a, css: hslHex(h, s, l) }
  }
  const sw = palette.find(p => p.id === choice.id)
  if (!sw) return gray()
  const l = clamp(choice.l ?? slot.lRest, slot.lMin, slot.lMax)
  return { h: sw.h, s: sw.s, l, a, css: hslHex(sw.h, sw.s, l) }
}

// Where a shape gets its paint: its own slot, else its own fixed gray, else (a twin, a shape that follows the template's) the shape it copies.
export function paintSource(c: ModelContent, shape: ModelShape, depth = 0): { slot: ModelSlot | null; gray: number | null } {
  if (shape.slot) return { slot: slotById(c, shape.slot) ?? null, gray: null }
  if (shape.gray !== null && shape.gray !== undefined) return { slot: null, gray: shape.gray }
  const from = shape.mirrorOf ?? shape.copyOf
  const next = from && depth < 4 ? shapeById(c, from) : undefined
  return next ? paintSource(c, next, depth + 1) : { slot: null, gray: null }
}

// The fill and opacity a shape is drawn with: its shape's own opacity times the opacity the colour has.
export function paintOf(c: ModelContent, colouring: Colouring, shape: ModelShape): Paint {
  const { slot, gray } = paintSource(c, shape)
  if (slot) {
    const r = resolveColour(slot, colouring.choices[slot.id], colouring.palette)
    return { fill: r.css, opacity: round2(shape.op * r.a) }
  }
  return { fill: grayHex(gray ?? NEUTRAL_GRAY), opacity: shape.op }
}

// The slot a shape is painted from, as the Colour tab shows it (own or inherited), and whether it is the shape's own.
export const slotOfShape = (c: ModelContent, shape: ModelShape): ModelSlot | null => paintSource(c, shape).slot

// How many slots have a colour chosen that is not gray: for the toolbar's count of what is off rest.
export const chosenCount = (c: ModelContent, choices: SlotChoices): number => Object.keys(choices).filter(id => slotById(c, id)).length

// ---- the slots, default colours, genres and the starter palette of a model ----

const clean = (name: string, max: number) => name.trim().slice(0, max)
const mapSlot = (c: ModelContent, id: string, change: (s: ModelSlot) => ModelSlot): ModelContent => ({ ...c, slots: slotsOf(c).map(s => (s.id === id ? change(s) : s)) })

export function addSlot(c: ModelContent, name: string, make: MakeId = randomId): Edit & { slotId?: string } {
  if (slotsOf(c).length >= LIMITS.slotsMax) return fail(`A model may have at most ${LIMITS.slotsMax} colour slots.`)
  const id = freshFormId(slotsOf(c).map(s => s.id), 'k', make)
  const slot: ModelSlot = { id, name: clean(name, NAME_MAX) || 'Colour', lMin: 10, lRest: 50, lMax: 90, aMin: 100, aRest: 100, aMax: 100, colours: [] }
  return { ...done({ ...c, slots: [...slotsOf(c), slot] }), slotId: id }
}

export const renameSlot = (c: ModelContent, id: string, name: string): ModelContent => mapSlot(c, id, s => ({ ...s, name }))

export type SlotKey = 'lMin' | 'lRest' | 'lMax' | 'aMin' | 'aRest' | 'aMax'
// One step of a number of a slot's ranges (brightness 2, opacity 5; a big step 10 and 20): the smallest never passes the resting value, the largest never falls
// under it, and they stay inside 0..100.
export function stepSlot(c: ModelContent, id: string, key: SlotKey, dir: 1 | -1, big = false): ModelContent {
  return mapSlot(c, id, s => {
    const bright = key.startsWith('l'), step = (bright ? 2 : 5) * (big ? 5 : 1)
    const lo = key.endsWith('Min') ? 0 : key.endsWith('Rest') ? s[bright ? 'lMin' : 'aMin'] : s[bright ? 'lRest' : 'aRest']
    const hi = key.endsWith('Max') ? 100 : key.endsWith('Rest') ? s[bright ? 'lMax' : 'aMax'] : s[bright ? 'lRest' : 'aRest']
    return { ...s, [key]: clamp(s[key] + dir * step, lo, hi) }
  })
}

// A slot goes: the shapes painted from it are left with no slot (gray).
export function removeSlot(c: ModelContent, id: string): Edit {
  if (!slotById(c, id)) return fail('There is no such colour slot.')
  return done({ ...c, slots: slotsOf(c).filter(s => s.id !== id), shapes: c.shapes.map(s => (s.slot === id ? { ...s, slot: null } : s)) })
}

export function addColour(c: ModelContent, slotId: string, hex = '#808080', make: MakeId = randomId): Edit & { colourId?: string } {
  const slot = slotById(c, slotId)
  if (!slot) return fail('There is no such colour slot.')
  if (slot.colours.length >= LIMITS.coloursMax) return fail(`A slot may have at most ${LIMITS.coloursMax} default colours.`)
  const id = freshFormId(slot.colours.map(k => k.id), 'c', make)
  return { ...done(mapSlot(c, slotId, s => ({ ...s, colours: [...s.colours, { id, name: '', hex: isHex(hex) ? hex.toLowerCase() : '#808080', genres: [] }] }))), colourId: id }
}

const mapColour = (c: ModelContent, slotId: string, id: string, change: (k: ModelColour) => ModelColour): ModelContent => mapSlot(c, slotId, s => ({ ...s, colours: s.colours.map(k => (k.id === id ? change(k) : k)) }))
export const renameColour = (c: ModelContent, slotId: string, id: string, name: string): ModelContent => mapColour(c, slotId, id, k => ({ ...k, name }))
export const setColourHex = (c: ModelContent, slotId: string, id: string, hex: string): ModelContent => (isHex(hex) ? mapColour(c, slotId, id, k => ({ ...k, hex: hex.toLowerCase() })) : c)
// The genres a colour fits: switched on or off one at a time (all off: it fits every genre).
export const toggleColourGenre = (c: ModelContent, slotId: string, id: string, genreId: string): ModelContent => mapColour(c, slotId, id, k => ({ ...k, genres: k.genres.includes(genreId) ? k.genres.filter(g => g !== genreId) : [...k.genres, genreId] }))
export const removeColour = (c: ModelContent, slotId: string, id: string): ModelContent => mapSlot(c, slotId, s => ({ ...s, colours: s.colours.filter(k => k.id !== id) }))

export function addGenre(c: ModelContent, name: string, make: MakeId = randomId): Edit & { genreId?: string } {
  if (genresOf(c).length >= LIMITS.genresMax) return fail(`A model may have at most ${LIMITS.genresMax} genres.`)
  const id = freshFormId(genresOf(c).map(g => g.id), 'g', make)
  return { ...done({ ...c, genres: [...genresOf(c), { id, name: clean(name, SWATCH_NAME_MAX) || 'Genre' }] }), genreId: id }
}
export const renameGenre = (c: ModelContent, id: string, name: string): ModelContent => ({ ...c, genres: genresOf(c).map(g => (g.id === id ? { ...g, name } : g)) })
// A genre goes: colours that fitted it no longer name it (one left with no genre fits every genre).
export const removeGenre = (c: ModelContent, id: string): ModelContent => ({
  ...c, genres: genresOf(c).filter(g => g.id !== id), slots: slotsOf(c).map(s => ({ ...s, colours: s.colours.map(k => (k.genres.includes(id) ? { ...k, genres: k.genres.filter(g => g !== id) } : k)) })),
})

// The standard genres, slots and starter palette, added where the model has none of them (an older model, or one whose slots were deleted): existing ones are kept.
export function addStandardSlots(c: ModelContent): Edit {
  const genreIds = new Set(genresOf(c).map(g => g.id)), slotIds = new Set(slotsOf(c).map(s => s.id))
  const genres = [...genresOf(c), ...standardGenres().filter(g => !genreIds.has(g.id))]
  const slots = [...slotsOf(c), ...standardSlots().filter(s => !slotIds.has(s.id))]
  if (genres.length > LIMITS.genresMax || slots.length > LIMITS.slotsMax) return fail('The model has too many genres or colour slots to add the standard ones.')
  return done({ ...c, genres, slots, palette: paletteOf(c).length ? paletteOf(c) : starterPalette() })
}

// The test palette becomes the model's starter palette.
export const setStarterPalette = (c: ModelContent, palette: ModelSwatch[]): ModelContent => ({ ...c, palette: palette.map(p => ({ ...p })) })

// ---- a palette (the model's starter palette or the test palette), as a list ----

export function addSwatch(palette: ModelSwatch[], make: MakeId = randomId): { palette: ModelSwatch[]; id?: string; reason?: string } {
  if (palette.length >= LIMITS.paletteMax) return { palette, reason: `A palette may have at most ${LIMITS.paletteMax} swatches.` }
  const id = freshFormId(palette.map(p => p.id), 'k', make)
  const last = palette[palette.length - 1]
  return { palette: [...palette, { id, name: `Swatch ${palette.length + 1}`, h: last ? (last.h + 150) % 360 : 24, s: 50 }], id }
}
export const setSwatch = (palette: ModelSwatch[], id: string, change: Partial<Pick<ModelSwatch, 'h' | 's' | 'name'>>): ModelSwatch[] =>
  palette.map(p => (p.id === id ? { ...p, ...change, h: Math.round(clamp(change.h ?? p.h, 0, 359)), s: Math.round(clamp(change.s ?? p.s, 0, 100)) } : p))
// A swatch goes (the last one stays): every slot that was using it falls back to gray.
export function removeSwatch(palette: ModelSwatch[], choices: SlotChoices, id: string): { palette: ModelSwatch[]; choices: SlotChoices } {
  if (palette.length <= 1) return { palette, choices }
  return { palette: palette.filter(p => p.id !== id), choices: Object.fromEntries(Object.entries(choices).filter(([, ch]) => !(ch.src === 'swatch' && ch.id === id))) }
}

// ---- random colours ----

export type Rng = () => number
const pick = <T,>(list: T[], rng: Rng): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]

// A random palette: five swatches, hues a step of 40 to 100 degrees apart, moderate saturation.
export function randomPalette(rng: Rng, count = 5): ModelSwatch[] {
  let h = Math.floor(rng() * 360)
  return Array.from({ length: count }, (_, i) => {
    const sw: ModelSwatch = { id: `k${i + 1}`, name: `Swatch ${i + 1}`, h: h % 360, s: 28 + Math.floor(rng() * 45) }
    h += 40 + Math.floor(rng() * 61)
    return sw
  })
}

export interface RollOptions {
  genre?: string | null
  // slots whose choice stays as it is
  keep?: ReadonlySet<string>
  // the stress previews: brightness and opacity at the smallest or the largest of each slot's range
  extreme?: 'min' | 'max' | null
}
// Slots that always take a default colour (a skin or an eye in a colour of the palette would look wrong most of the time).
const NATURAL = /skin|eye/i

// A random choice for every slot not kept: 70% a default colour that fits the genre (always, for a skin or an eye, or when the palette is empty), else a swatch
// at a brightness from the middle half of the slot's range. A slot with nothing to choose from (no fitting colour, no swatch) is left gray.
export function rollChoices(c: ModelContent, rng: Rng, palette: ModelSwatch[], current: SlotChoices = {}, options: RollOptions = {}): SlotChoices {
  const out: SlotChoices = {}
  for (const slot of slotsOf(c)) {
    if (options.keep?.has(slot.id)) { if (current[slot.id]) out[slot.id] = current[slot.id]; continue }
    const fits = slot.colours.filter(k => fitsGenre(k, options.genre ?? null))
    const useColour = fits.length > 0 && (palette.length === 0 || NATURAL.test(slot.name) || rng() < 0.7)
    let choice: SlotChoice | null = null
    if (useColour) choice = { src: 'colour', id: pick(fits, rng).id }
    else if (palette.length > 0) choice = { src: 'swatch', id: pick(palette, rng).id, l: Math.round(slot.lMin + (slot.lMax - slot.lMin) * (0.25 + 0.5 * rng())) }
    if (!choice) continue
    if (options.extreme) {
      choice = { ...choice, l: options.extreme === 'min' ? slot.lMin : slot.lMax }
      if (slot.aMax > slot.aMin) choice.a = options.extreme === 'min' ? slot.aMin : slot.aMax
    }
    out[slot.id] = choice
  }
  return out
}
