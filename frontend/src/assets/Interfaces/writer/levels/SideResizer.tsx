import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { clampSideWidth } from '../sidebarState'

// The drag handle on the side column's right edge: dragging sets its width (held between 200px and 60% of the Writer, see
// sidebarState.ts), a double click puts it back to the default. The width is reported live while dragging and committed on release.
// The mouse is followed on the window, so the drag carries on when the pointer leaves the 10px handle.
export default function SideResizer({ onDrag, onCommit, onReset }: {
  onDrag: (width: number) => void
  onCommit: (width: number) => void
  onReset: () => void
}) {
  const drag = useRef<{ x: number; width: number; container: number; last: number } | null>(null)
  const [active, setActive] = useState(false)
  const callbacks = useRef({ onDrag, onCommit })
  callbacks.current = { onDrag, onCommit }

  useEffect(() => {
    if (!active) return
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      d.last = clampSideWidth(d.width + e.clientX - d.x, d.container)
      callbacks.current.onDrag(d.last)
    }
    const end = () => {
      const d = drag.current
      drag.current = null
      setActive(false)
      if (d) callbacks.current.onCommit(d.last)
    }
    // No text is selected, and the cursor stays a resize one, while dragging.
    const { userSelect, cursor } = document.body.style
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', end)
      document.body.style.userSelect = userSelect
      document.body.style.cursor = cursor
    }
  }, [active])

  const down = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const side = e.currentTarget.parentElement as HTMLElement
    const width = side.getBoundingClientRect().width
    drag.current = { x: e.clientX, width, container: (side.parentElement ?? side).getBoundingClientRect().width, last: width }
    setActive(true)
    e.preventDefault()
  }

  return (
    <div
      className={`wrSideResizer${active ? ' wrSideResizer--active' : ''}`} role="separator" aria-orientation="vertical" aria-label="Sidebar width"
      title="Drag to resize the sidebar; double-click to reset" onMouseDown={down} onDoubleClick={onReset}
    />
  )
}
