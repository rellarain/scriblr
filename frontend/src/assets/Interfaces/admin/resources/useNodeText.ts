import { useEffect, useRef, useState } from 'react'

// A node's text being typed (a guide, an assessment): kept here while typing and saved a moment after the last key, so typing does not save
// on every keystroke. When another node is chosen while a save is still waiting, it is saved to the node it was typed for at once.
export function useNodeText(nodeId: string | null, stored: string, save: (nodeId: string, text: string) => void, delay = 600): [string, (next: string) => void] {
  const [text, setText] = useState(stored)
  const latest = useRef(stored)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save })

  useEffect(() => {
    latest.current = stored
    setText(stored)
    return () => {
      if (timer.current && nodeId) {
        clearTimeout(timer.current)
        timer.current = null
        saveRef.current(nodeId, latest.current)
      }
    }
    // the stored text is read when the node changes, not while typing (it follows what was typed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId])

  const change = (next: string) => {
    setText(next)
    latest.current = next
    if (!nodeId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      saveRef.current(nodeId, next)
    }, delay)
  }
  return [text, change]
}
