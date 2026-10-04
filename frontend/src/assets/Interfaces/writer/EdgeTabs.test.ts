import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../../../api/types'
import { tabClusters } from './EdgeTabs'
import { parentTrail, chapterPlotpoints } from './draft/draftModel'
import { buildChildIndex } from './outlineTree'
import { plotNode } from './plotTestWorkspace'

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, order = 0): OutlineNode =>
  ({ id, kind, parentId, order, title: id, synopsis: '', draftRef: null } as OutlineNode)

describe('tabClusters', () => {
  it('makes a cluster per arc, and groups the chapters straight under the book', () => {
    const nodes = [
      node('b', 'book', null),
      node('loose1', 'chapter', 'b', 0), node('loose2', 'chapter', 'b', 1),
      node('a1', 'arc', 'b', 2), node('c1', 'chapter', 'a1', 0), node('c2', 'chapter', 'a1', 1),
      node('a2', 'arc', 'b', 3),
      node('loose3', 'chapter', 'b', 4),
    ]
    const clusters = tabClusters(nodes, 'b')
    expect(clusters.map(c => [c.arc?.id ?? null, c.chapters.map(ch => ch.id)])).toEqual([
      [null, ['loose1', 'loose2']], ['a1', ['c1', 'c2']], ['a2', []], [null, ['loose3']],
    ])
  })
})

describe('draft model', () => {
  const nodes = [
    node('s', 'series', null), node('b', 'book', 's'), node('a', 'arc', 'b'), node('c', 'chapter', 'a'),
    node('act', 'act', 'c'), node('m', 'moment', 'act'),
  ]
  it('stacks the titles above a chapter, outermost first', () => {
    expect(parentTrail('c', new Map(nodes.map(n => [n.id, n]))).map(n => n.id)).toEqual(['s', 'b', 'a'])
    expect(parentTrail('b', new Map(nodes.map(n => [n.id, n]))).map(n => n.id)).toEqual(['s'])
  })

  it("lists a chapter's own plotpoints first, then those inside it in outline order", () => {
    const own = plotNode('own', 'plotpoint', 'l', { assignedMomentId: 'c' })
    const onMoment = plotNode('onMoment', 'plotpoint', 'l', { assignedMomentId: 'm' })
    const onAct = plotNode('onAct', 'plotpoint', 'l', { assignedMomentId: 'act' })
    const byNode = new Map([['c', [own]], ['m', [onMoment]], ['act', [onAct]]])
    expect(chapterPlotpoints('c', buildChildIndex(nodes), byNode).map(p => p.id)).toEqual(['own', 'onAct', 'onMoment'])
  })
})
