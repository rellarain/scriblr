import type { OutlineNode, PlotCustomFieldDef, PlotFieldKind, PlotFieldOption, PlotNode } from '../../../api/types'
import { chainOf, clampTitle, fieldIndex, isScrapField, newPoint, randomId, valuesIn, type MakeId } from './plotFields'
import { MAX_OPTIONS, clampLabel, hasOptions, kindOf, optionsOf } from './plotKinds'
import { placedCount } from './plotPlacement'

// Choice fields: a field's kind and options, and the answers (plotKinds.ts says what they are). Everything here is pure: the workspace
// applies the results.
//   the field   its kind is set while it has no values at all; a multi-select or dropdown has options, added, renamed, ordered and removed
//               by the node that defines the field
//   an answer   the plotpoint a node makes by ticking an option, picking one or writing the text: it belongs to that node (the plotline, or
//               the category, subcategory or cluster that defines the field), is titled with the option's label (or is the text) and is
//               placed like any plotpoint
// A plotline answers every choice field above it (and its own) for itself; the answer of the node that defines the field is shown on the
// plotline, read-only, not copied (a choice field makes no references).

const byId = (nodes: PlotNode[]) => new Map(nodes.map(n => [n.id, n]))

// The field `fieldId` as `holderId` sees it (its own or one above it), when it is one of these kinds.
function answerable(nodes: PlotNode[], holderId: string, fieldId: string, kinds: PlotFieldKind[]): PlotCustomFieldDef | null {
  const holder = nodes.find(n => n.id === holderId)
  if (!holder || holder.kind === 'plotpoint') return null
  for (const owner of chainOf(holder, byId(nodes))) {
    const def = owner.customFieldDefs.find(d => d.id === fieldId)
    if (def) return kinds.includes(kindOf(def)) ? def : null
  }
  return null
}

const withDef = (nodes: PlotNode[], ownerId: string, fieldId: string, change: (def: PlotCustomFieldDef) => PlotCustomFieldDef): PlotNode[] =>
  nodes.map(n => (n.id === ownerId ? { ...n, customFieldDefs: n.customFieldDefs.map(d => (d.id === fieldId ? change(d) : d)) } : n))

// ---- the field's kind ----

// Whether the field has any value (or answer) yet, anywhere: its kind is fixed from then on.
export const fieldHasValues = (nodes: PlotNode[], fieldId: string): boolean => nodes.some(n => n.kind === 'plotpoint' && n.fieldId === fieldId)

// Change a field's kind, while it has no values. A multi-select and a dropdown share their options; any other change drops them.
export function setFieldKind(nodes: PlotNode[], ownerId: string, fieldId: string, kind: PlotFieldKind): PlotNode[] {
  const def = nodes.find(n => n.id === ownerId)?.customFieldDefs.find(d => d.id === fieldId)
  if (!def || isScrapField(def) || kindOf(def) === kind || fieldHasValues(nodes, fieldId)) return nodes
  const { kind: _kind, options: _options, ...rest } = def
  const keep = hasOptions({ kind }) && hasOptions(def)
  const next: PlotCustomFieldDef = { ...rest, ...(kind === 'points' ? {} : { kind }), ...(keep ? { options: optionsOf(def) } : {}) }
  return withDef(nodes, ownerId, fieldId, () => next)
}

// ---- options ----

// A new option last, with its label cut to the limit; none when the label is blank, taken (compared without case), or the field is full.
export function addOption(nodes: PlotNode[], ownerId: string, fieldId: string, label: string, makeId: MakeId = randomId): { nodes: PlotNode[]; id: string | null } {
  const def = nodes.find(n => n.id === ownerId)?.customFieldDefs.find(d => d.id === fieldId)
  const clean = clampLabel(label.trim())
  if (!def || !hasOptions(def) || clean === '' || optionsOf(def).length >= MAX_OPTIONS) return { nodes, id: null }
  if (optionsOf(def).some(o => o.label.trim().toLowerCase() === clean.toLowerCase())) return { nodes, id: null }
  const option: PlotFieldOption = { id: makeId('opt'), label: clean }
  return { nodes: withDef(nodes, ownerId, fieldId, d => ({ ...d, options: [...optionsOf(d), option] })), id: option.id }
}

// The label is kept as typed (up to the limit; the editor trims it and drops an option left blank), and every answer with this option is
// titled with it.
export function renameOption(nodes: PlotNode[], ownerId: string, fieldId: string, optionId: string, label: string): PlotNode[] {
  const def = nodes.find(n => n.id === ownerId)?.customFieldDefs.find(d => d.id === fieldId)
  if (!def || !optionsOf(def).some(o => o.id === optionId)) return nodes
  const kept = clampLabel(label)
  const renamed = withDef(nodes, ownerId, fieldId, d => ({ ...d, options: optionsOf(d).map(o => (o.id === optionId ? { ...o, label: kept } : o)) }))
  return renamed.map(n => (n.kind === 'plotpoint' && n.fieldId === fieldId && n.optionId === optionId ? { ...n, title: kept } : n))
}

// Put an option before another of the same field (last when `beforeId` is null).
export function moveOption(nodes: PlotNode[], ownerId: string, fieldId: string, optionId: string, beforeId: string | null): PlotNode[] {
  const def = nodes.find(n => n.id === ownerId)?.customFieldDefs.find(d => d.id === fieldId)
  const moving = def && optionsOf(def).find(o => o.id === optionId)
  if (!def || !moving || optionId === beforeId) return nodes
  const rest = optionsOf(def).filter(o => o.id !== optionId)
  const at = beforeId ? rest.findIndex(o => o.id === beforeId) : -1
  rest.splice(at >= 0 ? at : rest.length, 0, moving)
  return withDef(nodes, ownerId, fieldId, d => ({ ...d, options: rest }))
}

// What removing an option takes with it: the answers that use it (on every plotline and on the node that defines the field) and the places
// they have in the outline.
export function optionUse(nodes: PlotNode[], fieldId: string, optionId: string, outlineById: Map<string, OutlineNode>): { answers: number; placements: number } {
  const answers = nodes.filter(n => n.kind === 'plotpoint' && n.fieldId === fieldId && n.optionId === optionId)
  return { answers: answers.length, placements: answers.reduce((sum, a) => sum + placedCount(a, outlineById), 0) }
}

// Remove an option, and every answer that uses it (with its places).
export function removeOption(nodes: PlotNode[], ownerId: string, fieldId: string, optionId: string): PlotNode[] {
  const def = nodes.find(n => n.id === ownerId)?.customFieldDefs.find(d => d.id === fieldId)
  if (!def || !optionsOf(def).some(o => o.id === optionId)) return nodes
  const removed = withDef(nodes, ownerId, fieldId, d => ({ ...d, options: optionsOf(d).filter(o => o.id !== optionId) }))
  return removed.filter(n => !(n.kind === 'plotpoint' && n.fieldId === fieldId && n.optionId === optionId))
}

// ---- answers ----

// The answer of `holderId` to a field (a multi-select can have several), in the order made.
export const answersOf = (nodes: PlotNode[], holderId: string, fieldId: string): PlotNode[] => valuesIn(nodes, holderId, fieldId)

const option = (def: PlotCustomFieldDef, optionId: string) => optionsOf(def).find(o => o.id === optionId)

// Tick or untick an option of a multi-select for `holderId`. Unticking removes the answer with its places.
export function toggleOption(nodes: PlotNode[], holderId: string, fieldId: string, optionId: string, on: boolean, makeId: MakeId = randomId): PlotNode[] {
  const def = answerable(nodes, holderId, fieldId, ['multi'])
  const chosen = def && option(def, optionId)
  if (!def || !chosen) return nodes
  const current = answersOf(nodes, holderId, fieldId).filter(a => a.optionId === optionId)
  if (!on) return current.length === 0 ? nodes : nodes.filter(n => !current.includes(n))
  if (current.length > 0) return nodes
  return [...nodes, newPoint(nodes, holderId, fieldId, makeId('plot'), { title: chosen.label, optionId })]
}

// Pick the option of a dropdown for `holderId` (null: none). The answer it had, if any, goes with its places.
export function chooseOption(nodes: PlotNode[], holderId: string, fieldId: string, optionId: string | null, makeId: MakeId = randomId): PlotNode[] {
  const def = answerable(nodes, holderId, fieldId, ['dropdown'])
  const chosen = def && optionId ? option(def, optionId) : undefined
  if (!def || (optionId && !chosen)) return nodes
  const current = answersOf(nodes, holderId, fieldId)
  if (chosen ? current.length === 1 && current[0].optionId === chosen.id : current.length === 0) return nodes
  const without = nodes.filter(n => !current.includes(n))
  return chosen ? [...without, newPoint(without, holderId, fieldId, makeId('plot'), { title: chosen.label, optionId: chosen.id })] : without
}

// Write the text of a short-text field for `holderId`: the answer is made when there is text and its title changed after that. The text is
// kept as typed (up to the limit), so a space in the middle of typing stays; a blank one changes nothing, and the editor removes the answer
// when it is left (removeAnswer).
export function setTextAnswer(nodes: PlotNode[], holderId: string, fieldId: string, text: string, makeId: MakeId = randomId): PlotNode[] {
  if (!answerable(nodes, holderId, fieldId, ['text'])) return nodes
  const kept = clampTitle(text)
  const current = answersOf(nodes, holderId, fieldId)[0]
  if (current) return current.title === kept ? nodes : nodes.map(n => (n.id === current.id ? { ...n, title: kept } : n))
  if (kept.trim() === '') return nodes
  return [...nodes, newPoint(nodes, holderId, fieldId, makeId('plot'), { title: kept })]
}

// Take an answer away, with its places.
export function removeAnswer(nodes: PlotNode[], id: string): PlotNode[] {
  const answer = nodes.find(n => n.id === id)
  if (!answer || answer.kind !== 'plotpoint' || answer.refId || !answer.fieldId) return nodes
  const def = fieldIndex(nodes).get(answer.fieldId)?.def
  return def && kindOf(def) !== 'points' ? nodes.filter(n => n.id !== id) : nodes
}
