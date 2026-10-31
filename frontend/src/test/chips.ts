import { createEvent, fireEvent } from '@testing-library/react'

// jsdom has no layout and no DragEvent, so a drag over a row of chips (useChipDrop.ts) is staged by hand: the chips are given a place, as if
// they wrapped two to a line, and the pointer's place goes on the event.

const WIDTH = 50
const HEIGHT = 20
const GAP = 10
const PER_LINE = 2

// Lays out the chips of `group` (its `data-chip` children, then the `data-chip-tail` one) 50 by 20 with 10px gaps, two to a line. Returns where
// the pointer is for the nth child (counting the chips and then the add chip): its left or right half.
export function layOutChips(group: Element) {
  const box = group as HTMLElement
  box.style.columnGap = `${GAP}px`
  box.style.rowGap = `${GAP}px`
  Object.defineProperty(box, 'clientWidth', { value: PER_LINE * (WIDTH + GAP), configurable: true })
  const kids = [...box.children].filter((el): el is HTMLElement => el instanceof HTMLElement && (el.dataset.chip !== undefined || el.dataset.chipTail !== undefined))
  const left = (n: number) => (n % PER_LINE) * (WIDTH + GAP)
  const top = (n: number) => Math.floor(n / PER_LINE) * (HEIGHT + GAP)
  kids.forEach((el, n) => {
    Object.defineProperty(el, 'offsetLeft', { value: left(n), configurable: true })
    Object.defineProperty(el, 'offsetTop', { value: top(n), configurable: true })
    Object.defineProperty(el, 'offsetWidth', { value: WIDTH, configurable: true })
    Object.defineProperty(el, 'offsetHeight', { value: HEIGHT, configurable: true })
  })
  return {
    leftHalf: (n: number) => ({ clientX: left(n) + 10, clientY: top(n) + 5 }),
    rightHalf: (n: number) => ({ clientX: left(n) + WIDTH - 10, clientY: top(n) + 5 }),
    // Beyond the last line, at the right
    afterAll: () => ({ clientX: 400, clientY: 400 }),
  }
}

export function dragAt(type: 'dragOver' | 'dragEnter' | 'drop', el: Element, pointer: { clientX: number; clientY: number }, dataTransfer: object) {
  const event = createEvent[type](el, { dataTransfer })
  Object.defineProperty(event, 'clientX', { value: pointer.clientX })
  Object.defineProperty(event, 'clientY', { value: pointer.clientY })
  return fireEvent(el, event)
}
