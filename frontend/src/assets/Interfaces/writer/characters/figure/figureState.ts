import type { CharacterFigure, FigureColour, ModelContent, ModelFrame, ModelPreset, ModelRange, ModelSlot } from '../../../../../api/types'
import { colourById, paletteOf, rollChoices, slotById, slotsOf, type Colouring, type Rng, type SlotChoice, type SlotChoices } from '../../../admin/characters/engine/colour'
import { axesFor, chosenForm, classesOf, membersOf, presetsOf, shownMember, type Choices } from '../../../admin/characters/engine/forms'
import { framesOf, hiddenThrough, tileOf, viewBoxOf } from '../../../admin/characters/engine/frames'
import type { Box } from '../../../admin/characters/engine/geometry'
import { activeLocks } from '../../../admin/characters/engine/locks'
import { drawable, paintShapes, type PaintItem } from '../../../admin/characters/engine/paint'
import { applyPreset, isOn, type TestState } from '../../../admin/characters/engine/presets'
import { defaultValues, solve, type Solved, type Values, type View } from '../../../admin/characters/engine/rig'
import { lockedSlots, lockedThings, rollLook } from '../../../admin/characters/engine/roll'
import { TILE_DEFAULT } from '../../../admin/characters/modelContent'
import { colourName, type ColourKind } from '../describe'

// The figure of a character (the art mannequin, phase 6), as the writer's side reads it. Pure: a model copy plus the writer's choices give the sliders the model is solved
// at, the colouring, the crop and the shapes to paint; nothing here touches the DOM. The admin's engine (admin/characters/engine) does the drawing, so a figure looks the
// same here as in the designer's previews. The server repairs what is stored; this file also copes with what it does not know (a value, a form or a colour the copy
// does not have is ignored, never an error).

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const r2 = (v: number): number => Math.round(v * 100) / 100
const KEY = /^[0-9a-f]{12}$/
const HEX = /^#[0-9a-f]{6}$/i
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// ---- the figure itself ----

// A figure on a model copy with nothing chosen: every slider at rest, the model's own forms and colours, the model's card colour.
export function blankFigure(modelKey: string, copy: ModelContent): CharacterFigure {
  return { model: modelKey, values: {}, forms: {}, hidden: [], colours: {}, palette: null, tile: tileOf(copy), fall: 'down', locks: [], zoff: {}, mine: [], genre: null, on: [], order: {} }
}

// A figure as a file or an older answer gives it, with what is missing filled in (null when it does not point at a model copy). The server is the authority on ranges.
export function normalizeFigure(raw: unknown): CharacterFigure | null {
  if (!isRecord(raw) || typeof raw.model !== 'string' || !KEY.test(raw.model)) return null
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  const map = <T,>(v: unknown): Record<string, T> => (isRecord(v) ? (v as Record<string, T>) : {})
  return {
    model: raw.model,
    values: map<number>(raw.values), forms: map<string>(raw.forms), hidden: list<string>(raw.hidden), colours: map<FigureColour>(raw.colours),
    palette: Array.isArray(raw.palette) ? (raw.palette as CharacterFigure['palette']) : null,
    tile: typeof raw.tile === 'string' && HEX.test(raw.tile) ? raw.tile.toLowerCase() : TILE_DEFAULT,
    fall: raw.fall === 'left' || raw.fall === 'right' || raw.fall === 'behind' ? raw.fall : 'down',
    locks: list<string>(raw.locks), zoff: map<number>(raw.zoff), mine: list<ModelPreset>(raw.mine), genre: typeof raw.genre === 'string' && raw.genre ? raw.genre : null,
    on: list<string>(raw.on), order: map<string[]>(raw.order),
  }
}

// A figure kept as it is (a story state captures one): nothing in it is shared with the figure it was copied from.
export const copyFigure = (f: CharacterFigure): CharacterFigure => JSON.parse(JSON.stringify(f)) as CharacterFigure

// ---- sliders ----

// The span a writer may choose within: the slider's limit, else its whole range, always holding the resting value.
export function spanOf(r: ModelRange): [number, number] {
  const [lo, hi] = r.limit ?? [r.min, r.max]
  return [clamp(Math.min(lo, hi, r.rest), r.min, r.max), clamp(Math.max(lo, hi, r.rest), r.min, r.max)]
}
export const clampToSpan = (r: ModelRange, v: number): number => {
  const [lo, hi] = spanOf(r)
  return clamp(Number.isFinite(v) ? v : r.rest, lo, hi)
}
// The sliders the model shows to writers.
export const writerRanges = (copy: ModelContent): ModelRange[] => copy.ranges.filter(r => r.show)

// Every slider of the model at the value the figure gives it (rest where it gives none), held to the span a writer may choose within.
export function valuesOf(copy: ModelContent, figure: CharacterFigure): Values {
  const out = defaultValues(copy)
  for (const r of copy.ranges) {
    const v = figure.values[r.id]
    if (typeof v === 'number' && Number.isFinite(v)) out[r.id] = clampToSpan(r, v)
  }
  return out
}

// The figure with one slider set (held to its span); a slider back at rest is no longer kept.
export function setValue(copy: ModelContent, figure: CharacterFigure, rangeId: string, value: number): CharacterFigure {
  const r = copy.ranges.find(x => x.id === rangeId)
  if (!r) return figure
  const v = r2(clampToSpan(r, value))
  const values = { ...figure.values }
  if (Math.abs(v - r.rest) < 1e-6) delete values[rangeId]
  else values[rangeId] = v
  return { ...figure, values }
}

// ---- colour ----

// The colours a figure has chosen for the slots the copy has.
function choicesOf(copy: ModelContent, figure: CharacterFigure): SlotChoices {
  const choices: SlotChoices = {}
  for (const [slot, c] of Object.entries(figure.colours ?? {})) {
    if (!c || !slotById(copy, slot)) continue
    const choice: SlotChoice = { src: c.src === 'swatch' ? 'swatch' : 'colour', id: c.id }
    if (typeof c.l === 'number') choice.l = c.l
    if (typeof c.a === 'number') choice.a = c.a
    choices[slot] = choice
  }
  return choices
}

// The colouring of a figure, with the parts of a colour the model locks (an object's own, and those of the styles that are on): a locked hue, saturation or lightness replaces
// that part of whatever colour is chosen, so the figure keeps it whatever the palette or a roll gives.
export function colouringOf(copy: ModelContent, figure: CharacterFigure): Colouring {
  const choices = choicesOf(copy, figure)
  const values = valuesOf(copy, figure)
  const locks = activeLocks(copy, { values, forms: { ...figure.forms }, hidden: [...figure.hidden], fall: figure.fall, colours: choices, on: [...(figure.on ?? [])], order: { ...(figure.order ?? {}) } })
  return { palette: figure.palette ?? paletteOf(copy), choices, forms: figure.forms ?? {}, values, ...(Object.keys(locks).length > 0 ? { locks } : {}) }
}
export const coloursFrom = (choices: SlotChoices): Record<string, FigureColour> => {
  const out: Record<string, FigureColour> = {}
  for (const [slot, c] of Object.entries(choices)) out[slot] = { src: c.src, id: c.id, ...(c.l !== undefined ? { l: c.l } : {}), ...(c.a !== undefined ? { a: c.a } : {}) }
  return out
}

// ---- the picture ----

// What a figure is looked at through: the whole figure, the head (the smallest of the model's frames with Face or Head in its name, else the top of the figure), the bust (the
// smallest frame named Bust, Shoulders or Portrait, else the head: what a small card shows, as a portrait shows head and shoulders) or one of the model's frames.
export type Crop = 'figure' | 'head' | 'bust' | { frame: string }

const smallest = (frames: ModelFrame[]): ModelFrame | undefined => [...frames].sort((a, b) => a.w * a.h - b.w * b.h)[0]
export const frameFor = (copy: ModelContent, crop: Crop): ModelFrame | undefined => {
  if (crop === 'figure') return undefined
  if (crop === 'head') return smallest(framesOf(copy).filter(f => /face|head/i.test(f.name)))
  if (crop === 'bust') return smallest(framesOf(copy).filter(f => /bust|shoulder|portrait/i.test(f.name))) ?? frameFor(copy, 'head')
  return framesOf(copy).find(f => f.id === crop.frame)
}

// The box the whole figure takes at rest (the same for every figure of a copy, so cards of one model line up), with a margin.
const restBoxes = new WeakMap<ModelContent, Partial<Record<View, Box>>>()
export function restBox(copy: ModelContent, view: View = 'front'): Box {
  const held = restBoxes.get(copy) ?? {}
  if (held[view]) return held[view]!
  const solved = solve(copy, defaultValues(copy), view)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const id of solved.order) {
    const b = solved.shapes[id]?.box
    if (!b || !solved.shapes[id].visible) continue
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
  }
  const pad = 4
  const box: Box = Number.isFinite(x0) ? { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad } : { x: 0, y: 0, w: 200, h: 400 }
  restBoxes.set(copy, { ...held, [view]: box })
  return box
}

// The box a crop shows: the frame's (turned about the axis in the back view), else the figure's, or for a head without a frame the top of the figure as wide as it is.
export function cropBox(copy: ModelContent, crop: Crop, view: View = 'front'): Box {
  const frame = frameFor(copy, crop)
  if (frame) return viewBoxOf(frame, view, copy.axis ?? 100)
  const whole = restBox(copy, view)
  return crop === 'head' || crop === 'bust' ? { x: whole.x, y: whole.y, w: whole.w, h: Math.min(whole.h, whole.w) } : whole
}

// The same box grown to a square about its middle (the tile of a small card is square).
export function squareBox(b: Box): Box {
  const side = Math.max(b.w, b.h)
  return { x: b.x - (side - b.w) / 2, y: b.y - (side - b.h) / 2, w: side, h: side }
}

export interface FigureDrawing { box: Box; items: PaintItem[]; tile: string }

// The figure solved the way it is drawn through a crop (what the editor reads where each part lies from).
export function solveFigure(copy: ModelContent, figure: CharacterFigure, crop: Crop = 'figure', view: View = 'front'): Solved {
  const frame = frameFor(copy, crop)
  return solve(copy, valuesOf(copy, figure), view, {
    forms: figure.forms, hidden: hiddenThrough(frame, figure.hidden), fall: figure.fall,
    ...(figure.order && Object.keys(figure.order).length > 0 ? { order: figure.order } : {}), ...(figure.zoff && Object.keys(figure.zoff).length > 0 ? { zoff: figure.zoff } : {}),
  })
}

// A figure drawn through a crop: the shapes to paint (back to front, no helpers) and the box to look at. Remembered for the figure object and the copy it was drawn from
// (a figure is replaced when it changes, never changed in place), so a cast list draws each card once.
const drawn = new WeakMap<ModelContent, WeakMap<CharacterFigure, Map<string, FigureDrawing>>>()
export function drawFigure(copy: ModelContent, figure: CharacterFigure, crop: Crop = 'figure', view: View = 'front', square = true): FigureDrawing {
  let byFigure = drawn.get(copy)
  if (!byFigure) { byFigure = new WeakMap(); drawn.set(copy, byFigure) }
  let byKey = byFigure.get(figure)
  if (!byKey) { byKey = new Map(); byFigure.set(figure, byKey) }
  const key = `${typeof crop === 'string' ? crop : crop.frame}|${view}|${square ? 1 : 0}`
  const hit = byKey.get(key)
  if (hit) return hit
  const items = drawable(paintShapes(copy, solveFigure(copy, figure, crop, view), colouringOf(copy, figure)))
  const box = cropBox(copy, crop, view)
  const made: FigureDrawing = { box: square ? squareBox(box) : box, items, tile: HEX.test(figure.tile) ? figure.tile : tileOf(copy) }
  byKey.set(key, made)
  return made
}

// ---- the test state the admin's engine works with ----

// (the default colours a variant picks are part of it: an age that picks a hair colour is on when the figure has that colour)
export const testOf = (copy: ModelContent, figure: CharacterFigure): TestState => ({
  values: valuesOf(copy, figure), forms: { ...figure.forms }, hidden: [...figure.hidden], fall: figure.fall, colours: choicesOf(copy, figure), on: [...(figure.on ?? [])], order: { ...(figure.order ?? {}) },
})

// What may be switched off: objects and groups, and (for a style of their object, or a fill pattern the writer turns off) shapes and patterns.
const known = (copy: ModelContent): Set<string> => new Set([...copy.objects.map(o => o.id), ...copy.groups.map(g => g.id), ...copy.shapes.map(s => s.id), ...(copy.patterns ?? []).map(p => p.id)])

// The figure with the sliders, forms, worn things, fall side and colours of a test state (what a preset or a roll gives); the rest of the figure stays as it was.
export function withTest(copy: ModelContent, figure: CharacterFigure, state: TestState): CharacterFigure {
  const values: Record<string, number> = {}
  for (const r of copy.ranges) {
    const v = r2(clampToSpan(r, state.values[r.id] ?? r.rest))
    if (Math.abs(v - r.rest) >= 1e-6) values[r.id] = v
  }
  const things = known(copy)
  const presets = new Set(presetsOf(copy).map(p => p.id))
  const order: Record<string, string[]> = {}
  for (const [objectId, ids] of Object.entries(state.order ?? {})) if (ids.length > 0 && copy.objects.some(o => o.id === objectId)) order[objectId] = [...ids]
  return {
    ...figure, values, forms: { ...state.forms }, hidden: [...new Set(state.hidden.filter(h => things.has(h)))], fall: state.fall ?? 'down', colours: coloursFrom(state.colours ?? {}),
    on: [...new Set((state.on ?? []).filter(id => presets.has(id)))], order,
  }
}

// ---- age ----

// The ages the model offers: its presets of the kind "Age" that are not scoped to one object (Infant, Child, Teen, Adult, Elder...), in the model's order.
export const agePresets = (copy: ModelContent): ModelPreset[] => presetsOf(copy).filter(p => !p.scope && p.kind.trim().toLowerCase() === 'age')

// The age preset the figure is at now (none when it is at none of them).
export function ageOf(copy: ModelContent, figure: CharacterFigure): ModelPreset | undefined {
  const state = testOf(copy, figure)
  return agePresets(copy).find(p => isOn(copy, state, p))
}

// The figure at another age: the preset is applied over the figure's own choices (an age only moves what the kind controls; the colours, the palette and the card stay).
export function atAge(copy: ModelContent, figure: CharacterFigure, presetId: string): CharacterFigure {
  const preset = agePresets(copy).find(p => p.id === presetId)
  return preset ? withTest(copy, figure, applyPreset(copy, testOf(copy, figure), preset)) : figure
}

// ---- Randomise ----

// Whether something a lock covers is touched by this: an object or group that is locked, or a shape inside a locked object.
function coveredByLock(copy: ModelContent, locked: ReturnType<typeof lockedThings>, id: string | null | undefined): boolean {
  if (!id) return false
  if (locked.groups.has(id) || locked.objects.has(id)) return true
  return copy.objects.some(o => locked.objects.has(o.id) && o.shapes.includes(id))
}

const touchesLock = (copy: ModelContent, locked: ReturnType<typeof lockedThings>, p: ModelPreset): boolean => {
  if (coveredByLock(copy, locked, p.scope)) return true
  if (Object.keys(p.values).some(rid => coveredByLock(copy, locked, copy.ranges.find(r => r.id === rid)?.scope))) return true
  if (Object.keys(p.forms ?? {}).some(key => coveredByLock(copy, locked, key.startsWith('class:') ? null : key.split('.')[0]))) return true
  // a variant that turns on the style of a locked object, or picks the colour of a slot a locked object is painted from
  if (Object.keys(p.styles ?? {}).some(objectId => coveredByLock(copy, locked, objectId))) return true
  const held = lockedSlots(copy, locked.objects)
  return Object.keys(p.picks ?? {}).some(slotId => held.has(slotId))
}

// A new random look inside the genre the figure is set to: a form on every axis and the member of every family, a colour for every slot, a value for every slider the writer
// may move (from the slider's own random span, else the span it may be moved within), and, 60% of the time per kind, one preset that only moves sliders and forms (a preset
// that takes clothes off is never drawn: what is worn is the writer's choice). Everything the figure locks stays as it is. The palette and the card colour never change.
export function rollFigure(copy: ModelContent, figure: CharacterFigure, rng: Rng): CharacterFigure {
  const locked = lockedThings(copy, figure.locks)
  const start = colouringOf(copy, figure)
  const look = rollLook(copy, rng, { genre: figure.genre, locks: figure.locks, forms: start.forms ?? {}, choices: start.choices, palette: start.palette, fall: figure.fall })
  const values = valuesOf(copy, figure)
  for (const r of writerRanges(copy)) {
    if (coveredByLock(copy, locked, r.scope)) continue
    const [lo, hi] = r.rand ?? spanOf(r)
    values[r.id] = r2(clampToSpan(r, lo + (hi - lo) * ((rng() + rng() + rng()) / 3)))
  }
  let state: TestState = { values, forms: look.forms, hidden: [...figure.hidden], fall: look.fall, colours: look.choices, on: [...(figure.on ?? [])], order: { ...(figure.order ?? {}) } }
  // A kind of preset that takes something off anywhere (Outfit) is the writer's to choose: applying one of its other presets would put back what they took off.
  const slotKey = (p: ModelPreset) => `${p.kind.trim().toLowerCase()}|${p.scope ?? ''}`
  const dressing = new Set(presetsOf(copy).filter(p => p.hidden.length > 0).map(slotKey))
  const slots = new Map<string, ModelPreset[]>()
  for (const p of presetsOf(copy)) slots.set(slotKey(p), [...(slots.get(slotKey(p)) ?? []), p])
  // Applying one preset of a kind first puts back everything any preset of the kind controls, so a kind with a preset that touches something locked is left alone as a whole.
  for (const [key, list] of slots) {
    if (dressing.has(key) || list.some(p => touchesLock(copy, locked, p))) continue
    if (rng() < 0.6) state = applyPreset(copy, state, list[Math.min(list.length - 1, Math.floor(rng() * list.length))])
  }
  return withTest(copy, figure, state)
}

// ---- words ----

// The name of a default colour: the one the model gives it, else a word for the colour itself (the standard colours have none) as the slot's kind of thing.
const kindOfSlot = (slot: ModelSlot): ColourKind => (/skin/i.test(slot.name) ? 'skin' : /hair/i.test(slot.name) ? 'hair' : /eye/i.test(slot.name) ? 'eye' : 'cloth')
function defaultColourName(slot: ModelSlot, id: string): string {
  const k = colourById(slot, id)
  return k ? k.name.trim() || colourName(k.hex, kindOfSlot(slot)) : ''
}

// What a figure is, as lines of a label and a value ("Age", "Adult"): the preset of each kind that is on, the form of each axis that is not the model's own, the member of
// each family, and the colour of each slot. The Compare view, the story and the words written from the look read these.
export function describeFigure(copy: ModelContent, figure: CharacterFigure): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const state = testOf(copy, figure)
  const kinds = new Map<string, string>()
  for (const p of presetsOf(copy)) if (!p.scope && !kinds.has(p.kind.trim().toLowerCase())) kinds.set(p.kind.trim().toLowerCase(), p.kind.trim())
  for (const [key, label] of kinds) {
    const on = presetsOf(copy).find(p => !p.scope && p.kind.trim().toLowerCase() === key && isOn(copy, state, p))
    if (on) out.push([label, on.name])
  }
  for (const o of copy.objects) {
    for (const axis of axesFor(copy, o)) {
      const form = chosenForm(o, axis, state.forms as Choices)
      if (form && form.id !== axis.initial) out.push([axis.name, form.name])
    }
  }
  for (const k of classesOf(copy)) {
    if (!k.exclusive || membersOf(copy, k.id).length === 0) continue
    const shown = shownMember(copy, k, state.forms as Choices)
    if (shown) out.push([k.name, shown.name])
  }
  const palette = figure.palette ?? paletteOf(copy)
  for (const slot of slotsOf(copy)) {
    const c = figure.colours?.[slot.id]
    if (!c) continue
    const name = c.src === 'swatch' ? palette.find(s => s.id === c.id)?.name : defaultColourName(slot, c.id)
    if (name) out.push([slot.name, name])
  }
  return out
}

// How two figures differ, as lines like the portrait's ("Age: Adult > Elder"); a line one of them has no counterpart for reads "none" on that side.
export function figureDiff(a: Array<[string, string]>, b: Array<[string, string]>): string[] {
  const from = new Map(a), to = new Map(b), lines: string[] = []
  for (const label of new Set([...from.keys(), ...to.keys()])) {
    const x = from.get(label) ?? 'none', y = to.get(label) ?? 'none'
    if (x !== y) lines.push(`${label}: ${x} > ${y}`)
  }
  return lines
}

// A figure as a plain sentence for a screen reader or a caption: "Age Adult, Build Broad, Skin Warm".
export const figureWords = (lines: Array<[string, string]>): string => lines.map(([label, value]) => `${label} ${value.toLowerCase()}`).join(', ')
