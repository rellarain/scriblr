import type { CharacterDoc, CharacterLook, CharacterProfile, CharacterRelationship, CharacterState, OutlineNode, RelationshipKind } from '../../../../api/types'
import { buildChildIndex } from '../outlineTree'
import { BUILDS, ACCESSORIES, BOTTOMS, OUTER, POSES, SHOES, TOPS } from './art/wardrobe'
import { BROWS, EARS, EYES, EXPRESSIONS, FACIAL_HAIR, HAIR, HEAD_SHAPES, MOUTHS, NOSES, type Option } from './art/library'

// Pure helpers for the profile, the relationships and the story of a character: where in the book a state or a change sits, what is true at a point, how a look differs
// from another, and the family tree. The story points are the chapters and scenes of the outline, in book order.

export const emptyProfile = (): CharacterProfile => ({
  role: '', age: '', occupation: '', aliases: '', summary: '', personality: '', goal: '', motivation: '', fear: '', flaw: '', strength: '', background: '', fields: [],
})
export type StoryFields = Pick<CharacterDoc, 'profile' | 'possessions' | 'relationships' | 'states' | 'arc' | 'events'>
export const emptyStory = (): StoryFields => ({ profile: emptyProfile(), possessions: [], relationships: [], states: [], arc: [], events: [] })

// The smallest id with this prefix that the list does not have (a, b, c ... of one kind of thing).
export function nextId(list: Array<{ id: string }>, prefix: string): string {
  for (let i = 1; ; i += 1) if (!list.some(x => x.id === `${prefix}${i}`)) return `${prefix}${i}`
}

// ---- where in the book ----
export interface StoryPoint { id: string; kind: 'chapter' | 'scene'; title: string; label: string; index: number }

// The chapters and scenes of the outline in book order, each with a label that says where it is ("Book One > Chapter 2 > Arrival").
export function storyPoints(nodes: OutlineNode[]): StoryPoint[] {
  const index = buildChildIndex(nodes)
  const out: StoryPoint[] = []
  const walk = (parentId: string | null, trail: string[]) => {
    for (const n of index.get(parentId) ?? []) {
      const title = n.title.trim() || (n.kind === 'scene' ? 'Untitled scene' : `Untitled ${n.kind}`)
      if (n.kind === 'chapter' || n.kind === 'scene') out.push({ id: n.id, kind: n.kind, title, label: [...trail, title].join(' > '), index: out.length })
      walk(n.id, n.kind === 'book' || n.kind === 'series' || n.kind === 'arc' || n.kind === 'chapter' ? [...trail, title] : trail)
    }
  }
  walk(null, [])
  return out
}

const indexOf = (points: StoryPoint[], id: string) => points.findIndex(p => p.id === id)

// The states in book order (one whose point is gone from the outline sorts last).
export function statesInOrder(states: CharacterState[], points: StoryPoint[]): CharacterState[] {
  const at = (s: CharacterState) => { const i = indexOf(points, s.at); return i < 0 ? Number.MAX_SAFE_INTEGER : i }
  return states.map((s, i) => ({ s, i })).sort((a, b) => at(a.s) - at(b.s) || a.i - b.i).map(x => x.s)
}

// What is true at a point: the last state that starts at or before it (a state carries forward until the next one). Null before the first.
export function stateAt(states: CharacterState[], points: StoryPoint[], pointId: string): CharacterState | null {
  const here = indexOf(points, pointId)
  if (here < 0) return null
  let found: CharacterState | null = null
  let foundAt = -1
  for (const s of states) {
    const i = indexOf(points, s.at)
    if (i >= 0 && i <= here && i >= foundAt) { found = s; foundAt = i }
  }
  return found
}

// How a relationship reads at a point: its label and note after the last change at or before it (or its own, before any change).
export function relationshipAt(rel: CharacterRelationship, points: StoryPoint[], pointId: string | null): { label: string; note: string } {
  let label = rel.label
  let note = rel.description
  if (pointId) {
    const here = indexOf(points, pointId)
    let at = -1
    for (const c of rel.changes) {
      const i = indexOf(points, c.at)
      if (i >= 0 && i <= here && i >= at) { at = i; label = c.label || label; note = c.note || note }
    }
  }
  return { label, note }
}

// ---- how a look differs ----
const NAMED: Array<[keyof CharacterLook, string, readonly Option[]]> = [
  ['build', 'Build', BUILDS], ['headShape', 'Head shape', HEAD_SHAPES], ['ears', 'Ears', EARS], ['eyes', 'Eyes', EYES], ['brows', 'Brows', BROWS], ['nose', 'Nose', NOSES], ['mouth', 'Mouth', MOUTHS],
  ['facialHair', 'Facial hair', FACIAL_HAIR], ['hair', 'Hair', HAIR], ['expression', 'Expression', EXPRESSIONS], ['pose', 'Pose', POSES],
]
const COLOURS: Array<[keyof CharacterLook, string]> = [['skin', 'Skin'], ['eyeColor', 'Eye colour'], ['browColor', 'Brow colour'], ['lipColor', 'Lip colour'], ['hairColor', 'Hair colour'], ['facialHairColor', 'Facial hair colour']]
const SLIDERS: Array<[keyof CharacterLook, string]> = [['height', 'Height'], ['width', 'Width'], ['hairLength', 'Hair length']]
const nameOf = (list: readonly Option[], id: string | null) => (id === null ? 'none' : list.find(o => o.id === id)?.name ?? id)

// The differences between two looks, as lines ("Hair: Short > Braid"): the parts that are another choice, the colours, the sliders that moved by a tenth, the outfit and the marks.
export function lookDiff(a: CharacterLook, b: CharacterLook): string[] {
  const lines: string[] = []
  for (const [k, label, list] of NAMED) if (a[k] !== b[k]) lines.push(`${label}: ${nameOf(list, a[k] as string)} > ${nameOf(list, b[k] as string)}`)
  for (const [k, label] of COLOURS) if (a[k] !== b[k]) lines.push(`${label}: ${a[k]} > ${b[k]}`)
  for (const [k, label] of SLIDERS) if (Math.abs((a[k] as number) - (b[k] as number)) >= 0.1) lines.push(`${label}: ${Math.round((a[k] as number) * 100)}% > ${Math.round((b[k] as number) * 100)}%`)
  const slots: Array<['top' | 'bottom' | 'shoes' | 'outer', string, readonly Option[]]> = [['top', 'Top', TOPS], ['bottom', 'Bottom', BOTTOMS], ['shoes', 'Footwear', SHOES], ['outer', 'Outerwear', OUTER]]
  for (const [k, label, list] of slots) if (a.outfit[k] !== b.outfit[k]) lines.push(`${label}: ${nameOf(list, a.outfit[k])} > ${nameOf(list, b.outfit[k])}`)
  const added = b.outfit.accessories.filter(x => !a.outfit.accessories.includes(x))
  const removed = a.outfit.accessories.filter(x => !b.outfit.accessories.includes(x))
  if (added.length) lines.push(`Puts on: ${added.map(x => nameOf(ACCESSORIES, x)).join(', ')}`)
  if (removed.length) lines.push(`Takes off: ${removed.map(x => nameOf(ACCESSORIES, x)).join(', ')}`)
  const marks = (l: CharacterLook) => new Set(l.marks.map(m => `${m.kind}:${m.design}:${m.area}`))
  const ma = marks(a), mb = marks(b)
  const gained = [...mb].filter(x => !ma.has(x)).length
  const lost = [...ma].filter(x => !mb.has(x)).length
  if (gained) lines.push(`${gained} new ${gained === 1 ? 'mark' : 'marks'}`)
  if (lost) lines.push(`${lost} ${lost === 1 ? 'mark' : 'marks'} gone`)
  return lines
}

// What changed in how the character looks from one state with a captured look to the next (states with no captured look are skipped).
export interface AppearanceGap { from: CharacterState; to: CharacterState; changes: string[] }
export function appearanceGaps(states: CharacterState[], points: StoryPoint[]): AppearanceGap[] {
  const shown = statesInOrder(states, points).filter(s => s.snapshot)
  const out: AppearanceGap[] = []
  for (let i = 1; i < shown.length; i += 1) out.push({ from: shown[i - 1], to: shown[i], changes: lookDiff(shown[i - 1].snapshot!, shown[i].snapshot!) })
  return out
}

// ---- the web and the tree ----
export const KIND_NAMES: Record<RelationshipKind, string> = { family: 'Family', friend: 'Friend', ally: 'Ally', rival: 'Rival', enemy: 'Enemy', romance: 'Romance', mentor: 'Mentor', other: 'Other' }

export interface Link { from: string; to: string; kind: RelationshipKind; label: string }
// Every relationship of the cast as links (one for each pair and kind: a link both characters have is one link).
export function webLinks(cast: CharacterDoc[]): Link[] {
  const seen = new Set<string>()
  const out: Link[] = []
  for (const c of cast) {
    for (const r of c.relationships) {
      const key = [c.id, r.targetId].sort().join('|') + `|${r.kind}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ from: c.id, to: r.targetId, kind: r.kind, label: r.label })
    }
  }
  return out
}

export interface TreeRow { generation: number; people: Array<{ id: string; name: string; partner: string | null }> }
// The family of one character as rows by generation (grandparents above, children below): parents, children, spouses and siblings, found through the family links either character has.
export function familyTree(cast: CharacterDoc[], rootId: string, depth = 3): TreeRow[] {
  const byId = new Map(cast.map(c => [c.id, c]))
  // parents[x] = the parents of x; spouses[x] = the spouses of x; both read from either side of a link.
  const parents = new Map<string, Set<string>>()
  const spouses = new Map<string, Set<string>>()
  const link = (map: Map<string, Set<string>>, a: string, b: string) => { map.set(a, (map.get(a) ?? new Set()).add(b)) }
  for (const c of cast) {
    for (const r of c.relationships) {
      if (r.kind !== 'family' || !r.family || !byId.has(r.targetId)) continue
      if (r.family === 'parent') link(parents, c.id, r.targetId)
      else if (r.family === 'child') link(parents, r.targetId, c.id)
      else if (r.family === 'spouse') { link(spouses, c.id, r.targetId); link(spouses, r.targetId, c.id) }
    }
  }
  const children = new Map<string, Set<string>>()
  for (const [child, ps] of parents) for (const p of ps) link(children, p, child)
  const gen = new Map<string, number>([[rootId, 0]])
  const queue: string[] = [rootId]
  while (queue.length > 0) {
    const id = queue.shift()!
    const g = gen.get(id)!
    const visit = (other: string, to: number) => {
      if (!gen.has(other) && Math.abs(to) <= depth && byId.has(other)) { gen.set(other, to); queue.push(other) }
    }
    for (const p of parents.get(id) ?? []) visit(p, g - 1)
    for (const c of children.get(id) ?? []) visit(c, g + 1)
    for (const s of spouses.get(id) ?? []) visit(s, g)
    // Siblings share a parent.
    for (const p of parents.get(id) ?? []) for (const sib of children.get(p) ?? []) visit(sib, g)
  }
  const rows = new Map<number, TreeRow>()
  for (const [id, g] of gen) {
    const row = rows.get(g) ?? { generation: g, people: [] }
    const partner = [...(spouses.get(id) ?? [])].find(s => gen.get(s) === g) ?? null
    row.people.push({ id, name: byId.get(id)!.name, partner })
    rows.set(g, row)
  }
  for (const row of rows.values()) row.people.sort((a, b) => a.name.localeCompare(b.name))
  return [...rows.values()].sort((a, b) => a.generation - b.generation)
}
