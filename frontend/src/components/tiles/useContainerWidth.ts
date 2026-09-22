import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

// The width of an element, kept up to date as it is resized. Components lay
// themselves out by this (not the window's width), so a narrow panel is a narrow
// container however wide the screen. Where nothing can be measured (a test DOM)
// `fallback` is used.
export function useContainerWidth<T extends HTMLElement>(fallback = 1000): [RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width || el.clientWidth
      setWidth(w > 0 ? w : fallback)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [fallback])
  return [ref, width]
}
