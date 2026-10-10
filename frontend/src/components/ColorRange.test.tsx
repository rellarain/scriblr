import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColorRange, resultColor, trackGradient } from './ColorRange'

const basis = { sat: 40, light: 30 }

describe('resultColor', () => {
  it('is the hue at the given saturation and lightness', () => {
    expect(resultColor(120, basis)).toBe('hsl(120, 40%, 30%)')
  })
})

describe('trackGradient', () => {
  it('runs through every hue at the given saturation and lightness', () => {
    const g = trackGradient(0, 360, basis)
    expect(g.startsWith('linear-gradient(to right, hsl(0, 40%, 30%) 0.00%')).toBe(true)
    expect(g).toContain('hsl(180, 40%, 30%) 50.00%')
    expect(g.endsWith('hsl(360, 40%, 30%) 100.00%)')).toBe(true)
  })

  it('shows just the window for a limited range, even across the wrap', () => {
    const g = trackGradient(-40, 80, basis)
    expect(g).toContain('hsl(-40, 40%, 30%) 0.00%')
    expect(g).toContain('hsl(80, 40%, 30%) 100.00%')
  })
})

describe('ColorRange', () => {
  it('is a range input over the hues, with the thumb showing the result colour', () => {
    const { container } = render(<ColorRange label="Hue" value={90} onChange={() => {}} sat={50} light={40} />)
    const input = screen.getByLabelText('Hue') as HTMLInputElement
    expect([input.type, input.min, input.max, input.value]).toEqual(['range', '0', '360', '90'])
    const root = container.querySelector('.colorRange') as HTMLElement
    expect(root.style.getPropertyValue('--cr-frac')).toBe('0.25')
    expect(root.style.getPropertyValue('--cr-result')).toBe('hsl(90, 50%, 40%)')
    expect(container.querySelector('.colorRangeThumb .colorRangeSwatch')).not.toBeNull()
  })

  it('reports the new value as a number', () => {
    const onChange = vi.fn()
    render(<ColorRange label="Hue" value={90} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Hue'), { target: { value: '200' } })
    expect(onChange).toHaveBeenCalledWith(200)
  })

  it('takes a window, and keeps a value outside it on the nearest end', () => {
    const { container } = render(<ColorRange label="Hue" value={300} onChange={() => {}} min={140} max={260} />)
    const input = screen.getByLabelText('Hue') as HTMLInputElement
    expect([input.min, input.max, input.value]).toEqual(['140', '260', '260'])
    expect((container.querySelector('.colorRange') as HTMLElement).style.getPropertyValue('--cr-frac')).toBe('1')
  })

  it('can be disabled', () => {
    render(<ColorRange label="Hue" value={0} onChange={() => {}} disabled />)
    expect((screen.getByLabelText('Hue') as HTMLInputElement).disabled).toBe(true)
  })

  it('turns the theme fade off while dragging when asked', () => {
    render(<ColorRange label="Hue" value={0} onChange={() => {}} live />)
    fireEvent.pointerDown(screen.getByLabelText('Hue'))
    expect(document.documentElement.hasAttribute('data-theme-live')).toBe(true)
    fireEvent(window, new Event('pointerup'))
    expect(document.documentElement.hasAttribute('data-theme-live')).toBe(false)
  })
})
