// Where a dragged thing would land in a list it is dragged over: an accent-tinted slot with a dashed outline, in the list's own coordinates (the
// list is `position: relative`). The same gap as a dragged tile's (components/tiles/tiles.scss).
export default function DragGap({ rect }: { rect: { left: number; top: number; width: number; height: number } | null }) {
  if (!rect) return null
  return <span className="dragGap" aria-hidden style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
}
