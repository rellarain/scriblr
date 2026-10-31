import { useLayoutEffect, useRef, useState } from 'react'

// The width and height of an element, kept up to date as it is resized (a tile is resized by its neighbours, not only by the window). It is null
// until measured, and stays null where there is no layout or no ResizeObserver (jsdom), so callers fall back to a default size.
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const report = (width: number, height: number) => {
      if (width > 0 && height > 0) setSize(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }))
    }
    const box = el.getBoundingClientRect()
    report(box.width, box.height)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (r) report(r.width, r.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}
