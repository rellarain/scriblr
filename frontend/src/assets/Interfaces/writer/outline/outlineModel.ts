import type { OutlineNode, PlotNode } from '../../../../api/types'
import type { ChildIndex } from '../outlineTree'
import { textOf } from '../plotFields'
import { isPlaced } from '../plotPlacement'

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

// What a chapter holds, counted for its card's stats line (the free draft is not counted).
export interface ChapterTotals { act: number; scene: number; moment: number }

export interface BookStructure {
  numbers: OutlineNumbers
  // How many acts, scenes and moments each chapter holds.
  totalsOfChapter: Map<string, ChapterTotals>
  // Each chapter's scenes in order.
  scenesOfChapter: Map<string, OutlineNode[]>
  // The chapter a scene, act or moment sits in.
  chapterOf: Map<string, string>
}

export function structureOfBook(index: ChildIndex, bookId: string): BookStructure {
  const numbers: OutlineNumbers = { arc: new Map(), chapter: new Map(), act: new Map(), scene: new Map(), moment: new Map() }
  const scenesOfChapter = new Map<string, OutlineNode[]>()
  const totalsOfChapter = new Map<string, ChapterTotals>()
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
    totalsOfChapter.set(chapter.id, counters)
  }
  const walkBook = (parentId: string) => {
    for (const n of index.get(parentId) ?? []) {
      if (n.kind === 'arc') { numbers.arc.set(n.id, ++arcs); walkBook(n.id) }
      else if (n.kind === 'chapter') { numbers.chapter.set(n.id, ++chapters); walkChapter(n) }
    }
  }
  walkBook(bookId)
  return { numbers, totalsOfChapter, scenesOfChapter, chapterOf }
}

// "1 act", "2 acts".
export const stat = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`

// The plotpoints in the tray: every one that has a title to show, in plot order (it stays there however often it is placed); with
// `stillToPlace`, only those placed nowhere yet.
export function trayPlotpoints(
  plotNodes: PlotNode[], outlineById: Map<string, OutlineNode>, plotById: Map<string, PlotNode>, stillToPlace: boolean,
): PlotNode[] {
  return plotNodes
    .filter(p => p.kind === 'plotpoint' && textOf(p, plotById).title.trim() !== '' && (!stillToPlace || !isPlaced(p, outlineById)))
    .sort((a, b) => a.order - b.order)
}
