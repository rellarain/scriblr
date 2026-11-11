import type { CharacterFigure, FigureColour, ModelAxis, ModelClass, ModelContent, ModelFallSide, ModelFieldset, ModelFrame, ModelGroup, ModelHsl, ModelLayer, ModelObject, ModelPattern, ModelPreset, ModelRange, ModelSlot, ModelState } from '../../../../../api/types'
import { colourById, paletteOf, resolveLocked, slotsOf, type ResolvedColour, type Rng, type SlotChoice, type SlotChoices } from '../../../admin/characters/engine/colour'
import { fieldsOf, fieldsetsOf, isOffered } from '../../../admin/characters/engine/fields'
import { axesFor, chosenForm, classKey, classesOf, formKey, membersOf, presetsOf, shownMember } from '../../../admin/characters/engine/forms'
import { framesOf } from '../../../admin/characters/engine/frames'
import type { Box } from '../../../admin/characters/engine/geometry'
import { activeLocks, slotsUsedBy } from '../../../admin/characters/engine/locks'
import { applyPreset, isOn, scopeOf, type TestState } from '../../../admin/characters/engine/presets'
import { defaultValues, solve, type Solved } from '../../../admin/characters/engine/rig'
import { lockedSlots as slotsPaintedBy, lockedThings, rollLook } from '../../../admin/characters/engine/roll'
import { applyOption, chosenOption, statesOf } from '../../../admin/characters/engine/states'
import { clampToSpan, spanOf, testOf, withTest, writerRanges } from './figureState'

// What the writer's editor offers for a figure (phase 6b-2), as pure functions of the model copy and the figure: the regions of the card (the model's frames), where each part of
// the figure lies, what can be changed about the figure, a region's groups and an object, and each change as a new figure. The editor (FigureEditor.tsx) only draws and calls these.
// Everything the writer is offered is held to what the model shows to writers: a slider that is not shown is not offered, and one that is offered is held to the writer's span.

export const WHOLE = 'figure'
export const NONE = '__none'
const r2 = (v: number): number => Math.round(v * 100) / 100
const kindKey = (k: string): string => k.trim().toLowerCase()
const objectById = (c: ModelContent, id: string | null | undefined): ModelObject | undefined => (id ? c.objects.find(o => o.id === id) : undefined)

// ---- regions: the model's frames, and which of them each part lies in ----

export interface Region { id: string; name: string; frame: ModelFrame | null }
interface Placement { objects: Record<string, string>; groups: Record<string, string> }
const placements = new WeakMap<ModelContent, Placement>()

export function unionBox(boxes: Array<Box | null | undefined>): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of boxes) {
    if (!b || !(b.w > 0) || !(b.h > 0)) continue
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

// Each object and group goes to the smallest frame that holds the middle of it at rest (a group: of its objects, or its pivot); what no frame holds goes to the whole figure. The
// same for every figure of a copy, so a part does not change sheet as its sliders move.
function placementOf(copy: ModelContent): Placement {
  const held = placements.get(copy)
  if (held) return held
  const solved = solve(copy, defaultValues(copy), 'front')
  const frames = [...framesOf(copy)].sort((a, b) => a.w * a.h - b.w * b.h)
  const helpers = new Set(copy.shapes.filter(s => s.helper).map(s => s.id))
  const regionAt = (x: number, y: number): string => frames.find(f => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h)?.id ?? WHOLE
  const boxOfObject = (o: ModelObject): Box | null => unionBox(o.shapes.filter(id => !helpers.has(id)).map(id => solved.shapes[id]?.box))
  const placed: Placement = { objects: {}, groups: {} }
  const boxes: Record<string, Box | null> = {}
  for (const o of copy.objects) {
    const b = boxOfObject(o)
    boxes[o.id] = b
    placed.objects[o.id] = b ? regionAt(b.x + b.w / 2, b.y + b.h / 2) : WHOLE
  }
  for (const g of copy.groups) {
    const b = unionBox(g.objects.map(id => boxes[id]))
    const pivot = solved.pivots[g.id]
    placed.groups[g.id] = b ? regionAt(b.x + b.w / 2, b.y + b.h / 2) : pivot ? regionAt(pivot[0], pivot[1]) : WHOLE
  }
  placements.set(copy, placed)
  return placed
}

// The sheets of the card, outermost first (so a smaller one lies in front of a bigger one): the model's frames, with a sheet for the whole figure when something lies in none of
// them (and for a model that has no frames).
export function regionsOf(copy: ModelContent): Region[] {
  const placed = placementOf(copy)
  const frames = [...framesOf(copy)].sort((a, b) => b.w * b.h - a.w * a.h)
  const out: Region[] = frames.map(f => ({ id: f.id, name: f.name.trim() || 'Frame', frame: f }))
  const whole = frames.length === 0 || Object.values(placed.objects).includes(WHOLE) || Object.values(placed.groups).includes(WHOLE)
  return whole ? [{ id: WHOLE, name: 'Whole figure', frame: null }, ...out] : out
}
export const regionOfObject = (copy: ModelContent, objectId: string): string => placementOf(copy).objects[objectId] ?? WHOLE
export const regionOfGroup = (copy: ModelContent, groupId: string): string => placementOf(copy).groups[groupId] ?? WHOLE

// ---- the kinds of preset and the states a dropdown shows ----

export interface PresetKind { key: string; label: string; presets: ModelPreset[]; scoped: boolean; value: string }

// The presets of a scope (none: the model's own: ages, builds, outfits, poses...), a dropdown for each kind in the order the kinds first appear. `value` is the preset that is on
// (NONE for a scoped kind that is all at rest; '' for a look that is none of them, which the dropdown calls Custom).
export function kindsFor(copy: ModelContent, state: TestState, scope: string | null): PresetKind[] {
  const by = new Map<string, PresetKind>()
  for (const p of presetsOf(copy)) {
    if ((p.scope ?? null) !== scope) continue
    const key = kindKey(p.kind)
    if (!by.has(key)) by.set(key, { key, label: p.kind.trim() || 'Preset', presets: [], scoped: scope !== null, value: '' })
    by.get(key)!.presets.push(p)
  }
  return [...by.values()].map(k => {
    const on = k.presets.find(p => isOn(copy, state, p))
    const rest: ModelPreset = { id: NONE, name: 'None', kind: k.label, scope, values: {}, hidden: [] }
    return { ...k, value: on ? on.id : k.scoped && isOn(copy, state, rest) ? NONE : '' }
  })
}

// The figure with one preset of a kind chosen (NONE: the kind put back to rest). Only what the kind controls changes; the colours, the palette and the card stay.
export function chooseKind(copy: ModelContent, figure: CharacterFigure, kind: PresetKind, id: string): CharacterFigure {
  const state = testOf(copy, figure)
  if (id === NONE) {
    const scope = kind.presets[0]?.scope ?? null
    return withTest(copy, figure, applyPreset(copy, state, { id: NONE, name: 'None', kind: kind.label, scope, values: {}, hidden: [] }))
  }
  const p = kind.presets.find(x => x.id === id)
  return p ? withTest(copy, figure, applyPreset(copy, state, p)) : figure
}

export interface StateChoice { state: ModelState; value: string }
export const chooseOption = (copy: ModelContent, figure: CharacterFigure, groupId: string, stateId: string, optionId: string): CharacterFigure =>
  withTest(copy, figure, applyOption(copy, testOf(copy, figure), groupId, stateId, optionId))

// ---- fields and sliders ----

export interface FieldsetPart { set: ModelFieldset; ranges: ModelRange[] }
// The sliders that are fields of some fieldset: they are offered under their fieldset (while it is offered), never as plain sliders.
const fieldRanges = (copy: ModelContent): Set<string> => new Set(fieldsetsOf(copy).flatMap(f => f.ranges))

// Where a fieldset is offered: on its object or group, for a preset on the object or group the preset is scoped to, else on the figure itself.
function placeOfFieldset(copy: ModelContent, f: ModelFieldset): { kind: 'object' | 'group' | 'figure'; id: string } {
  if (f.ownerKind === 'object') return { kind: 'object', id: f.owner }
  if (f.ownerKind === 'group') return { kind: 'group', id: f.owner }
  const scope = presetsOf(copy).find(p => p.id === f.owner)?.scope
  if (scope && copy.objects.some(o => o.id === scope)) return { kind: 'object', id: scope }
  if (scope && copy.groups.some(g => g.id === scope)) return { kind: 'group', id: scope }
  return { kind: 'figure', id: '' }
}
function fieldsetsAt(copy: ModelContent, state: TestState, kind: 'object' | 'group' | 'figure', id: string): FieldsetPart[] {
  const out: FieldsetPart[] = []
  for (const set of fieldsetsOf(copy)) {
    const at = placeOfFieldset(copy, set)
    if (at.kind !== kind || at.id !== id || !isOffered(copy, state, set)) continue
    const ranges = fieldsOf(copy, set).filter(r => r.show)
    if (ranges.length > 0) out.push({ set, ranges })
  }
  return out
}
// The sliders the model shows to writers that are listed under one of these things and are not fields.
const slidersUnder = (copy: ModelContent, ids: ReadonlySet<string>): ModelRange[] => {
  const fields = fieldRanges(copy)
  return writerRanges(copy).filter(r => r.scope !== null && ids.has(r.scope) && !fields.has(r.id))
}

// ---- the figure as a whole (step 0) ----

export interface FigurePart { kinds: PresetKind[]; sliders: ModelRange[]; fieldsets: FieldsetPart[] }
export function figurePartOf(copy: ModelContent, figure: CharacterFigure): FigurePart {
  const state = testOf(copy, figure)
  const known = new Set([...copy.groups.map(g => g.id), ...copy.objects.map(o => o.id), ...copy.shapes.map(s => s.id)])
  const fields = fieldRanges(copy)
  return {
    kinds: kindsFor(copy, state, null),
    sliders: writerRanges(copy).filter(r => (r.scope === null || !known.has(r.scope)) && !fields.has(r.id)),
    fieldsets: fieldsetsAt(copy, state, 'figure', ''),
  }
}

// ---- a region's groups (step 1) ----

export interface GroupPart { group: ModelGroup; sliders: ModelRange[]; kinds: PresetKind[]; states: StateChoice[]; fieldsets: FieldsetPart[] }
export function groupPartOf(copy: ModelContent, figure: CharacterFigure, group: ModelGroup): GroupPart {
  const state = testOf(copy, figure)
  return {
    group,
    sliders: slidersUnder(copy, new Set([group.id])),
    kinds: kindsFor(copy, state, group.id),
    states: statesOf(group).filter(st => st.options.length > 0).map(st => ({ state: st, value: chosenOption(copy, state, group.id, st)?.id ?? '' })),
    fieldsets: fieldsetsAt(copy, state, 'group', group.id),
  }
}
const groupHolds = (p: GroupPart): boolean => p.sliders.length > 0 || p.kinds.length > 0 || p.states.length > 0 || p.fieldsets.length > 0

// The groups of a region that have something to change (a twin group follows its original, so it has none of its own).
export function groupPartsOf(copy: ModelContent, figure: CharacterFigure, regionId: string): GroupPart[] {
  const placed = placementOf(copy)
  return copy.groups.filter(g => !g.mirrorOf && placed.groups[g.id] === regionId).map(g => groupPartOf(copy, figure, g)).filter(groupHolds)
}

// ---- an object (step 2) ----

export interface ObjectPart {
  object: ModelObject
  // whose controls these are: the object, or for a twin its original (a twin follows it)
  owner: ModelObject
  family: { klass: ModelClass; members: ModelObject[]; value: string } | null
  axes: Array<{ axis: ModelAxis; value: string }>
  sliders: ModelRange[]
  kinds: PresetKind[]
  fieldsets: FieldsetPart[]
  patterns: Array<{ pattern: ModelPattern; on: boolean }>
  slots: ModelSlot[]
  // whether the garment is worn (null: it is not a garment)
  worn: boolean | null
  // the side hanging things fall to can be chosen
  falls: boolean
}

const fallingShapes = (copy: ModelContent): Set<string> => new Set(copy.ranges.flatMap(r => r.drives.filter(d => d.kind === 'fall' && d.shape).map(d => d.shape as string)))

export function objectPartOf(copy: ModelContent, figure: CharacterFigure, objectId: string): ObjectPart | null {
  const object = objectById(copy, objectId)
  if (!object) return null
  const owner = objectById(copy, object.mirrorOf) ?? object
  const state = testOf(copy, figure)
  const klass = owner.classOf ? classesOf(copy).find(k => k.id === owner.classOf) : undefined
  const members = klass ? membersOf(copy, klass.id) : []
  const family = klass && klass.exclusive && members.length > 1 ? { klass, members, value: shownMember(copy, klass, figure.forms)?.id ?? members[0].id } : null
  const axes = axesFor(copy, owner).filter(a => a.options.length > 1).map(axis => ({ axis, value: chosenForm(owner, axis, figure.forms, owner.id)?.id ?? axis.initial }))
  const palette = figure.palette ?? paletteOf(copy)
  const falling = fallingShapes(copy)
  return {
    object, owner, family, axes,
    sliders: slidersUnder(copy, new Set([owner.id, ...owner.shapes])),
    kinds: kindsFor(copy, state, owner.id),
    fieldsets: fieldsetsAt(copy, state, 'object', owner.id),
    patterns: (copy.patterns ?? []).filter(p => owner.shapes.includes(p.base)).map(pattern => ({ pattern, on: !figure.hidden.includes(pattern.id) })),
    slots: slotsUsedBy(copy, owner).filter(s => s.colours.length > 0 || palette.length > 0),
    worn: owner.layer === 'clothing' ? !figure.hidden.includes(owner.id) : null,
    falls: owner.shapes.some(id => falling.has(id)),
  }
}

// What the writer can change about an object, in words (the hover tip of its hotspot and the label of the button).
export function changesOf(part: ObjectPart): string[] {
  const out: string[] = []
  if (part.family) out.push(part.family.klass.name)
  for (const { axis } of part.axes) out.push(axis.name)
  for (const r of part.sliders) out.push(r.name)
  for (const k of part.kinds) out.push(k.label)
  for (const f of part.fieldsets) out.push(f.set.name)
  for (const { pattern } of part.patterns) out.push(pattern.name.trim() || 'Pattern')
  for (const s of part.slots) out.push(`${s.name} colour`)
  if (part.worn !== null) out.push('Worn or not')
  if (part.falls) out.push('Where it falls')
  return out
}

// The garments of a region, worn or not (a garment that is not worn has no hotspot, so this list is how it is put on again): one row for each garment and each family of
// garments, in the model's order.
export interface Garment { object: ModelObject; name: string; worn: boolean }
export function garmentsIn(copy: ModelContent, figure: CharacterFigure, regionId: string): Garment[] {
  const placed = placementOf(copy)
  const out: Garment[] = [], families = new Set<string>()
  for (const o of copy.objects) {
    if (o.layer !== 'clothing' || o.mirrorOf || placed.objects[o.id] !== regionId) continue
    const klass = o.classOf ? classesOf(copy).find(k => k.id === o.classOf) : undefined
    if (klass) { if (families.has(klass.id)) continue; families.add(klass.id) }
    out.push({ object: o, name: klass?.name.trim() || o.name, worn: !figure.hidden.includes(o.id) })
  }
  return out
}

// ---- the parts on the card: hotspots ----

export type Layers = Record<ModelLayer, boolean>
export const ALL_LAYERS: Layers = { body: true, clothing: true, hair: true }
export interface Hotspot { object: ModelObject; box: Box; changes: string[] }

// The objects of a region that can be pointed at on the card: shown now, with something to change, in a layer that is on. The box is where it is drawn (in the card's view).
export function hotspotsOf(copy: ModelContent, figure: CharacterFigure, solved: Solved, regionId: string, layers: Layers = ALL_LAYERS): Hotspot[] {
  const placed = placementOf(copy)
  const helpers = new Set(copy.shapes.filter(s => s.helper).map(s => s.id))
  const drawn = new Map(solved.order.map((id, i) => [id, i]))
  const out: Array<Hotspot & { top: number }> = []
  for (const o of copy.objects) {
    if (placed.objects[o.id] !== regionId || layers[o.layer] === false) continue
    const shapes = o.shapes.filter(id => !helpers.has(id) && solved.shapes[id]?.visible)
    const box = unionBox(shapes.map(id => solved.shapes[id].box))
    if (!box) continue
    const part = objectPartOf(copy, figure, o.id)
    const changes = part ? changesOf(part) : []
    if (changes.length > 0) out.push({ object: o, box, changes, top: Math.max(...shapes.map(id => drawn.get(id) ?? -1)) })
  }
  // In the order they are drawn, back to front: what is drawn in front is in front to be pointed at (a shirt over the undershirt it covers, an eye on a head).
  return out.sort((a, b) => a.top - b.top).map(({ object, box, changes }) => ({ object, box, changes }))
}
// The layers that have an object that can be pointed at in a region (for the chips that switch them).
export function layersIn(copy: ModelContent, figure: CharacterFigure, regionId: string): ModelLayer[] {
  const placed = placementOf(copy)
  const seen = new Set<ModelLayer>()
  for (const o of copy.objects) if (placed.objects[o.id] === regionId) { const part = objectPartOf(copy, figure, o.id); if (part && changesOf(part).length > 0) seen.add(o.layer) }
  return (['body', 'clothing', 'hair'] as ModelLayer[]).filter(l => seen.has(l))
}

// ---- changes, each a new figure ----

export const FALL_LABELS: Record<ModelFallSide, string> = { down: 'Straight down', left: 'To the left', right: 'To the right', behind: 'Behind' }
export const setFall = (figure: CharacterFigure, side: ModelFallSide): CharacterFigure => (figure.fall === side ? figure : { ...figure, fall: side })

export function setForm(figure: CharacterFigure, objectId: string, axis: ModelAxis, formId: string): CharacterFigure {
  if (!axis.options.some(f => f.id === formId)) return figure
  return { ...figure, forms: { ...figure.forms, [formKey(objectId, axis.id)]: formId } }
}
export function setMember(figure: CharacterFigure, klass: ModelClass, memberId: string): CharacterFigure {
  return { ...figure, forms: { ...figure.forms, [classKey(klass.id)]: memberId } }
}

// A garment is worn or not: its id, and those of its twins and (in a family of garments) the other members and their twins, are off the figure's hidden list or on it.
export function wornIds(copy: ModelContent, object: ModelObject): string[] {
  const klass = object.classOf ? classesOf(copy).find(k => k.id === object.classOf) : undefined
  const base = klass ? membersOf(copy, klass.id) : [object]
  const ids = new Set<string>()
  for (const o of base) { ids.add(o.id); for (const t of copy.objects) if (t.mirrorOf === o.id) ids.add(t.id) }
  return [...ids]
}
export function setWorn(copy: ModelContent, figure: CharacterFigure, objectId: string, worn: boolean): CharacterFigure {
  const object = objectById(copy, objectId)
  if (!object) return figure
  const ids = new Set(wornIds(copy, objectById(copy, object.mirrorOf) ?? object))
  const rest = figure.hidden.filter(id => !ids.has(id))
  return { ...figure, hidden: worn ? rest : [...rest, ...ids] }
}

// A fill pattern is on or off (its id is hidden like an object's).
export function setPattern(figure: CharacterFigure, patternId: string, on: boolean): CharacterFigure {
  const rest = figure.hidden.filter(id => id !== patternId)
  return { ...figure, hidden: on ? rest : [...rest, patternId] }
}

// ---- colour ----

export interface SlotView {
  slot: ModelSlot
  choice: SlotChoice | undefined
  resolved: ResolvedColour
  // the parts of the colour the model locks for this object (null: free)
  lock: ModelHsl
  locked: { h: boolean; s: boolean; l: boolean; all: boolean }
  brightness: [number, number]
  opacity: [number, number] | null
}

export function slotViewOf(copy: ModelContent, figure: CharacterFigure, objectId: string, slot: ModelSlot): SlotView {
  const owner = objectById(copy, objectById(copy, objectId)?.mirrorOf) ?? objectById(copy, objectId)
  const lock: ModelHsl = (owner && activeLocks(copy, testOf(copy, figure))[owner.id]?.[slot.id]) || { h: null, s: null, l: null }
  const saved = figure.colours[slot.id]
  const choice: SlotChoice | undefined = saved && (saved.src === 'swatch' || saved.src === 'colour')
    ? { src: saved.src, id: saved.id, ...(typeof saved.l === 'number' ? { l: saved.l } : {}), ...(typeof saved.a === 'number' ? { a: saved.a } : {}) } : undefined
  const locked = { h: lock.h !== null, s: lock.s !== null, l: lock.l !== null, all: lock.h !== null && lock.s !== null && lock.l !== null }
  return { slot, choice, resolved: resolveLocked(slot, choice, figure.palette ?? paletteOf(copy), lock), lock, locked, brightness: [slot.lMin, slot.lMax], opacity: slot.aMax > slot.aMin ? [slot.aMin, slot.aMax] : null }
}

const withColour = (figure: CharacterFigure, slotId: string, colour: FigureColour): CharacterFigure => ({ ...figure, colours: { ...figure.colours, [slotId]: colour } })

// A default colour or a swatch of the palette for a slot. A default colour starts at its own brightness; a swatch keeps the brightness the slot had (inside its range).
export function pickColour(copy: ModelContent, figure: CharacterFigure, slotId: string, src: 'colour' | 'swatch', id: string): CharacterFigure {
  const slot = slotsOf(copy).find(s => s.id === slotId)
  if (!slot) return figure
  if (src === 'colour' ? !colourById(slot, id) : !(figure.palette ?? paletteOf(copy)).some(p => p.id === id)) return figure
  const had = figure.colours[slotId]
  const colour: FigureColour = { src, id }
  if (typeof had?.a === 'number') colour.a = had.a
  if (src === 'swatch' && typeof had?.l === 'number') colour.l = Math.min(slot.lMax, Math.max(slot.lMin, had.l))
  return withColour(figure, slotId, colour)
}
export function setBrightness(copy: ModelContent, figure: CharacterFigure, slotId: string, l: number): CharacterFigure {
  const slot = slotsOf(copy).find(s => s.id === slotId), had = figure.colours[slotId]
  if (!slot || !had) return figure
  return withColour(figure, slotId, { ...had, l: Math.round(Math.min(slot.lMax, Math.max(slot.lMin, l))) })
}
export function setOpacity(copy: ModelContent, figure: CharacterFigure, slotId: string, a: number): CharacterFigure {
  const slot = slotsOf(copy).find(s => s.id === slotId), had = figure.colours[slotId]
  if (!slot || !had) return figure
  return withColour(figure, slotId, { ...had, a: Math.round(Math.min(slot.aMax, Math.max(slot.aMin, a))) })
}

// ---- Randomise this part only ----

const pickOf = <T,>(list: T[], rng: Rng): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]

// A new random look for one group or object and what is in it, inside the figure's genre: a form on every axis and the member of every family, a value for every slider the
// writer may move that is listed under it (from the slider's own random span, else the span it may be moved within), the colour of every slot only it is painted from, and, 60% of
// the time per kind, one of its presets that only moves sliders and forms. Everything outside it stays as it is, and so does whatever the figure locks.
export function rollPart(copy: ModelContent, figure: CharacterFigure, scopeId: string, rng: Rng): CharacterFigure {
  const scope = scopeOf(copy, scopeId)
  if (!scope) return figure
  // The objects of the part: those in it, the family each belongs to (its pattern and every member), and the twins of all of them (a twin follows its original, so it is rolled with it).
  const inside = new Set(scope.objects.map(o => o.id))
  for (const o of scope.objects) {
    const klass = o.classOf ? classesOf(copy).find(k => k.id === o.classOf) : undefined
    if (klass) { inside.add(klass.template); for (const m of membersOf(copy, klass.id)) inside.add(m.id) }
  }
  for (let grew = true; grew;) {
    grew = false
    for (const o of copy.objects) if (o.mirrorOf && inside.has(o.mirrorOf) && !inside.has(o.id)) { inside.add(o.id); grew = true }
  }
  // Every object outside is kept as it is (only objects are named: locking a group would lock what hangs under it, and this part may hang under it); rolling a part leaves every
  // other part alone, and so every slot that something outside is painted from. A slot nothing in the part is painted from is left alone too.
  const outside = copy.objects.filter(o => !inside.has(o.id)).map(o => o.id)
  const kept = new Set([...outside, ...figure.locks])
  const locked = lockedThings(copy, [...kept])
  const start = { palette: figure.palette ?? paletteOf(copy), choices: testOf(copy, figure).colours ?? {} }
  const rolled = rollLook(copy, rng, { genre: figure.genre, locks: [...kept], forms: { ...figure.forms }, choices: start.choices, palette: start.palette, fall: figure.fall })
  const painted = slotsPaintedBy(copy, inside), held = slotsPaintedBy(copy, locked.objects)
  const choices: SlotChoices = {}
  for (const slot of slotsOf(copy)) {
    const pick = !painted.has(slot.id) || held.has(slot.id) ? start.choices[slot.id] : rolled.choices[slot.id]
    if (pick) choices[slot.id] = pick
  }
  const look = { ...rolled, choices }
  const values = { ...testOf(copy, figure).values }
  const fields = new Set(fieldsetsOf(copy).flatMap(f => f.ranges))
  for (const r of writerRanges(copy)) {
    if (r.scope === null || !scope.listed.has(r.scope) || fields.has(r.id)) continue
    if (locked.objects.has(r.scope) || locked.groups.has(r.scope)) continue
    const [lo, hi] = r.rand ?? spanOf(r)
    values[r.id] = r2(clampToSpan(r, lo + (hi - lo) * ((rng() + rng() + rng()) / 3)))
  }
  let state: TestState = { values, forms: look.forms, hidden: [...figure.hidden], fall: look.fall, colours: look.choices, on: [...(figure.on ?? [])], order: { ...(figure.order ?? {}) } }
  // A kind that takes something off (Outfit) is the writer's to choose, and so is one that touches something that is kept.
  const own = presetsOf(copy).filter(p => p.scope === scopeId)
  const kinds = new Map<string, ModelPreset[]>()
  for (const p of own) kinds.set(kindKey(p.kind), [...(kinds.get(kindKey(p.kind)) ?? []), p])
  for (const list of kinds.values()) {
    if (list.some(p => p.hidden.length > 0)) continue
    if (rng() < 0.6) state = applyPreset(copy, state, pickOf(list, rng))
  }
  return withTest(copy, figure, state)
}
