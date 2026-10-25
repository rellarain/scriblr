import type { PresetCard, PresetCluster, PresetContent, PresetEntry, PresetSubcategory } from '../../../../api/types'
import { BODY_MAX, FIELD_NAME_MAX, TITLE_MAX } from '../../writer/plotFields'

// The pure side of the Plot presets page: editing a preset's card tree, its limits and checks, how it compares with what was published,
// and the plain-words summary Publish shows. Nothing here touches the network or React.

// The same limits as the Plot editor, so a preset never holds anything the Writer would cut off.
export const NAME_MAX = TITLE_MAX
export const FIELD_MAX = FIELD_NAME_MAX
export const DESCRIPTION_MAX = BODY_MAX
export const KEYWORD_MAX = 50
export const HISTORY_MAX = 10

export type MakeId = (prefix: string) => string
export const randomId: MakeId = prefix => `${prefix}-${Math.random().toString(36).slice(2, 10)}`

export type CardKind = 'category' | 'subcategory' | 'cluster'
// The card of the preset itself has no id of its own: it is addressed by this.
export const ROOT = ''

export const blankContent = (): PresetContent => ({ name: '', description: '', keywords: [], fields: [], subcategories: [] })
export const blankSubcategory = (id: string): PresetSubcategory => ({ id, name: '', description: '', keywords: [], fields: [], clusters: [] })
export const blankCluster = (id: string): PresetCluster => ({ id, name: '', description: '', keywords: [], fields: [] })

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

export function countOf(content: PresetContent): { subcategories: number; clusters: number; fields: number } {
  let clusters = 0
  let fields = content.fields.length
  for (const sub of content.subcategories) {
    clusters += sub.clusters.length
    fields += sub.fields.length + sub.clusters.reduce((n, c) => n + c.fields.length, 0)
  }
  return { subcategories: content.subcategories.length, clusters, fields }
}

// A card with nothing in it: no text, no fields, nothing nested.
export function isBlankCard(card: PresetCard): boolean {
  const nested = 'subcategories' in card ? card.subcategories.length : 'clusters' in card ? card.clusters.length : 0
  return !card.name.trim() && !card.description.trim() && card.keywords.length === 0 && card.fields.length === 0 && nested === 0
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

function cleanBase<T extends PresetCard>(card: T): T {
  return {
    ...card,
    name: clampText(card.name, NAME_MAX), description: clampText(card.description, DESCRIPTION_MAX),
    keywords: cleanList(card.keywords, KEYWORD_MAX, true), fields: cleanList(card.fields, FIELD_MAX, false),
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

type Patch = Partial<Pick<PresetCard, 'name' | 'description' | 'keywords' | 'fields'>>

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
  if (!text || !found) return content
  return updateCard(content, id, { fields: [...found.card.fields, text] })
}

// Fields may repeat, so they are addressed by their place.
export function removeFieldAt(content: PresetContent, id: string, index: number): PresetContent {
  const found = findCard(content, id)
  return found ? updateCard(content, id, { fields: found.card.fields.filter((_, i) => i !== index) }) : content
}

// Move the field at `from` to just before the one at `before` (last when null).
export function moveFieldTo(content: PresetContent, id: string, from: number, before: number | null): PresetContent {
  const found = findCard(content, id)
  if (!found || from < 0 || from >= found.card.fields.length || from === before) return content
  const fields = [...found.card.fields]
  const [moving] = fields.splice(from, 1)
  const target = before === null ? fields.length : before > from ? before - 1 : before
  fields.splice(target, 0, moving)
  return updateCard(content, id, { fields })
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
  if (!content.name.trim()) faults.push({ id: ROOT, message: 'The preset needs a name.' })
  content.subcategories.forEach((sub, i) => {
    const label = sub.name.trim() ? `subcategory ${sub.name.trim()}` : `subcategory ${i + 1}`
    if (!sub.name.trim()) faults.push({ id: sub.id, message: `Subcategory ${i + 1} needs a name.` })
    sub.clusters.forEach((c, j) => {
      if (!c.name.trim()) faults.push({ id: c.id, message: `Cluster ${j + 1} in ${label} needs a name.` })
    })
  })
  return faults
}

// ---- what Publish will change ----

export interface Changes { added: string[]; changed: string[]; removed: string[] }

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`}`

function fieldChange(before: string[], after: string[]): string | null {
  const left = [...before]
  let added = 0
  for (const name of after) {
    const at = left.indexOf(name)
    if (at >= 0) left.splice(at, 1)
    else added += 1
  }
  const removed = left.length
  if (added || removed) return `fields (${[added && `${added} added`, removed && `${removed} removed`].filter(Boolean).join(', ')})`
  return before.join('\n') !== after.join('\n') ? 'field order' : null
}

// What differs between two cards' own text, keywords and fields, as short phrases ("name", "description", "fields (2 added)").
function cardChanges(before: PresetCard, after: PresetCard): string[] {
  const out: string[] = []
  if (before.name !== after.name) out.push(`name (${before.name || 'blank'} to ${after.name || 'blank'})`)
  if (before.description !== after.description) out.push('description')
  if (before.keywords.join('\n') !== after.keywords.join('\n')) out.push('keywords')
  const fields = fieldChange(before.fields, after.fields)
  if (fields) out.push(fields)
  return out
}

const describeNew = (card: PresetCard) => (card.fields.length ? `, ${plural(card.fields.length, 'field')} on it` : '')

// What publishing `after` changes against the version now published (`before`; null when there is none).
export function describeChanges(before: PresetContent | null, after: PresetContent): Changes {
  const next = normalizeContent(after)
  const out: Changes = { added: [], changed: [], removed: [] }
  if (!before) {
    const n = countOf(next)
    const parts = [n.subcategories && plural(n.subcategories, 'subcategory'), n.clusters && plural(n.clusters, 'cluster'), n.fields && plural(n.fields, 'field')].filter(Boolean)
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
