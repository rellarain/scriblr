// A page's consoles take one of three sizes: an icon (minimized), a tile (mid-size, simplified) or the full console.
// An icon opens as a tile; a tile's title opens it full and the others shrink to icons; the chevron steps one down.

export type ConsoleState = 'min' | 'tile' | 'full'
export type ConsoleStates = Record<string, ConsoleState>

export const stateOf = (states: ConsoleStates, defaults: ConsoleStates, id: string): ConsoleState => states[id] ?? defaults[id] ?? 'min'

export function resolve(ids: string[], states: ConsoleStates, defaults: ConsoleStates): ConsoleStates {
  return Object.fromEntries(ids.map(id => [id, stateOf(states, defaults, id)]))
}

export const anyFull = (current: ConsoleStates): boolean => Object.values(current).includes('full')

// A click on a console's icon in the header bar: a minimized one opens as a tile (a full console steps down to a tile); an open one minimizes.
export function toggleIcon(current: ConsoleStates, id: string): ConsoleStates {
  if (current[id] === 'min') {
    return Object.fromEntries(Object.entries(current).map(([k, v]) => [k, k === id ? 'tile' : v === 'full' ? 'tile' : v]))
  }
  return { ...current, [id]: 'min' }
}

// A click on a tile's title: that console is full, every other one an icon.
export function grow(current: ConsoleStates, id: string): ConsoleStates {
  return Object.fromEntries(Object.keys(current).map(k => [k, k === id ? 'full' : 'min']))
}

// The chevron: a full console becomes a tile, a tile an icon.
export function shrink(current: ConsoleStates, id: string): ConsoleStates {
  return { ...current, [id]: current[id] === 'full' ? 'tile' : 'min' }
}

// The URL names one full console: the page opens with just that one full.
export function withFull(ids: string[], current: ConsoleStates, full: string | null): ConsoleStates {
  if (!full || !ids.includes(full)) return current
  return grow(current, full)
}
