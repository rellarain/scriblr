import { useRef, type PointerEvent } from 'react'
import AUI from './assets/Interfaces/AUI'
import HUI from './assets/Interfaces/HUI'
import type { Handedness, HuiPanel } from './interfaceShellTypes'
import type { HelperChats } from './assets/Interfaces/helper/useHelperChats'

interface SidebarProps {
  side: Handedness
  helper: HelperChats
  panel: HuiPanel
  auiOpen: boolean
  // AUI's own width in px, dragged from its outer edge (snapping to 400px columns).
  auiWidth: number
  onSetAuiWidth: (width: number) => void
  // Only admins get the AUI panel and its toggle.
  isAdmin: boolean
}

// Dragged to set AUI's own width: pointer-drag resizes (clamped and snapped to 400px
// columns by the caller). AUI can sit on either screen edge, so
// the drag direction flips with handedness (AUI is always the outer side -- see
// .sidebar's DOM-order comment in App.scss).
function AuiResize({ side, width, onWidthChange }: { side: Handedness; width: number; onWidthChange: (width: number) => void }) {
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
      className="aUIResize" role="separator" aria-orientation="vertical" aria-label="Resize Admin panel" tabIndex={0}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft') onWidthChange(width - sign * (e.shiftKey ? 400 : 40))
        else if (e.key === 'ArrowRight') onWidthChange(width + sign * (e.shiftKey ? 400 : 40))
      }}
    />
  )
}

// DOM order (AUI, HUI) plus .sidebar's handedness-mirrored flex-direction (see App.scss) puts AUI on the true screen edge
// ("outermost") and HUI innermost, next to Mainscreen, regardless of handedness. Their console buttons are in the band under
// the header (HuiMini.tsx), not here. AUI stays always-mounted (like HUI) so its width transition can animate and its internal
// section state survives close/reopen.
function Sidebar({ side, helper, panel, auiOpen, auiWidth, onSetAuiWidth, isAdmin }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label={`Helper sidebar (${side})`}>
      {isAdmin && <AUI />}
      {isAdmin && auiOpen && <AuiResize side={side} width={auiWidth} onWidthChange={onSetAuiWidth} />}
      <HUI side={side} helper={helper} panel={panel} />
    </aside>
  )
}

export default Sidebar
