import type { OutlineNode, PlotNode, TimeSystem } from '../../../api/types'
import { booksOf, buildChildIndex, descendantsOf, nearestOfKind } from './outlineTree'
import { compareTimeValues, hasTime, systemForBook, type TimeValue } from './timeSystem'

// Helpers for the plot tree (categories > subcategories > plotlines >
// plotpoints) and the rules around plotpoint assignment.

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

// Where a plotpoint is assigned in the outline:
//  - 'none'    unassigned (or its target no longer exists)
//  - 'book'    a whole book
//  - 'chapter' a chapter (shown in that chapter's left column)
//  - 'inner'   an act, scene or moment ("assigned at the chapter level"),
//              which locks the plotpoint in the plotline editor
export type AssignedLevel = 'none' | 'book' | 'chapter' | 'inner'

export function assignedLevel(
  point: Pick<PlotNode, 'assignedMomentId'>, outlineById: Map<string, OutlineNode>,
): AssignedLevel {
  const target = point.assignedMomentId ? outlineById.get(point.assignedMomentId) : undefined
  if (!target) return 'none'
  if (target.kind === 'act' || target.kind === 'scene' || target.kind === 'moment') return 'inner'
  if (target.kind === 'chapter') return 'chapter'
  return 'book'
}

export const isAssignedPlotpoint = (point: Pick<PlotNode, 'assignedMomentId'>, outlineById: Map<string, OutlineNode>) =>
  assignedLevel(point, outlineById) !== 'none'

// The chapter an assigned plotpoint belongs to (walking up from an act, scene
// or moment; the chapter itself for a chapter assignment; undefined for a
// book-level or missing target).
export function chapterOfAssignment(
  point: Pick<PlotNode, 'assignedMomentId'>, outlineById: Map<string, OutlineNode>,
): OutlineNode | undefined {
  let current = point.assignedMomentId ? outlineById.get(point.assignedMomentId) : undefined
  while (current) {
    if (current.kind === 'chapter') return current
    current = current.parentId ? outlineById.get(current.parentId) : undefined
  }
  return undefined
}

// Assigned plotpoints in order of occurrence: by book, then by the Time of the
// scene they belong to (compared in that book's time system; a plotpoint with
// no timed scene sorts after the timed ones), then by outline position.
//   - assigned to a scene: that scene; to a moment: its scene;
//   - assigned to an act or chapter: the first scene inside it that has a Time;
//   - assigned to a book: no scene (sorts by position).
export function orderAssignedPlotpoints(
  points: PlotNode[], outlineNodes: OutlineNode[], systems: TimeSystem[],
): PlotNode[] {
  const byId = new Map(outlineNodes.map(n => [n.id, n]))
  const index = buildChildIndex(outlineNodes)
  const bookIndex = new Map(booksOf(outlineNodes).map((b, i) => [b.id, i]))

  // Document order of every node (book, chapter, act, scene, moment...).
  const position = new Map<string, number>()
  let next = 0
  const walk = (parentId: string | null) => {
    for (const n of index.get(parentId) ?? []) { position.set(n.id, next++); walk(n.id) }
  }
  walk(null)

  interface Key { book: number; system: TimeSystem; time: TimeValue | undefined; position: number; order: number }
  const keyOf = (p: PlotNode): Key => {
    const target = p.assignedMomentId ? byId.get(p.assignedMomentId) : undefined
    const book = target ? nearestOfKind(outlineNodes, target.id, 'book') : undefined
    let scene: OutlineNode | undefined
    if (target?.kind === 'scene') scene = target
    else if (target?.kind === 'moment') scene = nearestOfKind(outlineNodes, target.id, 'scene')
    else if (target && target.kind !== 'book') {
      scene = descendantsOf(index, target.id).find(n => n.kind === 'scene' && hasTime(n.timeValue))
    }
    return {
      book: book ? bookIndex.get(book.id) ?? Infinity : Infinity,
      system: systemForBook(systems, book),
      time: scene?.timeValue,
      position: target ? position.get(target.id) ?? Infinity : Infinity,
      order: p.order,
    }
  }

  const keyed = points.map(p => ({ p, k: keyOf(p) }))
  keyed.sort((a, b) =>
    a.k.book - b.k.book
    || compareTimeValues(a.k.system, a.k.time, b.k.time)
    || a.k.position - b.k.position
    || a.k.order - b.k.order)
  return keyed.map(x => x.p)
}
