import type { ModelContent, ModelDrive, ModelFeatureKind, ModelFieldset, ModelOwnerKind, ModelPreset, ModelRange } from '../../../../../api/types'
import { RANGE_NAME_MAX, dropFieldsets, freshId, randomId, withoutRanges, type MakeId } from '../modelContent'
import { freshFormId } from './formEdit'
import { LIMITS } from './limits'
import { isOn, type TestState } from './presets'
import { PROPS, type PropKey, type PropSpec } from './props'
import { addRange, done, fail, type Edit } from './rigEdit'

// Authored fields (phase D3c). A FIELDSET is bound to one FEATURE (a whole shape, one point or one edge of a shape, a whole object) and belongs to an OWNER (an object, a
// group, or a preset, which is a variant or a style); its FIELDS are sliders with a `prop` drive that change one property of the feature: its place, size, turn, opacity, the
// shift of its colour or the look of its gradient. The writer is offered an object's or a group's fields as long as the model has them, and a preset's while that preset is on.
// Everything here is pure: each function returns new content (or why it cannot) and leaves the content it was given alone.

export interface FeatureRef { feature: ModelFeatureKind; target: string; i: number }
export interface OwnerRef { kind: ModelOwnerKind; id: string }

const label = (name: string, id: string) => name.trim() || id
const clean = (name: string, max: number) => name.trim().slice(0, max)

export const fieldsetsOf = (c: ModelContent): ModelFieldset[] => c.fieldsets ?? []
export const fieldsetById = (c: ModelContent, id: string): ModelFieldset | undefined => fieldsetsOf(c).find(f => f.id === id)
export const fieldsetsOwnedBy = (c: ModelContent, owner: OwnerRef): ModelFieldset[] => fieldsetsOf(c).filter(f => f.ownerKind === owner.kind && f.owner === owner.id)
export const featureOf = (f: Pick<ModelFieldset, 'feature' | 'target' | 'i'>): FeatureRef => ({ feature: f.feature, target: f.target, i: f.i })
export const sameFeature = (a: FeatureRef, b: FeatureRef): boolean => a.feature === b.feature && a.target === b.target && (a.feature === 'shape' || a.feature === 'object' || a.i === b.i)
export const fieldsetsOnFeature = (c: ModelContent, ref: FeatureRef): ModelFieldset[] => fieldsetsOf(c).filter(f => sameFeature(featureOf(f), ref))

// The sliders of a fieldset, in order (one that is gone is left out).
export function fieldsOf(c: ModelContent, f: ModelFieldset): ModelRange[] {
  const byId = new Map(c.ranges.map(r => [r.id, r]))
  return f.ranges.map(id => byId.get(id)).filter((r): r is ModelRange => !!r)
}

// The drive of a field that changes a property of the fieldset's feature.
export const fieldDriveIndex = (r: ModelRange, ref: FeatureRef): number =>
  r.drives.findIndex(d => d.kind === 'prop' && d.feature === ref.feature && (ref.feature === 'object' ? d.id : d.shape) === ref.target && ((ref.feature !== 'point' && ref.feature !== 'edge') || (d.i ?? 0) === ref.i))
export const fieldDrive = (r: ModelRange, ref: FeatureRef): ModelDrive | undefined => r.drives[fieldDriveIndex(r, ref)]
// The property a field changes (undefined for a slider that is not a field of this feature).
export const fieldProp = (r: ModelRange, ref: FeatureRef): PropSpec | undefined => {
  const d = fieldDrive(r, ref)
  return d?.prop && d.prop in PROPS ? PROPS[d.prop as PropKey] : undefined
}

// ---- naming ----

export function featureText(c: ModelContent, ref: FeatureRef): string {
  if (ref.feature === 'object') return `Object ${label(c.objects.find(o => o.id === ref.target)?.name ?? '', ref.target)}`
  const shape = label(c.shapes.find(s => s.id === ref.target)?.name ?? '', ref.target)
  return ref.feature === 'shape' ? `Shape ${shape}` : `${ref.feature === 'point' ? 'Point' : 'Edge'} ${ref.i + 1} of ${shape}`
}

export function ownerText(c: ModelContent, owner: OwnerRef): string {
  if (owner.kind === 'object') return label(c.objects.find(o => o.id === owner.id)?.name ?? '', owner.id)
  if (owner.kind === 'group') return label(c.groups.find(g => g.id === owner.id)?.name ?? '', owner.id)
  return label((c.presets ?? []).find(p => p.id === owner.id)?.name ?? '', owner.id)
}

// ---- what can hold fields ----

// Why a feature cannot hold fields (null when it can): it must be there, and a twin follows its original, so the fields belong to the original.
export function featureProblem(c: ModelContent, ref: FeatureRef): string | null {
  if (ref.feature === 'object') {
    const o = c.objects.find(x => x.id === ref.target)
    if (!o) return 'There is no such object.'
    return o.mirrorOf ? 'A twin follows its original: give the fields to the original.' : null
  }
  const s = c.shapes.find(x => x.id === ref.target)
  if (!s) return 'There is no such shape.'
  if (s.mirrorOf) return 'A twin follows its original: give the fields to the original.'
  if (ref.feature === 'shape') return null
  if (s.pts.length < 3) return 'That shape has no points of its own: give the fields to its pattern or its original.'
  return ref.i >= 0 && ref.i < s.pts.length ? null : `That shape has no such ${ref.feature}.`
}

export function ownerProblem(c: ModelContent, owner: OwnerRef): string | null {
  const found = owner.kind === 'object' ? c.objects.some(o => o.id === owner.id) : owner.kind === 'group' ? c.groups.some(g => g.id === owner.id) : (c.presets ?? []).some(p => p.id === owner.id)
  return found ? null : `There is no such ${owner.kind === 'preset' ? 'variant or style' : owner.kind}.`
}

// The object a feature belongs to (the object itself, or the object of its shape).
const objectOfFeature = (c: ModelContent, ref: FeatureRef): string | null => (ref.feature === 'object' ? ref.target : c.objects.find(o => o.shapes.includes(ref.target))?.id ?? null)

// ---- editing ----

const driveFor = (ref: FeatureRef, spec: PropSpec): ModelDrive => ({
  kind: 'prop', group: null, target: null, id: ref.feature === 'object' ? ref.target : null, axis: 'xy', shape: ref.feature === 'object' ? null : ref.target, moves: [], sym: false, pivot: null, y0: 0, y1: 0,
  atMin: spec.amounts[0], atMax: spec.amounts[1], mirror: true, feature: ref.feature, prop: spec.key, i: ref.feature === 'point' || ref.feature === 'edge' ? ref.i : 0,
})

const mapFieldset = (c: ModelContent, id: string, change: (f: ModelFieldset) => ModelFieldset): ModelContent => ({ ...c, fieldsets: fieldsetsOf(c).map(f => (f.id === id ? change(f) : f)) })

// A new fieldset for a feature, owned by an object, a group or a preset, with no field yet.
export function addFieldset(c: ModelContent, owner: OwnerRef, ref: FeatureRef, name = '', make: MakeId = randomId): Edit & { fieldsetId?: string } {
  const bad = ownerProblem(c, owner) ?? featureProblem(c, ref)
  if (bad) return fail(bad)
  if (fieldsetsOf(c).length >= LIMITS.fieldsetsMax) return fail(`A model may have at most ${LIMITS.fieldsetsMax} fieldsets.`)
  const id = freshFormId(fieldsetsOf(c).map(f => f.id), 'fs', make)
  const set: ModelFieldset = { id, name: clean(name, RANGE_NAME_MAX) || clean(featureText(c, ref), RANGE_NAME_MAX), ownerKind: owner.kind, owner: owner.id, feature: ref.feature, target: ref.target, i: ref.feature === 'point' || ref.feature === 'edge' ? ref.i : 0, ranges: [] }
  return { ...done({ ...c, fieldsets: [...fieldsetsOf(c), set] }), fieldsetId: id }
}

export const renameFieldset = (c: ModelContent, id: string, name: string): ModelContent => mapFieldset(c, id, f => ({ ...f, name }))

// A fieldset goes with its sliders.
export const removeFieldset = (c: ModelContent, id: string): ModelContent => dropFieldsets(c, f => f.id === id)

// A new field: a slider of its own that changes `prop` of the fieldset's feature, with a span that shows the property itself to begin with (the steppers of its drive change that).
export function addField(c: ModelContent, fieldsetId: string, prop: PropKey, make: MakeId = randomId): Edit & { rangeId?: string } {
  const f = fieldsetById(c, fieldsetId)
  if (!f) return fail('There is no such fieldset.')
  const spec = PROPS[prop]
  if (!spec) return fail('There is no such property.')
  const ref = featureOf(f)
  if (!spec.features.includes(f.feature)) return fail(`${spec.label} is not something a ${f.feature} has.`)
  const bad = featureProblem(c, ref)
  if (bad) return fail(bad)
  if (f.ranges.length >= LIMITS.fieldsMax) return fail(`A fieldset may have at most ${LIMITS.fieldsMax} fields.`)
  if (fieldsOf(c, f).some(r => fieldDrive(r, ref)?.prop === prop)) return fail(`${f.name.trim() || 'This fieldset'} already has a field for ${spec.label.toLowerCase()}.`)
  const scope = f.ownerKind === 'preset' ? objectOfFeature(c, ref) : f.owner
  const id = freshId(c, 'r', make)
  const range: ModelRange = { id, name: spec.label, scope, min: spec.slider[0], rest: spec.slider[1], max: spec.slider[2], unit: spec.unit, show: true, rand: null, drives: [driveFor(ref, spec)] }
  const added = addRange(c, range)
  if (!added.ok) return added
  return { ...done(mapFieldset(added.content, fieldsetId, x => ({ ...x, ranges: [...x.ranges, id] }))), rangeId: id }
}

// A field goes: its slider and everything that named it.
export const removeField = (c: ModelContent, rangeId: string): ModelContent => withoutRanges(c, new Set([rangeId]))

// A field changes another property of the same feature: the slider takes the new property's span and amounts (and its name, if it still had the old property's).
export function setFieldProp(c: ModelContent, fieldsetId: string, rangeId: string, prop: PropKey): Edit {
  const f = fieldsetById(c, fieldsetId), r = c.ranges.find(x => x.id === rangeId)
  if (!f || !r) return fail('There is no such field.')
  const spec = PROPS[prop]
  if (!spec || !spec.features.includes(f.feature)) return fail(`${spec?.label ?? 'That'} is not something a ${f.feature} has.`)
  const ref = featureOf(f), at = fieldDriveIndex(r, ref)
  if (at < 0) return fail('That slider is not a field of this fieldset.')
  const old = r.drives[at].prop
  if (old === prop) return done(c)
  if (fieldsOf(c, f).some(x => x.id !== rangeId && fieldDrive(x, ref)?.prop === prop)) return fail(`${f.name.trim() || 'This fieldset'} already has a field for ${spec.label.toLowerCase()}.`)
  const wasNamed = old && old in PROPS ? r.name === PROPS[old as PropKey].label : false
  const next: ModelRange = { ...r, name: wasNamed ? spec.label : r.name, min: spec.slider[0], rest: spec.slider[1], max: spec.slider[2], unit: spec.unit, rand: null, limit: null, drives: r.drives.map((d, i) => (i === at ? driveFor(ref, spec) : d)) }
  return done({ ...c, ranges: c.ranges.map(x => (x.id === rangeId ? next : x)) })
}

// ---- who is offered what ----

// The preset a fieldset waits on (a variant or a style): its fields are offered while the preset is on.
export const waitsOn = (c: ModelContent, f: ModelFieldset): ModelPreset | undefined => (f.ownerKind === 'preset' ? (c.presets ?? []).find(p => p.id === f.owner) : undefined)

// Whether a fieldset is offered with the figure as it is: always, unless it belongs to a preset that is not on.
export function isOffered(c: ModelContent, s: TestState, f: ModelFieldset): boolean {
  const p = waitsOn(c, f)
  return f.ownerKind !== 'preset' || (!!p && isOn(c, s, p))
}

// The fieldsets the Fields tab lists for a thing: those it owns, and those bound to it (an object's shapes' own fields too).
export function fieldsetsFor(c: ModelContent, owner: OwnerRef | null, ref: FeatureRef | null): ModelFieldset[] {
  return fieldsetsOf(c).filter(f => (!!owner && f.ownerKind === owner.kind && f.owner === owner.id) || (!!ref && sameFeature(featureOf(f), ref)))
}

