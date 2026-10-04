import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import HueSlider from './HueSlider'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

describe('HueSlider', () => {
  it('runs the whole wheel with no centre', () => {
    render(<HueSlider label="Book colour" hue={200} centre={null} onChange={() => {}} />)
    const input = screen.getByLabelText('Book colour') as HTMLInputElement
    expect([input.min, input.max, input.value]).toEqual(['0', '360', '200'])
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
