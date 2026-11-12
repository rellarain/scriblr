import { FIGURE_MAX_LOCKS, FIGURE_MAX_MINE, type CharacterFigure, type FigureColour, type ModelAxis, type ModelClass, type ModelContent, type ModelFallSide, type ModelFieldset, type ModelFrame, type ModelGroup, type ModelHsl, type ModelLayer, type ModelObject, type ModelPattern, type ModelPreset, type ModelRange, type ModelSlot, type ModelState, type ModelSwatch } from '../../../../../api/types'
import { addSwatch, colourById, paletteOf, removeSwatch, resolveLocked, setSwatch, slotsOf, type ResolvedColour, type Rng, type SlotChoice, type SlotChoices } from '../../../admin/characters/engine/colour'
import { fieldsOf, fieldsetsOf, isOffered } from '../../../admin/characters/engine/fields'
import { axesFor, chosenForm, classKey, classesOf, formKey, membersOf, presetsOf, shownMember } from '../../../admin/characters/engine/forms'
import { framesOf } from '../../../admin/characters/engine/frames'
import type { Box } from '../../../admin/characters/engine/geometry'
import { activeLocks, slotsUsedBy } from '../../../admin/characters/engine/locks'
import { applyPreset, isOn, saveStyle, scopeOf, type TestState } from '../../../admin/characters/engine/presets'
import { orderedUnits, type LayerUnit } from '../../../admin/characters/engine/order'
import { defaultValues, solve, type Solved } from '../../../admin/characters/engine/rig'
import { lockedSlots as slotsPaintedBy, lockedThings, rollLook } from '../../../admin/characters/engine/roll'
import { applyOption, chosenOption, statesOf } from '../../../admin/characters/engine/states'
import { wearPair } from '../../../admin/characters/engine/wear'
import { NAME_MAX, SWATCH_NAME_MAX, randomId } from '../../../admin/characters/modelContent'
import { clampToSpan, coloursFrom, spanOf, testOf, withTest, writerRanges } from './figureState'

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
  const boxIn = (o: ModelObject, from: Solved): Box | null => unionBox(o.shapes.filter(id => !helpers.has(id)).map(id => from.shapes[id]?.box))
  // A part a form hides at rest (a beard) has no box there: it lies where its first form that shows anything puts it.
  const boxOfObject = (o: ModelObject): Box | null => {
    const at = boxIn(o, solved)
    if (at) return at
    for (const axis of o.axes ?? []) for (const form of axis.options) {
      if (form.id === axis.initial) continue
      const box = boxIn(o, solve(copy, defaultValues(copy), 'front', { forms: { [`${o.id}.${axis.id}`]: form.id } }))
      if (box) return box
    }
    return null
  }
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

// The model's presets and the writer's own (the styles saved on the figure) as one list of presets, which is what a dropdown of styles lists and what choosing one applies. The
// same content for the same figure styles, so what is worked out from it is remembered.
const withMine = new WeakMap<ModelContent, WeakMap<ModelPreset[], ModelContent>>()
export function presetContent(copy: ModelContent, figure: CharacterFigure): ModelContent {
  const mine = figure.mine ?? []
  if (mine.length === 0) return copy
  let by = withMine.get(copy)
  if (!by) { by = new WeakMap(); withMine.set(copy, by) }
  let made = by.get(mine)
  if (!made) { made = { ...copy, presets: [...presetsOf(copy), ...mine] }; by.set(mine, made) }
  return made
}

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
  const state = testOf(copy, figure), all = presetContent(copy, figure)
  if (id === NONE) {
    const scope = kind.presets[0]?.scope ?? null
    return withTest(all, figure, applyPreset(all, state, { id: NONE, name: 'None', kind: kind.label, scope, values: {}, hidden: [] }))
  }
  const p = kind.presets.find(x => x.id === id)
  return p ? withTest(all, figure, applyPreset(all, state, p)) : figure
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
  // the part is locked: Randomise leaves it as it is
  locked: boolean
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
    kinds: kindsFor(presetContent(copy, figure), state, owner.id),
    fieldsets: fieldsetsAt(copy, state, 'object', owner.id),
    patterns: (copy.patterns ?? []).filter(p => owner.shapes.includes(p.base)).map(pattern => ({ pattern, on: !figure.hidden.includes(pattern.id) })),
    slots: slotsUsedBy(copy, owner).filter(s => s.colours.length > 0 || palette.length > 0),
    worn: owner.layer === 'clothing' ? !figure.hidden.includes(owner.id) : null,
    falls: owner.shapes.some(id => falling.has(id)),
    locked: figure.locks.includes(owner.id),
  }
}

// The parts the figure has switched off until the writer chooses them (a beard, a horn, a crown): the objects that show nothing with every form at the model's own, that have a
// form to choose and are not a twin, a member of a family or the pattern of one. A hidden part has no box on the card to point at, so the first step lists them (the writer's way to a beard).
const optionalCache = new WeakMap<ModelContent, ObjectPart['object'][]>()
export function optionalObjects(copy: ModelContent): ModelObject[] {
  const held = optionalCache.get(copy)
  if (held) return held
  const rest = solve(copy, defaultValues(copy), 'front')
  const patterns = new Set(classesOf(copy).map(k => k.template))   // the pattern of a family is never drawn itself: its members are
  const out = copy.objects.filter(o => !o.mirrorOf && !o.classOf && !patterns.has(o.id) && o.shapes.length > 0 && axesFor(copy, o).some(a => a.options.length > 1) && o.shapes.every(id => !rest.shapes[id]?.visible))
  optionalCache.set(copy, out)
  return out
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

// ---- the clothing and the hair of a sheet: put on and taken off, and moved in front of or behind one another ----

export type MovableLayer = 'clothing' | 'hair'
export interface LayerRow {
  // the key of the part (see order.ts `layerUnits`): what is moved
  key: string
  // the object to open for it: the object, or the member of a family that is shown
  open: ModelObject
  name: string
  // worn or not (a garment that is not worn has no box on the card, so this list is how it is put on again); null for a layer that is not put on and taken off (hair)
  worn: boolean | null
  // why the part cannot be moved in front of (or behind) the next one in the list (null: it can)
  front: string | null
  behind: string | null
}

// The object that stands for a part: the object itself, or in a family the member that is shown (the first when none is).
function unitObject(copy: ModelContent, figure: CharacterFigure, u: LayerUnit): ModelObject | undefined {
  const klass = (copy.classes ?? []).find(k => k.template === u.key)
  if (!klass) return u.objects.find(o => o.id === u.key)
  return shownMember(copy, klass, figure.forms) ?? membersOf(copy, klass.id)[0]
}

// The parts of a layer that lie on a sheet, from the back to the front as they are drawn now (a twin goes with its original, a family counts once).
function listedUnits(copy: ModelContent, figure: CharacterFigure, regionId: string, layer: MovableLayer): LayerUnit[] {
  const placed = placementOf(copy)
  return orderedUnits(copy, layer, figure.zoff ?? {}).filter(u => { const o = unitObject(copy, figure, u); return !!o && placed.objects[o.id] === regionId })
}

const keeps = (c: ModelContent, a: LayerUnit, b: LayerUnit): string | null => {
  const pair = wearPair(c, a.objects, b.objects)
  return pair ? `${pair.under.name.trim() || 'It'} is worn under ${pair.over.name.trim() || 'it'}: the model keeps it there.` : null
}

// The rows of a layer of a sheet, the one in front first (a list of layers reads from the top). A part cannot be moved past one the model says it is worn under or over.
export function layerListIn(copy: ModelContent, figure: CharacterFigure, regionId: string, layer: MovableLayer): LayerRow[] {
  const listed = listedUnits(copy, figure, regionId, layer)
  const rows: LayerRow[] = listed.map((u, i) => {
    const open = unitObject(copy, figure, u)!
    const klass = (copy.classes ?? []).find(k => k.template === u.key)
    const ahead = listed[i + 1], behind = listed[i - 1]
    return {
      key: u.key, open, name: klass?.name.trim() || open.name,
      worn: layer === 'clothing' ? !figure.hidden.includes(open.id) : null,
      front: ahead ? keeps(copy, u, ahead) : 'It is in front already.',
      behind: behind ? keeps(copy, u, behind) : 'It is at the back already.',
    }
  })
  return rows.reverse()
}

// The figure with a part moved in front of the next part of its sheet (or behind the previous one): the two change places among all the parts of the layer, and every part's offset is
// worked out again from where the model puts it, so the offsets always describe exactly the order that is drawn.
export function moveLayer(copy: ModelContent, figure: CharacterFigure, layer: MovableLayer, key: string, toward: 'front' | 'behind', regionId: string): CharacterFigure {
  const row = layerListIn(copy, figure, regionId, layer).find(r => r.key === key)
  if (!row || (toward === 'front' ? row.front : row.behind) !== null) return figure
  const listed = listedUnits(copy, figure, regionId, layer)
  const at = listed.findIndex(u => u.key === key)
  const other = listed[at + (toward === 'front' ? 1 : -1)]
  const all = orderedUnits(copy, layer, figure.zoff ?? {})
  const i = all.findIndex(u => u.key === key), j = all.findIndex(u => u.key === other?.key)
  if (i < 0 || j < 0) return figure
  ;[all[i], all[j]] = [all[j], all[i]]
  const zoff = { ...(figure.zoff ?? {}) }
  all.forEach((u, place) => {
    const off = Math.max(-50, Math.min(50, place - u.base))
    if (off === 0) delete zoff[u.key]
    else zoff[u.key] = off
  })
  return { ...figure, zoff }
}

// ---- the parts on the card: hotspots ----

export type Layers = Record<ModelLayer, boolean>
export const ALL_LAYERS: Layers = { body: true, clothing: true, hair: true }
export interface Hotspot { object: ModelObject; box: Box; changes: string[]; locked: boolean }

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
    if (changes.length > 0) out.push({ object: o, box, changes, locked: !!part?.locked, top: Math.max(...shapes.map(id => drawn.get(id) ?? -1)) })
  }
  // In the order they are drawn, back to front: what is drawn in front is in front to be pointed at (a shirt over the undershirt it covers, an eye on a head).
  return out.sort((a, b) => a.top - b.top).map(({ object, box, changes, locked }) => ({ object, box, changes, locked }))
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

// ---- locks: what Randomise leaves as it is ----

// A lock is kept on the object itself; a twin follows its original, so the lock of a twin is its original's.
const lockId = (copy: ModelContent, objectId: string): string => objectById(copy, objectById(copy, objectId)?.mirrorOf)?.id ?? objectId
export const isLocked = (copy: ModelContent, figure: CharacterFigure, objectId: string): boolean => figure.locks.includes(lockId(copy, objectId))

export function setLock(copy: ModelContent, figure: CharacterFigure, objectId: string, on: boolean): CharacterFigure {
  const id = lockId(copy, objectId)
  if (!objectById(copy, id)) return figure
  const rest = figure.locks.filter(x => x !== id)
  return { ...figure, locks: on ? [...rest, id].slice(0, FIGURE_MAX_LOCKS) : rest }
}

// Every object that lies on a sheet (the parts a lock on the sheet covers: those with something to change and those with only a colour), as the objects locks are kept on.
const lockedOnSheet = (copy: ModelContent, regionId: string): string[] => [...new Set(copy.objects.filter(o => placementOf(copy).objects[o.id] === regionId).map(o => lockId(copy, o.id)))]
export const sheetLocked = (copy: ModelContent, figure: CharacterFigure, regionId: string): boolean => {
  const ids = lockedOnSheet(copy, regionId)
  return ids.length > 0 && ids.every(id => figure.locks.includes(id))
}
export function lockSheet(copy: ModelContent, figure: CharacterFigure, regionId: string, on: boolean): CharacterFigure {
  const ids = lockedOnSheet(copy, regionId), set = new Set(ids)
  const rest = figure.locks.filter(id => !set.has(id))
  return { ...figure, locks: on ? [...rest, ...ids].slice(0, FIGURE_MAX_LOCKS) : rest }
}
export const unlockAll = (figure: CharacterFigure): CharacterFigure => (figure.locks.length === 0 ? figure : { ...figure, locks: [] })

// ---- the writer's own styles ("mine"): the look of one part, kept on the figure ----

export const isMine = (figure: CharacterFigure, presetId: string): boolean => (figure.mine ?? []).some(p => p.id === presetId)

// Keep what is chosen for a part (its forms, its sliders and the fields among them, what it hides) as a style of the writer's own, in the kind its styles are in. It comes back as the
// figure with the style added, which then reads as the style that is on; or why not (nothing about the part is away from the model's own look yet, or the figure has all it may keep).
export function saveMine(copy: ModelContent, figure: CharacterFigure, objectId: string, name: string): CharacterFigure | string {
  const mine = figure.mine ?? []
  if (mine.length >= FIGURE_MAX_MINE) return `A character may keep at most ${FIGURE_MAX_MINE} styles of its own. Delete one first.`
  const owner = objectById(copy, objectById(copy, objectId)?.mirrorOf) ?? objectById(copy, objectId)
  if (!owner) return 'That part is not in this model.'
  const kind = presetsOf(copy).find(p => p.scope === owner.id)?.kind ?? 'Style'
  const made = saveStyle(presetContent(copy, figure), testOf(copy, figure), owner.id, name.trim() || `My style ${mine.length + 1}`, kind, randomId)
  if (!made.ok) return made.reason
  const preset = presetsOf(made.content).find(p => p.id === made.presetId)
  if (!preset) return 'The style could not be kept.'
  if (Object.keys(preset.values).length === 0 && preset.hidden.length === 0 && Object.keys(preset.forms ?? {}).length === 0 && !preset.fall && (preset.order ?? []).length === 0) {
    return 'Change something about this part first: a style keeps its forms and sliders.'
  }
  return { ...figure, mine: [...mine, preset] }
}
export const renameMine = (figure: CharacterFigure, presetId: string, name: string): CharacterFigure => {
  const clean = name.trim().slice(0, NAME_MAX)
  return !clean || !isMine(figure, presetId) ? figure : { ...figure, mine: figure.mine.map(p => (p.id === presetId ? { ...p, name: clean } : p)) }
}
export const deleteMine = (figure: CharacterFigure, presetId: string): CharacterFigure =>
  (isMine(figure, presetId) ? { ...figure, mine: figure.mine.filter(p => p.id !== presetId), on: (figure.on ?? []).filter(id => id !== presetId) } : figure)

// ---- the character's own palette and the card colour ----

export const paletteFor = (copy: ModelContent, figure: CharacterFigure): ModelSwatch[] => figure.palette ?? paletteOf(copy)

// The first change to a palette makes it the character's own (a copy of the model's starter palette, changed).
export function addSwatchTo(copy: ModelContent, figure: CharacterFigure): CharacterFigure | string {
  const made = addSwatch(paletteFor(copy, figure), randomId)
  return made.reason ?? { ...figure, palette: made.palette }
}
export function editSwatch(copy: ModelContent, figure: CharacterFigure, id: string, change: { h?: number; s?: number; name?: string }): CharacterFigure {
  const name = change.name === undefined ? '' : change.name.trim().slice(0, SWATCH_NAME_MAX)
  const colour: { h?: number; s?: number } = {}
  if (change.h !== undefined) colour.h = change.h
  if (change.s !== undefined) colour.s = change.s
  return { ...figure, palette: setSwatch(paletteFor(copy, figure), id, name ? { ...colour, name } : colour) }
}
// A swatch goes (the last one stays): every colour of a slot that used it falls back to gray.
export function deleteSwatch(copy: ModelContent, figure: CharacterFigure, id: string): CharacterFigure {
  const palette = paletteFor(copy, figure)
  if (palette.length <= 1 || !palette.some(p => p.id === id)) return figure
  const gone = removeSwatch(palette, testOf(copy, figure).colours ?? {}, id)
  return { ...figure, palette: gone.palette, colours: coloursFrom(gone.choices) }
}
export const setTile = (figure: CharacterFigure, hex: string): CharacterFigure => (/^#[0-9a-f]{6}$/i.test(hex) ? { ...figure, tile: hex.toLowerCase() } : figure)

// ---- the overview (phase 6c-5): every part and ready look of the figure at a glance, in five sections ----

export type OverviewId = 'head' | 'hair' | 'face' | 'body' | 'fantasy'
// One line of the overview: what it is called, what is chosen (a form or a ready look), and the part it opens (none for a ready look, which is chosen in the first step).
export interface OverviewRow { key: string; label: string; value: string; objectId: string | null }
export interface OverviewSection { id: OverviewId; name: string; rows: OverviewRow[] }
export const OVERVIEW_NAMES: Record<OverviewId, string> = { head: 'Head', hair: 'Hair', face: 'Face', body: 'Body', fantasy: 'Fantasy' }
const OVERVIEW_ORDER: OverviewId[] = ['head', 'hair', 'face', 'body', 'fantasy']
const FACE = /eye|brow|nose|mouth|lip/i

// Which section a ready look is in, by what the kind is called.
const kindSection = (label: string): OverviewId => (/expression/i.test(label) ? 'face' : /hair|facial|beard|moustache/i.test(label) ? 'hair' : 'body')

// The head, hair, face, body and fantasy of a figure, each with the ready looks and the forms of the parts that belong to it, read from the model: a form of a part that is off until it
// is chosen (a part of the body: horns, extra eyes; a garment that is worn or not is a garment, not fantasy), or that the model draws only for some genres (the fantasy ears, the eye
// style), is fantasy; hair is the hairstyle and the facial hair; the eyes, brows, nose and mouth are the face; what lies in a group of the head is the head; the rest, clothes and
// what is held included, is the body. A section with nothing in it is left out.
export function overviewOf(copy: ModelContent, figure: CharacterFigure): OverviewSection[] {
  const rows = new Map<OverviewId, OverviewRow[]>(OVERVIEW_ORDER.map(id => [id, []]))
  for (const k of figurePartOf(copy, figure).kinds) {
    const chosen = k.presets.find(p => p.id === k.value)
    rows.get(kindSection(k.label))!.push({ key: `kind.${k.key}`, label: k.label, value: chosen ? chosen.name : 'Custom', objectId: null })
  }
  const optional = new Set(optionalObjects(copy).map(o => o.id))
  const headObjects = new Set(copy.groups.filter(g => /head/i.test(g.id) || /head/i.test(g.name)).flatMap(g => g.objects))
  for (const o of copy.objects) {
    if (o.mirrorOf || o.classOf) continue
    // the hair is its ready looks; the cut of each of its sections is not a choice to list
    if (o.layer === 'hair') continue
    const part = objectPartOf(copy, figure, o.id)
    if (!part) continue
    for (const { axis, value } of part.axes) {
      const fantasy = (axis.genres?.length ?? 0) > 0 || (optional.has(o.id) && o.layer !== 'clothing')
      const id: OverviewId = fantasy ? 'fantasy' : FACE.test(o.id) || FACE.test(o.name) ? 'face' : o.layer === 'clothing' ? 'body' : headObjects.has(o.id) ? 'head' : 'body'
      rows.get(id)!.push({ key: `${o.id}.${axis.id}`, label: axis.name, value: axis.options.find(f => f.id === value)?.name ?? '', objectId: o.id })
    }
  }
  return OVERVIEW_ORDER.filter(id => rows.get(id)!.length > 0).map(id => ({ id, name: OVERVIEW_NAMES[id], rows: rows.get(id)! }))
}
