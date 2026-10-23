import { useStoredState } from '../storage'

// Which cards of the book outline are folded up: the chapter's tile (and with it the chapter's own row of title, colour and counts in the
// contents), acts and scenes. Remembered per node, shared by the contents (OutlineNav) and the cards (OutlineCards); a card with no entry is open.
export function useOutlineOpen() {
  const [openMap, setOpenMap] = useStoredState<Record<string, boolean>>('scriblr.writer.outlineOpen', {})
  return {
    isOpen: (id: string): boolean => openMap[id] ?? true,
    setOpen: (id: string, open: boolean) => setOpenMap(prev => ({ ...prev, [id]: open })),
  }
}
