import { useLayoutEffect, useRef, useState } from 'react'

// The lowest of `breakpoints` that `width` has reached (0 below all of them): all a layout choice needs of a width.
export function widthBucket(width: number, breakpoints: readonly number[]): number {
  let bucket = 0
  for (const b of breakpoints) if (width >= b && b > bucket) bucket = b
  return bucket
}

// The width of an element, kept up to date as it is resized (a tile is resized by its neighbours, not only by the window).
// It is null until measured, and stays null where there is no layout or no ResizeObserver (jsdom), so callers fall back to
// their widest layout. With `breakpoints` the width is reported as the highest breakpoint it has reached, so a drag only
// re-renders the caller when it crosses one (and a caller that only compares the width with those breakpoints is unaffected).
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(breakpoints?: readonly number[]) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState<number | null>(null)
  const marks = useRef(breakpoints)
  marks.current = breakpoints
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const report = (raw: number) => setWidth(marks.current ? widthBucket(raw, marks.current) : raw)
    const measured = el.getBoundingClientRect().width
    if (measured > 0) report(measured)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width
      if (next !== undefined && next > 0) report(next)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

// The compare tile's layouts, by its own width (PlotCompare.tsx):
//   wide     the chapters panel beside the list (about 1,040px and up)
//   medium, compact   the chapters in a fold-out under the list (the groups stand as columns from COMPARE_COLUMNS_FROM)
export type PlotSize = 'wide' | 'medium' | 'compact'
export const PLOT_COMPACT_BELOW = 720
export const PLOT_WIDE_FROM = 1040
export const PLOT_BREAKPOINTS = [PLOT_COMPACT_BELOW, PLOT_WIDE_FROM] as const

export function plotSizeOf(width: number | null): PlotSize {
  if (width === null) return 'wide'
  return width < PLOT_COMPACT_BELOW ? 'compact' : width < PLOT_WIDE_FROM ? 'medium' : 'wide'
}

// The compare view puts its plotlines side by side in columns from this width.
export const COMPARE_COLUMNS_FROM = 860
export const COMPARE_BREAKPOINTS = [COMPARE_COLUMNS_FROM] as const
