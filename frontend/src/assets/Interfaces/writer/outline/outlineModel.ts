import type { OutlineNode, PlotNode } from '../../../../api/types'
import type { ChildIndex } from '../outlineTree'
import { textOf } from '../plotFields'
import { assignedLevel } from '../plotTree'

// Pure helpers behind the Outline level's cards: numbering, the scenes of each
// chapter (a scene inherits its Location / Time / Action from the scenes before
// it in its chapter), and which plotpoints wait to be placed.

export interface OutlineNumbers {
  // Arcs and chapters are numbered across the whole book, in outline order...
  arc: Map<string, number>
  chapter: Map<string, number>
  // ...acts, scenes and moments from 1 again in every chapter. The free draft is never numbered.
  act: Map<string, number>
  scene: Map<string, number>
  moment: Map<string, number>
}

export interface BookStructure {
  numbers: OutlineNumbers
  // Each chapter's scenes in order.
  scenesOfChapter: Map<string, OutlineNode[]>
  // The chapter a scene, act or moment sits in.
  chapterOf: Map<string, string>
}

export function structureOfBook(index: ChildIndex, bookId: string): BookStructure {
  const numbers: OutlineNumbers = { arc: new Map(), chapter: new Map(), act: new Map(), scene: new Map(), moment: new Map() }
  const scenesOfChapter = new Map<string, OutlineNode[]>()
  const chapterOf = new Map<string, string>()
  let arcs = 0
  let chapters = 0

  const walkChapter = (chapter: OutlineNode) => {
    const counters = { act: 0, scene: 0, moment: 0 }
    const scenes: OutlineNode[] = []
    const walk = (parentId: string) => {
      for (const n of index.get(parentId) ?? []) {
        chapterOf.set(n.id, chapter.id)
        if (!n.freeDraft && (n.kind === 'act' || n.kind === 'scene' || n.kind === 'moment')) numbers[n.kind].set(n.id, ++counters[n.kind])
        if (n.kind === 'scene') scenes.push(n)
        walk(n.id)
      }
    }
    walk(chapter.id)
    scenesOfChapter.set(chapter.id, scenes)
  }
  const walkBook = (parentId: string) => {
    for (const n of index.get(parentId) ?? []) {
      if (n.kind === 'arc') { numbers.arc.set(n.id, ++arcs); walkBook(n.id) }
      else if (n.kind === 'chapter') { numbers.chapter.set(n.id, ++chapters); walkChapter(n) }
    }
  }
  walkBook(bookId)
  return { numbers, scenesOfChapter, chapterOf }
}

// The plotpoints assigned to each outline node (a chapter, act, scene or moment), in plot order.
export function pointsByTarget(plotNodes: PlotNode[]): Map<string, PlotNode[]> {
  const map = new Map<string, PlotNode[]>()
  for (const p of plotNodes) {
    if (p.kind !== 'plotpoint' || !p.assignedMomentId) continue
    const list = map.get(p.assignedMomentId)
    if (list) list.push(p)
    else map.set(p.assignedMomentId, [p])
  }
  for (const list of map.values()) list.sort((a, b) => a.order - b.order)
  return map
}

// The plotpoints still waiting for a place in the outline: assigned to nothing
// (or to something that no longer exists), and with a title to show.
export function unassignedPlotpoints(
  plotNodes: PlotNode[], outlineById: Map<string, OutlineNode>, plotById: Map<string, PlotNode>,
): PlotNode[] {
  return plotNodes
    .filter(p => p.kind === 'plotpoint' && assignedLevel(p, outlineById) === 'none' && textOf(p, plotById).title.trim() !== '')
    .sort((a, b) => a.order - b.order)
}
