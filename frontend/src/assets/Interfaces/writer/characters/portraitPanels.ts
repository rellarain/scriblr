import { useState } from 'react'

// Which parts of the portrait page are open: one section at a time (Head, Hair, Face, Body or Card) and, inside it, the subsections (Eyes, Nose, Mouth...) that have not been
// closed. It is remembered on this computer, so the page opens the way it was left; a store that is missing, full or holds nonsense gives the default (Head open, every
// subsection open). Nothing here is part of the character.

export const PANELS_KEY = 'scriblr.characters.portrait.panels'

export interface PanelState { open: string | null; closed: string[] }
export const DEFAULT_PANELS: PanelState = { open: 'head', closed: [] }

const MAX_CLOSED = 80
const idOf = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 40

// The state a stored text holds, repaired: an open section that is not an id is the default, and the closed list keeps only ids.
export function parsePanels(text: string | null): PanelState {
  if (!text) return { ...DEFAULT_PANELS, closed: [] }
  try {
    const raw = JSON.parse(text) as Partial<PanelState> | null
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_PANELS, closed: [] }
    const open = raw.open === null ? null : idOf(raw.open) ? raw.open : DEFAULT_PANELS.open
    const closed = Array.isArray(raw.closed) ? [...new Set(raw.closed.filter(idOf))].slice(0, MAX_CLOSED) : []
    return { open, closed }
  } catch {
    return { ...DEFAULT_PANELS, closed: [] }
  }
}

export function readPanels(): PanelState {
  try { return parsePanels(localStorage.getItem(PANELS_KEY)) } catch { return { ...DEFAULT_PANELS, closed: [] } }
}
function writePanels(state: PanelState): void {
  try { localStorage.setItem(PANELS_KEY, JSON.stringify(state)) } catch { /* the page still works without a store */ }
}

// The open parts of the page and how to change them: opening a section closes the one that was open (pressing the open one closes it), and a subsection opens and closes on its own.
export function usePortraitPanels() {
  const [state, setState] = useState<PanelState>(readPanels)
  const update = (next: PanelState) => { setState(next); writePanels(next) }
  return {
    open: state.open,
    toggle: (section: string) => update({ ...state, open: state.open === section ? null : section }),
    subOpen: (key: string) => !state.closed.includes(key),
    toggleSub: (key: string) => update({ ...state, closed: state.closed.includes(key) ? state.closed.filter(k => k !== key) : [...state.closed, key].slice(-MAX_CLOSED) }),
  }
}
