import type { OutlineNode, PlotCustomFieldDef, PlotFieldSet, PlotNode, TimeSystem } from '../../../api/types'
import { insertAfter } from '../../../lib/siblingOrder'
import { isPlaced, placementsOf, repairPlacements } from './plotPlacement'
import { orderAssignedPlotpoints } from './plotTree'

// Fields and their values. A field (a PlotCustomFieldDef) is defined on a
// category, a subcategory, a cluster or a plotline; each value in it is a plotpoint.
//   - a value defined on a plotline is that plotline's own;
//   - a value defined on a category, subcategory or cluster is shown on every plotline
//     under it as a REFERENCE (a plotpoint with `refId`, whose text is the
//     original's), which the plotline places on its own chapters, acts, scenes and moments (as many times as it likes: plotPlacement.ts);
//   - a plotline can also add its own values to an inherited field.
// A node can also define FIELDSETS (a PlotFieldSet): named groups its fields are listed under (a field has `setId`; none = a loose field,
// in at most one set). A set shows on every plotline under the node as its fields do; only the node's own editor changes it, and a
// plotline's own fields go in its own sets. A node lists its loose fields first, then its sets, then (a plotline) its Scrap field.
// Everything here is pure: the workspace applies the results.

export const FIELD_NAME_MAX = 30
export const FIELDSET_NAME_MAX = 30
export const MAX_FIELDSETS = 20
export const TITLE_MAX = 50
export const BODY_MAX = 255
export const DEFAULT_FIELD_NAME = 'Default'
export const SCRAP_FIELD_NAME = 'Scrap'

export type MakeId = (prefix: string) => string
export const randomId: MakeId = prefix => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

export type FieldScope = 'plotline' | 'cluster' | 'subcategory' | 'category'
export interface FieldInfo { def: PlotCustomFieldDef; owner: PlotNode; scope: FieldScope }

const byId = (nodes: PlotNode[]) => new Map(nodes.map(n => [n.id, n]))
const nextOrder = (nodes: PlotNode[], parentId: string | null) => {
  const siblings = nodes.filter(n => n.parentId === parentId)
  return siblings.length === 0 ? 0 : Math.max(...siblings.map(s => s.order)) + 1
}
const blank = { body: '', sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null }

// A plotline's Scrap field id: it holds the assigned values of fields that were deleted.
export const scrapFieldId = (plotlineId: string) => `scrap-${plotlineId}`
export const isScrapField = (def: { id: string }) => def.id.startsWith('scrap-')

export const clampTitle = (s: string) => s.slice(0, TITLE_MAX)
export const clampBody = (s: string) => s.slice(0, BODY_MAX)
export const clampFieldName = (s: string) => s.trim().slice(0, FIELD_NAME_MAX)

// ---- reading ----

// `node` and its ancestors, nearest first.
export function chainOf(node: PlotNode, index: Map<string, PlotNode>): PlotNode[] {
  const out: PlotNode[] = []
  for (let current: PlotNode | undefined = node, guard = 0; current && guard < 8; guard += 1) {
    out.push(current)
    current = current.parentId ? index.get(current.parentId) : undefined
  }
  return out
}

const scopeOf = (n: PlotNode): FieldScope | null => (n.kind === 'plotpoint' ? null : n.kind)

// The fields a plotline shows, grouped by where they are defined (Scrap is the plotline's last).
export function fieldGroups(plotline: PlotNode, index: Map<string, PlotNode>): Record<FieldScope, FieldInfo[]> {
  const groups: Record<FieldScope, FieldInfo[]> = { plotline: [], cluster: [], subcategory: [], category: [] }
  for (const owner of chainOf(plotline, index)) {
    const scope = scopeOf(owner)
    if (scope) groups[scope].push(...owner.customFieldDefs.map(def => ({ def, owner, scope })))
  }
  groups.plotline.sort((a, b) => Number(isScrapField(a.def)) - Number(isScrapField(b.def)))
  return groups
}

// Every field of every node, by id.
export function fieldIndex(nodes: PlotNode[]): Map<string, FieldInfo> {
  const out = new Map<string, FieldInfo>()
  for (const owner of nodes) {
    const scope = scopeOf(owner)
    if (scope) for (const def of owner.customFieldDefs) out.set(def.id, { def, owner, scope })
  }
  return out
}

// ---- fieldsets ----

export const setsOf = (node: PlotNode): PlotFieldSet[] => node.customFieldSets ?? []

// The field with its set changed (none = loose); the key is left out when it is not in one, so a loose field stays `{ id, name }`.
const withSet = (def: PlotCustomFieldDef, setId: string | null): PlotCustomFieldDef => {
  const { setId: _old, ...rest } = def
  return setId ? { ...rest, setId } : rest
}

// A node's fields as it lists them: the loose ones, then its sets (each with its fields, in order), then (a plotline) its Scrap field.
// A field that names a set the node does not have is loose.
export interface FieldLayout {
  loose: PlotCustomFieldDef[]
  sets: Array<{ set: PlotFieldSet; fields: PlotCustomFieldDef[] }>
  scrap: PlotCustomFieldDef | null
}
export function fieldLayout(node: PlotNode): FieldLayout {
  const sets = setsOf(node)
  const known = new Set(sets.map(s => s.id))
  const defs = node.customFieldDefs
  return {
    loose: defs.filter(d => !isScrapField(d) && !(d.setId && known.has(d.setId))),
    sets: sets.map(set => ({ set, fields: defs.filter(d => !isScrapField(d) && d.setId === set.id) })),
    scrap: defs.find(d => isScrapField(d)) ?? null,
  }
}

// The same fields in the order they are listed (the order Tab goes through them).
export function fieldsInOrder(node: PlotNode): PlotCustomFieldDef[] {
  const layout = fieldLayout(node)
  return [...layout.loose, ...layout.sets.flatMap(s => s.fields), ...(layout.scrap ? [layout.scrap] : [])]
}

// What a plotline shows from one place its fields come from (its own, its cluster's, its subcategory's, its category's): the owners that
// define something there, and their loose fields, sets and Scrap field with where each comes from.
export interface ScopeLayout {
  owners: PlotNode[]
  loose: FieldInfo[]
  sets: Array<{ set: PlotFieldSet; owner: PlotNode; fields: FieldInfo[] }>
  scrap: FieldInfo | null
}
export function scopeLayouts(plotline: PlotNode, index: Map<string, PlotNode>): Record<FieldScope, ScopeLayout> {
  const empty = (): ScopeLayout => ({ owners: [], loose: [], sets: [], scrap: null })
  const out: Record<FieldScope, ScopeLayout> = { plotline: empty(), cluster: empty(), subcategory: empty(), category: empty() }
  for (const owner of chainOf(plotline, index)) {
    const scope = scopeOf(owner)
    if (!scope) continue
    const layout = fieldLayout(owner)
    const info = (def: PlotCustomFieldDef): FieldInfo => ({ def, owner, scope })
    const bucket = out[scope]
    if (owner.customFieldDefs.length > 0 || setsOf(owner).length > 0) bucket.owners.push(owner)
    bucket.loose.push(...layout.loose.map(info))
    bucket.sets.push(...layout.sets.map(s => ({ set: s.set, owner, fields: s.fields.map(info) })))
    if (layout.scrap) bucket.scrap = info(layout.scrap)
  }
  return out
}

// The values held by a node in one of its fields (own values and references), in stored order.
export function valuesIn(nodes: PlotNode[], holderId: string, fieldId: string): PlotNode[] {
  return nodes.filter(n => n.kind === 'plotpoint' && n.parentId === holderId && n.fieldId === fieldId).sort((a, b) => a.order - b.order)
}

// A value's title and description: a reference reads the original's.
export function textOf(point: PlotNode, index: Map<string, PlotNode>): { title: string; body: string } {
  const original = point.refId ? index.get(point.refId) : undefined
  return original ? { title: original.title, body: original.body } : { title: point.title, body: point.body }
}

// Values not placed yet first, then the placed ones by book, then chapter (each at its earliest placement).
export function orderValues(points: PlotNode[], outlineNodes: OutlineNode[], systems: TimeSystem[], mode: 'time' | 'story' = 'time'): PlotNode[] {
  const outlineById = new Map(outlineNodes.map(n => [n.id, n]))
  const open = points.filter(p => !isPlaced(p, outlineById)).sort((a, b) => a.order - b.order)
  const placed = orderAssignedPlotpoints(points.filter(p => isPlaced(p, outlineById)), outlineNodes, systems, mode)
  return [...open, ...placed]
}

// ---- fields ----

// A new field goes after `afterFieldId` and joins that field's set; with `setId` (a set of the owner) it goes at the end of that set instead
// (null: loose).
export function addField(
  nodes: PlotNode[], ownerId: string, name: string, makeId: MakeId = randomId, afterFieldId?: string, setId?: string | null,
): { nodes: PlotNode[]; id: string | null } {
  const clean = clampFieldName(name)
  const owner = nodes.find(n => n.id === ownerId)
  if (!owner || !scopeOf(owner)) return { nodes, id: null }
  const defs = [...owner.customFieldDefs]
  const after = afterFieldId ? defs.find(d => d.id === afterFieldId) : undefined
  const wanted = setId !== undefined ? setId : after?.setId ?? null
  const inSet = wanted && setsOf(owner).some(s => s.id === wanted) ? wanted : null
  const def: PlotCustomFieldDef = { id: makeId('field'), name: clean, ...(inSet ? { setId: inSet } : {}) }
  let at = afterFieldId && setId === undefined ? defs.findIndex(d => d.id === afterFieldId) : -1
  if (at >= 0) at += 1
  else if (inSet) {
    const last = defs.reduce((found, d, i) => (d.setId === inSet ? i : found), -1)
    at = last >= 0 ? last + 1 : defs.length
  } else at = defs.length
  defs.splice(at, 0, def)
  // The plotline's Scrap stays last.
  defs.sort((a, b) => Number(isScrapField(a)) - Number(isScrapField(b)))
  return { nodes: nodes.map(n => (n.id === ownerId ? { ...n, customFieldDefs: defs } : n)), id: def.id }
}

// The name is kept as typed (up to the limit); the editor trims it and drops a blank one when it is left.
export function renameField(nodes: PlotNode[], ownerId: string, fieldId: string, name: string): PlotNode[] {
  if (isScrapField({ id: fieldId })) return nodes
  const kept = name.slice(0, FIELD_NAME_MAX)
  return nodes.map(n => (n.id === ownerId ? { ...n, customFieldDefs: n.customFieldDefs.map(d => (d.id === fieldId ? { ...d, name: kept } : d)) } : n))
}

// Put a field before another of the same owner (last when `beforeId` is null). Before a field it is listed in that field's set (loose if
// that one is); moved last it keeps its own.
export function moveField(nodes: PlotNode[], ownerId: string, fieldId: string, beforeId: string | null): PlotNode[] {
  return nodes.map(n => {
    if (n.id !== ownerId) return n
    const moving = n.customFieldDefs.find(d => d.id === fieldId)
    if (!moving || isScrapField(moving) || fieldId === beforeId) return n
    const target = beforeId ? n.customFieldDefs.find(d => d.id === beforeId) : undefined
    const placed = target ? withSet(moving, target.setId ?? null) : moving
    const rest = n.customFieldDefs.filter(d => d.id !== fieldId)
    const at = beforeId ? rest.findIndex(d => d.id === beforeId) : -1
    rest.splice(at >= 0 ? at : rest.length, 0, placed)
    rest.sort((a, b) => Number(isScrapField(a)) - Number(isScrapField(b)))
    return { ...n, customFieldDefs: rest }
  })
}

// ---- fieldsets: made, named, ordered, deleted, and fields put into them ----

export const clampSetName = (s: string) => s.trim().slice(0, FIELDSET_NAME_MAX)

// A new set after `afterSetId` (last when there is none). A node has at most MAX_FIELDSETS.
export function addFieldset(
  nodes: PlotNode[], ownerId: string, name = '', makeId: MakeId = randomId, afterSetId?: string,
): { nodes: PlotNode[]; id: string | null } {
  const owner = nodes.find(n => n.id === ownerId)
  if (!owner || !scopeOf(owner) || setsOf(owner).length >= MAX_FIELDSETS) return { nodes, id: null }
  const set: PlotFieldSet = { id: makeId('set'), name: name.slice(0, FIELDSET_NAME_MAX) }
  const sets = [...setsOf(owner)]
  const at = afterSetId ? sets.findIndex(s => s.id === afterSetId) : -1
  sets.splice(at >= 0 ? at + 1 : sets.length, 0, set)
  return { nodes: nodes.map(n => (n.id === ownerId ? { ...n, customFieldSets: sets } : n)), id: set.id }
}

// The name is kept as typed (up to the limit); the editor trims it and drops a blank set that holds nothing when it is left.
export function renameFieldset(nodes: PlotNode[], ownerId: string, setId: string, name: string): PlotNode[] {
  const kept = name.slice(0, FIELDSET_NAME_MAX)
  return nodes.map(n => (n.id === ownerId ? { ...n, customFieldSets: setsOf(n).map(s => (s.id === setId ? { ...s, name: kept } : s)) } : n))
}

// Put a set before another of the same owner (last when `beforeId` is null).
export function moveFieldset(nodes: PlotNode[], ownerId: string, setId: string, beforeId: string | null): PlotNode[] {
  return nodes.map(n => {
    if (n.id !== ownerId) return n
    const moving = setsOf(n).find(s => s.id === setId)
    if (!moving || setId === beforeId) return n
    const rest = setsOf(n).filter(s => s.id !== setId)
    const at = beforeId ? rest.findIndex(s => s.id === beforeId) : -1
    rest.splice(at >= 0 ? at : rest.length, 0, moving)
    return { ...n, customFieldSets: rest }
  })
}

// Delete a set: its fields stay, as loose fields (in the order they had).
export function deleteFieldset(nodes: PlotNode[], ownerId: string, setId: string): PlotNode[] {
  return nodes.map(n => {
    if (n.id !== ownerId || !setsOf(n).some(s => s.id === setId)) return n
    return { ...n, customFieldSets: setsOf(n).filter(s => s.id !== setId), customFieldDefs: n.customFieldDefs.map(d => (d.setId === setId ? withSet(d, null) : d)) }
  })
}

// List a field under a set of its owner (null: take it out, loose), at the end of that group or before `beforeFieldId`. A field is in one
// set at most; the Scrap field is never in one. A field dropped on the set it is already in stays where it is.
export function setFieldSet(nodes: PlotNode[], ownerId: string, fieldId: string, setId: string | null, beforeFieldId: string | null = null): PlotNode[] {
  return nodes.map(n => {
    if (n.id !== ownerId) return n
    const moving = n.customFieldDefs.find(d => d.id === fieldId)
    if (!moving || isScrapField(moving) || fieldId === beforeFieldId) return n
    if (setId && !setsOf(n).some(s => s.id === setId)) return n
    if ((moving.setId ?? null) === setId && !beforeFieldId) return n
    const placed = withSet(moving, setId)
    const rest = n.customFieldDefs.filter(d => d.id !== fieldId)
    let at = beforeFieldId ? rest.findIndex(d => d.id === beforeFieldId) : -1
    if (at < 0) {
      // The end of the group it goes to; a group with nothing in it yet leaves the field where it is in the list.
      const last = rest.reduce((found, d, i) => ((d.setId ?? null) === setId && !isScrapField(d) ? i : found), -1)
      at = last >= 0 ? last + 1 : Math.min(n.customFieldDefs.indexOf(moving), rest.length)
    }
    rest.splice(at, 0, placed)
    rest.sort((a, b) => Number(isScrapField(a)) - Number(isScrapField(b)))
    return { ...n, customFieldDefs: rest }
  })
}

// ---- values ----

export function addValue(nodes: PlotNode[], holderId: string, fieldId: string, makeId: MakeId = randomId, afterId?: string): { nodes: PlotNode[]; id: string | null } {
  const holder = nodes.find(n => n.id === holderId)
  if (!holder || !scopeOf(holder)) return { nodes, id: null }
  const id = makeId('plot')
  const point: PlotNode = {
    ...blank, id, kind: 'plotpoint', parentId: holderId, order: nextOrder(nodes, holderId), title: '', fieldId, refId: null, placements: [],
  }
  const inField = (n: PlotNode) => n.parentId === holderId && n.kind === 'plotpoint' && n.fieldId === fieldId
  return { nodes: insertAfter(nodes, point, afterId, n => (afterId ? inField(n) : n.parentId === holderId)), id }
}

// Edit an own value's text (a reference is read-only), within the limits.
export function updateValue(nodes: PlotNode[], id: string, patch: { title?: string; body?: string }): PlotNode[] {
  return nodes.map(n => {
    if (n.id !== id || n.kind !== 'plotpoint' || n.refId) return n
    return {
      ...n,
      ...(patch.title !== undefined ? { title: clampTitle(patch.title) } : {}),
      ...(patch.body !== undefined ? { body: clampBody(patch.body) } : {}),
    }
  })
}

// A value can move between the plotline's own fields (and Scrap) while it is
// its own and not placed anywhere.
export function canMoveValue(point: PlotNode, toFieldId: string, index: Map<string, PlotNode>, outlineById: Map<string, OutlineNode>): boolean {
  if (point.kind !== 'plotpoint' || point.refId || isPlaced(point, outlineById)) return false
  const plotline = point.parentId ? index.get(point.parentId) : undefined
  if (plotline?.kind !== 'plotline') return false
  return plotline.customFieldDefs.some(d => d.id === toFieldId)
}

export function moveValue(nodes: PlotNode[], id: string, toFieldId: string, outlineById: Map<string, OutlineNode>): PlotNode[] {
  const index = byId(nodes)
  const point = index.get(id)
  if (!point || !canMoveValue(point, toFieldId, index, outlineById)) return nodes
  return nodes.map(n => (n.id === id ? { ...n, fieldId: toFieldId } : n))
}

// The plotline's field with this name (case-insensitive), made when it has none.
function plotlineFieldNamed(nodes: PlotNode[], plotlineId: string, name: string, makeId: MakeId): { nodes: PlotNode[]; id: string } {
  const plotline = nodes.find(n => n.id === plotlineId)!
  const found = plotline.customFieldDefs.find(d => !isScrapField(d) && d.name.trim().toLowerCase() === name.trim().toLowerCase())
  if (found) return { nodes, id: found.id }
  const added = addField(nodes, plotlineId, name, makeId)
  return { nodes: added.nodes, id: added.id! }
}

function scrapFieldOf(nodes: PlotNode[], plotlineId: string): { nodes: PlotNode[]; id: string } {
  const id = scrapFieldId(plotlineId)
  const plotline = nodes.find(n => n.id === plotlineId)!
  if (plotline.customFieldDefs.some(d => d.id === id)) return { nodes, id }
  const defs = [...plotline.customFieldDefs, { id, name: SCRAP_FIELD_NAME }]
  return { nodes: nodes.map(n => (n.id === plotlineId ? { ...n, customFieldDefs: defs } : n)), id }
}

// A reference whose original is going away, kept as the plotline's own value in a
// plotline field named like the original's.
function detach(nodes: PlotNode[], refId: string, original: PlotNode | undefined, fieldName: string, makeId: MakeId): PlotNode[] {
  const ref = nodes.find(n => n.id === refId)
  if (!ref || !ref.parentId) return nodes
  const field = plotlineFieldNamed(nodes, ref.parentId, fieldName, makeId)
  return field.nodes.map(n => (n.id === refId
    ? { ...n, refId: null, fieldId: field.id, title: clampTitle(original?.title ?? n.title ?? '') || 'Untitled', body: clampBody(original?.body ?? n.body) }
    : n))
}

// Remove a value. An own value goes only while it is not placed; a reference never goes
// from a plotline. Deleting a value defined on a category, subcategory or cluster removes
// its references, except the placed ones, which become the plotline's own values
// in a plotline field of the same name.
export function deleteValue(nodes: PlotNode[], id: string, outlineById: Map<string, OutlineNode>, makeId: MakeId = randomId): PlotNode[] {
  const value = nodes.find(n => n.id === id)
  if (!value || value.kind !== 'plotpoint' || value.refId) return nodes
  const holder = value.parentId ? nodes.find(n => n.id === value.parentId) : undefined
  if (!holder) return nodes
  if (holder.kind === 'plotline') return isPlaced(value, outlineById) ? nodes : nodes.filter(n => n.id !== id)

  const fieldName = holder.customFieldDefs.find(d => d.id === value.fieldId)?.name ?? DEFAULT_FIELD_NAME
  let next = nodes
  for (const ref of nodes.filter(n => n.refId === id)) {
    next = isPlaced(ref, outlineById) ? detach(next, ref.id, value, fieldName, makeId) : next.filter(n => n.id !== ref.id)
  }
  return next.filter(n => n.id !== id)
}

// Remove a field. On a category, subcategory or cluster: every value goes as above, and the
// plotlines' own values in it keep only the placed ones (in a plotline field of the
// same name). On a plotline: placed values move to its Scrap field, the rest go.
export function deleteField(nodes: PlotNode[], ownerId: string, fieldId: string, outlineById: Map<string, OutlineNode>, makeId: MakeId = randomId): PlotNode[] {
  const owner = nodes.find(n => n.id === ownerId)
  const def = owner?.customFieldDefs.find(d => d.id === fieldId)
  if (!owner || !def || isScrapField(def)) return nodes
  let next = nodes

  if (owner.kind === 'plotline') {
    for (const v of valuesIn(nodes, ownerId, fieldId)) {
      if (isPlaced(v, outlineById)) {
        const scrap = scrapFieldOf(next, ownerId)
        next = scrap.nodes.map(n => (n.id === v.id ? { ...n, fieldId: scrap.id } : n))
      } else next = next.filter(n => n.id !== v.id)
    }
  } else {
    // The originals (with their references)...
    for (const v of valuesIn(nodes, ownerId, fieldId)) next = deleteValue(next, v.id, outlineById, makeId)
    // ...and what plotlines added to the field themselves.
    for (const own of next.filter(n => n.kind === 'plotpoint' && n.fieldId === fieldId && !n.refId && n.parentId !== ownerId)) {
      const parent = own.parentId ? next.find(n => n.id === own.parentId) : undefined
      if (parent?.kind !== 'plotline') continue
      if (isPlaced(own, outlineById)) {
        const field = plotlineFieldNamed(next, parent.id, def.name, makeId)
        next = field.nodes.map(n => (n.id === own.id ? { ...n, fieldId: field.id } : n))
      } else next = next.filter(n => n.id !== own.id)
    }
  }
  return next.map(n => (n.id === ownerId ? { ...n, customFieldDefs: n.customFieldDefs.filter(d => d.id !== fieldId) } : n))
}

// ---- references ----

// Make every plotline hold exactly one reference per value defined on its category,
// subcategory and cluster. Idempotent; returns the same array when nothing changes. A
// reference whose original is gone (or no longer above its plotline) is kept as the
// plotline's own value when placed, and dropped otherwise.
export function syncReferences(nodes: PlotNode[], outlineById: Map<string, OutlineNode> = new Map(), makeId: MakeId = randomId): PlotNode[] {
  let next = nodes
  const index = byId(nodes)
  for (const plotline of nodes.filter(n => n.kind === 'plotline')) {
    const wanted = new Map<string, { original: PlotNode; fieldId: string }>()
    for (const owner of chainOf(plotline, index).slice(1)) {
      if (owner.kind !== 'category' && owner.kind !== 'subcategory' && owner.kind !== 'cluster') continue
      for (const def of owner.customFieldDefs) {
        for (const original of valuesIn(nodes, owner.id, def.id)) wanted.set(original.id, { original, fieldId: def.id })
      }
    }
    const refs = next.filter(n => n.kind === 'plotpoint' && n.parentId === plotline.id && n.refId)
    for (const ref of refs) {
      if (wanted.has(ref.refId!)) continue
      const original = index.get(ref.refId!)
      const placed = outlineById.size > 0 ? isPlaced(ref, outlineById) : placementsOf(ref).length > 0
      const fieldName = original?.parentId ? index.get(original.parentId)?.customFieldDefs.find(d => d.id === original.fieldId)?.name : undefined
      next = placed ? detach(next, ref.id, original, fieldName ?? DEFAULT_FIELD_NAME, makeId) : next.filter(n => n.id !== ref.id)
    }
    const have = new Set(refs.map(r => r.refId))
    for (const [originalId, { fieldId }] of wanted) {
      if (have.has(originalId)) continue
      next = [...next, {
        ...blank, id: `${plotline.id}~${originalId}`, kind: 'plotpoint', parentId: plotline.id, order: nextOrder(next, plotline.id),
        title: '', fieldId, refId: originalId, placements: [],
      }]
    }
  }
  return next
}

// ---- migration ----

// Bring a plot saved before fields had values into the new shape. Idempotent.
//   - a plotpoint's old single place (assignedMomentId) becomes its first placement, a place on a book, arc or series (only chapters, acts,
//     scenes and moments take plotpoints) is dropped, there is one placement to a target, and an awareness only on a moment (plotPlacement.ts);
//   - a plotline's old template-field values become values of that field;
//   - plotpoints with no field go into a plotline field called "Default";
//   - titles and descriptions keep to their limits, and a nameless plotpoint is named or dropped.
export function migratePlot(nodes: PlotNode[], outlineNodes: OutlineNode[], makeId: MakeId = randomId): PlotNode[] {
  const outlineById = new Map(outlineNodes.map(n => [n.id, n]))
  const index = byId(nodes)
  let next: PlotNode[] = nodes.map(n => {
    const point = { ...n, fieldId: n.fieldId ?? null, refId: n.refId ?? null }
    return n.kind === 'plotpoint' ? repairPlacements(point, outlineById, () => makeId('pl')) : point
  })

  // Old single values, mirrored (or not yet) as a plotpoint with sourceFieldId.
  for (const plotline of nodes.filter(n => n.kind === 'plotline')) {
    const values = Object.entries(plotline.customFieldValues ?? {}).filter(([, text]) => text.trim() !== '')
    for (const [fieldId, text] of values) {
      const mirror = next.find(n => n.kind === 'plotpoint' && n.parentId === plotline.id && n.sourceFieldId === fieldId)
      if (mirror) next = next.map(n => (n.id === mirror.id ? { ...n, fieldId } : n))
      else next = [...next, { ...blank, id: makeId('plot'), kind: 'plotpoint', parentId: plotline.id, order: nextOrder(next, plotline.id), title: text.trim(), fieldId, refId: null, placements: [] }]
    }
    next = next.map(n => (n.id === plotline.id ? { ...n, customFieldValues: {} } : n))
  }

  for (const point of next.filter(n => n.kind === 'plotpoint' && !n.refId)) {
    const placed = isPlaced(point, outlineById)
    const patch: Partial<PlotNode> = {}
    const parent = point.parentId ? index.get(point.parentId) ?? next.find(n => n.id === point.parentId) : undefined
    if (!point.fieldId && parent?.kind === 'plotline') {
      const field = plotlineFieldNamed(next, parent.id, DEFAULT_FIELD_NAME, makeId)
      next = field.nodes
      patch.fieldId = field.id
    }
    let title = clampTitle(point.title)
    if (title.trim() === '') {
      const inUse = point.body.trim() !== '' || placed
      if (!inUse) { next = next.filter(n => n.id !== point.id); continue }
      title = 'Untitled'
    }
    patch.title = title
    patch.body = clampBody(point.body)
    next = next.map(n => (n.id === point.id ? { ...n, ...patch } : n))
  }

  // A field left with no name and no values is dropped.
  next = next.map(n => (n.customFieldDefs.some(d => d.name.trim() === '' && !isScrapField(d) && !next.some(v => v.fieldId === d.id))
    ? { ...n, customFieldDefs: n.customFieldDefs.filter(d => d.name.trim() !== '' || isScrapField(d) || next.some(v => v.fieldId === d.id)) }
    : n))

  // A field that names a set its node does not have is loose.
  next = next.map(n => {
    const known = new Set(setsOf(n).map(s => s.id))
    if (!n.customFieldDefs.some(d => d.setId && !known.has(d.setId))) return n
    return { ...n, customFieldDefs: n.customFieldDefs.map(d => (d.setId && !known.has(d.setId) ? withSet(d, null) : d)) }
  })

  return syncReferences(next, outlineById, makeId)
}

// The name of the field a plotpoint belongs to (looked up on its plotline and the nodes above it).
export function fieldNameOf(point: PlotNode, index: Map<string, PlotNode>): string {
  const start = point.parentId ? index.get(point.parentId) : undefined
  if (!start || !point.fieldId) return ''
  for (const owner of chainOf(start, index)) {
    const def = owner.customFieldDefs.find(d => d.id === point.fieldId)
    if (def) return def.name
  }
  return ''
}
