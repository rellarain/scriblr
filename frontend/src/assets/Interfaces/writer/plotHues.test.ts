import { describe, expect, it } from 'vitest'
import type { PlotNode } from '../../../api/types'
import { plotParentOf, reconcilePlotHues, shownPlotHue } from './plotHues'

const node = (id: string, kind: PlotNode['kind'], parentId: string | null, hue?: number | null): PlotNode => ({
  id, kind, parentId, order: 0, title: id, body: '', assignedMomentId: null, assignedParagraphIndex: null, sourceFieldId: null,
  customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, hue,
})
const byId = (nodes: PlotNode[]) => new Map(nodes.map(n => [n.id, n]))

const APP = 330

describe('plotParentOf', () => {
  const nodes = [
    node('cat', 'category', null, 100), node('sub', 'subcategory', 'cat'), node('clu', 'cluster', 'sub'),
    node('direct', 'cluster', 'cat'), node('line', 'plotline', 'clu'),
  ]
  const map = byId(nodes)

  it('is the category for a subcategory, the subcategory for a cluster, and the category for a cluster straight under one', () => {
    expect(plotParentOf(nodes[1], map)?.id).toBe('cat')
    expect(plotParentOf(nodes[2], map)?.id).toBe('sub')
    expect(plotParentOf(nodes[3], map)?.id).toBe('cat')
  })

  it('is nothing for a category (it is measured from the project)', () => {
    expect(plotParentOf(nodes[0], map)).toBeUndefined()
  })
})

describe('shownPlotHue', () => {
  it('is a node\'s own hue, else its parent\'s, else (for a category) the app theme\'s', () => {
    const nodes = [node('cat', 'category', null), node('sub', 'subcategory', 'cat'), node('clu', 'cluster', 'sub', 40)]
    const map = byId(nodes)
    expect(shownPlotHue(nodes[0], map, APP)).toBe(APP)
    expect(shownPlotHue(nodes[1], map, APP)).toBe(APP)
    expect(shownPlotHue(nodes[2], map, APP)).toBe(40)
    expect(shownPlotHue(node('c2', 'category', null, 200), map, APP)).toBe(200)
    expect(shownPlotHue(undefined, map, APP)).toBe(APP)
  })
})

describe('reconcilePlotHues', () => {
  const tree = () => [
    node('cat', 'category', null, 100), node('sub', 'subcategory', 'cat', 150), node('clu', 'cluster', 'sub', 170),
    node('other', 'category', null, 100), node('osub', 'subcategory', 'other', 300),
  ]
  const hues = (nodes: PlotNode[]) => nodes.map(n => n.hue)

  it('pulls a subcategory back within 60 of its category and its cluster within 30 of the subcategory, top down', () => {
    // The category moves to 20: its subcategory (150) comes to 80, then its cluster (170) to within 30 of 80, which is 110.
    const moved = tree().map(n => (n.id === 'cat' ? { ...n, hue: 20 } : n))
    expect(hues(reconcilePlotHues(moved, 'cat'))).toEqual([20, 80, 110, 100, 300])
  })

  it('leaves colours elsewhere alone, even ones outside their range (they are held when they or their parent change)', () => {
    expect(hues(reconcilePlotHues(tree(), 'cat'))[4]).toBe(300)
  })

  it('does not move the node it starts from', () => {
    const nodes = [node('cat', 'category', null, 100), node('sub', 'subcategory', 'cat', 300)]
    expect(hues(reconcilePlotHues(nodes, 'sub'))).toEqual([100, 300])
    expect(hues(reconcilePlotHues(nodes, 'cat'))).toEqual([100, 40])
  })

  it('leaves a node with no hue of its own, and an unchanged tree, as the same objects', () => {
    const nodes = [node('cat', 'category', null, 100), node('sub', 'subcategory', 'cat'), node('clu', 'cluster', 'sub', 110)]
    const out = reconcilePlotHues(nodes, 'cat')
    expect(out[1]).toBe(nodes[1])
    expect(out[2]).toBe(nodes[2])
  })

  it('measures a cluster from the subcategory\'s shown hue when the subcategory has none of its own (its category\'s)', () => {
    const nodes = [node('cat', 'category', null, 100), node('sub', 'subcategory', 'cat'), node('clu', 'cluster', 'sub', 200)]
    expect(hues(reconcilePlotHues(nodes, 'cat'))[2]).toBe(130)
  })

  it('skips a cluster whose chain has no stored hue at all (nothing to measure from)', () => {
    const nodes = [node('cat', 'category', null), node('sub', 'subcategory', 'cat'), node('clu', 'cluster', 'sub', 200)]
    expect(reconcilePlotHues(nodes, 'cat')[2].hue).toBe(200)
  })
})
