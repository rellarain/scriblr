import { render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useContainerSize } from './useContainerWidth'

function Probe({ padding }: { padding: string }) {
  const [ref, size] = useContainerSize<HTMLDivElement>()
  return createElement('div', { ref, style: { padding }, 'data-width': size.width, 'data-height': size.height })
}

const mockRect = (width: number, height: number) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}),
  })

afterEach(() => { vi.restoreAllMocks() })

describe('useContainerSize', () => {
  it("subtracts the measured element's own padding -- a child filling its content box exactly must not overflow it", () => {
    mockRect(300, 200)
    const { container } = render(createElement(Probe, { padding: '10px 4px' }))
    const el = container.firstChild as HTMLElement
    expect(el.getAttribute('data-width')).toBe(String(300 - 4 - 4))
    expect(el.getAttribute('data-height')).toBe(String(200 - 10 - 10))
  })

  it('falls back to the given defaults when nothing can be measured (a test DOM with a zero rect)', () => {
    mockRect(0, 0)
    const { container } = render(createElement(Probe, { padding: '10px' }))
    const el = container.firstChild as HTMLElement
    expect(el.getAttribute('data-width')).toBe('1000')
    expect(el.getAttribute('data-height')).toBe('600')
  })
})
