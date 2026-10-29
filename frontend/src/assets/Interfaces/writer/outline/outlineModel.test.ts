import { describe, expect, it } from 'vitest'
import type { OutlineNode, PlotNode } from '../../../../api/types'
import { buildChildIndex } from '../outlineTree'
import { pointsByTarget } from '../plotPlacement'
import { stat, structureOfBook, trayPlotpoints } from './outlineModel'

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, order = 0, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)
const point = (id: string, over: Partial<PlotNode> = {}): PlotNode =>
  ({
    id, kind: 'plotpoint', parentId: 'line', order: 0, title: id, body: '', placements: [],
    customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, sourceFieldId: null, fieldId: null, refId: null, ...over,
  } as PlotNode)

const tree = [
  node('b', 'book', null),
  node('a1', 'arc', 'b', 0), node('c1', 'chapter', 'a1', 0), node('c2', 'chapter', 'a1', 1),
  node('a2', 'arc', 'b', 1), node('c3', 'chapter', 'a2', 0),
  node('c4', 'chapter', 'b', 2),
  node('act1', 'act', 'c1', 0), node('s1', 'scene', 'act1', 0), node('m1', 'moment', 's1', 0), node('m2', 'moment', 's1', 1),
  node('free', 'moment', 'c1', -1, { freeDraft: true }),
  node('act2', 'act', 'c3', 0), node('s2', 'scene', 'act2', 0), node('m3', 'moment', 's2', 0),
]

describe('structureOfBook', () => {
  const { numbers, scenesOfChapter, chapterOf } = structureOfBook(buildChildIndex(tree), 'b')

  it('numbers arcs and chapters across the book', () => {
    expect([...numbers.arc]).toEqual([['a1', 1], ['a2', 2]])
    expect([...numbers.chapter]).toEqual([['c1', 1], ['c2', 2], ['c3', 3], ['c4', 4]])
  })

  it('starts acts, scenes and moments again in every chapter, and never numbers the free draft', () => {
    expect(numbers.act.get('act1')).toBe(1)
    expect(numbers.act.get('act2')).toBe(1)
    expect([numbers.moment.get('m1'), numbers.moment.get('m2'), numbers.moment.get('m3')]).toEqual([1, 2, 1])
    expect(numbers.moment.has('free')).toBe(false)
  })

  it('counts the acts, scenes and moments each chapter holds, without the free draft', () => {
    const { totalsOfChapter } = structureOfBook(buildChildIndex(tree), 'b')
    expect(totalsOfChapter.get('c1')).toEqual({ act: 1, scene: 1, moment: 2 })
    expect(totalsOfChapter.get('c3')).toEqual({ act: 1, scene: 1, moment: 1 })
    expect(totalsOfChapter.get('c2')).toEqual({ act: 0, scene: 0, moment: 0 })
  })

  it('lists the scenes of each chapter and finds the chapter of anything inside one', () => {
    expect(scenesOfChapter.get('c1')!.map(s => s.id)).toEqual(['s1'])
    expect(scenesOfChapter.get('c3')!.map(s => s.id)).toEqual(['s2'])
    expect(scenesOfChapter.get('c2')).toEqual([])
    expect([chapterOf.get('m2'), chapterOf.get('s2'), chapterOf.get('free')]).toEqual(['c1', 'c3', 'c1'])
  })
})

describe('stat', () => {
  it('counts in the singular for one and the plural otherwise', () => {
    expect([stat(0, 'act'), stat(1, 'act'), stat(2, 'act')]).toEqual(['0 acts', '1 act', '2 acts'])
  })
})

describe('plotpoints', () => {
  const outlineById = new Map(tree.map(n => [n.id, n]))
  const on = (targetId: string, awareness: 'front' | null = null, id = `at-${targetId}`) => ({ id, targetId, paragraphIndex: null, awareness })
  const points = [
    point('loose', { order: 2 }), point('first', { order: 1 }),
    point('placed', { placements: [on('m1', 'front')] }), point('inChapter', { placements: [on('c1')] }),
    point('twice', { placements: [on('c1', null, 'twice1'), on('m1', 'front', 'twice2')], order: 4 }),
    point('gone', { placements: [on('deleted-node')], order: 3 }), point('nameless', { title: '' }),
  ]
  const plotById = new Map(points.map(p => [p.id, p]))

  it('keeps every plotpoint with a title in the tray, placed or not, in plot order', () => {
    expect(trayPlotpoints(points, outlineById, plotById, false).map(p => p.id)).toEqual(['placed', 'inChapter', 'first', 'loose', 'gone', 'twice'])
  })

  it('narrows the tray to what is still to place: placed nowhere, or only where there is no outline node any more', () => {
    expect(trayPlotpoints(points, outlineById, plotById, true).map(p => p.id)).toEqual(['first', 'loose', 'gone'])
  })

  it('takes a reference title from its original', () => {
    const original = point('orig', { title: 'The original' })
    const ref = point('ref', { title: '', refId: 'orig', order: 1 })
    const all = [original, ref]
    expect(trayPlotpoints(all, outlineById, new Map(all.map(p => [p.id, p])), true).map(p => p.id)).toEqual(['orig', 'ref'])
  })

  it('groups the placements by the node they sit on, a plotpoint placed twice standing on both', () => {
    const byNode = pointsByTarget(points)
    expect([...byNode.keys()].sort()).toEqual(['c1', 'deleted-node', 'm1'])
    expect(byNode.get('m1')!.map(e => e.point.id)).toEqual(['placed', 'twice'])
    expect(byNode.get('c1')!.map(e => [e.point.id, e.placement.id])).toEqual([['inChapter', 'at-c1'], ['twice', 'twice1']])
  })
})
