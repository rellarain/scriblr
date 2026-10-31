import { useEffect, type RefObject } from 'react'

// Horizontal scrolling for a wide box (the activity grid in a landscape tile) by the plain wheel, as the shelf's row does, and by touch (the browser's own
// pan). A sideways wheel or trackpad swipe is left to the browser, and at either end the page is given the wheel. The listener is added by hand because a
// React wheel handler is passive and cannot stop the page scrolling too.
export function useWheelScrollX(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const max = el.scrollWidth - el.clientWidth
      const next = Math.min(max, Math.max(0, el.scrollLeft + e.deltaY))
      if (Math.abs(next - el.scrollLeft) < 1) return // at an end: let the page have it
      e.preventDefault()
      el.scrollLeft = next
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref])
}
