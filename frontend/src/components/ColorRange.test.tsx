import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColorRange, resultColor, toneLayout, toneName, toneTrackGradient, trackGradient } from './ColorRange'

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

describe('the tone track', () => {
  const zone = { sat: 30, light: 86 } // the day zone's theme look

  it('lays out the unlimited and the limited tracks end to end', () => {
    for (const limited of [false, true]) {
      const layout = toneLayout(limited)
      expect(layout[0].from).toBe(0)
      expect(layout.at(-1)!.to).toBe(1)
      layout.slice(1).forEach((seg, i) => expect(seg.from).toBeCloseTo(layout[i].to, 10))
    }
    expect(toneLayout(false)).toHaveLength(6)
    expect(toneLayout(true)).toHaveLength(7)
  })

  it('draws a flat dark gray block, then each tone round the wheel starting at orange, then white', () => {
    const g = toneTrackGradient(zone, null)
    expect(g.startsWith('linear-gradient(to right, hsl(0, 0%, 46%) 0.00%, hsl(0, 0%, 46%) 3.00%')).toBe(true) // dark gray at day: 86 - 40
    expect(g).toContain('hsl(28, 30%, 68%) 3.00%') // the dark wheel starts at orange, 18 points darker
    expect(g).toContain('hsl(28, 30%, 86%) 26.50%') // the saturated wheel starts at the same orange
    expect(g).toContain('hsl(28, 14%, 86%)') // the desaturated wheel's colour
    expect(g.endsWith('hsl(0, 0%, 94%) 100.00%)')).toBe(true)
  })

  it('draws the limited track round the parent hue, with its stops from that hue', () => {
    const g = toneTrackGradient(zone, 210)
    expect(g).toContain('hsl(210, 10%, 46%) 0.00%') // dark gray of the parent
    expect(g).toContain('hsl(150, 30%, 86%)') // the window starts 60 degrees before the parent hue
    expect(g).toContain('hsl(270, 30%, 86%)')
    expect(g.endsWith('hsl(210, 30%, 94%) 100.00%)')).toBe(true) // light shade of the parent
  })

  it('names a code', () => {
    expect([toneName(200), toneName(721), toneName(722)]).toEqual(['Saturated, hue 200', 'White', 'Light gray of the parent'])
  })
})
