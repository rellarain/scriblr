import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { swatchPosToValue, swatchValueToPos } from '../../../components/ColorRange'
import { HUE_SWATCHES } from '../../../theme/bookColors'
import HueSlider from './HueSlider'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

describe('HueSlider', () => {
  it('runs the whole wheel with no centre, ending with the brown, black, gray and white swatches', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Book colour" hue={200} centre={null} onChange={onChange} />)
    const input = screen.getByLabelText('Book colour') as HTMLInputElement
    expect(input.max).toBe('1000')
    expect(input.getAttribute('aria-valuetext')).toBe('Hue 200')
    // The last fifth of the track is four equal swatch blocks, in order.
    for (const [pos, value] of [[810, 361], [860, 362], [910, 363], [990, 364]] as const) {
      fireEvent.change(input, { target: { value: String(pos) } })
      expect(onChange).toHaveBeenLastCalledWith(value)
    }
    // The hues start at orange (28) and run once round the wheel: halfway through them is 180 degrees on.
    fireEvent.change(input, { target: { value: '400' } })
    expect(onChange).toHaveBeenLastCalledWith(208)
    fireEvent.change(input, { target: { value: '0' } })
    expect(onChange).toHaveBeenLastCalledWith(28)
  })

  it('draws one continuous track: orange round to orange, then brown, black, gray, white', () => {
    const { container } = render(<HueSlider label="Book colour" hue={200} centre={null} onChange={() => {}} />)
    const track = (container.firstElementChild as HTMLElement).style.getPropertyValue('--cr-track')
    const stops = track.match(/hsl\([^)]*\) [\d.]+%/g)!.map(s => s.replace(/, /g, ',').replace(/\) /, ')@'))
    expect(stops[0].startsWith('hsl(28,')).toBe(true) // starts at orange
    expect(stops[12].startsWith('hsl(388,')).toBe(true) // and is back at orange where the hues end
    expect(stops[12].endsWith('@80.00%')).toBe(true)
    // Then a stop at the centre of each swatch's block (no hard edges), ending on white.
    expect(stops.slice(13).map(s => s.split('@')[1])).toEqual(['82.50%', '87.50%', '92.50%', '97.50%', '100%'])
    expect(stops[13].startsWith('hsl(28,45%,32%)')).toBe(true)
    expect(stops[14].startsWith('hsl(0,0%,10%)')).toBe(true)
    expect(stops[16].startsWith('hsl(0,0%,94%)')).toBe(true)
  })

  it('maps every hue to a track position and back', () => {
    for (let hue = 0; hue < 360; hue++) expect(swatchPosToValue(swatchValueToPos(hue, HUE_SWATCHES), HUE_SWATCHES)).toBe(hue)
    expect(swatchValueToPos(28, HUE_SWATCHES)).toBe(0) // orange is the start of the track
  })

  it('shows a swatch as itself, named', () => {
    render(<HueSlider label="Book colour" hue={363} centre={null} onChange={() => {}} />)
    expect(screen.getByLabelText('Book colour').getAttribute('aria-valuetext')).toBe('Gray')
  })

  it('has no swatches in a window (there is no hue to stay near)', () => {
    render(<HueSlider label="Arc colour" hue={210} centre={210} onChange={() => {}} />)
    expect((screen.getByLabelText('Arc colour') as HTMLInputElement).max).toBe('270')
  })

  it('runs only 60 degrees either side of its centre', () => {
    render(<HueSlider label="Arc colour" hue={230} centre={210} onChange={() => {}} />)
    const input = screen.getByLabelText('Arc colour') as HTMLInputElement
    expect([input.min, input.max, input.value]).toEqual(['150', '270', '230'])
  })

  it('shows a hue across the 0/360 wrap inside the window and reports plain 0-359 hues', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Arc colour" hue={10} centre={350} onChange={onChange} />)
    const input = screen.getByLabelText('Arc colour') as HTMLInputElement
    expect([input.min, input.max, input.value]).toEqual(['290', '410', '370'])
    fireEvent.change(input, { target: { value: '400' } })
    expect(onChange).toHaveBeenCalledWith(40)
  })
})
