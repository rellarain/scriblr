import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { decodeHue, encodeHue } from '../theme/bookColors'
import { ColorRange, resultColor, toneCodeToPos, toneLayout, toneName, tonePosToCode, toneTrackGradient, trackGradient } from './ColorRange'

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

  it('lays out three brightness bands, darker, base, lighter, end to end', () => {
    const layout = toneLayout()
    expect(layout.map(s => s.tone)).toEqual(['dark', 'base', 'light'])
    expect(layout[0].from).toBe(0)
    expect(layout.at(-1)!.to).toBe(1)
    layout.slice(1).forEach((seg, i) => expect(seg.from).toBeCloseTo(layout[i].to, 10))
  })

  it('draws each band round the wheel starting at orange, at one saturation and its own brightness', () => {
    const g = toneTrackGradient(zone, null)
    expect(g.startsWith('linear-gradient(to right, hsl(28, 30%, 68%) 0.00%')).toBe(true) // darker: 18 points under the zone
    expect(g).toContain('hsl(28, 30%, 86%) 33.33%') // base starts at the same orange
    expect(g).toContain('hsl(28, 30%, 94%) 66.67%') // lighter (22 more, held to 94)
    expect(g.match(/hsl\(\d+, (\d+)%/g)!.every(c => c.includes(', 30%'))).toBe(true) // never another saturation
  })

  it('draws the limited track as the three windows round the parent hue', () => {
    const g = toneTrackGradient(zone, 210)
    expect(g).toContain('hsl(150, 30%, 68%) 0.00%')
    expect(g).toContain('hsl(270, 30%, 86%) 66.67%')
    expect(g).toContain('hsl(210, 30%, 94%)') // the parent hue itself, lighter, in the middle of the last band
  })

  it('puts every code on the track and reads it back, on both tracks', () => {
    for (const centre of [null, 210]) {
      for (const tone of ['dark', 'base', 'light'] as const) {
        for (const hue of centre === null ? [0, 28, 100, 200, 300, 359] : [150, 180, 210, 240, 270]) {
          const code = encodeHue(hue, tone)
          const back = decodeHue(tonePosToCode(toneCodeToPos(code, centre), centre))
          expect(back.tone).toBe(tone)
          expect(Math.abs(((back.hue - hue + 540) % 360) - 180)).toBeLessThanOrEqual(2)
        }
      }
    }
  })

  it('names a code', () => {
    expect([toneName(200), toneName(encodeHue(30, 'dark')), toneName(encodeHue(30, 'light'))]).toEqual(['Base, hue 200', 'Darker, hue 30', 'Lighter, hue 30'])
  })
})
