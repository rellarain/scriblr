import type { PlotNode } from '../../../api/types'
import { accentColorCss, fillColorCss, themeColorCss } from '../../../theme/bookColors'

// Colour coding for the plot tree. A category has a hue drawn in the theme's
// colour; a subcategory and a cluster have a hue drawn in the accent's colour, each kept within 60 degrees of its category's.
// Saturation and brightness are the active zone's, through CSS variables, so the colours follow the theme.
//   - a category with no hue of its own shows the app theme's hue
//   - a subcategory with no hue of its own uses its category's
//   - a cluster with no hue of its own uses its subcategory's (its category's outside one)
//   - a plotline (and its plotpoints) wears its category's colour as its surface, with a left
//     edge: a stripe in its subcategory's colour, in its cluster's, or a gradient from the one to the other
//     (no edge without either)

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
  // The left edge as a CSS image (a vertical gradient, or the one colour as a flat one), for a 4px stripe.
  edge: string | null
}

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
  const categoryCss = category ? themeColorCss(categoryHue ?? APP_HUE) : null
  const subcategoryHue = subcategory ? subcategory.hue ?? categoryHue ?? APP_HUE : null
  const clusterHue = cluster ? cluster.hue ?? subcategoryHue ?? categoryHue ?? APP_HUE : null
  const subcategoryCss = subcategoryHue !== null ? accentColorCss(subcategoryHue) : null
  const clusterCss = clusterHue !== null ? accentColorCss(clusterHue) : null
  return {
    category: categoryCss,
    subcategory: subcategoryCss,
    subcategoryFill: subcategoryHue !== null ? fillColorCss(subcategoryHue) : null,
    cluster: clusterCss,
    clusterFill: clusterHue !== null ? fillColorCss(clusterHue) : null,
    edge: subcategoryCss && clusterCss ? `linear-gradient(to bottom, ${subcategoryCss}, ${clusterCss})`
      : subcategoryCss || clusterCss ? `linear-gradient(${subcategoryCss ?? clusterCss}, ${subcategoryCss ?? clusterCss})` : null,
  }
}

// The style that hands a node's colours to its CSS: `var(--wr-cat)`, `var(--wr-sub)`, `var(--wr-sub-fill)`, `var(--wr-cluster)`,
// `var(--wr-cluster-fill)` and `var(--wr-edge)` (each set only when the node has that colour, so `var(--wr-edge, none)` works).
export function plotColorVars(colors: PlotColors) {
  const vars: Record<string, string> = {}
  if (colors.category) vars['--wr-cat'] = colors.category
  if (colors.subcategory) vars['--wr-sub'] = colors.subcategory
  if (colors.subcategoryFill) vars['--wr-sub-fill'] = colors.subcategoryFill
  if (colors.cluster) vars['--wr-cluster'] = colors.cluster
  if (colors.clusterFill) vars['--wr-cluster-fill'] = colors.clusterFill
  if (colors.edge) vars['--wr-edge'] = colors.edge
  return Object.keys(vars).length > 0 ? vars : undefined
}
