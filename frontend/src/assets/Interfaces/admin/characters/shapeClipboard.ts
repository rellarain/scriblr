import type { ModelPoint, ModelShape } from '../../../../api/types'
import { moveShape } from './engine/edit'
import { frameOf } from './engine/transform'

// The shape editor's clipboard (shape types T2): Ctrl+C copies the selected shape, Ctrl+X cuts it, and Ctrl+V pastes it, as many times as wanted, under the pointer (or a little right
// of and below where it was copied from). It lives for the session, so a shape copied in one model can be pasted into another. A pasted shape follows nothing: its points stay where
// they are, without the links the copied one had.

let held: ModelShape | null = null

const unlinked = (p: ModelPoint): ModelPoint => { const { bind: _bind, ...rest } = p; return rest }

export function copyShape(shape: ModelShape): void {
  // a pasted shape follows nothing and is drawn where it was drawn, not where it was posed (its anchors come with it)
  held = { ...structuredClone(shape), pts: shape.pts.map(unlinked), mirrorOf: null, copyOf: null, place: null }
}
export const hasCopy = (): boolean => held !== null
// forget what was copied (for tests)
export const clearClipboard = (): void => { held = null }

// The copy as a new shape with this id: its middle under the pointer when there is one, else moved a little right and down.
export const PASTE_OFFSET = 10
export function pasted(id: string, at: [number, number] | null): ModelShape | null {
  if (!held) return null
  const base: ModelShape = { ...structuredClone(held), id }
  const f = frameOf(base)
  if (at && f) return moveShape(base, at[0] - f.cx, at[1] - f.cy)
  return moveShape(base, PASTE_OFFSET, PASTE_OFFSET)
}
