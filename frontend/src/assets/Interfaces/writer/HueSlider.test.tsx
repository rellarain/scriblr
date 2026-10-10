import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import HueSlider from './HueSlider'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement

describe('HueSlider: unlimited', () => {
  it('is one track over the whole wheel, 0 to 360, with the thumb at the hue', () => {
    render(<HueSlider label="Book colour" hue={200} centre={null} onChange={() => {}} />)
    expect([input('Book colour').min, input('Book colour').max, input('Book colour').value]).toEqual(['0', '360', '200'])
  })

  it('reports the hue chosen, wrapped (360 is red, 0)', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Book colour" hue={200} centre={null} onChange={onChange} />)
    fireEvent.change(input('Book colour'), { target: { value: '90' } })
    fireEvent.change(input('Book colour'), { target: { value: '360' } })
    expect(onChange.mock.calls.map(c => c[0])).toEqual([90, 0])
  })

  it('shows a stored 360 (red) at the start of the track', () => {
    render(<HueSlider label="Book colour" hue={360} centre={null} onChange={() => {}} />)
    expect(input('Book colour').value).toBe('0')
  })
})

describe('HueSlider: limited', () => {
  it('runs the +-60 degree window round the parent hue, the middle being the parent hue itself', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Arc colour" hue={230} centre={210} onChange={onChange} />)
    expect([input('Arc colour').min, input('Arc colour').max, input('Arc colour').value]).toEqual(['150', '270', '230'])
    fireEvent.change(input('Arc colour'), { target: { value: '210' } })
    fireEvent.change(input('Arc colour'), { target: { value: '150' } })
    expect(onChange.mock.calls.map(c => c[0])).toEqual([210, 150])
  })

  it('shows a hue across the 0/360 wrap inside its window, and reports it wrapped', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Arc colour" hue={10} centre={350} onChange={onChange} />)
    expect([input('Arc colour').min, input('Arc colour').max, input('Arc colour').value]).toEqual(['290', '410', '370'])
    fireEvent.change(input('Arc colour'), { target: { value: '400' } })
    expect(onChange).toHaveBeenCalledWith(40)
  })

  it('holds a hue outside the window on its nearest end', () => {
    render(<HueSlider label="Arc colour" hue={100} centre={210} onChange={() => {}} />)
    expect(input('Arc colour').value).toBe('150')
  })
})
