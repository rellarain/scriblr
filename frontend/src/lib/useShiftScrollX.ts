import { useEffect, type RefObject } from 'react'

// Horizontal scrolling for a wide box (the activity grid): by touch (the browser's own pan) or Shift + the wheel. The plain wheel is left alone, so the
// page still scrolls over it. The listener is added by hand because a React wheel handler is passive and cannot stop the page scrolling too.
export function useShiftScrollX(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey || el.scrollWidth <= el.clientWidth) return
      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX
      const max = el.scrollWidth - el.clientWidth
      const next = Math.min(max, Math.max(0, el.scrollLeft + delta))
      if (Math.abs(next - el.scrollLeft) < 1) return // at an end: let the page have it
      e.preventDefault()
      el.scrollLeft = next
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref])
}
