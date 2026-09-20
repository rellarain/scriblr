import type { PlotNode } from '../../../api/types'
import { accentColorCss, themeColorCss } from '../../../theme/bookColors'

// Colour coding for the plot tree. A category has a hue drawn in the theme's
// (desaturated) colour; a subcategory has a hue drawn in the accent's (saturated)
// colour, kept within 60 degrees of its category's. Saturation and brightness
// are the active zone's, through CSS variables, so the colours follow the theme.
//   - a category with no hue of its own shows the app theme's hue
//   - a subcategory with no hue of its own uses its category's
//   - a plotline (and its plotpoints) wears its category's colour as its surface, with a left
//     edge in its subcategory's colour (no edge without a subcategory)

// The hue used when nothing is stored: the app theme's own.
const APP_HUE = 'var(--color-theme-h)'

export interface PlotColors {
  category: string | null
  subcategory: string | null
}

export function plotColors(node: PlotNode, byId: Map<string, PlotNode>): PlotColors {
  let category: PlotNode | undefined
  let subcategory: PlotNode | undefined
  for (let current: PlotNode | undefined = node, guard = 0; current && guard < 8; guard += 1) {
    if (current.kind === 'category') category = current
    else if (current.kind === 'subcategory') subcategory = current
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  const categoryHue = category?.hue ?? null
  const categoryCss = category ? themeColorCss(categoryHue ?? APP_HUE) : null
  const subcategoryCss = subcategory ? accentColorCss(subcategory.hue ?? categoryHue ?? APP_HUE) : null
  return { category: categoryCss, subcategory: subcategoryCss }
}

// The style that hands a node's colours to its CSS: `var(--wr-cat)` and `var(--wr-sub)`
// (each set only when the node has that colour, so `var(--wr-sub, transparent)` works).
export function plotColorVars(colors: PlotColors) {
  const vars: Record<string, string> = {}
  if (colors.category) vars['--wr-cat'] = colors.category
  if (colors.subcategory) vars['--wr-sub'] = colors.subcategory
  return Object.keys(vars).length > 0 ? vars : undefined
}
