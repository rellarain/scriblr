import type { PlotNode } from '../../../api/types'
import { SAT_LOUD, SAT_MIDDLE, SAT_QUIET, accentColorCss, fillColorCss, themeColorCss } from '../../../theme/bookColors'

// Colour coding for the plot tree. A category has a hue drawn in the theme's
// colour; a subcategory and a cluster have a hue drawn in the accent's colour, each kept within 60 degrees of its category's.
// Saturation and brightness are the active zone's, through CSS variables, so the colours follow the theme; the saturation is in tiers,
// the quietest for a category (half the zone's), a subcategory in the middle (three quarters), a cluster the loudest (all of it).
//   - a category with no hue of its own shows the app theme's hue
//   - a subcategory with no hue of its own uses its category's
//   - a cluster with no hue of its own uses its subcategory's (its category's outside one)
//   - a plotline (and its plotpoints) wears its category's colour as its surface, with a left
//     edge of stripes stacked from the left edge inwards in the order of the tree: its category's, its subcategory's, its cluster's
//     (one for each it has; each in the accent colour of that level's hue, so the category's reads against its own surface)

// The hue used when nothing is stored: the app theme's own.
const APP_HUE = 'var(--color-theme-h)'

export interface PlotColors {
  category: string | null
  subcategory: string | null
  // The subcategory's colour as a surface that carries text (a nav row, a card): the level's fill of its hue, held dark enough for white
  // text to read whatever the hue (the accent colour at a hue can be too bright). The edge stripe stays the accent colour.
  subcategoryFill: string | null
  cluster: string | null
  clusterFill: string | null
  // The left edge: the stripes side by side, each a flat colour drawn as a background image 4px wide. `edge` is the list of images,
  // `edgeSize` and `edgePos` the matching background-size and -position lists, `edgeWidth` the room the stripes take.
  edge: string | null
  edgeSize: string | null
  edgePos: string | null
  edgeWidth: string | null
}

export const STRIPE_PX = 4

export function plotColors(node: PlotNode, byId: Map<string, PlotNode>): PlotColors {
  let category: PlotNode | undefined
  let subcategory: PlotNode | undefined
  let cluster: PlotNode | undefined
  for (let current: PlotNode | undefined = node, guard = 0; current && guard < 8; guard += 1) {
    if (current.kind === 'category') category = current
    else if (current.kind === 'subcategory') subcategory = current
    else if (current.kind === 'cluster') cluster = current
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  const categoryHue = category?.hue ?? null
  const categoryCss = category ? themeColorCss(categoryHue ?? APP_HUE, SAT_QUIET) : null
  const subcategoryHue = subcategory ? subcategory.hue ?? categoryHue ?? APP_HUE : null
  const clusterHue = cluster ? cluster.hue ?? subcategoryHue ?? categoryHue ?? APP_HUE : null
  const subcategoryCss = subcategoryHue !== null ? accentColorCss(subcategoryHue, SAT_MIDDLE) : null
  const clusterCss = clusterHue !== null ? accentColorCss(clusterHue, SAT_LOUD) : null
  const stripes = [category ? accentColorCss(categoryHue ?? APP_HUE, SAT_QUIET) : null, subcategoryCss, clusterCss].filter((c): c is string => c !== null)
  const edged = stripes.length > 0
  return {
    category: categoryCss,
    subcategory: subcategoryCss,
    subcategoryFill: subcategoryHue !== null ? fillColorCss(subcategoryHue, SAT_MIDDLE) : null,
    cluster: clusterCss,
    clusterFill: clusterHue !== null ? fillColorCss(clusterHue, SAT_LOUD) : null,
    edge: edged ? stripes.map(c => `linear-gradient(${c}, ${c})`).join(', ') : null,
    edgeSize: edged ? stripes.map(() => `${STRIPE_PX}px 100%`).join(', ') : null,
    edgePos: edged ? stripes.map((_, i) => `${i * STRIPE_PX}px 0`).join(', ') : null,
    edgeWidth: edged ? `${stripes.length * STRIPE_PX}px` : null,
  }
}

// The style that hands a node's colours to its CSS: `var(--wr-cat)`, `var(--wr-sub)`, `var(--wr-sub-fill)`, `var(--wr-cluster)`,
// `var(--wr-cluster-fill)`, and the edge: `var(--wr-edge)`, `var(--wr-edge-size)`, `var(--wr-edge-pos)` and `var(--wr-edge-w)` (each set only when the
// node has that colour, so `var(--wr-edge, none)` works).
export function plotColorVars(colors: PlotColors) {
  const vars: Record<string, string> = {}
  if (colors.category) vars['--wr-cat'] = colors.category
  if (colors.subcategory) vars['--wr-sub'] = colors.subcategory
  if (colors.subcategoryFill) vars['--wr-sub-fill'] = colors.subcategoryFill
  if (colors.cluster) vars['--wr-cluster'] = colors.cluster
  if (colors.clusterFill) vars['--wr-cluster-fill'] = colors.clusterFill
  if (colors.edge) vars['--wr-edge'] = colors.edge
  if (colors.edgeSize) vars['--wr-edge-size'] = colors.edgeSize
  if (colors.edgePos) vars['--wr-edge-pos'] = colors.edgePos
  if (colors.edgeWidth) vars['--wr-edge-w'] = colors.edgeWidth
  return Object.keys(vars).length > 0 ? vars : undefined
}
