import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import type { SplitDir } from './splitTree'

const STEP = 0.02
const BIG_STEP = 0.08

// A drag handle between two areas of a split-tree grid: pointer-drag resizes (only
// the two neighbours it separates -- the pointer is captured, so the drag keeps
// tracking even outside the divider's own thin hit area), double-click restores its
// default position, and with focus the arrow keys nudge it (Shift for a bigger step).
function Divider({ dir, ratio, style, onDragTo, onResize, onReset }: {
  dir: SplitDir
  ratio: number
  style: CSSProperties
  onDragTo: (clientX: number, clientY: number) => void
  onResize: (ratio: number) => void
  onReset: () => void
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const dec = dir === 'row' ? 'ArrowLeft' : 'ArrowUp'
    const inc = dir === 'row' ? 'ArrowRight' : 'ArrowDown'
    if (e.key !== dec && e.key !== inc) return
    e.preventDefault()
    const step = e.shiftKey ? BIG_STEP : STEP
    onResize(ratio + (e.key === inc ? step : -step))
  }
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    onDragTo(e.clientX, e.clientY)
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div
      className={dir === 'row' ? 'tileDivider tileDivider--row' : 'tileDivider tileDivider--col'}
      style={style}
      role="separator"
      aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={8}
      aria-valuemax={92}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    >
      <span className="tileDividerBar" />
    </div>
  )
}

export default Divider
