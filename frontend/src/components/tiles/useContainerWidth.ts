import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface Size { width: number; height: number }

// The size of an element, kept up to date as it is resized. Components lay
// themselves out by this (not the window's), so a narrow panel is narrow however
// wide the screen, and a split grid can fill its own height too. Where nothing can
// be measured (a test DOM) `fallback` is used.
export function useContainerSize<T extends HTMLElement>(fallback: Size = { width: 1000, height: 600 }): [RefObject<T>, Size] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<Size>(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // A child sized to fill this element exactly needs its CONTENT box, not its
    // border box -- clientWidth/clientHeight (and getBoundingClientRect) already
    // fold the element's own padding in, so a child given that full size overflows
    // by the padding on both sides (a few px, but enough to force an unnecessary
    // scrollbar on an otherwise one-page layout). Subtract it back out here, once,
    // rather than in every caller.
    const measure = () => {
      // jsdom (the test DOM) reports an unset padding as '' rather than '0px' --
      // parseFloat of that is NaN, so `|| 0` is load-bearing here, not just style.
      const cs = getComputedStyle(el)
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
      const r = el.getBoundingClientRect()
      const width = (r.width || el.clientWidth) - padX
      const height = (r.height || el.clientHeight) - padY
      setSize({ width: width > 0 ? width : fallback.width, height: height > 0 ? height : fallback.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback.width, fallback.height])
  return [ref, size]
}

// The width alone, for callers (the Writer's narrow-sidebar check) that don't need height.
export function useContainerWidth<T extends HTMLElement>(fallback = 1000): [RefObject<T>, number] {
  const [ref, size] = useContainerSize<T>({ width: fallback, height: 600 })
  return [ref, size.width]
}
