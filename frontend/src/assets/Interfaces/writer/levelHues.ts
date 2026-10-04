import type { OutlineNode } from '../../../api/types'
import {
  bookThemeHue, clampCodeToWindow, decodeHue, encodeHue, hueDelta, hueOfCode, isNeutralHue, themeColorCss, wrapHue,
} from '../../../theme/bookColors'

// The Writer's level colours. Each level has a colour code (one number holding a hue and a tone, or a
// neutral stop: see theme/bookColors.ts); the tones' saturation and lightness come from the active
// theme zone.
//
//   project   its own (ProjectSettings.themeHue), else a default off the app theme's hue
//   series    within LEVEL_HUE_WINDOW of the project's hue
//   book      any hue (its own themeHue; see bookThemeHue)
//   arc       within LEVEL_HUE_WINDOW of its book's hue
//   chapter   within LEVEL_HUE_WINDOW of its arc's hue (its book's, outside any arc)
//
// "Within a window" is about the HUE: a series, arc or chapter picks any tone round its parent's
// hue (or one of the stops "of the parent"). A series, arc or chapter with no colour of its own shows
// its parent's. Changing a parent pulls its children's own hues back inside their window, and a
// parent with no hue (a neutral) gives its children no window at all.
export const LEVEL_HUE_WINDOW = 60
// The project's default hue is this far round the wheel from the app theme's, so the
// Dash (the theme itself) and the Project level read as different tints.
const DEFAULT_PROJECT_HUE_OFFSET = 120

export const defaultProjectHue = (appHue: number): number => encodeHue(appHue + DEFAULT_PROJECT_HUE_OFFSET, 'saturated')

type HueNode = Pick<OutlineNode, 'id' | 'kind' | 'parentId' | 'themeHue' | 'color'>
export type HueNodes = Map<string, HueNode>

// A node's colour: its own code, else its parent's (a book's own, else the book default). `parentHue`
// is the hue the stops "of the parent" take (the hue of the node that owns the colour's parent).
export interface LevelColor { code: number; parentHue: number }

export function levelColor(node: HueNode, nodes: HueNodes, projectHue: number): LevelColor {
  const parent = node.parentId ? nodes.get(node.parentId) : undefined
  const parentColor: LevelColor = parent ? levelColor(parent, nodes, projectHue) : { code: projectHue, parentHue: 0 }
  const own = node.kind === 'book' ? bookThemeHue(node) : node.themeHue != null ? Math.round(node.themeHue) : null
  if (own === null) return parentColor
  return { code: own, parentHue: hueOfCode(parentColor.code, parentColor.parentHue) }
}

// The colour code a node shows.
export const levelHue = (node: HueNode, nodes: HueNodes, projectHue: number): number => levelColor(node, nodes, projectHue).code

// The node's colour as CSS (the zone's theme saturation and lightness, in the node's tone).
export function levelTint(node: HueNode, nodes: HueNodes, projectHue: number): string {
  const { code, parentHue } = levelColor(node, nodes, projectHue)
  return themeColorCss(code, parentHue)
}

// The hue a node's own hue must stay near, or null when it may be any hue (a book, or anything under a
// parent with no hue: dark gray, white and the stops of the parent have none to stay near).
export function hueCentre(node: HueNode, nodes: HueNodes, projectHue: number): number | null {
  if (node.kind === 'book') return null
  const parent = node.parentId ? nodes.get(node.parentId) : undefined
  const { code } = parent ? levelColor(parent, nodes, projectHue) : { code: projectHue }
  const { parentHue } = parent ? levelColor(parent, nodes, projectHue) : { parentHue: 0 }
  return isNeutralHue(code) ? null : hueOfCode(code, parentHue)
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

// Whether a colour a node holds may stay under its parent's: under a parent with a hue it must have
// a hue within the window (the free neutrals fall back to the parent's colour); under one without,
// the stops "of the parent" have no hue to be of, so they fall back too.
export function fitToParent(code: number, parentCode: number, centre: number | null): number {
  if (centre !== null) return clampCodeToWindow(centre, code, parentCode)
  const d = decodeHue(code)
  return d.kind === 'neutral' && d.neutral !== 'darkGray' && d.neutral !== 'white' ? parentCode : code
}

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
      const parent = node.parentId ? byId.get(node.parentId) : undefined
      const parentCode = parent ? levelHue(parent, byId, projectHue) : projectHue
      const fitted = fitToParent(Math.round(node.themeHue), parentCode, hueCentre(node, byId, projectHue))
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
