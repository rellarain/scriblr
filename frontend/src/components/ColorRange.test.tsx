import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColorRange, resultColor, trackGradient } from './ColorRange'

const basis = { hue: 200, sat: 40, light: 30 }

describe('resultColor', () => {
  it('varies the channel being edited and holds the other two', () => {
    expect(resultColor('hue', 120, basis)).toBe('hsl(120, 40%, 30%)')
    expect(resultColor('saturation', 70, basis)).toBe('hsl(200, 70%, 30%)')
    expect(resultColor('brightness', 55, basis)).toBe('hsl(200, 40%, 55%)')
  })
})

describe('trackGradient', () => {
  it('runs through every hue at the given saturation and lightness', () => {
    const g = trackGradient('hue', 0, 360, basis)
    expect(g.startsWith('linear-gradient(to right, hsl(0, 40%, 30%) 0.00%')).toBe(true)
    expect(g).toContain('hsl(180, 40%, 30%) 50.00%')
    expect(g.endsWith('hsl(360, 40%, 30%) 100.00%)')).toBe(true)
  })

  it('shows just the window for a limited range, even across the wrap', () => {
    const g = trackGradient('hue', -40, 80, basis)
    expect(g).toContain('hsl(-40, 40%, 30%) 0.00%')
    expect(g).toContain('hsl(80, 40%, 30%) 100.00%')
  })

  it('goes from the low to the high value for saturation and brightness', () => {
    expect(trackGradient('saturation', 35, 95, basis)).toMatch(/^linear-gradient\(to right, hsl\(200, 35%, 30%\) 0\.00%.*hsl\(200, 95%, 30%\) 100\.00%\)$/)
    expect(trackGradient('brightness', 0, 100, basis)).toContain('hsl(200, 40%, 50%) 50.00%')
  })
})

describe('ColorRange', () => {
  it('is a range input over the value range, with the thumb showing the result colour', () => {
    const { container } = render(<ColorRange label="Hue" kind="hue" value={90} onChange={() => {}} sat={50} light={40} />)
    const input = screen.getByLabelText('Hue') as HTMLInputElement
    expect([input.type, input.min, input.max, input.value]).toEqual(['range', '0', '360', '90'])
    const root = container.querySelector('.colorRange') as HTMLElement
    expect(root.style.getPropertyValue('--cr-frac')).toBe('0.25')
    expect(root.style.getPropertyValue('--cr-result')).toBe('hsl(90, 50%, 40%)')
    expect(container.querySelector('.colorRangeThumb .colorRangeSwatch')).not.toBeNull()
  })

  it('reports the new value as a number', () => {
    const onChange = vi.fn()
    render(<ColorRange label="Hue" kind="hue" value={90} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Hue'), { target: { value: '200' } })
    expect(onChange).toHaveBeenCalledWith(200)
  })

  it('takes a window, and keeps a value outside it on the nearest end', () => {
    const { container } = render(<ColorRange label="Hue" kind="hue" value={300} onChange={() => {}} min={140} max={260} />)
    const input = screen.getByLabelText('Hue') as HTMLInputElement
    expect([input.min, input.max, input.value]).toEqual(['140', '260', '260'])
    expect((container.querySelector('.colorRange') as HTMLElement).style.getPropertyValue('--cr-frac')).toBe('1')
  })

  it('can be disabled', () => {
    render(<ColorRange label="Hue" kind="hue" value={0} onChange={() => {}} disabled />)
    expect((screen.getByLabelText('Hue') as HTMLInputElement).disabled).toBe(true)
  })

  it('turns the theme fade off while dragging when asked', () => {
    render(<ColorRange label="Hue" kind="hue" value={0} onChange={() => {}} live />)
    fireEvent.pointerDown(screen.getByLabelText('Hue'))
    expect(document.documentElement.hasAttribute('data-theme-live')).toBe(true)
    fireEvent(window, new Event('pointerup'))
    expect(document.documentElement.hasAttribute('data-theme-live')).toBe(false)
  })
})
