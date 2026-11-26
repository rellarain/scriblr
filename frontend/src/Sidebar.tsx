import { useRef, type PointerEvent } from 'react'
import AUI from './assets/Interfaces/AUI'
import HUI from './assets/Interfaces/HUI'
import type { Handedness, HuiPanel } from './interfaceShellTypes'
import type { HelperChats } from './assets/Interfaces/helper/useHelperChats'
import type { AuiMode } from './lib/auiSize'

interface SidebarProps {
  side: Handedness
  helper: HelperChats
  panel: HuiPanel
  // AUI's size (lib/auiSize.ts), which its tiles follow; its width comes from App.tsx (--aui-w).
  auiMode: AuiMode
  // Only admins get the AUI panel and its toggle.
  isAdmin: boolean
}

// AUI's edge, between it and HUI (or the page): dragged, it resizes AUI through its modes (App.tsx snaps the width:
// mini, small, medium, max); the arrow keys step a column at a time; a double-click puts it back to small. It sits beside
// the sidebar, not in it, so it can still be grabbed at the screen edge when AUI is mini (no panel). AUI can sit on either
// screen edge, so the drag direction flips with handedness.
export function AuiResize({ side, width, label, onWidthChange, onStep, onReset }: {
  side: Handedness
  width: number
  // What the size is now, for screen readers (aria-valuetext).
  label: string
  onWidthChange: (width: number) => void
  onStep: (by: 1 | -1) => void
  onReset: () => void
}) {
  const sign = side === 'left' ? 1 : -1
  // The drag's own running (unsnapped) width -- movementX deltas are only a
  // few px per event, far smaller than a column, so feeding them against the
  // already-snapped `width` prop rounds right back to where it started every
  // time (the drag visibly does nothing). Reset at the start of each drag and
  // accumulated here instead, independent of whether the parent's snapped
  // state has caught up yet.
  const raw = useRef(width)
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    raw.current = width
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !e.movementX) return
    raw.current += sign * e.movementX
    onWidthChange(raw.current)
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  return (
    <div
      className="aUIResize" role="separator" aria-orientation="vertical" aria-label="Resize Admin panel" aria-valuetext={label} tabIndex={0}
      title="Drag to resize the Admin panel: mini, small, medium, max (double-click: small)"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onDoubleClick={onReset}
      onKeyDown={e => {
        const wider = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
        const narrower = side === 'left' ? 'ArrowLeft' : 'ArrowRight'
        if (e.key === wider) { e.preventDefault(); onStep(1) } else if (e.key === narrower) { e.preventDefault(); onStep(-1) }
      }}
    />
  )
}

// DOM order (AUI, HUI) plus .sidebar's handedness-mirrored flex-direction (see App.scss) puts AUI on the true screen edge
// ("outermost") and HUI innermost, next to Mainscreen, regardless of handedness. Their console buttons are in the band under
// the header (HuiMini.tsx), not here. AUI stays always-mounted (like HUI) so its width transition can animate and its internal
// section state survives close/reopen.
function Sidebar({ side, helper, panel, auiMode, isAdmin }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label={`Helper sidebar (${side})`}>
      {isAdmin && <AUI mode={auiMode} />}
      <HUI side={side} helper={helper} panel={panel} />
    </aside>
  )
}

export default Sidebar
