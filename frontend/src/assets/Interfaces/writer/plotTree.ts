import type { OutlineNode, PlotNode, PlotPlacement, TimeSystem } from '../../../api/types'
import { booksOf, buildChildIndex, descendantsOf } from './outlineTree'
import { compareTimeValues, hasTime, systemForBook, type TimeValue } from './timeSystem'

// Helpers for the plot tree (categories > subcategories > clusters > plotlines >
// plotpoints) and the rules around where plotpoints are placed.

// The grouping nodes above a node (category, subcategory, cluster: whichever it sits under), outermost first.
export function plotTrail(node: PlotNode, byId: Map<string, PlotNode>): PlotNode[] {
  const out: PlotNode[] = []
  for (let current = node.parentId ? byId.get(node.parentId) : undefined, guard = 0; current && guard < 8; guard += 1) {
    if (current.kind === 'category' || current.kind === 'subcategory' || current.kind === 'cluster') out.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return out
}

// Every plotline beneath a category, subcategory or cluster (or the plotline itself).
export function plotlinesUnder(node: PlotNode, childrenByParent: Map<string | null, PlotNode[]>): PlotNode[] {
  if (node.kind === 'plotline') return [node]
  if (node.kind === 'plotpoint') return []
  return (childrenByParent.get(node.id) ?? []).flatMap(child => plotlinesUnder(child, childrenByParent))
}

// Whether all, some or none of the plotlines under a node are ticked (the state of its checkbox).
export type SelectionState = 'all' | 'some' | 'none'
export function selectionState(node: PlotNode, childrenByParent: Map<string | null, PlotNode[]>, selected: ReadonlySet<string>): SelectionState {
  const lines = plotlinesUnder(node, childrenByParent)
  const ticked = lines.filter(l => selected.has(l.id)).length
  return ticked === 0 ? 'none' : ticked === lines.length ? 'all' : 'some'
}

// The category a node sits under (or is), if any.
export function categoryOf(node: PlotNode, byId: Map<string, PlotNode>): PlotNode | undefined {
  return node.kind === 'category' ? node : plotTrail(node, byId).find(n => n.kind === 'category')
}

// What to show where a node's title appears as text: the title, or a quiet
// "Untitled <kind>" when it is blank (new nodes are created with no title).
export function nodeLabel(node: { title: string; kind: string }): string {
  return node.title.trim() !== '' ? node.title : `Untitled ${node.kind}`
}

// Case-insensitive, natural ("Act 2" before "Act 10") title order; blank titles
// sort last, then by the stored order.
export function compareByTitle(a: { title: string; order: number }, b: { title: string; order: number }): number {
  const ta = a.title.trim()
  const tb = b.title.trim()
  if (ta === '' && tb === '') return a.order - b.order
  if (ta === '') return 1
  if (tb === '') return -1
  const byTitle = ta.localeCompare(tb, undefined, { sensitivity: 'base', numeric: true })
  return byTitle !== 0 ? byTitle : a.order - b.order
}

export function sortByTitle<T extends { title: string; order: number }>(nodes: T[]): T[] {
  return [...nodes].sort(compareByTitle)
}

// A plotpoint's description is only available once it has a title.
export function plotpointDescriptionAllowed(point: { title: string }): boolean {
  return point.title.trim() !== ''
}

// When a plotpoint's title is left empty while its description has text, the
// title becomes "Untitled" (never a description without a title).
export const UNTITLED_PLOTPOINT = 'Untitled'
export function titleAfterEdit(title: string, body: string): string {
  return title.trim() === '' && body.trim() !== '' ? UNTITLED_PLOTPOINT : title
}

// Where a placement's target sits in the outline:
//  - 'none'    it no longer exists, or is something that takes no plotpoints (a series, book or arc)
//  - 'chapter' a chapter (shown in that chapter's card)
//  - 'inner'   an act, scene or moment of a chapter ("placed in the chapter outline")
export type TargetLevel = 'none' | 'chapter' | 'inner'

export function levelOfTarget(targetId: string | null | undefined, outlineById: Map<string, OutlineNode>): TargetLevel {
  const target = targetId ? outlineById.get(targetId) : undefined
  if (!target) return 'none'
  if (target.kind === 'act' || target.kind === 'scene' || target.kind === 'moment') return 'inner'
  return target.kind === 'chapter' ? 'chapter' : 'none'
}

// The chapter a placement belongs to (walking up from an act, scene or moment; the chapter itself for a chapter; undefined for anything else).
export function chapterOfTarget(targetId: string | null | undefined, outlineById: Map<string, OutlineNode>): OutlineNode | undefined {
  let current = targetId ? outlineById.get(targetId) : undefined
  while (current) {
    if (current.kind === 'chapter') return current
    current = current.parentId ? outlineById.get(current.parentId) : undefined
  }
  return undefined
}

// One placement of a plotpoint: a plotpoint can be placed many times, and each place stands alone.
export interface PlacedPoint { point: PlotNode; placement: PlotPlacement }

// Every outline node's place in document order (book, chapter, act, scene, moment...).
export function outlinePositions(outlineNodes: OutlineNode[]): Map<string, number> {
  const index = buildChildIndex(outlineNodes)
  const position = new Map<string, number>()
  let next = 0
  const walk = (parentId: string | null) => {
    for (const n of index.get(parentId) ?? []) { position.set(n.id, next++); walk(n.id) }
  }
  walk(null)
  return position
}

// Placements in order of occurrence: by book, then by the Time of the scene they belong to (compared in that book's time system; one with no
// timed scene sorts after the timed ones), then by outline position, then by the plotpoint's own order.
//   - placed on a scene: that scene; on a moment: its scene;
//   - placed on an act or chapter: the first scene inside it that has a Time.
// In 'story' mode the Time is left out: by book, then outline position only.
export function orderPlacements(
  entries: PlacedPoint[], outlineNodes: OutlineNode[], systems: TimeSystem[], mode: 'time' | 'story' = 'time',
): PlacedPoint[] {
  const byId = new Map(outlineNodes.map(n => [n.id, n]))
  const index = buildChildIndex(outlineNodes)
  const bookIndex = new Map(booksOf(outlineNodes).map((b, i) => [b.id, i]))
  const position = outlinePositions(outlineNodes)
  const ancestorOfKind = (id: string, kind: OutlineNode['kind']): OutlineNode | undefined => {
    for (let current = byId.get(id); current; current = current.parentId ? byId.get(current.parentId) : undefined) {
      if (current.kind === kind) return current
    }
    return undefined
  }

  interface Key { book: number; system: TimeSystem; time: TimeValue | undefined; position: number; order: number }
  const keyOf = ({ point, placement }: PlacedPoint): Key => {
    const target = byId.get(placement.targetId)
    const book = target ? ancestorOfKind(target.id, 'book') : undefined
    let scene: OutlineNode | undefined
    if (target?.kind === 'scene') scene = target
    else if (target?.kind === 'moment') scene = ancestorOfKind(target.id, 'scene')
    else if (target && target.kind !== 'book') {
      scene = descendantsOf(index, target.id).find(n => n.kind === 'scene' && hasTime(n.timeValue))
    }
    return {
      book: book ? bookIndex.get(book.id) ?? Infinity : Infinity,
      system: systemForBook(systems, book),
      time: scene?.timeValue,
      position: target ? position.get(target.id) ?? Infinity : Infinity,
      order: point.order,
    }
  }

  const keyed = entries.map(entry => ({ entry, k: keyOf(entry) }))
  keyed.sort((a, b) =>
    a.k.book - b.k.book
    || (mode === 'time' ? compareTimeValues(a.k.system, a.k.time, b.k.time) : 0)
    || a.k.position - b.k.position
    || a.k.order - b.k.order)
  return keyed.map(x => x.entry)
}

// Plotpoints in order of occurrence, each at its earliest placement; those placed nowhere come last, in their own order.
export function orderAssignedPlotpoints(
  points: PlotNode[], outlineNodes: OutlineNode[], systems: TimeSystem[], mode: 'time' | 'story' = 'time',
): PlotNode[] {
  const entries = points.flatMap(point => (point.placements ?? []).map(placement => ({ point, placement })))
  const seen = new Set<string>()
  const out: PlotNode[] = []
  for (const { point } of orderPlacements(entries, outlineNodes, systems, mode)) {
    if (!seen.has(point.id)) { seen.add(point.id); out.push(point) }
  }
  return [...out, ...points.filter(p => !seen.has(p.id)).sort((a, b) => a.order - b.order)]
}
