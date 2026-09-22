export type Direction = 'left' | 'right' | 'up' | 'down'

export interface Box { left: number; top: number; width: number; height: number }

// Which tile the arrow keys move focus to, from the tile at `current`: the nearest
// one wholly beyond its edge in that direction (favouring the same row or column). Where the
// tiles have no size to measure, right and down go to the next tile and left and up
// to the previous one. Returns `current` when there is nowhere to go.
export function nextFocus(boxes: Box[], current: number, dir: Direction): number {
  const here = boxes[current]
  if (!here) return current
  if (!boxes.some(b => b.width > 0 || b.height > 0)) {
    const step = dir === 'right' || dir === 'down' ? 1 : -1
    return Math.min(boxes.length - 1, Math.max(0, current + step))
  }
  const centre = (b: Box) => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 })
  const c = centre(here)
  let best = -1
  let bestScore = Infinity
  boxes.forEach((b, i) => {
    if (i === current) return
    const p = centre(b)
    const dx = p.x - c.x
    const dy = p.y - c.y
    // Only tiles wholly beyond this one's edge in that direction count.
    const ahead = dir === 'right' ? b.left >= here.left + here.width - 1
      : dir === 'left' ? b.left + b.width <= here.left + 1
      : dir === 'down' ? b.top >= here.top + here.height - 1
      : b.top + b.height <= here.top + 1
    if (!ahead) return
    const along = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy)
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    const score = along + 3 * across
    if (score < bestScore) { bestScore = score; best = i }
  })
  return best >= 0 ? best : current
}
