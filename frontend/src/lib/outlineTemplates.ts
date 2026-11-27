// Outline templates: the writer's own outline shapes, for every project. A book template is the arcs, chapters, acts, scenes and moments
// under a book; a chapter template, the acts, scenes and moments under a chapter. Their titles and summaries are kept when asked (a scene's
// place counts as its title and what happens as its summary), never the draft, a colour or a plotpoint. A new book or chapter can start
// from one. Pure functions; the templates are kept in the settings store (`outline/useOutlineTemplates.ts`).

import type { OutlineNode, OutlineNodeKind } from '../api/types'

export type TemplateKind = 'book' | 'chapter'
export interface TemplateNode {
  key: string
  parentKey: string | null // null: right under the book or chapter the template is for
  kind: OutlineNodeKind
  title: string
  synopsis: string
  location: string
  action: string
}
export interface OutlineTemplate { id: string; kind: TemplateKind; name: string; createdAt: string; nodes: TemplateNode[] }
export interface Keeps { titles: boolean; summaries: boolean }

export const TEMPLATE_NAME_MAX = 80
// What a template of each kind may hold, under its book or chapter.
const HOLDS: Record<TemplateKind, OutlineNodeKind[]> = { book: ['arc', 'chapter', 'act', 'scene', 'moment'], chapter: ['act', 'scene', 'moment'] }

function childrenByParent(nodes: OutlineNode[]): Map<string | null, OutlineNode[]> {
  const map = new Map<string | null, OutlineNode[]>()
  for (const n of nodes) map.set(n.parentId, [...(map.get(n.parentId) ?? []), n])
  for (const list of map.values()) list.sort((a, b) => a.order - b.order)
  return map
}

// The shape under a book or a chapter, in outline order (each node after its parent, siblings in their order). A chapter's free-draft moment
// is the chapter's writing space, not part of its shape, and is left out.
export function templateFrom(nodes: OutlineNode[], rootId: string, kind: TemplateKind, name: string, keeps: Keeps, id: string, now: string): OutlineTemplate {
  const kids = childrenByParent(nodes)
  const out: TemplateNode[] = []
  const walk = (parentId: string, parentKey: string | null) => {
    for (const n of kids.get(parentId) ?? []) {
      if (!HOLDS[kind].includes(n.kind) || n.freeDraft) continue
      const key = `t${out.length + 1}`
      out.push({
        key, parentKey, kind: n.kind,
        title: keeps.titles ? n.title : '', location: keeps.titles ? n.location ?? '' : '',
        synopsis: keeps.summaries ? n.synopsis : '', action: keeps.summaries ? n.action ?? '' : '',
      })
      walk(n.id, key)
    }
  }
  walk(rootId, null)
  return { id, kind, name: name.trim().slice(0, TEMPLATE_NAME_MAX), createdAt: now, nodes: out }
}

const PLURAL: Partial<Record<OutlineNodeKind, [string, string]>> = {
  arc: ['arc', 'arcs'], chapter: ['chapter', 'chapters'], act: ['act', 'acts'], scene: ['scene', 'scenes'], moment: ['moment', 'moments'],
}

// What a template holds, by kind.
export function templateCounts(t: Pick<OutlineTemplate, 'nodes'>): Partial<Record<OutlineNodeKind, number>> {
  const counts: Partial<Record<OutlineNodeKind, number>> = {}
  for (const n of t.nodes) counts[n.kind] = (counts[n.kind] ?? 0) + 1
  return counts
}

// "3 arcs · 14 chapters · 38 scenes · 112 moments" (the kinds it has), "Nothing outlined yet." for an empty one.
export function countsLine(t: Pick<OutlineTemplate, 'nodes'>): string {
  const counts = templateCounts(t)
  const parts = (['arc', 'chapter', 'act', 'scene', 'moment'] as OutlineNodeKind[])
    .filter(k => counts[k])
    .map(k => `${counts[k]} ${(PLURAL[k] as [string, string])[counts[k] === 1 ? 0 : 1]}`)
  return parts.length ? parts.join(' · ') : 'Nothing outlined yet.'
}

// The nodes a template makes under a new book or chapter: fresh ids, each under its new parent, in the template's order.
export function nodesFromTemplate(t: OutlineTemplate, rootId: string, newId: (kind: OutlineNodeKind) => string): Array<Pick<OutlineNode, 'id' | 'kind' | 'parentId' | 'order' | 'title' | 'synopsis' | 'location' | 'action'>> {
  const ids = new Map<string, string>()
  const orders = new Map<string, number>()
  return t.nodes.map(n => {
    const id = newId(n.kind)
    ids.set(n.key, id)
    const parentId = n.parentKey ? ids.get(n.parentKey) ?? rootId : rootId
    const order = orders.get(parentId) ?? 0
    orders.set(parentId, order + 1)
    return { id, kind: n.kind, parentId, order, title: n.title, synopsis: n.synopsis, location: n.location, action: n.action }
  })
}

// A short picture of the shape for the save dialog: the top level of it, each with what it holds ("Chapter 1 · The Courier · 3 scenes"),
// up to `max` lines, the rest counted ("and 6 more").
export function shapeLines(t: Pick<OutlineTemplate, 'kind' | 'nodes'>, max = 8): Array<{ text: string; depth: number }> {
  const under = new Map<string | null, TemplateNode[]>()
  for (const n of t.nodes) under.set(n.parentKey, [...(under.get(n.parentKey) ?? []), n])
  const numbered: Partial<Record<OutlineNodeKind, number>> = {}
  const label = (n: TemplateNode) => {
    numbered[n.kind] = (numbered[n.kind] ?? 0) + 1
    const name = n.kind[0].toUpperCase() + n.kind.slice(1)
    const title = (n.title || n.location).trim()
    return `${name} ${numbered[n.kind]}${title ? ` · ${title}` : ''}`
  }
  const inside = (key: string) => {
    const all: TemplateNode[] = []
    const walk = (k: string) => { for (const c of under.get(k) ?? []) { all.push(c); walk(c.key) } }
    walk(key)
    return all
  }
  const lines: Array<{ text: string; depth: number }> = []
  for (const top of under.get(null) ?? []) {
    const kids = under.get(top.key) ?? []
    // A book's arcs list their chapters; anything else says what it holds.
    if (top.kind === 'arc' && kids.some(k => k.kind === 'chapter')) {
      lines.push({ text: label(top), depth: 0 })
      for (const c of kids) lines.push({ text: `${label(c)}${holds(inside(c.key))}`, depth: 1 })
    } else {
      lines.push({ text: `${label(top)}${holds(inside(top.key))}`, depth: 0 })
    }
  }
  if (lines.length <= max) return lines
  return [...lines.slice(0, max - 1), { text: `and ${lines.length - max + 1} more`, depth: 0 }]
}

function holds(nodes: TemplateNode[]): string {
  const scenes = nodes.filter(n => n.kind === 'scene').length
  const moments = nodes.filter(n => n.kind === 'moment').length
  const what = scenes ? `${scenes} scene${scenes === 1 ? '' : 's'}` : moments ? `${moments} moment${moments === 1 ? '' : 's'}` : ''
  return what ? ` · ${what}` : ''
}
