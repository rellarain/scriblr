// The canvas's layers, as the view toolbar shows them: a row of toggles whose order is the order the layers are drawn in (the leftmost is on top) and whose pressed state
// says whether a layer is shown. The painted figure is one of the layers, so the gridlines can sit above it or below it, but it cannot be hidden. Pure, so it is tested without
// the page; the page keeps the state on this computer.

export type LayerId = 'figure' | 'gridlines' | 'guides' | 'outlines' | 'points' | 'mirror' | 'pivots' | 'ghost' | 'weights' | 'heads'

export interface LayerInfo { id: LayerId; name: string; hint: string; fixed?: boolean }
export const LAYERS: LayerInfo[] = [
  { id: 'weights', name: 'Weights and curve handles', hint: 'the weight rings on points and the curve handles of the selected point' },
  { id: 'points', name: 'Shape points', hint: 'the points of the selected shape (and of the one the pointer is over)' },
  { id: 'outlines', name: 'Shape outlines', hint: 'the outline of what is selected, and of the shape the pointer is over' },
  { id: 'pivots', name: 'Pivots, anchors and links', hint: 'the pivot of the selected group, where it is fixed, and the points that are linked' },
  { id: 'guides', name: 'Alignment guides', hint: 'lines that show where a dragged point, shape or pivot lines up with others (and snap to them when Snap is on)' },
  { id: 'heads', name: 'Head units', hint: 'lines one head apart from the crown down, and where a figure 7.5 heads tall has its chin, nipples, navel, crotch, knees and soles (it reads the head bone, set in the Proportions tab)' },
  { id: 'mirror', name: 'Mirror line', hint: 'the line twins and mirror editing reflect about' },
  { id: 'ghost', name: 'Pattern ghost and frames', hint: 'the dashed outline of a class pattern behind a member, and the frames of the model' },
  { id: 'figure', name: 'The figure', hint: 'the painted shapes (it cannot be hidden)', fixed: true },
  { id: 'gridlines', name: 'Gridlines', hint: 'a faint line every 2 units and a stronger one every 10' },
]
export const LAYER_IDS: LayerId[] = LAYERS.map(l => l.id)
export const layerInfo = (id: LayerId): LayerInfo => LAYERS.find(l => l.id === id)!

export interface LayerState {
  // Leftmost (on top) first.
  order: LayerId[]
  hidden: LayerId[]
}
// The head units are hidden until asked for.
export const DEFAULT_LAYERS: LayerState = { order: LAYER_IDS, hidden: ['heads'] }

const known = (v: unknown): v is LayerId => typeof v === 'string' && (LAYER_IDS as string[]).includes(v)

// Whatever was stored, made into a state that has every layer once (a layer added since is put at the end, shown or hidden as it is by default; one that is gone is dropped).
export function normalizeLayers(raw: unknown): LayerState {
  const o = raw && typeof raw === 'object' ? (raw as { order?: unknown; hidden?: unknown }) : {}
  const order: LayerId[] = []
  for (const id of Array.isArray(o.order) ? o.order : []) if (known(id) && !order.includes(id)) order.push(id)
  const added = LAYER_IDS.filter(id => !order.includes(id))
  order.push(...added)
  if (!Array.isArray(o.hidden)) return { order, hidden: DEFAULT_LAYERS.hidden }
  const hidden = new Set<LayerId>(o.hidden.filter(known))
  for (const id of added) if (DEFAULT_LAYERS.hidden.includes(id)) hidden.add(id)
  return { order, hidden: [...hidden].filter(id => !layerInfo(id).fixed) }
}

export const isShown = (s: LayerState, id: LayerId): boolean => !s.hidden.includes(id)

export function toggleLayer(s: LayerState, id: LayerId): LayerState {
  if (layerInfo(id).fixed) return s
  return { ...s, hidden: s.hidden.includes(id) ? s.hidden.filter(x => x !== id) : [...s.hidden, id] }
}

// Move a layer to sit just before another (or last: null), as when its toggle is dropped there.
export function moveLayer(s: LayerState, id: LayerId, before: LayerId | null): LayerState {
  if (id === before) return s
  const rest = s.order.filter(x => x !== id)
  const at = before === null ? rest.length : rest.indexOf(before)
  if (at < 0) return s
  rest.splice(at, 0, id)
  return { ...s, order: rest }
}
// Move a layer one place left (-1, towards the top) or right (1).
export function nudgeLayer(s: LayerState, id: LayerId, dir: -1 | 1): LayerState {
  const at = s.order.indexOf(id), to = at + dir
  if (at < 0 || to < 0 || to >= s.order.length) return s
  const out = [...s.order]
  ;[out[at], out[to]] = [out[to], out[at]]
  return { ...s, order: out }
}

// The layers to draw, bottom first: the shown ones, the leftmost last (so it is on top).
export function drawOrder(s: LayerState): LayerId[] {
  return [...s.order].reverse().filter(id => isShown(s, id))
}
