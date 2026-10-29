import { useStoredState } from './storage'

// Which fieldsets of the plot editor are folded up. Remembered per set, so a set folded in its category stays folded when the same set shows
// on a plotline under it; a set with no entry is open.
export function usePlotSetOpen() {
  const [closed, setClosed] = useStoredState<Record<string, boolean>>('scriblr.writer.plotSetClosed', {})
  return {
    isOpen: (id: string): boolean => !closed[id],
    setOpen: (id: string, open: boolean) => setClosed(prev => {
      if (open === !prev[id]) return prev
      const next = { ...prev }
      if (open) delete next[id]
      else next[id] = true
      return next
    }),
  }
}
