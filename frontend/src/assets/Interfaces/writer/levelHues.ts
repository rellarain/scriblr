import type { OutlineNode } from '../../../api/types'
import { bookThemeHue, clampCodeToWindow, encodeHue, hueDelta, hueOfCode, themeColorCss, wrapHue } from '../../../theme/bookColors'

// The Writer's level colours. Each level has a colour code (one number holding a hue and a brightness,
// darker / base / lighter: see theme/bookColors.ts); the one saturation and the lightness come from the
// active theme zone.
//
//   project   its own (ProjectSettings.themeHue), else a default off the app theme's hue
//   series    within LEVEL_HUE_WINDOW of the project's hue
//   book      any hue (its own themeHue; see bookThemeHue)
//   arc       within LEVEL_HUE_WINDOW of its book's hue
//   chapter   within LEVEL_HUE_WINDOW of its arc's hue (its book's, outside any arc)
//
// "Within a window" is about the HUE: a series, arc or chapter picks any brightness round its parent's
// hue. A series, arc or chapter with no colour of its own shows its parent's. Changing a parent pulls
// its children's own hues back inside their window.
export const LEVEL_HUE_WINDOW = 60
// The project's default hue is this far round the wheel from the app theme's, so the
// Dash (the theme itself) and the Project level read as different tints.
const DEFAULT_PROJECT_HUE_OFFSET = 120

export const defaultProjectHue = (appHue: number): number => encodeHue(appHue + DEFAULT_PROJECT_HUE_OFFSET, 'base')

type HueNode = Pick<OutlineNode, 'id' | 'kind' | 'parentId' | 'themeHue' | 'color'>
export type HueNodes = Map<string, HueNode>

// A node's colour code: its own, else its parent's (a book's own, else the book default).
export function levelHue(node: HueNode, nodes: HueNodes, projectHue: number): number {
  const parent = node.parentId ? nodes.get(node.parentId) : undefined
  const own = node.kind === 'book' ? bookThemeHue(node) : node.themeHue != null ? Math.round(node.themeHue) : null
  if (own !== null) return own
  return parent ? levelHue(parent, nodes, projectHue) : projectHue
}

// The node's colour as CSS (the zone's theme saturation and lightness, in the node's brightness).
export const levelTint = (node: HueNode, nodes: HueNodes, projectHue: number): string => themeColorCss(levelHue(node, nodes, projectHue))

// The hue a node's own hue must stay near, or null when it may be any hue (a book).
export function hueCentre(node: HueNode, nodes: HueNodes, projectHue: number): number | null {
  if (node.kind === 'book') return null
  const parent = node.parentId ? nodes.get(node.parentId) : undefined
  return hueOfCode(parent ? levelHue(parent, nodes, projectHue) : projectHue)
}

// The hue for a new node among its siblings: the one in its window farthest from the
// siblings' hues (and the centre, when it has none yet), so siblings stay distinct.
export function autoPickHue(centre: number, siblingHues: number[]): number {
  const taken = siblingHues.length > 0 ? siblingHues : [centre]
  let best = centre
  let bestGap = -1
  for (let offset = -LEVEL_HUE_WINDOW; offset <= LEVEL_HUE_WINDOW; offset += 5) {
    const candidate = wrapHue(centre + offset)
    const gap = Math.min(...taken.map(h => Math.abs(hueDelta(h, candidate))))
    // Strictly greater: of equally good hues the first (lowest offset) wins.
    if (gap > bestGap) { best = candidate; bestGap = gap }
  }
  return best
}

// A colour held within its window: its hue brought back to within the window round the parent's hue
// (`centre`), the brightness kept. A book (no centre) is not held.
export const fitToParent = (code: number, centre: number | null): number => (centre === null ? code : clampCodeToWindow(centre, code))

// The tree with every series', arc's and chapter's own colour held inside its window
// (top-down, so a pulled-back arc then pulls its chapters).
export function reconcileHues(nodes: OutlineNode[], projectHue: number): OutlineNode[] {
  const byId: HueNodes = new Map(nodes.map(n => [n.id, n]))
  const children = new Map<string | null, OutlineNode[]>()
  for (const n of nodes) {
    const bucket = children.get(n.parentId)
    if (bucket) bucket.push(n)
    else children.set(n.parentId, [n])
  }
  const result = new Map<string, OutlineNode>()
  const visit = (node: OutlineNode) => {
    let current = node
    if (node.kind !== 'book' && node.themeHue != null) {
      const fitted = fitToParent(Math.round(node.themeHue), hueCentre(node, byId, projectHue))
      if (fitted !== node.themeHue) current = { ...node, themeHue: fitted }
    }
    result.set(node.id, current)
    byId.set(node.id, current)
    for (const child of children.get(node.id) ?? []) visit(child)
  }
  for (const root of children.get(null) ?? []) visit(root)
  // Nodes whose parent is missing are not reachable from a root: keep them as they are.
  return nodes.map(n => result.get(n.id) ?? n)
}
