import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { toneCodeToPos, toneLayout, tonePosToCode } from '../../../components/ColorRange'
import { NEUTRAL_CODE, TONES, decodeHue, encodeHue } from '../../../theme/bookColors'
import HueSlider from './HueSlider'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

const posOfMiddle = (index: number, limited: boolean) => { const s = toneLayout(limited)[index]; return Math.round(((s.from + s.to) / 2) * 1000) }

describe('HueSlider: unlimited', () => {
  it('runs from dark gray through four tones of the whole wheel to white', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Book colour" hue={200} centre={null} onChange={onChange} />)
    const input = screen.getByLabelText('Book colour') as HTMLInputElement
    expect(input.max).toBe('1000')
    expect(input.getAttribute('aria-valuetext')).toBe('Saturated, hue 200')
    const layout = toneLayout(false)
    expect(layout.map(s => (s.kind === 'neutral' ? s.neutral : s.tone))).toEqual(['darkGray', 'dark', 'saturated', 'desaturated', 'light', 'white'])
    fireEvent.change(input, { target: { value: String(posOfMiddle(0, false)) } })
    expect(onChange).toHaveBeenLastCalledWith(NEUTRAL_CODE.darkGray)
    fireEvent.change(input, { target: { value: String(posOfMiddle(5, false)) } })
    expect(onChange).toHaveBeenLastCalledWith(NEUTRAL_CODE.white)
    // The middle of the saturated wheel is 180 degrees on from its orange start.
    fireEvent.change(input, { target: { value: String(posOfMiddle(2, false)) } })
    const middle = decodeHue(onChange.mock.calls.at(-1)![0])
    expect(middle.kind === 'hue' && middle.tone).toBe('saturated')
    expect(middle.kind === 'hue' && Math.abs(middle.hue - 208)).toBeLessThanOrEqual(2)
  })

  it('names a neutral and a tone', () => {
    const { rerender } = render(<HueSlider label="Book colour" hue={NEUTRAL_CODE.white} centre={null} onChange={() => {}} />)
    expect(screen.getByLabelText('Book colour').getAttribute('aria-valuetext')).toBe('White')
    rerender(<HueSlider label="Book colour" hue={encodeHue(30, 'dark')} centre={null} onChange={() => {}} />)
    expect(screen.getByLabelText('Book colour').getAttribute('aria-valuetext')).toBe('Dark saturated, hue 30')
  })

  it('puts every hue of every tone on the track and reads it back within a degree or two', () => {
    for (const tone of TONES) {
      for (let hue = 0; hue < 360; hue += 7) {
        const back = decodeHue(tonePosToCode(toneCodeToPos(encodeHue(hue, tone), null), null))
        expect(back.kind === 'hue' && back.tone).toBe(tone)
        if (back.kind === 'hue') expect(Math.abs(((back.hue - hue + 540) % 360) - 180)).toBeLessThanOrEqual(2)
      }
    }
  })
})

describe('HueSlider: limited', () => {
  it('runs the stops of the parent and four tones of the +-60 degree window round its hue', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Arc colour" hue={230} centre={210} onChange={onChange} />)
    const input = screen.getByLabelText('Arc colour') as HTMLInputElement
    const layout = toneLayout(true)
    expect(layout.map(s => (s.kind === 'neutral' ? s.neutral : s.tone)))
      .toEqual(['darkGrayOfParent', 'dark', 'saturated', 'desaturated', 'light', 'lightGrayOfParent', 'lightShadeOfParent'])
    fireEvent.change(input, { target: { value: String(posOfMiddle(0, true)) } })
    expect(onChange).toHaveBeenLastCalledWith(NEUTRAL_CODE.darkGrayOfParent)
    fireEvent.change(input, { target: { value: String(posOfMiddle(6, true)) } })
    expect(onChange).toHaveBeenLastCalledWith(NEUTRAL_CODE.lightShadeOfParent)
    // The middle of any window is the parent's own hue; its start and end are 60 degrees either side.
    fireEvent.change(input, { target: { value: String(posOfMiddle(4, true)) } })
    expect(decodeHue(onChange.mock.calls.at(-1)![0])).toEqual({ kind: 'hue', hue: 210, tone: 'light' })
    const sat = layout[2]
    fireEvent.change(input, { target: { value: String(Math.round(sat.from * 1000) + 1) } })
    const start = decodeHue(onChange.mock.calls.at(-1)![0])
    expect(start.kind === 'hue' && Math.abs(start.hue - 150)).toBeLessThanOrEqual(1)
  })

  it('shows a hue across the 0/360 wrap inside its window', () => {
    render(<HueSlider label="Arc colour" hue={10} centre={350} onChange={() => {}} />)
    const pos = Number((screen.getByLabelText('Arc colour') as HTMLInputElement).value)
    const sat = toneLayout(true)[2]
    // 10 degrees is 20 degrees past a 350 centre: a third of the way from the middle to the end of the window.
    const expected = (sat.from + ((20 + 60) / 120) * (sat.to - sat.from)) * 1000
    expect(Math.abs(pos - expected)).toBeLessThanOrEqual(1)
  })

  it('names the stops of the parent', () => {
    render(<HueSlider label="Arc colour" hue={NEUTRAL_CODE.lightGrayOfParent} centre={210} onChange={() => {}} />)
    expect(screen.getByLabelText('Arc colour').getAttribute('aria-valuetext')).toBe('Light gray of the parent')
  })
})
