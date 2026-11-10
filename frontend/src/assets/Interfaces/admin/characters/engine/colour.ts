import type { ModelBlend, ModelColour, ModelContent, ModelGenre, ModelGradDir, ModelHsl, ModelObject, ModelShape, ModelSlot, ModelSwatch, ModelTintKind } from '../../../../../api/types'
import { fromHsl, mix, shade, toHsl } from '../../../writer/characters/portrait/colour'
import { NAME_MAX, SWATCH_NAME_MAX, shapeById, type MakeId, randomId } from '../modelContent'
import { freshFormId } from './formEdit'
import { axesOf, chosenForm, type Choices } from './forms'
import { LIMITS } from './limits'
import { isPaintProp, PROPS, type PropKey } from './props'
import { done, fail, type Edit } from './rigEdit'
import { amount, valueOf, type Values } from './rig'
import { standardGenres, standardSlots, starterPalette } from './standardColours'

// Colour. A shape is painted from a colour SLOT (Skin, Hair, Eye...), or has a fixed gray, or neither (the neutral gray every uncoloured model is drawn in). A slot
// holds the admin's default colours and how bright and how opaque a colour in it may be. What a character wears is a choice per slot: a default colour, or a swatch
// of its palette (hue and saturation from the swatch, brightness inside the slot's range). The designer works on a test character whose choices are never saved;
// no choice at all is gray, so a model as saved is a plain grayscale figure. Everything here is pure.

// The choice made for one slot: a default colour of the slot (`colour`) or a swatch of the palette (`swatch`), and optionally the brightness (`l`) and opacity (`a`),
// 0..100, it is set to inside the slot's range.
export interface SlotChoice { src: 'colour' | 'swatch'; id: string; l?: number; a?: number }
export type SlotChoices = Record<string, SlotChoice>
// The palette in use and what is chosen from it: what colours a shape is drawn with. `forms` are the forms chosen on the test character: a form may change the
// paint of a shape (its slot, its tone), so they belong to the colouring.
// The parts of a slot's colour that objects hold (phase D3a): object id to slot id to the lock. A locked hue, saturation or lightness keeps its value whatever colour is
// chosen for the slot; a free part comes from the colour chosen.
export type HslLocks = Record<string, Record<string, ModelHsl>>
// `values` are the slider values: an authored field (phase D3c) may shift the colour of a shape or the second colour of its gradient, or change how far the gradient reaches.
export interface Colouring { palette: ModelSwatch[]; choices: SlotChoices; forms?: Choices; locks?: HslLocks; values?: Values }
export interface ResolvedColour { h: number; s: number; l: number; a: number; css: string }
export interface Paint { fill: string; opacity: number }
// Everything a shape is painted with (phase 4b): the fill (the colour with its tone and any derived tone), a gradient to another colour, how it blends with what is
// under it, the shapes it is kept inside (`clip`) and that cut a hole in it (`cuts`), whether it is a shading shape (kept inside the base shapes of its object) and
// whether it is a helper (never drawn). `clip` and `cuts` name shapes of this shape's own side: a twin's refer to the twins of what its original's refer to.
export interface PaintLayer extends Paint {
  gradient: { dir: ModelGradDir; end: string; reach?: number; angle?: number } | null
  blend: ModelBlend | null
  clip: string | null
  cuts: string[]
  shading: boolean
  helper: boolean
}

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

// Whether a choice names a colour (or a swatch) that is there.
const choiceValid = (slot: ModelSlot, choice: SlotChoice | undefined, palette: ModelSwatch[]): boolean =>
  !!choice && (choice.src === 'colour' ? !!colourById(slot, choice.id) : palette.some(p => p.id === choice.id))

// The same with the parts an object holds: each locked part replaces the part of the chosen colour (the lightness inside the slot's range). A slot with no colour chosen
// stays gray, whatever is locked: the model as saved is a gray figure, and colour comes from a choice.
export function resolveLocked(slot: ModelSlot, choice: SlotChoice | undefined, palette: ModelSwatch[], lock: ModelHsl | undefined): ResolvedColour {
  const r = resolveColour(slot, choice, palette)
  if (!lock || (lock.h === null && lock.s === null && lock.l === null) || !choiceValid(slot, choice, palette)) return r
  const h = lock.h ?? r.h, sat = lock.s ?? r.s, l = clamp(lock.l ?? r.l, slot.lMin, slot.lMax)
  return { h, s: sat, l, a: r.a, css: hslHex(h, sat, l) }
}

// ---- tones: a shadow, a mid tone, a highlight, and a step lighter or darker (the old portrait engine's arithmetic) ----

// A tone of a colour: a shadow is the portrait's shade, a mid tone half of it, a highlight a mix with white.
export const toneHex = (hex: string, kind: ModelTintKind, t: number): string => (kind === 'shadow' ? shade(hex, t) : kind === 'mid' ? shade(hex, t * 0.5) : mix(hex, '#ffffff', t))
// A step lighter (+) or darker (-) than a colour: lightness + 9 or - 12 per step, held to 2..98.
export function toneShift(hex: string, steps: number): string {
  if (!steps) return hex
  const [h, s, l] = hexHsl(hex)
  return hslHex(h, s, clamp(l + (steps > 0 ? 9 : -12) * Math.abs(steps), 2, 98))
}

// ---- where a shape gets its paint ----

// What the paint walk needs to know about a model, found once per content (content is never changed in place).
interface PaintIndex { shapes: Map<string, ModelShape>; owner: Map<string, ModelObject>; twin: Map<string, string>; copies: Map<string, string> }
const indexes = new WeakMap<ModelContent, PaintIndex>()
function paintIndex(c: ModelContent): PaintIndex {
  const found = indexes.get(c)
  if (found) return found
  const shapes = new Map(c.shapes.map(s => [s.id, s])), owner = new Map<string, ModelObject>()
  for (const o of c.objects) for (const id of o.shapes) if (!owner.has(id)) owner.set(id, o)
  // an original's twin, and the shape a member has for each shape of its template
  const twin = new Map<string, string>(), copies = new Map<string, string>()
  for (const s of c.shapes) {
    if (s.mirrorOf && !twin.has(s.mirrorOf)) twin.set(s.mirrorOf, s.id)
    const member = s.copyOf ? owner.get(s.id) : undefined
    if (s.copyOf && member) copies.set(`${s.copyOf}|${member.id}`, s.id)
  }
  const made = { shapes, owner, twin, copies }
  indexes.set(c, made)
  return made
}

// One step from a shape to the shape whose paint it takes: a twin follows its original, a shape of a class member the template's shape (under the member's choice).
interface Hop { kind: 'twin' | 'copy'; member?: string }
export interface PaintOrigin { shape: ModelShape; hops: Hop[] }

// The shape whose paint fields a shape uses: itself when it has a slot or a fixed gray of its own (or nothing to follow), else the shape it copies, and so on.
export function paintOrigin(c: ModelContent, shape: ModelShape): PaintOrigin {
  const ix = paintIndex(c), hops: Hop[] = []
  let cur = shape
  while (hops.length < 4 && !cur.slot && (cur.gray === null || cur.gray === undefined)) {
    const from = cur.mirrorOf ?? cur.copyOf, next = from ? ix.shapes.get(from) : undefined
    if (!next) break
    const home = ix.owner.get(cur.id)
    hops.push(cur.mirrorOf ? { kind: 'twin' } : { kind: 'copy', member: home?.classOf ? home.id : undefined })
    cur = next
  }
  return { shape: cur, hops }
}

// A shape named from the origin's side, as it is on the painted shape's side: through a twin, the twin of what it names (or the original, if it names a twin; a
// shape on the middle line, with no twin, stays); through a member, the member's own shape for it.
function mapRef(ix: PaintIndex, hops: Hop[], id: string): string {
  let t = id
  for (let i = hops.length - 1; i >= 0; i--) {
    const h = hops[i]
    if (h.kind === 'twin') t = ix.twin.get(t) ?? ix.shapes.get(t)?.mirrorOf ?? t
    else if (h.member) t = ix.copies.get(`${t}|${h.member}`) ?? t
  }
  return t
}

// The look the chosen forms give a shape's paint: the first axis (in order) of the origin's object whose chosen form has one for it wins. A shape of a class member
// takes the template's forms under the member's own choice.
function lookFor(ix: PaintIndex, origin: PaintOrigin, forms: Choices) {
  const home = ix.owner.get(origin.shape.id)
  if (!home) return undefined
  const via = [...origin.hops].reverse().find(h => h.kind === 'copy')
  for (const axis of axesOf(home)) {
    const look = chosenForm(home, axis, forms, via?.member ?? home.id)?.looks?.find(l => l.shape === origin.shape.id)
    if (look) return look
  }
  return undefined
}

// The paint fields a shape would carry if it stood on its own: used when a twin or a member stops following (the pair is broken, the member detached).
export function bakedPaint(c: ModelContent, shape: ModelShape): Pick<ModelShape, 'slot' | 'gray' | 'tone' | 'derive' | 'shade' | 'grad' | 'blend' | 'clip' | 'cut' | 'helper'> {
  const ix = paintIndex(c), origin = paintOrigin(c, shape), o = origin.shape
  const slot = o.slot ?? null
  return {
    slot, gray: slot ? null : o.gray ?? null, tone: o.tone ?? 0, derive: o.derive ?? null, shade: o.shade ?? null, grad: o.grad ?? null, blend: o.blend ?? null,
    clip: o.clip ? mapRef(ix, origin.hops, o.clip) : null, cut: (o.cut ?? []).map(t => mapRef(ix, origin.hops, t)), helper: o.helper === true,
  }
}

// Where a shape gets its colour: its own slot, else its own fixed gray, else (a twin, a shape that follows the template's) the shape it copies.
export function paintSource(c: ModelContent, shape: ModelShape, depth = 0): { slot: ModelSlot | null; gray: number | null } {
  if (shape.slot) return { slot: slotById(c, shape.slot) ?? null, gray: null }
  if (shape.gray !== null && shape.gray !== undefined) return { slot: null, gray: shape.gray }
  const from = shape.mirrorOf ?? shape.copyOf
  const next = from && depth < 4 ? shapeById(c, from) : undefined
  return next ? paintSource(c, next, depth + 1) : { slot: null, gray: null }
}

// ---- authored fields that change paint (phase D3c) ----

// What the fields that fade, shift or reshape the paint of a shape come to: the shifts of hue (degrees), saturation and lightness (points) of its colour and of the second colour
// of its gradient, how far the gradient reaches and how much it blends (percent; 100 at rest) and how far a linear gradient is turned (degrees). A field of a whole shape counts
// for that shape (and for a twin or a member shape that follows it), a field of a whole object for every shape of that object.
export interface PaintShift { hue: number; sat: number; light: number; gradHue: number; gradSat: number; gradLight: number; reach: number; blend: number; dir: number; any: boolean }
const NO_SHIFT: PaintShift = { hue: 0, sat: 0, light: 0, gradHue: 0, gradSat: 0, gradLight: 0, reach: 100, blend: 100, dir: 0, any: false }

const paintFields = new WeakMap<ModelContent, boolean>()
const hasPaintFields = (c: ModelContent): boolean => {
  let found = paintFields.get(c)
  if (found === undefined) { found = c.ranges.some(r => r.drives.some(d => d.kind === 'prop' && isPaintProp(d.prop))); paintFields.set(c, found) }
  return found
}

function paintShift(c: ModelContent, values: Values | undefined, ix: PaintIndex, shapeIds: string[]): PaintShift {
  if (!values || !hasPaintFields(c)) return NO_SHIFT
  const shapes = new Set(shapeIds), objects = new Set<string>()
  for (const id of shapeIds) { const o = ix.owner.get(id); if (o) { objects.add(o.id); if (o.mirrorOf) objects.add(o.mirrorOf) } }
  const out = { ...NO_SHIFT }
  for (const r of c.ranges) {
    for (const d of r.drives) {
      if (d.kind !== 'prop' || !isPaintProp(d.prop)) continue
      if (!((d.feature === 'shape' && d.shape && shapes.has(d.shape)) || (d.feature === 'object' && d.id && objects.has(d.id)))) continue
      const spec = PROPS[d.prop as PropKey], a = amount(r, d, valueOf(r, values), spec.rest) - spec.rest
      if (Math.abs(a) < 1e-9) continue
      out.any = true
      if (d.prop === 'fillHue') out.hue += a
      else if (d.prop === 'fillSat') out.sat += a
      else if (d.prop === 'fillLight') out.light += a
      else if (d.prop === 'gradHue') out.gradHue += a
      else if (d.prop === 'gradSat') out.gradSat += a
      else if (d.prop === 'gradLight') out.gradLight += a
      else if (d.prop === 'gradReach') out.reach += a
      else if (d.prop === 'gradBlend') out.blend += a
      else if (d.prop === 'gradDir') out.dir += a
    }
  }
  out.reach = clamp(out.reach, 0, 200); out.blend = clamp(out.blend, 0, 100)
  return out
}

// A colour with its hue turned and its saturation and lightness moved, the lightness held inside a slot's brightness range (a colour already outside it is not pushed further out).
export function shiftColour(hex: string, hue: number, sat: number, light: number, slot?: Pick<ModelSlot, 'lMin' | 'lMax'> | null): string {
  if (!hue && !sat && !light) return hex
  const [h, s, l] = hexHsl(hex), lo = Math.min(slot?.lMin ?? 0, l), hi = Math.max(slot?.lMax ?? 100, l)
  return hslHex(h + hue, clamp(s + sat, 0, 100), clamp(l + light, lo, hi))
}

// Everything a shape is painted with. The paint fields (tone, derived tone, shading, gradient, blend, clip, cut-outs, helper) come from the shape the paint walk ends
// at, whose slot or fixed gray is the one used; the forms the colouring chooses may change that shape's slot, gray and tone.
export function paintLayer(c: ModelContent, colouring: Colouring, shape: ModelShape): PaintLayer {
  const ix = paintIndex(c), origin = paintOrigin(c, shape), o = origin.shape
  const forms = colouring.forms ?? {}
  const look = Object.keys(forms).length > 0 ? lookFor(ix, origin, forms) : undefined
  let slot: ModelSlot | null, gray: number | null
  if (look?.slot) { slot = slotById(c, look.slot) ?? null; gray = null }
  else if (look && look.gray !== null && look.gray !== undefined) { slot = null; gray = look.gray }
  else if (o.slot) { slot = slotById(c, o.slot) ?? null; gray = null }
  else { slot = null; gray = o.gray ?? null }
  const tone = look?.tone ?? o.tone ?? 0
  // the parts of the colour the shape's own object holds
  const held = colouring.locks?.[ix.owner.get(shape.id)?.id ?? '']
  let css: string, alpha = 1
  if (slot) {
    const r = resolveLocked(slot, colouring.choices[slot.id], colouring.palette, held?.[slot.id])
    css = r.css; alpha = r.a
  } else css = grayHex(gray ?? NEUTRAL_GRAY)
  // authored fields may shift the colour itself (after the parts an object holds), and shape what the gradient does
  const shift = paintShift(c, colouring.values, ix, shape.id === o.id ? [o.id] : [shape.id, o.id])
  if (shift.any) css = shiftColour(css, shift.hue, shift.sat, shift.light, slot)
  // a shading shape is a tone of its slot's colour; any other shape is the colour a step lighter or darker, and perhaps a tone of that
  const shading = !!o.shade
  let fill = o.shade ? toneHex(css, o.shade.kind, o.shade.t) : toneShift(css, tone)
  if (!o.shade && o.derive) fill = toneHex(fill, o.derive.kind, o.derive.t)
  let gradient: PaintLayer['gradient'] = null
  if (o.grad && !shading) {
    const to = o.grad.to ? slotById(c, o.grad.to) : undefined
    let end = to ? resolveLocked(to, colouring.choices[to.id], colouring.palette, held?.[to.id]).css : toneShift(fill, -1)
    end = shiftColour(end, shift.gradHue, shift.gradSat, shift.gradLight, to)
    if (shift.blend < 100) end = mix(fill, end, shift.blend / 100)
    gradient = { dir: o.grad.dir, end, ...(shift.reach !== 100 ? { reach: shift.reach } : {}), ...(shift.dir !== 0 && o.grad.dir !== 'radial' ? { angle: shift.dir } : {}) }
  }
  const clip = o.clip ? mapRef(ix, origin.hops, o.clip) : null
  const cuts = [...new Set((o.cut ?? []).map(t => mapRef(ix, origin.hops, t)))].filter(t => t !== shape.id)
  return { fill, opacity: slot ? round2(shape.op * alpha) : shape.op, gradient, blend: o.blend ?? null, clip: clip === shape.id ? null : clip, cuts, shading, helper: o.helper === true }
}

// The fill and opacity a shape is drawn with: its shape's own opacity times the opacity the colour has.
export function paintOf(c: ModelContent, colouring: Colouring, shape: ModelShape): Paint {
  const { fill, opacity } = paintLayer(c, colouring, shape)
  return { fill, opacity }
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

// A record without one key (the same record when the key is not there).
const without = <V,>(rec: Record<string, V> | undefined, key: string): Record<string, V> | undefined => {
  if (!rec || !(key in rec)) return rec
  const { [key]: _gone, ...rest } = rec
  return rest
}

// A slot goes: the shapes painted from it are left with no slot (gray), and no object, style or variant keeps a lock or a pick for it.
export function removeSlot(c: ModelContent, id: string): Edit {
  if (!slotById(c, id)) return fail('There is no such colour slot.')
  return done({
    ...c, slots: slotsOf(c).filter(s => s.id !== id),
    ...(c.presets ? { presets: c.presets.map(p => (p.hsl?.[id] || p.picks?.[id] ? { ...p, hsl: without(p.hsl, id), picks: without(p.picks, id) } : p)) } : {}),
    shapes: c.shapes.map(s => (s.slot === id || s.grad?.to === id ? { ...s, slot: s.slot === id ? null : s.slot, grad: s.grad?.to === id ? { ...s.grad, to: null } : s.grad } : s)),
    objects: c.objects.map(o => {
      const unlocked = o.hsl?.[id] ? { ...o, hsl: without(o.hsl, id) } : o
      return (o.axes ?? []).some(a => a.options.some(f => (f.looks ?? []).some(l => l.slot === id)))
        ? { ...unlocked, axes: (o.axes ?? []).map(a => ({ ...a, options: a.options.map(f => ({ ...f, looks: (f.looks ?? []).flatMap(l => (l.slot !== id ? [l] : l.tone != null ? [{ ...l, slot: null }] : [])) })) })) } : unlocked
    }),
  })
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
// A default colour goes: a variant that picked it picks nothing for the slot any more.
export const removeColour = (c: ModelContent, slotId: string, id: string): ModelContent => {
  const next = mapSlot(c, slotId, s => ({ ...s, colours: s.colours.filter(k => k.id !== id) }))
  return next.presets?.some(p => p.picks?.[slotId] === id) ? { ...next, presets: next.presets.map(p => (p.picks?.[slotId] === id ? { ...p, picks: without(p.picks, slotId) } : p)) } : next
}

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
