import { useCallback, useEffect, useRef, useState } from 'react'
import OutlineEditor from '../outline/OutlineEditor'
import PlotSidebar from './PlotSidebar'

const SIDEBAR_WIDTH_KEY = 'scriblr:planSidebarWidth'
const DEFAULT_SIDEBAR_WIDTH = 320
const MIN_SIDEBAR_WIDTH = 220
const MAX_SIDEBAR_WIDTH = 640

function readStoredWidth(): number {
  const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
  return stored >= MIN_SIDEBAR_WIDTH && stored <= MAX_SIDEBAR_WIDTH ? stored : DEFAULT_SIDEBAR_WIDTH
}

function PlanMode() {
  const [sidebarWidth, setSidebarWidth] = useState(readStoredWidth)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const next = Math.round(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, rect.right - e.clientX)))
    setSidebarWidth(next)
  }, [])

  const stopDragging = useCallback(() => {
    draggingRef.current = false
    document.body.style.removeProperty('cursor')
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', stopDragging)
  }, [handlePointerMove])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => () => stopDragging(), [stopDragging])

  function startDragging(e: React.PointerEvent) {
    e.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDragging)
  }

  return (
    <div ref={containerRef} className="plan-mode" style={{ gridTemplateColumns: `1fr 10px ${sidebarWidth}px` }}>
      <div className="plan-mode__focal">
        <OutlineEditor />
      </div>
      <div
        className="plan-mode__resizer"
        onPointerDown={startDragging}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize plot sidebar"
      />
      <aside className="plan-mode__sidebar">
        <PlotSidebar />
      </aside>
    </div>
  )
}

export default PlanMode
