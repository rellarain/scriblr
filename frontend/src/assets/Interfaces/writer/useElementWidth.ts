import { useLayoutEffect, useRef, useState } from 'react'

// The width of an element, kept up to date as it is resized (a tile is resized by its neighbours, not only by the window).
// It is null until measured, and stays null where there is no layout or no ResizeObserver (jsdom), so callers fall back to
// their widest layout.
export function useElementWidth<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measured = el.getBoundingClientRect().width
    if (measured > 0) setWidth(measured)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width
      if (next !== undefined && next > 0) setWidth(next)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

// The Plot tool's three layouts, by its own width:
//   wide     the contents column beside the editor, a plotline's fields beside its chapters (about 1,040px and up)
//   medium   contents beside the editor, but a plotline's chapters panel under its fields
//   compact  one column: the contents are a bar on top (under about 720px)
export type PlotSize = 'wide' | 'medium' | 'compact'
export const PLOT_COMPACT_BELOW = 720
export const PLOT_WIDE_FROM = 1040

export function plotSizeOf(width: number | null): PlotSize {
  if (width === null) return 'wide'
  return width < PLOT_COMPACT_BELOW ? 'compact' : width < PLOT_WIDE_FROM ? 'medium' : 'wide'
}

// The compare view puts its plotlines side by side in columns from this width.
export const COMPARE_COLUMNS_FROM = 860
