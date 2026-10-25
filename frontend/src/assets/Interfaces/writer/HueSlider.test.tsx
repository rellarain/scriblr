import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import HueSlider from './HueSlider'
import { mockFetch } from '../../../test/mockFetch'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
})

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const reset = () => screen.queryByRole('button', { name: 'Reset to parent colour' })

describe('HueSlider: the whole wheel (the project)', () => {
  it('is one track over the whole wheel, 0 to 360, with the thumb at the hue', () => {
    render(<HueSlider label="Project colour" hue={200} centre={null} range={360} onChange={() => {}} />)
    expect([input('Project colour').min, input('Project colour').max, input('Project colour').value]).toEqual(['0', '360', '200'])
  })

  it('draws its track from hue 0 (red) at the left', () => {
    const { container } = render(<HueSlider label="Project colour" hue={200} centre={null} range={360} onChange={() => {}} />)
    const track = (container.querySelector('.colorRange') as HTMLElement).style.getPropertyValue('--cr-track')
    expect(track).toMatch(/^linear-gradient\(to right, hsl\(0, /)
    expect(track).toMatch(/hsl\(360, [^)]*\) 100\.00%\)$/)
  })

  it('reports the hue chosen, wrapped (360 is red, 0)', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Project colour" hue={200} centre={null} range={360} onChange={onChange} />)
    fireEvent.change(input('Project colour'), { target: { value: '90' } })
    fireEvent.change(input('Project colour'), { target: { value: '360' } })
    expect(onChange.mock.calls.map(c => c[0])).toEqual([90, 0])
  })

  it('shows a stored 360 (red) at the start of the track', () => {
    render(<HueSlider label="Project colour" hue={360} centre={null} range={360} onChange={() => {}} />)
    expect(input('Project colour').value).toBe('0')
  })

  it('has no reset button: a project has no parent hue', () => {
    render(<HueSlider label="Project colour" hue={200} centre={null} range={360} onChange={() => {}} />)
    expect(reset()).toBeNull()
  })
})

describe('HueSlider: a range round the parent hue', () => {
  it('runs the range either side of the parent hue, the middle being the parent hue itself', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Arc colour" hue={230} centre={210} range={60} onChange={onChange} />)
    expect([input('Arc colour').min, input('Arc colour').max, input('Arc colour').value]).toEqual(['150', '270', '230'])
    fireEvent.change(input('Arc colour'), { target: { value: '210' } })
    fireEvent.change(input('Arc colour'), { target: { value: '150' } })
    expect(onChange.mock.calls.map(c => c[0])).toEqual([210, 150])
  })

  it.each([[30, '180', '240'], [60, '150', '270'], [90, '120', '300']])('is %i degrees either side at a range of %i', (range, min, max) => {
    render(<HueSlider label="Colour" hue={210} centre={210} range={range} onChange={() => {}} />)
    expect([input('Colour').min, input('Colour').max]).toEqual([min, max])
  })

  it('shows a hue across the 0/360 wrap inside its window, and reports it wrapped', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Arc colour" hue={10} centre={350} range={60} onChange={onChange} />)
    expect([input('Arc colour').min, input('Arc colour').max, input('Arc colour').value]).toEqual(['290', '410', '370'])
    fireEvent.change(input('Arc colour'), { target: { value: '400' } })
    expect(onChange).toHaveBeenCalledWith(40)
  })

  it('holds a hue outside the window on its nearest end (the stored colour is not changed)', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Arc colour" hue={100} centre={210} range={60} onChange={onChange} />)
    expect(input('Arc colour').value).toBe('150')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('is the whole wheel from 0 at a range of 360, and keeps its reset button', () => {
    render(<HueSlider label="Colour" hue={100} centre={210} range={360} onChange={() => {}} />)
    expect([input('Colour').min, input('Colour').max, input('Colour').value]).toEqual(['0', '360', '100'])
    expect(reset()).not.toBeNull()
  })
})

describe('HueSlider: the reset button', () => {
  it('stands to the left of the slider, a square filled with the parent hue, and says so', () => {
    const { container } = render(<HueSlider label="Arc colour" className="wrNodeHue" hue={230} centre={210} range={60} onChange={() => {}} />)
    const row = container.firstElementChild as HTMLElement
    expect(row).toHaveClass('hueSliderRow', 'wrNodeHue')
    expect(row.firstElementChild).toBe(reset())
    expect(reset()).toHaveAttribute('title', 'Reset to parent colour (210°)')
    expect(reset()!.style.getPropertyValue('--cr-reset')).toMatch(/^hsl\(210, /)
  })

  it('sets the colour to the parent hue, even at the middle of a window across the wrap', () => {
    const onChange = vi.fn()
    const { rerender } = render(<HueSlider label="Arc colour" hue={230} centre={210} range={60} onChange={onChange} />)
    fireEvent.click(reset()!)
    rerender(<HueSlider label="Arc colour" hue={40} centre={350} range={60} onChange={onChange} />)
    fireEvent.click(reset()!)
    expect(onChange.mock.calls.map(c => c[0])).toEqual([210, 350])
  })

  it('wraps a parent hue given past 360', () => {
    const onChange = vi.fn()
    render(<HueSlider label="Arc colour" hue={10} centre={370} range={60} onChange={onChange} />)
    fireEvent.click(reset()!)
    expect(onChange).toHaveBeenCalledWith(10)
  })
})
