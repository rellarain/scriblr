import { describe, expect, it } from 'vitest'
import type { PlotNode } from '../../../api/types'
import { fillColorCss } from '../../../theme/bookColors'
import { plotColors, plotColorVars } from './plotColors'

const node = (id: string, kind: PlotNode['kind'], parentId: string | null, hue?: number | null): PlotNode => ({
  id, kind, parentId, order: 0, title: id, body: '', assignedMomentId: null, assignedParagraphIndex: null,
  sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, hue,
})
const tree = (...nodes: PlotNode[]) => new Map(nodes.map(n => [n.id, n]))

// Saturation tiers: a category 0.5 of the zone's, a subcategory 0.75, a cluster all of it.
const sat = (family: string, k: number) => (k === 1 ? `var(--color-${family}-s)` : `calc(var(--color-${family}-s) * ${k})`)
const theme = (h: number | string, k = 0.5) => `hsl(${h}, ${sat('theme', k)}, var(--color-theme-l))`
const accent = (h: number | string, k: number) => `hsl(${h}, ${sat('accent', k)}, var(--color-accent-l))`
const fill = (h: number | string, k: number) => fillColorCss(h, k)
const flat = (c: string) => `linear-gradient(${c}, ${c})`
const none = { cluster: null, clusterFill: null }
// The edge for these stripes (left to right), each 4px wide and the next one 4px further in.
const edge = (...colours: string[]) => ({
  edge: colours.map(flat).join(', '),
  edgeSize: colours.map(() => '4px 100%').join(', '),
  edgePos: colours.map((_, i) => `${i * 4}px 0`).join(', '),
  edgeWidth: `${colours.length * 4}px`,
})
const noEdge = { edge: null, edgeSize: null, edgePos: null, edgeWidth: null }

describe('plotColors', () => {
  const category = node('c', 'category', null, 200)
  const sub = node('s', 'subcategory', 'c', 230)
  const line = node('l', 'plotline', 's')
  const point = node('p', 'plotpoint', 'l')
  const all = tree(category, sub, line, point)

  it('draws a category in the theme colour and a subcategory in the accent colour', () => {
    expect(plotColors(category, all)).toEqual({ category: theme(200), subcategory: null, subcategoryFill: null, ...none, ...edge(accent(200, 0.5)) })
    expect(plotColors(sub, all)).toEqual({ category: theme(200), subcategory: accent(230, 0.75), subcategoryFill: fill(230, 0.75), ...none, ...edge(accent(200, 0.5), accent(230, 0.75)) })
  })

  it('gives plotlines and plotpoints their category\'s and their subcategory\'s colour, and the stripes of both side by side', () => {
    expect(plotColors(line, all)).toEqual({ category: theme(200), subcategory: accent(230, 0.75), subcategoryFill: fill(230, 0.75), ...none, ...edge(accent(200, 0.5), accent(230, 0.75)) })
    expect(plotColors(point, all)).toEqual({ category: theme(200), subcategory: accent(230, 0.75), subcategoryFill: fill(230, 0.75), ...none, ...edge(accent(200, 0.5), accent(230, 0.75)) })
  })

  it('has the category\'s stripe alone for a plotline directly under a category', () => {
    const direct = node('d', 'plotline', 'c')
    expect(plotColors(direct, tree(category, direct))).toEqual({ category: theme(200), subcategory: null, subcategoryFill: null, ...none, ...edge(accent(200, 0.5)) })
  })

  it('lets a subcategory without a hue follow its category', () => {
    const plain = node('s2', 'subcategory', 'c', null)
    expect(plotColors(plain, tree(category, plain)).subcategory).toBe(accent(200, 0.75))
  })

  it('uses the app theme hue when a category has none, for both levels', () => {
    const bare = node('c2', 'category', null)
    const bareSub = node('s3', 'subcategory', 'c2')
    const m = tree(bare, bareSub)
    expect(plotColors(bare, m).category).toBe(theme('var(--color-theme-h)'))
    expect(plotColors(bareSub, m).subcategory).toBe(accent('var(--color-theme-h)', 0.75))
  })

  it('has no colour for something outside the category tree', () => {
    const orphan = node('o', 'plotline', null)
    expect(plotColors(orphan, tree(orphan))).toEqual({ category: null, subcategory: null, subcategoryFill: null, ...none, ...noEdge })
  })

  it('hands the colours to CSS as variables, each only when there is one', () => {
    expect(plotColorVars({ category: theme(10), subcategory: accent(40, 0.75), subcategoryFill: fill(40, 0.75), ...none, ...edge(accent(10, 0.5), accent(40, 0.75)) }))
      .toEqual({
        '--wr-cat': theme(10), '--wr-sub': accent(40, 0.75), '--wr-sub-fill': fill(40, 0.75),
        '--wr-edge': `${flat(accent(10, 0.5))}, ${flat(accent(40, 0.75))}`, '--wr-edge-size': '4px 100%, 4px 100%', '--wr-edge-pos': '0px 0, 4px 0', '--wr-edge-w': '8px',
      })
    expect(plotColorVars({ category: theme(10), subcategory: null, subcategoryFill: null, ...none, ...noEdge })).toEqual({ '--wr-cat': theme(10) })
    expect(plotColorVars({ category: null, subcategory: null, subcategoryFill: null, ...none, ...noEdge })).toBeUndefined()
  })

  describe('with a cluster', () => {
    const cluster = node('k', 'cluster', 's', 170)
    const inCluster = node('kl', 'plotline', 'k')
    const withCluster = tree(category, sub, cluster, inCluster)

    it('draws a cluster in the accent colour of its own hue', () => {
      expect(plotColors(cluster, withCluster)).toMatchObject({ category: theme(200), subcategory: accent(230, 0.75), cluster: accent(170, 1), clusterFill: fill(170, 1) })
    })

    it('lets a cluster without a hue follow its subcategory, then its category', () => {
      const plain = node('k2', 'cluster', 's', null)
      expect(plotColors(plain, tree(category, sub, plain)).cluster).toBe(accent(230, 1))
      const bareSub = node('s2', 'subcategory', 'c', null)
      const plain2 = node('k3', 'cluster', 's2', null)
      expect(plotColors(plain2, tree(category, bareSub, plain2)).cluster).toBe(accent(200, 1))
      const direct = node('k4', 'cluster', 'c', null)
      expect(plotColors(direct, tree(category, direct)).cluster).toBe(accent(200, 1))
    })

    it('stacks a plotline in a cluster\'s stripes left to right: its category\'s, its subcategory\'s, its cluster\'s', () => {
      expect(plotColors(inCluster, withCluster)).toMatchObject(edge(accent(200, 0.5), accent(230, 0.75), accent(170, 1)))
    })

    it('has the category\'s and the cluster\'s stripes when there is no subcategory', () => {
      const direct = node('k4', 'cluster', 'c', 150)
      const line = node('dl', 'plotline', 'k4')
      expect(plotColors(line, tree(category, direct, line))).toMatchObject(edge(accent(200, 0.5), accent(150, 1)))
    })

    it('hands the cluster\'s colours and its three stripes to CSS too', () => {
      const vars = plotColorVars(plotColors(inCluster, withCluster))
      expect(vars).toMatchObject({ '--wr-cluster': accent(170, 1), '--wr-cluster-fill': fill(170, 1), '--wr-edge-w': '12px', '--wr-edge-pos': '0px 0, 4px 0, 8px 0' })
    })
  })
})
