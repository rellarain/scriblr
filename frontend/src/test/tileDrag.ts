import { act, fireEvent } from '@testing-library/react'

// jsdom has no PointerEvent constructor: build the native events by hand so clientX arrives.
export const pointerEvent = (type: string, init: { clientX?: number; clientY?: number } = {}) =>
  Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerId: 1, button: 0, ...init })

export interface Held { moveTo: (x: number, y: number) => void; drop: () => void; cancel: () => void }

// Presses a tile's title bar (or a tab-bar icon) at `from`, and moves the pointer past the drag threshold. In jsdom every box
// is at 0, 0, so client coordinates are the grid's own. Move it to a point, then drop it there (or Escape).
export function holdTile(handle: HTMLElement, from: { x: number; y: number }): Held {
  fireEvent(handle, pointerEvent('pointerdown', { clientX: from.x, clientY: from.y }))
  const send = (type: string, x: number, y: number) => act(() => { window.dispatchEvent(pointerEvent(type, { clientX: x, clientY: y })) })
  send('pointermove', from.x + 12, from.y + 12)
  return {
    moveTo: (x, y) => send('pointermove', x, y),
    drop: () => send('pointerup', 0, 0),
    cancel: () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) }),
  }
}

// The whole gesture: hold, move to the point, drop.
export function dragTile(handle: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }): void {
  const held = holdTile(handle, from)
  held.moveTo(to.x, to.y)
  held.drop()
}
