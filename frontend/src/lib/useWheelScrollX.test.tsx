import { render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { useWheelScrollX } from './useWheelScrollX'

function Box() {
  const ref = useRef<HTMLDivElement>(null)
  useWheelScrollX(ref)
  return <div ref={ref} data-testid="box" />
}

// jsdom does no layout, so the box is given a width and a content width by hand.
function sized(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth })
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth })
}

const wheel = (box: HTMLElement, init: WheelEventInit) => {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  box.dispatchEvent(e)
  return e
}

describe('scrolling a wide box sideways by the plain wheel', () => {
  it('turns the vertical wheel into a sideways scroll, and stops the page scrolling too', () => {
    render(<Box />)
    const box = screen.getByTestId('box')
    sized(box, 1000, 400)
    const e = wheel(box, { deltaY: 120 })
    expect(box.scrollLeft).toBe(120)
    expect(e.defaultPrevented).toBe(true)
  })

  it('leaves a sideways wheel and Shift + the wheel to the browser', () => {
    render(<Box />)
    const box = screen.getByTestId('box')
    sized(box, 1000, 400)
    expect(wheel(box, { deltaX: 120, deltaY: 10 }).defaultPrevented).toBe(false)
    expect(wheel(box, { deltaY: 120, shiftKey: true }).defaultPrevented).toBe(false)
    expect(box.scrollLeft).toBe(0)
  })

  it('lets the page have it at an end, and when there is nothing to scroll', () => {
    render(<Box />)
    const box = screen.getByTestId('box')
    sized(box, 1000, 400)
    expect(wheel(box, { deltaY: -120 }).defaultPrevented).toBe(false) // already at the left end
    box.scrollLeft = 600
    expect(wheel(box, { deltaY: 120 }).defaultPrevented).toBe(false) // at the right end
    sized(box, 300, 400)
    expect(wheel(box, { deltaY: 120 }).defaultPrevented).toBe(false) // it fits
  })
})
