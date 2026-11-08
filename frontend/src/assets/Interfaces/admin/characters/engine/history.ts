// Undo and redo as stacks of whole values (a model's content, as the page keeps it). Pure: every function returns new stacks.
export interface History<T> { past: T[]; future: T[] }

export const CAP = 40

export const emptyHistory = <T,>(): History<T> => ({ past: [], future: [] })

// Remember `before` (the value as it was) before a change; a change forgets what could have been redone.
export function remember<T>(h: History<T>, before: T, cap = CAP): History<T> {
  const past = [...h.past, before]
  return { past: past.length > cap ? past.slice(past.length - cap) : past, future: [] }
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.past.length) return null
  const value = h.past[h.past.length - 1]
  return { history: { past: h.past.slice(0, -1), future: [...h.future, current] }, value }
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.future.length) return null
  const value = h.future[h.future.length - 1]
  return { history: { past: [...h.past, current], future: h.future.slice(0, -1) }, value }
}
