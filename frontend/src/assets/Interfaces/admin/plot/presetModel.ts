import type { PlotFieldKind, PresetCard, PresetCluster, PresetContent, PresetEntry, PresetField, PresetFieldset, PresetSubcategory } from '../../../../api/types'
import { BODY_MAX, FIELD_NAME_MAX, FIELDSET_NAME_MAX, MAX_FIELDSETS, TITLE_MAX } from '../../writer/plotFields'
import { MAX_OPTIONS, OPTION_LABEL_MAX } from '../../writer/plotKinds'

// The pure side of the Plot presets page: editing a preset's card tree, its limits and checks, how it compares with what was published,
// and the plain-words summary Publish shows. Nothing here touches the network or React.

// The same limits as the Plot editor, so a preset never holds anything the Writer would cut off.
export const NAME_MAX = TITLE_MAX
export const FIELD_MAX = FIELD_NAME_MAX
export const DESCRIPTION_MAX = BODY_MAX
export const KEYWORD_MAX = 50
export const HISTORY_MAX = 10
export const FIELDSET_MAX = FIELDSET_NAME_MAX
export const FIELDSETS_MAX = MAX_FIELDSETS
// Loose fields and the fields in fieldsets together, on one card (the server's limit).
export const FIELDS_MAX = 100
// The options of a multi-select or dropdown field: a label and how many, as in the Plot editor.
export const OPTION_MAX = OPTION_LABEL_MAX
export const OPTIONS_MAX = MAX_OPTIONS

export type MakeId = (prefix: string) => string
export const randomId: MakeId = prefix => `${prefix}-${Math.random().toString(36).slice(2, 10)}`

export type CardKind = 'category' | 'subcategory' | 'cluster'
// The card of the preset itself has no id of its own: it is addressed by this.
export const ROOT = ''

export const blankContent = (): PresetContent => ({ name: '', description: '', keywords: [], fields: [], fieldsets: [], subcategories: [] })
export const blankSubcategory = (id: string): PresetSubcategory => ({ id, name: '', description: '', keywords: [], fields: [], fieldsets: [], clusters: [] })
export const blankCluster = (id: string): PresetCluster => ({ id, name: '', description: '', keywords: [], fields: [], fieldsets: [] })

// ---- reading ----

export function findCard(content: PresetContent, id: string): { kind: CardKind; card: PresetCard; parentId: string | null } | null {
  if (id === ROOT) return { kind: 'category', card: content, parentId: null }
  for (const sub of content.subcategories) {
    if (sub.id === id) return { kind: 'subcategory', card: sub, parentId: ROOT }
    const cluster = sub.clusters.find(c => c.id === id)
    if (cluster) return { kind: 'cluster', card: cluster, parentId: sub.id }
  }
  return null
}

// Ids of the cards that share this card's parent, in order (the preset's own card has none).
export function siblingIds(content: PresetContent, id: string): string[] {
  const found = findCard(content, id)
  if (!found || found.kind === 'category') return []
  return found.kind === 'subcategory'
    ? content.subcategories.map(s => s.id)
    : content.subcategories.find(s => s.id === found.parentId)?.clusters.map(c => c.id) ?? []
}

// A field of a card: a plain field is its name; a multi-select, dropdown or short text is a name, a kind and the labels of its options.
export const fieldName = (field: PresetField): string => (typeof field === 'string' ? field : field.name)
export const fieldKind = (field: PresetField): PlotFieldKind => (typeof field === 'string' ? 'points' : field.kind)
export const fieldOptions = (field: PresetField): string[] => (typeof field === 'string' ? [] : field.options)
// Whether the field has options to choose from.
export const choosesFrom = (field: PresetField): boolean => fieldKind(field) === 'multi' || fieldKind(field) === 'dropdown'

// The field as another kind: a plain one is just its name, a short text has no options, and a multi-select and a dropdown keep theirs.
export function withKind(field: PresetField, kind: PlotFieldKind): PresetField {
  if (fieldKind(field) === kind) return field
  const name = fieldName(field)
  if (kind === 'points') return name
  return { name, kind, options: kind === 'text' ? [] : fieldOptions(field) }
}

// A card's fieldsets (an older preset has none), and how many fields it lists in all: the loose ones and the ones in its sets.
export const setsOf = (card: PresetCard): PresetFieldset[] => card.fieldsets ?? []
export const fieldTotal = (card: PresetCard): number => card.fields.length + setsOf(card).reduce((n, s) => n + s.fields.length, 0)

export function countOf(content: PresetContent): { subcategories: number; clusters: number; fields: number; fieldsets: number } {
  let clusters = 0
  let fields = fieldTotal(content)
  let fieldsets = setsOf(content).length
  for (const sub of content.subcategories) {
    clusters += sub.clusters.length
    fields += fieldTotal(sub) + sub.clusters.reduce((n, c) => n + fieldTotal(c), 0)
    fieldsets += setsOf(sub).length + sub.clusters.reduce((n, c) => n + setsOf(c).length, 0)
  }
  return { subcategories: content.subcategories.length, clusters, fields, fieldsets }
}

// A card with nothing in it: no text, no fields, no fieldsets, nothing nested.
export function isBlankCard(card: PresetCard): boolean {
  const nested = 'subcategories' in card ? card.subcategories.length : 'clusters' in card ? card.clusters.length : 0
  return !card.name.trim() && !card.description.trim() && card.keywords.length === 0 && card.fields.length === 0 && setsOf(card).length === 0 && nested === 0
}

// ---- cleaning ----

const clampText = (s: string, max: number) => s.trim().slice(0, max).trim()

function cleanList(values: string[], max: number, unique: boolean): string[] {
  const out: string[] = []
  for (const value of values) {
    const text = clampText(value, max)
    if (text && !(unique && out.includes(text))) out.push(text)
  }
  return out
}

// The labels of a field's options, trimmed and cut, without blanks or repeats (compared without case), within their limit.
function cleanOptions(labels: string[]): string[] {
  const out: string[] = []
  for (const label of labels) {
    const text = clampText(label, OPTION_MAX)
    if (text && !out.some(o => o.toLocaleLowerCase() === text.toLocaleLowerCase())) out.push(text)
  }
  return out.slice(0, OPTIONS_MAX)
}

// Fields with their names trimmed and cut and the blank ones dropped (a repeat is allowed); the options of a choice field the same, without
// repeats and within their limit, and a short text has none.
function cleanFields(fields: PresetField[]): PresetField[] {
  const out: PresetField[] = []
  for (const field of fields) {
    const name = clampText(fieldName(field), FIELD_MAX)
    if (!name) continue
    if (typeof field === 'string') { out.push(name); continue }
    out.push({ name, kind: field.kind, options: field.kind === 'text' ? [] : cleanOptions(field.options) })
  }
  return out
}

// A set with no name and no fields is dropped; one with fields is kept even unnamed (a set still being written; Publish is what asks for it).
function cleanFieldsets(sets: PresetFieldset[]): PresetFieldset[] {
  return sets
    .map(set => ({ name: clampText(set.name, FIELDSET_MAX), fields: cleanFields(set.fields) }))
    .filter(set => set.name !== '' || set.fields.length > 0)
    .slice(0, FIELDSETS_MAX)
}

function cleanBase<T extends PresetCard>(card: T): T {
  return {
    ...card,
    name: clampText(card.name, NAME_MAX), description: clampText(card.description, DESCRIPTION_MAX),
    keywords: cleanList(card.keywords, KEYWORD_MAX, true), fields: cleanFields(card.fields),
    fieldsets: cleanFieldsets(setsOf(card)),
  }
}

// What the server stores for a draft: text trimmed and cut to its limits, blank fields and keywords dropped, repeated keywords merged. A
// card with no name is kept (a card still being written); Publish is what asks for it.
export function normalizeContent(content: PresetContent): PresetContent {
  return {
    ...cleanBase(content),
    subcategories: content.subcategories.map(sub => ({ ...cleanBase(sub), clusters: sub.clusters.map(c => cleanBase(c)) })),
  }
}

export function sameContent(a: PresetContent, b: PresetContent): boolean {
  return JSON.stringify(normalizeContent(a)) === JSON.stringify(normalizeContent(b))
}

// ---- editing ----

type Patch = Partial<Pick<PresetCard, 'name' | 'description' | 'keywords' | 'fields' | 'fieldsets'>>

// Change one card's own text, keywords or fields.
export function updateCard(content: PresetContent, id: string, patch: Patch): PresetContent {
  if (id === ROOT) return { ...content, ...patch }
  return {
    ...content,
    subcategories: content.subcategories.map(sub => {
      if (sub.id === id) return { ...sub, ...patch }
      if (!sub.clusters.some(c => c.id === id)) return sub
      return { ...sub, clusters: sub.clusters.map(c => (c.id === id ? { ...c, ...patch } : c)) }
    }),
  }
}

function insertAt<T extends { id: string }>(list: T[], item: T, afterId?: string): T[] {
  const at = afterId ? list.findIndex(x => x.id === afterId) : -1
  return at >= 0 ? [...list.slice(0, at + 1), item, ...list.slice(at + 1)] : [...list, item]
}

// A new, empty subcategory after `afterId` (last when it is not given).
export function addSubcategory(content: PresetContent, id: string, afterId?: string): PresetContent {
  return { ...content, subcategories: insertAt(content.subcategories, blankSubcategory(id), afterId) }
}

// A new, empty cluster in a subcategory, after `afterId` (last when it is not given).
export function addCluster(content: PresetContent, subcategoryId: string, id: string, afterId?: string): PresetContent {
  return {
    ...content,
    subcategories: content.subcategories.map(sub => (sub.id === subcategoryId ? { ...sub, clusters: insertAt(sub.clusters, blankCluster(id), afterId) } : sub)),
  }
}

// A subcategory (with its clusters) or a cluster. The preset's own card cannot be removed from inside it.
export function removeCard(content: PresetContent, id: string): PresetContent {
  return {
    ...content,
    subcategories: content.subcategories.filter(s => s.id !== id).map(sub => ({ ...sub, clusters: sub.clusters.filter(c => c.id !== id) })),
  }
}

// Move `id` to just before `beforeId` (last when null) among the cards that share its parent.
export function moveCard(content: PresetContent, id: string, beforeId: string | null): PresetContent {
  const found = findCard(content, id)
  if (!found || found.kind === 'category' || id === beforeId) return content
  if (found.kind === 'subcategory') return { ...content, subcategories: moveBefore(content.subcategories, id, beforeId) }
  return {
    ...content,
    subcategories: content.subcategories.map(sub => (sub.id === found.parentId ? { ...sub, clusters: moveBefore(sub.clusters, id, beforeId) } : sub)),
  }
}

// `list` with the item `id` moved to just before `beforeId` (last when null or not in the list).
export function moveBefore<T extends { id: string }>(list: T[], id: string, beforeId: string | null): T[] {
  const moving = list.find(x => x.id === id)
  if (!moving || id === beforeId) return list
  const rest = list.filter(x => x.id !== id)
  const at = beforeId ? rest.findIndex(x => x.id === beforeId) : -1
  return at >= 0 ? [...rest.slice(0, at), moving, ...rest.slice(at)] : [...rest, moving]
}

// One place up (-1) or down (1) among its siblings: the keyboard route to the same move a drag makes.
export function nudge<T extends { id: string }>(list: T[], id: string, dir: -1 | 1): T[] {
  const at = list.findIndex(x => x.id === id)
  const to = at + dir
  if (at < 0 || to < 0 || to >= list.length) return list
  const out = [...list]
  ;[out[at], out[to]] = [out[to], out[at]]
  return out
}

export function addKeyword(content: PresetContent, id: string, keyword: string): PresetContent {
  const text = clampText(keyword, KEYWORD_MAX)
  const found = findCard(content, id)
  if (!text || !found || found.card.keywords.includes(text)) return content
  return updateCard(content, id, { keywords: [...found.card.keywords, text] })
}

export function removeKeyword(content: PresetContent, id: string, keyword: string): PresetContent {
  const found = findCard(content, id)
  return found ? updateCard(content, id, { keywords: found.card.keywords.filter(k => k !== keyword) }) : content
}

export function addFieldName(content: PresetContent, id: string, name: string): PresetContent {
  const text = clampText(name, FIELD_MAX)
  const found = findCard(content, id)
  if (!text || !found || fieldTotal(found.card) >= FIELDS_MAX) return content
  return updateCard(content, id, { fields: [...found.card.fields, text] })
}

// Fields may repeat, so they are addressed by their place.
export function removeFieldAt(content: PresetContent, id: string, index: number): PresetContent {
  const found = findCard(content, id)
  return found ? updateCard(content, id, { fields: found.card.fields.filter((_, i) => i !== index) }) : content
}

// `list` with the item at `from` moved to just before the one at `before` (last when null); the same list when nothing moves.
function moveIndex<T>(list: T[], from: number, before: number | null): T[] {
  if (from < 0 || from >= list.length || from === before) return list
  const out = [...list]
  const [moving] = out.splice(from, 1)
  const target = before === null ? out.length : before > from ? before - 1 : before
  out.splice(target, 0, moving)
  return out
}

// Move the field at `from` to just before the one at `before` (last when null).
export function moveFieldTo(content: PresetContent, id: string, from: number, before: number | null): PresetContent {
  const found = findCard(content, id)
  if (!found) return content
  const fields = moveIndex(found.card.fields, from, before)
  return fields === found.card.fields ? content : updateCard(content, id, { fields })
}

// ---- fieldsets: a card's named groups of field names, addressed by their place like the fields ----

function changeSets(content: PresetContent, id: string, change: (sets: PresetFieldset[], card: PresetCard) => PresetFieldset[]): PresetContent {
  const found = findCard(content, id)
  if (!found) return content
  const before = setsOf(found.card)
  const after = change(before, found.card)
  return after === before ? content : updateCard(content, id, { fieldsets: after })
}

// A new, unnamed set last (a card holds at most FIELDSETS_MAX).
export function addFieldset(content: PresetContent, id: string): PresetContent {
  return changeSets(content, id, sets => (sets.length >= FIELDSETS_MAX ? sets : [...sets, { name: '', fields: [] }]))
}

export function renameFieldsetAt(content: PresetContent, id: string, index: number, name: string): PresetContent {
  return changeSets(content, id, sets => (sets[index] ? sets.map((s, i) => (i === index ? { ...s, name: name.slice(0, FIELDSET_MAX) } : s)) : sets))
}

// Delete a set: its fields stay, added to the card's loose fields.
export function removeFieldsetAt(content: PresetContent, id: string, index: number): PresetContent {
  const found = findCard(content, id)
  const set = found && setsOf(found.card)[index]
  if (!found || !set) return content
  return updateCard(content, id, { fields: [...found.card.fields, ...set.fields], fieldsets: setsOf(found.card).filter((_, i) => i !== index) })
}

// Move the set at `from` to just before the one at `before` (last when null).
export function moveFieldsetTo(content: PresetContent, id: string, from: number, before: number | null): PresetContent {
  return changeSets(content, id, sets => moveIndex(sets, from, before))
}

export function addFieldNameToSet(content: PresetContent, id: string, index: number, name: string): PresetContent {
  const text = clampText(name, FIELD_MAX)
  return changeSets(content, id, (sets, card) => (
    !text || !sets[index] || fieldTotal(card) >= FIELDS_MAX ? sets : sets.map((s, i) => (i === index ? { ...s, fields: [...s.fields, text] } : s))
  ))
}

export function removeSetFieldAt(content: PresetContent, id: string, index: number, fieldIndex: number): PresetContent {
  return changeSets(content, id, sets => (sets[index] ? sets.map((s, i) => (i === index ? { ...s, fields: s.fields.filter((_, j) => j !== fieldIndex) } : s)) : sets))
}

export function moveSetFieldTo(content: PresetContent, id: string, index: number, from: number, before: number | null): PresetContent {
  return changeSets(content, id, sets => {
    const set = sets[index]
    if (!set) return sets
    const fields = moveIndex(set.fields, from, before)
    return fields === set.fields ? sets : sets.map((s, i) => (i === index ? { ...s, fields } : s))
  })
}

// ---- the kind and the options of a field: addressed by its place, in the loose fields (set = null) or in the fields of a set ----

function changeField(content: PresetContent, id: string, set: number | null, index: number, change: (field: PresetField) => PresetField): PresetContent {
  const found = findCard(content, id)
  if (!found) return content
  if (set === null) {
    const field = found.card.fields[index]
    if (field === undefined) return content
    const next = change(field)
    return next === field ? content : updateCard(content, id, { fields: found.card.fields.map((f, i) => (i === index ? next : f)) })
  }
  return changeSets(content, id, sets => {
    const field = sets[set]?.fields[index]
    if (field === undefined) return sets
    const next = change(field)
    if (next === field) return sets
    return sets.map((s, i) => (i === set ? { ...s, fields: s.fields.map((f, j) => (j === index ? next : f)) } : s))
  })
}

// The field as another kind (it keeps its name; a multi-select and a dropdown keep their options, any other change drops them).
export function setFieldKindAt(content: PresetContent, id: string, set: number | null, index: number, kind: PlotFieldKind): PresetContent {
  return changeField(content, id, set, index, field => withKind(field, kind))
}

// A new option last: its label trimmed and cut, none when blank, repeated (compared without case) or over the limit.
export function addOptionAt(content: PresetContent, id: string, set: number | null, index: number, label: string): PresetContent {
  const text = clampText(label, OPTION_MAX)
  return changeField(content, id, set, index, field => {
    if (!choosesFrom(field) || typeof field === 'string') return field
    if (!text || field.options.length >= OPTIONS_MAX || field.options.some(o => o.toLocaleLowerCase() === text.toLocaleLowerCase())) return field
    return { ...field, options: [...field.options, text] }
  })
}

export function removeOptionAt(content: PresetContent, id: string, set: number | null, index: number, optionIndex: number): PresetContent {
  return changeField(content, id, set, index, field => (
    typeof field === 'string' || !field.options[optionIndex] ? field : { ...field, options: field.options.filter((_, i) => i !== optionIndex) }
  ))
}

// Move the option at `from` to just before the one at `before` (last when null).
export function moveOptionTo(content: PresetContent, id: string, set: number | null, index: number, from: number, before: number | null): PresetContent {
  return changeField(content, id, set, index, field => {
    if (typeof field === 'string') return field
    const options = moveIndex(field.options, from, before)
    return options === field.options ? field : { ...field, options }
  })
}

// ---- the list of presets ----

export const nameKey = (name: string) => name.trim().toLocaleLowerCase()

// Whether another preset already has this name (compared without case); a blank name is never taken.
export function nameTaken(entries: PresetEntry[], name: string, exceptId?: string): boolean {
  const key = nameKey(name)
  return key !== '' && entries.some(e => e.id !== exceptId && nameKey(e.draft.name) === key)
}

// `name`, or `name (copy)`, `name (copy 2)`... when taken, within the name limit.
export function copyName(name: string, entries: PresetEntry[]): string {
  const base = clampText(name, NAME_MAX) || 'Preset'
  if (!nameTaken(entries, base)) return base
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? ' (copy)' : ` (copy ${n})`
    const candidate = `${base.slice(0, NAME_MAX - suffix.length).trimEnd()}${suffix}`
    if (!nameTaken(entries, candidate)) return candidate
  }
}

// The same cards under new ids (a duplicate or an imported preset must not share ids with another).
export function withNewIds(content: PresetContent, makeId: MakeId = randomId): PresetContent {
  return {
    ...content,
    subcategories: content.subcategories.map(sub => ({ ...sub, id: makeId('sub'), clusters: sub.clusters.map(c => ({ ...c, id: makeId('cluster') })) })),
  }
}

// ---- where a preset stands ----

export type PresetStatus = 'live' | 'pending' | 'never' | 'off'

// live: published and the draft matches it. pending: published, with changes in the draft. never: not published yet.
// off: was published, now unpublished.
export function statusOf(entry: PresetEntry): PresetStatus {
  if (entry.published) return sameContent(entry.draft, entry.published.content) ? 'live' : 'pending'
  return entry.history.length > 0 ? 'off' : 'never'
}

export interface Fault { id: string; message: string }

// What stops a draft from being published, with the card at fault (the preset's own is ROOT). A name is required on every card.
export function publishFaults(content: PresetContent): Fault[] {
  const faults: Fault[] = []
  // A fieldset that holds fields needs a name (one with neither is dropped when the draft is saved).
  const unnamedSets = (card: PresetCard, id: string, where: string) => {
    setsOf(card).forEach((set, i) => {
      if (!set.name.trim() && set.fields.length > 0) faults.push({ id, message: `Fieldset ${i + 1} on ${where} needs a name.` })
    })
  }
  // A multi-select or dropdown with no options has nothing to choose from.
  const noOptions = (card: PresetCard, id: string, where: string) => {
    for (const field of [...card.fields, ...setsOf(card).flatMap(s => s.fields)]) {
      if (choosesFrom(field) && fieldOptions(field).length === 0) faults.push({ id, message: `The ${fieldKind(field) === 'dropdown' ? 'dropdown' : 'multi-select'} ${fieldName(field)} on ${where} needs an option.` })
    }
  }
  if (!content.name.trim()) faults.push({ id: ROOT, message: 'The preset needs a name.' })
  unnamedSets(content, ROOT, 'the preset')
  noOptions(content, ROOT, 'the preset')
  content.subcategories.forEach((sub, i) => {
    const label = sub.name.trim() ? `subcategory ${sub.name.trim()}` : `subcategory ${i + 1}`
    if (!sub.name.trim()) faults.push({ id: sub.id, message: `Subcategory ${i + 1} needs a name.` })
    unnamedSets(sub, sub.id, label)
    noOptions(sub, sub.id, label)
    sub.clusters.forEach((c, j) => {
      const where = `cluster ${c.name.trim() || j + 1} in ${label}`
      if (!c.name.trim()) faults.push({ id: c.id, message: `Cluster ${j + 1} in ${label} needs a name.` })
      unnamedSets(c, c.id, where)
      noOptions(c, c.id, where)
    })
  })
  return faults
}

// ---- what Publish will change ----

export interface Changes { added: string[]; changed: string[]; removed: string[] }

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`}`

// What differs between two lists of fields, as short phrases: fields added or removed (matched by name), or none and the order differs; and the
// fields that stay with another kind or other options.
function fieldChanges(before: PresetField[], after: PresetField[]): string[] {
  const left = [...before]
  let added = 0
  let reshaped = 0
  for (const field of after) {
    const at = left.findIndex(f => fieldName(f) === fieldName(field))
    if (at < 0) { added += 1; continue }
    if (JSON.stringify(left[at]) !== JSON.stringify(field)) reshaped += 1
    left.splice(at, 1)
  }
  const removed = left.length
  const out: string[] = []
  if (added || removed) out.push(`fields (${[added && `${added} added`, removed && `${removed} removed`].filter(Boolean).join(', ')})`)
  else if (before.map(fieldName).join('\n') !== after.map(fieldName).join('\n')) out.push('field order')
  if (reshaped) out.push(`field kinds or options (${reshaped} changed)`)
  return out
}

// What differs between two cards' fieldsets, as short phrases: sets added or removed (matched by name), the fields of a set that stays, and the
// order of the sets that stay.
function fieldsetChanges(before: PresetFieldset[], after: PresetFieldset[]): string[] {
  const out: string[] = []
  const left = [...before]
  const kept: Array<[PresetFieldset, PresetFieldset]> = []
  let added = 0
  for (const set of after) {
    const at = left.findIndex(s => s.name === set.name)
    if (at >= 0) { kept.push([left[at], set]); left.splice(at, 1) } else added += 1
  }
  if (added || left.length) out.push(`fieldsets (${[added && `${added} added`, left.length && `${left.length} removed`].filter(Boolean).join(', ')})`)
  for (const [was, now] of kept) {
    const change = fieldChanges(was.fields, now.fields)
    if (change.length) out.push(`fieldset ${now.name || 'without a name'}: ${change.join(', ')}`)
  }
  const stay = new Set(kept.map(([, now]) => now.name))
  if (before.filter(s => stay.has(s.name)).map(s => s.name).join('\n') !== after.filter(s => stay.has(s.name)).map(s => s.name).join('\n')) out.push('fieldset order')
  return out
}

// What differs between two cards' own text, keywords, fields and fieldsets, as short phrases ("name", "description", "fields (2 added)").
function cardChanges(before: PresetCard, after: PresetCard): string[] {
  const out: string[] = []
  if (before.name !== after.name) out.push(`name (${before.name || 'blank'} to ${after.name || 'blank'})`)
  if (before.description !== after.description) out.push('description')
  if (before.keywords.join('\n') !== after.keywords.join('\n')) out.push('keywords')
  out.push(...fieldChanges(before.fields, after.fields))
  out.push(...fieldsetChanges(setsOf(before), setsOf(after)))
  return out
}

function describeNew(card: PresetCard): string {
  const parts = [fieldTotal(card) && plural(fieldTotal(card), 'field'), setsOf(card).length && plural(setsOf(card).length, 'fieldset')].filter(Boolean)
  return parts.length ? `, ${parts.join(' and ')} on it` : ''
}

// What publishing `after` changes against the version now published (`before`; null when there is none).
export function describeChanges(before: PresetContent | null, after: PresetContent): Changes {
  const next = normalizeContent(after)
  const out: Changes = { added: [], changed: [], removed: [] }
  if (!before) {
    const n = countOf(next)
    const parts = [
      n.subcategories && plural(n.subcategories, 'subcategory'), n.clusters && plural(n.clusters, 'cluster'),
      n.fields && plural(n.fields, 'field'), n.fieldsets && plural(n.fieldsets, 'fieldset'),
    ].filter(Boolean)
    out.added.push(parts.length ? `the preset, with ${parts.join(', ')}` : 'the preset')
    return out
  }
  const prev = normalizeContent(before)
  const own = cardChanges(prev, next)
  if (own.length) out.changed.push(own.join(', '))

  const prevSubs = new Map(prev.subcategories.map(s => [s.id, s]))
  const nextSubs = new Map(next.subcategories.map(s => [s.id, s]))
  for (const sub of next.subcategories) {
    const old = prevSubs.get(sub.id)
    if (!old) {
      out.added.push(`subcategory ${sub.name || 'without a name'}${describeNew(sub)}`)
      for (const c of sub.clusters) out.added.push(`cluster ${c.name || 'without a name'}${describeNew(c)}`)
      continue
    }
    const label = `subcategory ${sub.name || old.name || 'without a name'}`
    const changes = cardChanges(old, sub)
    if (changes.length) out.changed.push(`${label}: ${changes.join(', ')}`)
    const prevClusters = new Map(old.clusters.map(c => [c.id, c]))
    for (const c of sub.clusters) {
      const was = prevClusters.get(c.id)
      if (!was) { out.added.push(`cluster ${c.name || 'without a name'}${describeNew(c)}`); continue }
      const cc = cardChanges(was, c)
      if (cc.length) out.changed.push(`cluster ${c.name || was.name || 'without a name'}: ${cc.join(', ')}`)
    }
    const kept = new Set(sub.clusters.map(c => c.id))
    for (const c of old.clusters) if (!kept.has(c.id)) out.removed.push(`cluster ${c.name || 'without a name'}`)
    const oldOrder = old.clusters.filter(c => kept.has(c.id)).map(c => c.id).join()
    const newOrder = sub.clusters.filter(c => prevClusters.has(c.id)).map(c => c.id).join()
    if (oldOrder !== newOrder) out.changed.push(`${label}: cluster order`)
  }
  for (const sub of prev.subcategories) if (!nextSubs.has(sub.id)) out.removed.push(`subcategory ${sub.name || 'without a name'}`)
  const keptOrder = prev.subcategories.filter(s => nextSubs.has(s.id)).map(s => s.id).join()
  const nextOrder = next.subcategories.filter(s => prevSubs.has(s.id)).map(s => s.id).join()
  if (keptOrder !== nextOrder) out.changed.push('subcategory order')
  return out
}

export const isEmptyChange = (c: Changes) => c.added.length + c.changed.length + c.removed.length === 0
