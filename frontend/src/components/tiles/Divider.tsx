import type { CSSProperties, DragEvent, KeyboardEvent, PointerEvent } from 'react'
import type { SplitDir } from './splitTree'

const STEP = 0.02
const BIG_STEP = 0.08

// A drag handle between two areas of a split-tree grid: pointer-drag resizes (only
// the two neighbours it separates -- the pointer is captured, so the drag keeps
// tracking even outside the divider's own thin hit area), and with focus the arrow
// keys nudge it (Shift for a bigger step). It's also a drop target for a dragged
// tile's header: dropping there wedges the tile in as a new side of the divider,
// rather than swapping it with a tile (dropTarget/onDragOver/onDrop, all optional --
// the caller only wires them up when there's room for the extra side).
function Divider({ dir, ratio, style, dropTarget, onDragTo, onResize, onDragOver, onDrop }: {
  dir: SplitDir
  ratio: number
  style: CSSProperties
  dropTarget?: boolean
  onDragTo: (clientX: number, clientY: number) => void
  onResize: (ratio: number) => void
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void
  onDrop?: (e: DragEvent<HTMLDivElement>) => void
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

  const classes = [
    dir === 'row' ? 'tileDivider tileDivider--row' : 'tileDivider tileDivider--col',
    dropTarget ? 'tileDivider--drop' : '',
  ].filter(Boolean).join(' ')
  return (
    <div
      className={classes}
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
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className="tileDividerBar" />
    </div>
  )
}

export default Divider
