import type { CharacterDoc, CharacterProfile, CharacterRelationship, CharacterState, OutlineNode, RelationshipKind } from '../../../../api/types'
import { buildChildIndex } from '../outlineTree'
import { portraitDiff } from './portrait/diff'

// Pure helpers for the profile, the relationships and the story of a character: where in the book a state or a change sits, what is true at a point, how a portrait differs
// from another, and the family tree. The story points are the chapters and scenes of the outline, in book order.

export const emptyProfile = (): CharacterProfile => ({
  role: '', age: '', occupation: '', aliases: '', summary: '', personality: '', goal: '', motivation: '', fear: '', flaw: '', strength: '', background: '',
  appearance: '', height: '', build: '', skin: '', hair: '', eyes: '', face: '', voice: '', bearing: '', style: '', marks: '', fields: [],
})
export type StoryFields = Pick<CharacterDoc, 'profile' | 'possessions' | 'relationships' | 'states' | 'arc' | 'events' | 'appearances'>
export const emptyStory = (): StoryFields => ({ profile: emptyProfile(), possessions: [], relationships: [], states: [], arc: [], events: [], appearances: [] })

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

// ---- how a portrait differs ----
// (`portraitDiff`, in portrait/diff.ts, lists the differences between two portraits as lines: "Hair style: Plain > Full braids".)

// What changed in how the character looks from one state with a captured portrait to the next (states with none are skipped).
export interface AppearanceGap { from: CharacterState; to: CharacterState; changes: string[] }
export function appearanceGaps(states: CharacterState[], points: StoryPoint[]): AppearanceGap[] {
  const shown = statesInOrder(states, points).filter(s => s.portrait)
  const out: AppearanceGap[] = []
  for (let i = 1; i < shown.length; i += 1) out.push({ from: shown[i - 1], to: shown[i], changes: portraitDiff(shown[i - 1].portrait!, shown[i].portrait!) })
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
