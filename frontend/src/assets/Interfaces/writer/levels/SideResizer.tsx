import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { clampSideWidth } from '../sidebarState'

// The drag handle on a column's right edge (the side column's, the Plot contents'): dragging sets its width, held by `clamp` (the side
// column's is 200px to 60% of the Writer, see sidebarState.ts), and a double click puts it back to the default, when there is `onReset`.
// `edge="left"` is for a column on the right of the screen (the Dash's project shelves): the handle is on its left edge, and dragging left widens it.
// The width is reported live while dragging and committed on release. The mouse is followed on the window, so the drag carries on when
// the pointer leaves the 10px handle. The column is the handle's parent, and its own parent is what the limits are measured against.
// `className` is the handle's own base class (its styles are the caller's; `--left` and `--active` follow it) for a column that is not the Writer's. `keyStep` makes the handle
// something the keyboard can reach: it takes focus, the left and right arrow keys move it by that many pixels (five times as many with Shift) and Home puts it back to the default;
// `value` is the width now (for a screen reader, and the start of a step when the column cannot be measured).
export default function SideResizer({ onDrag, onCommit, onReset, clamp = clampSideWidth, label = 'Sidebar width', what = 'the sidebar', edge = 'right', className, value, keyStep }: {
  onDrag: (width: number) => void
  onCommit: (width: number) => void
  onReset?: () => void
  clamp?: (width: number, containerWidth: number) => number
  label?: string
  what?: string
  edge?: 'left' | 'right'
  className?: string
  value?: number
  keyStep?: number
}) {
  const drag = useRef<{ x: number; width: number; container: number; last: number } | null>(null)
  const [active, setActive] = useState(false)
  const callbacks = useRef({ onDrag, onCommit, clamp, edge })
  callbacks.current = { onDrag, onCommit, clamp, edge }

  useEffect(() => {
    if (!active) return
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.x
      d.last = callbacks.current.clamp(d.width + (callbacks.current.edge === 'left' ? -dx : dx), d.container)
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

  const key = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!keyStep) return
    if (e.key === 'Home' && onReset) { e.preventDefault(); onReset(); return }
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (dir === 0) return
    e.preventDefault()
    const side = e.currentTarget.parentElement as HTMLElement
    const measured = side.getBoundingClientRect().width
    const container = (side.parentElement ?? side).getBoundingClientRect().width
    const next = clamp((measured > 0 ? measured : value ?? 0) + dir * (edge === 'left' ? -1 : 1) * keyStep * (e.shiftKey ? 5 : 1), container)
    onDrag(next)
    onCommit(next)
  }

  const base = className ?? 'wrSideResizer'
  return (
    <div
      className={`${base}${edge === 'left' ? ` ${base}--left` : ''}${active ? ` ${base}--active` : ''}`} role="separator" aria-orientation="vertical" aria-label={label}
      title={`Drag to resize ${what}${keyStep ? ' (or use the arrow keys)' : ''}${onReset ? '; double-click to reset' : ''}`} onMouseDown={down} onDoubleClick={onReset}
      tabIndex={keyStep ? 0 : undefined} aria-valuenow={keyStep && value !== undefined ? Math.round(value) : undefined} onKeyDown={keyStep ? key : undefined}
    />
  )
}
