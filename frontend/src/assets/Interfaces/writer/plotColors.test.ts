import { describe, expect, it } from 'vitest'
import type { PlotNode } from '../../../api/types'
import { fillColorCss } from '../../../theme/bookColors'
import { plotColors, plotColorVars } from './plotColors'

const node = (id: string, kind: PlotNode['kind'], parentId: string | null, hue?: number | null): PlotNode => ({
  id, kind, parentId, order: 0, title: id, body: '', assignedMomentId: null, assignedParagraphIndex: null,
  sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, hue,
})
const tree = (...nodes: PlotNode[]) => new Map(nodes.map(n => [n.id, n]))

const theme = (h: number | string) => `hsl(${h}, var(--color-theme-s), var(--color-theme-l))`
const accent = (h: number | string) => `hsl(${h}, var(--color-accent-s), var(--color-accent-l))`
const fill = (h: number | string) => fillColorCss(h)
const flat = (c: string) => `linear-gradient(${c}, ${c})`
const none = { cluster: null, clusterFill: null }

describe('plotColors', () => {
  const category = node('c', 'category', null, 200)
  const sub = node('s', 'subcategory', 'c', 230)
  const line = node('l', 'plotline', 's')
  const point = node('p', 'plotpoint', 'l')
  const all = tree(category, sub, line, point)

  it('draws a category in the theme colour and a subcategory in the accent colour', () => {
    expect(plotColors(category, all)).toEqual({ category: theme(200), subcategory: null, subcategoryFill: null, ...none, edge: null })
    expect(plotColors(sub, all)).toEqual({ category: theme(200), subcategory: accent(230), subcategoryFill: fill(230), ...none, edge: flat(accent(230)) })
  })

  it('gives plotlines and plotpoints both their category\'s and their subcategory\'s colour', () => {
    expect(plotColors(line, all)).toEqual({ category: theme(200), subcategory: accent(230), subcategoryFill: fill(230), ...none, edge: flat(accent(230)) })
    expect(plotColors(point, all)).toEqual({ category: theme(200), subcategory: accent(230), subcategoryFill: fill(230), ...none, edge: flat(accent(230)) })
  })

  it('has only the category colour for a plotline directly under a category', () => {
    const direct = node('d', 'plotline', 'c')
    expect(plotColors(direct, tree(category, direct))).toEqual({ category: theme(200), subcategory: null, subcategoryFill: null, ...none, edge: null })
  })

  it('lets a subcategory without a hue follow its category', () => {
    const plain = node('s2', 'subcategory', 'c', null)
    expect(plotColors(plain, tree(category, plain)).subcategory).toBe(accent(200))
  })

  it('uses the app theme hue when a category has none, for both levels', () => {
    const bare = node('c2', 'category', null)
    const bareSub = node('s3', 'subcategory', 'c2')
    const m = tree(bare, bareSub)
    expect(plotColors(bare, m).category).toBe(theme('var(--color-theme-h)'))
    expect(plotColors(bareSub, m).subcategory).toBe(accent('var(--color-theme-h)'))
  })

  it('has no colour for something outside the category tree', () => {
    const orphan = node('o', 'plotline', null)
    expect(plotColors(orphan, tree(orphan))).toEqual({ category: null, subcategory: null, subcategoryFill: null, ...none, edge: null })
  })

  it('hands the colours to CSS as variables, each only when there is one', () => {
    expect(plotColorVars({ category: theme(10), subcategory: accent(40), subcategoryFill: fill(40), ...none, edge: flat(accent(40)) }))
      .toEqual({ '--wr-cat': theme(10), '--wr-sub': accent(40), '--wr-sub-fill': fill(40), '--wr-edge': flat(accent(40)) })
    expect(plotColorVars({ category: theme(10), subcategory: null, subcategoryFill: null, ...none, edge: null })).toEqual({ '--wr-cat': theme(10) })
    expect(plotColorVars({ category: null, subcategory: null, subcategoryFill: null, ...none, edge: null })).toBeUndefined()
  })

  describe('with a cluster', () => {
    const cluster = node('k', 'cluster', 's', 170)
    const inCluster = node('kl', 'plotline', 'k')
    const withCluster = tree(category, sub, cluster, inCluster)

    it('draws a cluster in the accent colour of its own hue', () => {
      expect(plotColors(cluster, withCluster)).toMatchObject({ category: theme(200), subcategory: accent(230), cluster: accent(170), clusterFill: fill(170) })
    })

    it('lets a cluster without a hue follow its subcategory, then its category', () => {
      const plain = node('k2', 'cluster', 's', null)
      expect(plotColors(plain, tree(category, sub, plain)).cluster).toBe(accent(230))
      const bareSub = node('s2', 'subcategory', 'c', null)
      const plain2 = node('k3', 'cluster', 's2', null)
      expect(plotColors(plain2, tree(category, bareSub, plain2)).cluster).toBe(accent(200))
      const direct = node('k4', 'cluster', 'c', null)
      expect(plotColors(direct, tree(category, direct)).cluster).toBe(accent(200))
    })

    it('gives a plotline in a cluster an edge that runs from its subcategory\'s colour to its cluster\'s', () => {
      expect(plotColors(inCluster, withCluster).edge).toBe(`linear-gradient(to bottom, ${accent(230)}, ${accent(170)})`)
    })

    it('has a flat edge in the cluster\'s colour when there is no subcategory', () => {
      const direct = node('k4', 'cluster', 'c', 150)
      const line = node('dl', 'plotline', 'k4')
      expect(plotColors(line, tree(category, direct, line)).edge).toBe(flat(accent(150)))
    })

    it('hands the cluster\'s colours to CSS too', () => {
      const vars = plotColorVars(plotColors(inCluster, withCluster))
      expect(vars).toMatchObject({ '--wr-cluster': accent(170), '--wr-cluster-fill': fill(170) })
      expect(vars?.['--wr-edge']).toContain('linear-gradient(to bottom')
    })
  })
})
