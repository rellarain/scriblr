import { describe, expect, it } from 'vitest'
import type { PlotNode } from '../../../api/types'
import { nodeColorStyle, plotColors } from './plotColors'

const node = (id: string, kind: PlotNode['kind'], parentId: string | null, hue?: number | null): PlotNode => ({
  id, kind, parentId, order: 0, title: id, body: '', assignedMomentId: null, assignedParagraphIndex: null,
  sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, hue,
})
const tree = (...nodes: PlotNode[]) => new Map(nodes.map(n => [n.id, n]))

const theme = (h: number | string) => `hsl(${h}, var(--color-theme-s), var(--color-theme-l))`
const accent = (h: number | string) => `hsl(${h}, var(--color-accent-s), var(--color-accent-l))`

describe('plotColors', () => {
  const category = node('c', 'category', null, 200)
  const sub = node('s', 'subcategory', 'c', 230)
  const line = node('l', 'plotline', 's')
  const point = node('p', 'plotpoint', 'l')
  const all = tree(category, sub, line, point)

  it('draws a category in the theme colour and a subcategory in the accent colour', () => {
    expect(plotColors(category, all)).toEqual({ category: theme(200), subcategory: null, primary: theme(200) })
    expect(plotColors(sub, all)).toEqual({ category: theme(200), subcategory: accent(230), primary: accent(230) })
  })

  it('gives plotlines and plotpoints their subcategory\'s colour', () => {
    expect(plotColors(line, all).primary).toBe(accent(230))
    expect(plotColors(point, all)).toEqual({ category: theme(200), subcategory: accent(230), primary: accent(230) })
  })

  it('falls back to the category for a plotline directly under a category', () => {
    const direct = node('d', 'plotline', 'c')
    expect(plotColors(direct, tree(category, direct))).toEqual({ category: theme(200), subcategory: null, primary: theme(200) })
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
    expect(plotColors(orphan, tree(orphan))).toEqual({ category: null, subcategory: null, primary: null })
  })

  it('hands the colour to CSS as a variable', () => {
    expect(nodeColorStyle(theme(10))).toEqual({ '--wr-node-color': theme(10) })
    expect(nodeColorStyle(null)).toBeUndefined()
  })
})
