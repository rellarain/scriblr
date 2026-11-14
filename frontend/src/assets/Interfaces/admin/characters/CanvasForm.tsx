import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// A small form opened on the canvas of the shape editor (shape types T1, T2): it lies over the whole stage (so no panel's scrolling area clips it) where it was opened, kept inside
// the stage. The chosen control has the focus when it opens; a press outside it and Escape (wherever the focus is) close it.

const MARGIN = 8

export function CanvasForm({ at, label, className, onClose, children }: { at: { left: number; top: number }; label: string; className?: string; onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState(at)
  useLayoutEffect(() => {
    const el = root.current, stage = el?.parentElement
    if (!el || !stage) return
    const w = el.offsetWidth, h = el.offsetHeight, W = stage.clientWidth, H = stage.clientHeight
    setPlace({ left: Math.max(MARGIN, Math.min(at.left, W - w - MARGIN)), top: Math.max(MARGIN, Math.min(at.top, H - h - MARGIN)) })
  }, [at.left, at.top])
  useEffect(() => {
    const first = root.current?.querySelector<HTMLElement>('[data-choice="on"]') ?? root.current?.querySelector<HTMLElement>('button:not(:disabled)')
    first?.focus()
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true) }
  }, [onClose])
  return (
    <div ref={root} className={`cmCanvasForm${className ? ` ${className}` : ''}`} role="dialog" aria-label={label} style={{ left: place.left, top: place.top }} onContextMenu={e => e.preventDefault()}>
      {children}
    </div>
  )
}
