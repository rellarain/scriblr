import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { useShiftScrollX } from './useShiftScrollX'

function Box() {
  const ref = useRef<HTMLDivElement>(null)
  useShiftScrollX(ref)
  return <div ref={ref} data-testid="box" />
}

// jsdom does no layout, so the box is given a width and a content width by hand.
function sized(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth })
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth })
}

describe('scrolling a wide box sideways', () => {
  it('scrolls with Shift and the wheel, and stops the page scrolling too', () => {
    render(<Box />)
    const box = screen.getByTestId('box')
    sized(box, 1000, 400)
    const e = new WheelEvent('wheel', { deltaY: 120, shiftKey: true, bubbles: true, cancelable: true })
    box.dispatchEvent(e)
    expect(box.scrollLeft).toBe(120)
    expect(e.defaultPrevented).toBe(true)
  })

  it('leaves the plain wheel alone, so the page scrolls over it', () => {
    render(<Box />)
    const box = screen.getByTestId('box')
    sized(box, 1000, 400)
    const e = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
    box.dispatchEvent(e)
    expect(box.scrollLeft).toBe(0)
    expect(e.defaultPrevented).toBe(false)
  })

  it('lets the page have it at an end, and when there is nothing to scroll', () => {
    render(<Box />)
    const box = screen.getByTestId('box')
    sized(box, 1000, 400)
    box.scrollLeft = 600 // the far end
    const end = new WheelEvent('wheel', { deltaY: 50, shiftKey: true, bubbles: true, cancelable: true })
    box.dispatchEvent(end)
    expect(end.defaultPrevented).toBe(false)
    sized(box, 300, 400)
    const fits = new WheelEvent('wheel', { deltaY: 50, shiftKey: true, bubbles: true, cancelable: true })
    box.dispatchEvent(fits)
    expect(fits.defaultPrevented).toBe(false)
  })

  it('reads a sideways wheel too, as a touchpad sends with Shift', () => {
    render(<Box />)
    const box = screen.getByTestId('box')
    sized(box, 1000, 400)
    fireEvent(box, new WheelEvent('wheel', { deltaX: 40, deltaY: 0, shiftKey: true, bubbles: true, cancelable: true }))
    expect(box.scrollLeft).toBe(40)
  })
})
