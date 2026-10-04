import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { toneCodeToPos, toneLayout, tonePosToCode } from '../../../components/ColorRange'
import { TONES, decodeHue, encodeHue } from '../../../theme/bookColors'
import HueSlider from './HueSlider'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

const posOfMiddle = (index: number) => { const s = toneLayout()[index]; return Math.round(((s.from + s.to) / 2) * 999) }

describe('HueSlider: unlimited', () => {
  it('runs three bands of the whole wheel: darker, base, lighter', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Book colour" hue={200} centre={null} onChange={onChange} />)
    const input = screen.getByLabelText('Book colour') as HTMLInputElement
    expect(input.max).toBe('999')
    expect(input.getAttribute('aria-valuetext')).toBe('Base, hue 200')
    expect(toneLayout().map(s => s.tone)).toEqual(['dark', 'base', 'light'])
    // The middle of any band is 180 degrees on from its orange start.
    for (const [i, tone] of TONES.entries()) {
      fireEvent.change(input, { target: { value: String(posOfMiddle(i)) } })
      const middle = decodeHue(onChange.mock.calls.at(-1)![0])
      expect(middle.tone).toBe(tone)
      expect(Math.abs(middle.hue - 208)).toBeLessThanOrEqual(2)
    }
  })

  it('names a hue by its brightness', () => {
    render(<HueSlider label="Book colour" hue={encodeHue(30, 'dark')} centre={null} onChange={() => {}} />)
    expect(screen.getByLabelText('Book colour').getAttribute('aria-valuetext')).toBe('Darker, hue 30')
  })

  it('puts every hue of every brightness on the track and reads it back within a degree or two', () => {
    for (const tone of TONES) {
      for (let hue = 0; hue < 360; hue += 7) {
        const back = decodeHue(tonePosToCode(toneCodeToPos(encodeHue(hue, tone), null), null))
        expect(back.tone).toBe(tone)
        expect(Math.abs(((back.hue - hue + 540) % 360) - 180)).toBeLessThanOrEqual(2)
      }
    }
  })
})

describe('HueSlider: limited', () => {
  it('runs the +-60 degree window round the parent hue in each of the three brightnesses', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Arc colour" hue={230} centre={210} onChange={onChange} />)
    const input = screen.getByLabelText('Arc colour') as HTMLInputElement
    // The middle of any window is the parent's own hue; its start and end are 60 degrees either side.
    for (const [i, tone] of TONES.entries()) {
      fireEvent.change(input, { target: { value: String(posOfMiddle(i)) } })
      expect(decodeHue(onChange.mock.calls.at(-1)![0])).toEqual({ hue: 210, tone })
    }
    const base = toneLayout()[1]
    fireEvent.change(input, { target: { value: String(Math.round(base.from * 999) + 1) } })
    const start = decodeHue(onChange.mock.calls.at(-1)![0])
    expect(Math.abs(start.hue - 150)).toBeLessThanOrEqual(1)
    expect(start.tone).toBe('base')
  })

  it('shows a hue across the 0/360 wrap inside its window', () => {
    render(<HueSlider label="Arc colour" hue={10} centre={350} onChange={() => {}} />)
    const pos = Number((screen.getByLabelText('Arc colour') as HTMLInputElement).value)
    const base = toneLayout()[1]
    // 10 degrees is 20 degrees past a 350 centre: a third of the way from the middle to the end of the window.
    const expected = (base.from + ((20 + 60) / 120) * (base.to - base.from)) * 999
    expect(Math.abs(pos - expected)).toBeLessThanOrEqual(1)
  })
})
