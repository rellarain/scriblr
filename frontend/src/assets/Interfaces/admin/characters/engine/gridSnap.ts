// The designer's grid and what snaps to it. The lines are every 2 units at the normal zoom, 1 and then 0.5 as the view closes in, and wider apart (5, 10, 20, 50...) when it is
// zoomed out so far that the lines would crowd; the line a multiple of ten units away (of fifty, once the lines are ten apart or more) is the stronger one. A shape, a pivot or a
// frame that snaps to the grid lands on the lines that are drawn, so the grid size is whatever the lines show.

const STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200]
// The most lines across the view before the lines are spread to the next size.
const MOST_LINES = 160

// The distance between two lines of the grid for a view this many units wide.
export function gridStep(viewWidth: number): number {
  const w = Number.isFinite(viewWidth) && viewWidth > 0 ? viewWidth : 230
  let i = w > 120 ? 2 : w > 40 ? 1 : 0
  while (i < STEPS.length - 1 && w / STEPS[i] > MOST_LINES) i += 1
  return STEPS[i]
}

// The distance between two stronger lines.
export const majorStep = (step: number): number => (step >= 10 ? 50 : 10)

// A value on the nearest line (rounded so 0.1 + 0.2 never shows).
export function snapTo(value: number, step: number): number {
  if (!Number.isFinite(value) || !(step > 0)) return value
  return Math.round(Math.round(value / step) * step * 1e6) / 1e6
}

// Whether the line at this position is a stronger one.
export function isMajor(position: number, step: number): boolean {
  const m = majorStep(step)
  return Math.abs(position / m - Math.round(position / m)) < 1e-9
}
