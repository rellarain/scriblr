import type { OutlineNode } from '../../../api/types'
import { clampCodeToWindow, effectiveRange, hueDelta, hueOfCode, outlineSat, ownBookHue, themeColorCss, wrapHue } from '../../../theme/bookColors'

// The Writer's level colours. Each level has a colour (a hue in degrees: see theme/bookColors.ts); the one
// saturation and the lightness come from the active theme zone.
//
//   project   its own (ProjectSettings.themeHue), else a default off the app theme's hue; any hue
//   series    none: it shows the project's colour
//   book      within its range (90 until another is chosen) of the project's hue (its own themeHue; see ownBookHue)
//   arc       within its range (60) of its book's hue
//   chapter   within its range (30) of its arc's hue (its book's, outside any arc)
//
// A range is the node's own `hueRange` (30, 60, 90, 120, 180 or 360), else its kind's default (HUE_RANGES), and never wider than its parent's
// (levelRange). A book, arc or chapter with no colour of its own shows its parent's (it inherits). Changing a parent pulls its children's own
// hues back inside their ranges (reconcileHues); a colour already outside its range is left alone until it, or its parent, is changed.
// The project's default hue is this far round the wheel from the app theme's, so the
// Dash (the theme itself) and the Project level read as different tints.
const DEFAULT_PROJECT_HUE_OFFSET = 120

export const defaultProjectHue = (appHue: number): number => wrapHue(appHue + DEFAULT_PROJECT_HUE_OFFSET)

type HueNode = Pick<OutlineNode, 'id' | 'kind' | 'parentId' | 'themeHue' | 'color'> & { hueRange?: number | null }
export type HueNodes = Map<string, HueNode>

// A node's colour: its own, else its parent's (a book's own, else the project's). A series has no colour: it shows its parent's.
export function levelHue(node: HueNode, nodes: HueNodes, projectHue: number): number {
  const parent = node.parentId ? nodes.get(node.parentId) : undefined
  const own = node.kind === 'series' ? null : node.kind === 'book' ? ownBookHue(node) : node.themeHue != null ? Math.round(node.themeHue) : null
  if (own !== null) return own
  return parent ? levelHue(parent, nodes, projectHue) : projectHue
}

// The node's colour as CSS (the zone's theme saturation, in the node's tier: a series quiet, a book middle, the rest loud, and its lightness).
export const levelTint = (node: HueNode, nodes: HueNodes, projectHue: number): string => themeColorCss(levelHue(node, nodes, projectHue), outlineSat(node.kind))

// The hue a node's own hue must stay near: the hue its parent shows (the project's for a book, whose series has no colour). A series
// has no colour of its own, so null.
export function hueCentre(node: HueNode, nodes: HueNodes, projectHue: number): number | null {
  if (node.kind === 'series') return null
  const parent = node.parentId ? nodes.get(node.parentId) : undefined
  return hueOfCode(parent ? levelHue(parent, nodes, projectHue) : projectHue)
}

// How far a node's colour may sit from its parent's hue, in degrees either side: its own range, else its kind's default, never wider than its parent's
// (the project's `projectRange` for what hangs from the project; a series has no colour, so its children look past it).
export function levelRange(node: HueNode, nodes: HueNodes, projectRange: number): number {
  return effectiveRange(node.hueRange, node.kind, rangeCapOf(node, nodes, projectRange))
}

// The widest a node's range may be: its parent's range (the project's when it has no coloured parent).
export function rangeCapOf(node: HueNode, nodes: HueNodes, projectRange: number): number {
  const parent = node.parentId ? nodes.get(node.parentId) : undefined
  if (!parent) return projectRange
  return parent.kind === 'series' ? rangeCapOf(parent, nodes, projectRange) : levelRange(parent, nodes, projectRange)
}

// The hue for a new node among its siblings: the one in its range farthest from the
// siblings' hues (and the centre, when it has none yet), so siblings stay distinct.
export function autoPickHue(centre: number, siblingHues: number[], range: number): number {
  const taken = siblingHues.length > 0 ? siblingHues : [centre]
  let best = centre
  let bestGap = -1
  for (let offset = -range; offset <= range; offset += 5) {
    const candidate = wrapHue(centre + offset)
    const gap = Math.min(...taken.map(h => Math.abs(hueDelta(h, candidate))))
    // Strictly greater: of equally good hues the first (lowest offset) wins.
    if (gap > bestGap) { best = candidate; bestGap = gap }
  }
  return best
}

// A colour held within its range: its hue brought back to within `range` degrees either side of the parent's hue
// (`centre`). With no centre (a node with no parent hue) it is not held.
export const fitToParent = (code: number, centre: number | null, range: number): number => (centre === null ? code : clampCodeToWindow(centre, code, range))

// Series have no colour: the same nodes with any series colour cleared (the same array when there is none).
export function dropSeriesHues(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.some(n => n.kind === 'series' && n.themeHue != null) ? nodes.map(n => (n.kind === 'series' && n.themeHue != null ? { ...n, themeHue: null } : n)) : nodes
}

// The tree with every book's, arc's and chapter's own colour held inside its range (top-down, so a pulled-back arc then pulls its
// chapters), and any series colour cleared. With `fromId`, only what is under that node is held (the node itself is already where
// it should be): changing one chapter never moves a colour elsewhere.
// A node's own range above its parent's is lowered to it, so a parent set narrower pulls the ranges (and so the hues) of what is under it in.
export function reconcileHues(nodes: OutlineNode[], projectHue: number, fromId?: string, projectRange = 360): OutlineNode[] {
  const byId: HueNodes = new Map(nodes.map(n => [n.id, n]))
  const children = new Map<string | null, OutlineNode[]>()
  for (const n of nodes) {
    const bucket = children.get(n.parentId)
    if (bucket) bucket.push(n)
    else children.set(n.parentId, [n])
  }
  const result = new Map<string, OutlineNode>()
  const visit = (node: OutlineNode, inScope: boolean) => {
    let current = node
    if (node.kind === 'series') {
      if (node.themeHue != null) current = { ...node, themeHue: null }
    } else if (inScope) {
      const cap = rangeCapOf(node, byId, projectRange)
      if (node.hueRange != null && node.hueRange > cap) current = { ...current, hueRange: cap }
      if (node.themeHue != null) {
        const fitted = fitToParent(Math.round(node.themeHue), hueCentre(node, byId, projectHue), effectiveRange(current.hueRange, node.kind, cap))
        if (fitted !== node.themeHue) current = { ...current, themeHue: fitted }
      }
    }
    result.set(node.id, current)
    byId.set(node.id, current)
    const childScope = inScope || node.id === fromId
    for (const child of children.get(node.id) ?? []) visit(child, childScope)
  }
  for (const root of children.get(null) ?? []) visit(root, fromId === undefined)
  // Nodes whose parent is missing are not reachable from a root: keep them as they are.
  return nodes.map(n => result.get(n.id) ?? n)
}
