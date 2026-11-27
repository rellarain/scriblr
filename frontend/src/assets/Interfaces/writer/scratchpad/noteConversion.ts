// Turning a Scratchpad note into part of a project (the Dash's Scratchpad, ConvertNote.tsx): an outline node, a plotpoint, draft text or a
// revision flag. Pure functions: what a note says (its title and the rest), where in a project it can go (each place named by its path, "Book 1
// · Chapter 3 · Scene 2 · The landing"), and the trees with the new node in them, for a project that is not the open one (the open one is
// changed through the workspace, so its unsaved edits stay its own).

import type { FlagType, NodeFlag, OutlineNode, OutlineNodeKind, PlotNode } from '../../../../api/types'
import { buildChildIndex } from '../outlineTree'
import { structureOfBook } from '../outline/outlineModel'
import { addValue, updateValue } from '../plotFields'
import { isChoice } from '../plotKinds'
import { placeValue } from '../plotPlacement'

export type ConvertTarget = 'outline' | 'plot' | 'draft' | 'flag'
export interface NoteLike { title: string; body: string }
// What a note became, kept on it when it stays (shown as "Became a plotpoint in Harbour Lights").
export interface NoteConversion { target: ConvertTarget; projectId: string; projectTitle: string; at: string }

export const TARGET_NAMES: Record<ConvertTarget, string> = { outline: 'An outline node', plot: 'A plotpoint', draft: 'Draft text', flag: 'A revision flag' }
const BECAME: Record<ConvertTarget, string> = { outline: 'an outline node', plot: 'a plotpoint', draft: 'draft text', flag: 'a revision flag' }
export const becameLine = (c: NoteConversion) => `Became ${BECAME[c.target]} in ${c.projectTitle || 'a project'}`

// The note's title and the rest of it: its own title, else the first line of its text.
export function noteParts(note: NoteLike): { title: string; rest: string } {
  const title = note.title.trim()
  const body = note.body.trim()
  if (title) return { title, rest: body }
  const [first = '', ...more] = body.split('\n')
  return { title: first.trim(), rest: more.join('\n').trim() }
}

// The note's text as one paragraph (its title and the rest, each line joined by a space).
export function noteParagraph(note: NoteLike): string {
  const { title, rest } = noteParts(note)
  return [title, rest].filter(Boolean).join(' ').split('\n').map(s => s.trim()).filter(Boolean).join(' ')
}

const ORDER: OutlineNodeKind[] = ['series', 'book', 'arc', 'chapter', 'act', 'scene', 'moment']
const NAME: Record<OutlineNodeKind, string> = { series: 'Series', book: 'Book', arc: 'Arc', chapter: 'Chapter', act: 'Act', scene: 'Scene', moment: 'Moment' }
// The kinds a note can become, deepest first (the order of the choice).
export const NEW_KINDS: OutlineNodeKind[] = ['moment', 'scene', 'act', 'chapter', 'arc', 'book']

export interface Place { id: string; kind: OutlineNodeKind; label: string }

// Every node of a project named by its path: the series by their order, the books across the project, the arcs and chapters across their book,
// the acts, scenes and moments across their chapter, the last part with the node's title (a scene's place) when it has one.
export function placesOf(nodes: OutlineNode[]): Map<string, Place> {
  const index = buildChildIndex(nodes)
  for (const list of index.values()) list.sort((a, b) => a.order - b.order)
  const byId = new Map(nodes.map(n => [n.id, n]))
  const books: OutlineNode[] = []
  const series: OutlineNode[] = []
  const walkTop = (parentId: string | null) => {
    for (const n of index.get(parentId) ?? []) {
      if (n.kind === 'series') { series.push(n); walkTop(n.id) } else if (n.kind === 'book') books.push(n)
    }
  }
  walkTop(null)
  const number = new Map<string, number>()
  series.forEach((s, i) => number.set(s.id, i + 1))
  books.forEach((b, i) => {
    number.set(b.id, i + 1)
    const s = structureOfBook(index, b.id)
    for (const kind of ['arc', 'chapter', 'act', 'scene', 'moment'] as const) for (const [id, n] of s.numbers[kind]) number.set(id, n)
  })
  const places = new Map<string, Place>()
  const part = (n: OutlineNode) => `${NAME[n.kind]}${number.has(n.id) ? ` ${number.get(n.id)}` : ''}`
  for (const n of nodes) {
    const chain: OutlineNode[] = []
    for (let at: OutlineNode | undefined = n, guard = 0; at && guard < 12; at = at.parentId ? byId.get(at.parentId) : undefined, guard += 1) chain.unshift(at)
    // A book's place starts at the book (its series is said only for the series itself).
    const from = chain.findIndex(x => x.kind !== 'series')
    const path = (n.kind === 'series' ? [n] : chain.slice(from < 0 ? 0 : from)).filter(x => !x.freeDraft)
    const title = (n.title || n.location || '').trim()
    const label = [...path.map(part), ...(title ? [title] : [])].join(' · ')
    places.set(n.id, { id: n.id, kind: n.kind, label: n.freeDraft ? `${label ? `${label} · ` : ''}Free draft` : label })
  }
  return places
}

// Where a new node of a kind can go: under any node of a shallower kind in a book (a book under a series, or at the top), in outline order.
export function parentsFor(nodes: OutlineNode[], kind: OutlineNodeKind): Array<{ id: string | null; label: string }> {
  const places = placesOf(nodes)
  const depth = ORDER.indexOf(kind)
  const inOrder = outlineOrder(nodes)
  const under = inOrder.filter(n => ORDER.indexOf(n.kind) < depth && !n.freeDraft && (n.kind !== 'series' || kind === 'book')).map(n => ({ id: n.id as string | null, label: places.get(n.id)?.label ?? n.id }))
  return kind === 'book' ? [{ id: null, label: 'The top of the project' }, ...under.filter(p => nodes.find(n => n.id === p.id)?.kind === 'series')] : under
}

// The nodes in outline order (each after its parent, siblings in order).
export function outlineOrder(nodes: OutlineNode[]): OutlineNode[] {
  const index = buildChildIndex(nodes)
  for (const list of index.values()) list.sort((a, b) => a.order - b.order)
  const out: OutlineNode[] = []
  const walk = (parentId: string | null) => { for (const n of index.get(parentId) ?? []) { out.push(n); walk(n.id) } }
  walk(null)
  return out
}

// The moments (where draft text goes, and where a plotpoint can be placed), and the chapters (what a flag can be on), named by their paths.
export const momentsOf = (nodes: OutlineNode[]) => { const p = placesOf(nodes); return outlineOrder(nodes).filter(n => n.kind === 'moment').map(n => p.get(n.id) as Place) }
export const chaptersOf = (nodes: OutlineNode[]) => { const p = placesOf(nodes); return outlineOrder(nodes).filter(n => n.kind === 'chapter').map(n => p.get(n.id) as Place) }

// The chapter a node is in (a moment's, for its draft).
export function chapterOf(nodes: OutlineNode[], id: string): string | null {
  const byId = new Map(nodes.map(n => [n.id, n]))
  for (let at = byId.get(id), guard = 0; at && guard < 12; at = at.parentId ? byId.get(at.parentId) : undefined, guard += 1) if (at.kind === 'chapter') return at.id
  return null
}

// The fields a plotpoint can be written into: every field that takes values (not a choice), on the node that defines it, named by its path
// ("Characters · Mara Quell · Her mother").
export function fieldsOf(plot: PlotNode[]): Array<{ holderId: string; fieldId: string; label: string }> {
  const byId = new Map(plot.map(n => [n.id, n]))
  const path = (n: PlotNode) => {
    const parts: string[] = []
    for (let at: PlotNode | undefined = n, guard = 0; at && guard < 12; at = at.parentId ? byId.get(at.parentId) : undefined, guard += 1) parts.unshift(at.title.trim() || `Untitled ${at.kind}`)
    return parts.join(' · ')
  }
  const out: Array<{ holderId: string; fieldId: string; label: string }> = []
  for (const holder of plot) {
    if (holder.kind === 'plotpoint') continue
    for (const def of holder.customFieldDefs ?? []) {
      if (isChoice(def)) continue
      out.push({ holderId: holder.id, fieldId: def.id, label: `${path(holder)} · ${def.name.trim() || 'Untitled field'}` })
    }
  }
  return out
}

// ---- the trees with the note in them (for a project that is not open) ----

let made = 0
export const conversionId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(made += 1).toString(36)}`

// A new outline node at the end of its parent's.
export function withOutlineNode(nodes: OutlineNode[], parentId: string | null, kind: OutlineNodeKind, fields: Partial<OutlineNode>): { nodes: OutlineNode[]; id: string } {
  const id = conversionId('node')
  const order = nodes.filter(n => n.parentId === parentId).reduce((m, n) => Math.max(m, n.order + 1), 0)
  const node: OutlineNode = {
    id, kind, parentId, order, title: '', synopsis: '', draftRef: null, flag: null, color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null,
    location: '', timeValue: {}, action: '', createdAt: new Date().toISOString(), ...fields,
  }
  return { nodes: [...nodes, node], id }
}

// A new plotpoint in a field, with its title and notes, placed on a node when one is given.
export function withPlotpoint(plot: PlotNode[], outline: OutlineNode[], holderId: string, fieldId: string, title: string, body: string, placeOn: string | null): { nodes: PlotNode[]; id: string | null } {
  const added = addValue(plot, holderId, fieldId, prefix => conversionId(prefix))
  if (!added.id) return added
  let nodes = updateValue(added.nodes, added.id, { title, body })
  if (placeOn) nodes = placeValue(nodes, added.id, placeOn, new Map(outline.map(n => [n.id, n])))
  return { nodes, id: added.id }
}

// A chapter flagged (its one flag, replacing any it had).
export const withNodeFlag = (nodes: OutlineNode[], id: string, type: FlagType, note: string): OutlineNode[] =>
  nodes.map(n => (n.id === id ? { ...n, flag: { type, note } as NodeFlag } : n))

// A moment's text with a paragraph added at its start or its end.
export function withParagraph(body: string, paragraph: string, where: 'start' | 'end'): string {
  const text = body.replace(/\s+$/, '')
  if (!text.trim()) return paragraph
  return where === 'start' ? `${paragraph}\n\n${text.replace(/^\s+/, '')}` : `${text}\n\n${paragraph}`
}
