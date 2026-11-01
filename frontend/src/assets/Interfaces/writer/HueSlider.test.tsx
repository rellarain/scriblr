import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('is the whole wheel from 0 at a range of 360', () => {
    render(<HueSlider label="Colour" hue={100} centre={210} range={360} onChange={() => {}} />)
    expect([input('Colour').min, input('Colour').max, input('Colour').value]).toEqual(['0', '360', '100'])
  })

  it('is centred on the parent hue at a range of 180, across the wrap', () => {
    render(<HueSlider label="Colour" hue={10} centre={350} range={180} onChange={() => {}} />)
    expect([input('Colour').min, input('Colour').max, input('Colour').value]).toEqual(['170', '530', '370'])
  })
})

const inherit = () => screen.getByRole('button', { name: 'Inherit parent colour' })
const rangeGroup = () => screen.getByRole('radiogroup', { name: 'Arc colour range' })

describe('HueSlider: the row', () => {
  it('is the Inherit toggle, the degree chip, the slider and the range button, in that order', () => {
    const { container } = render(<HueSlider label="Arc colour" className="wrNodeHue" hue={230} centre={210} range={60} onChange={() => {}} onInherit={() => {}} onRange={() => {}} />)
    const row = container.firstElementChild as HTMLElement
    expect(row).toHaveClass('hueSliderRow', 'wrNodeHue')
    expect(Array.from(row.children).map(c => c.className.split(' ')[0])).toEqual(['hueInherit', 'hueChip', 'colorRange', 'hueRange'])
  })

  it('has no Inherit toggle, chip or range button for a plain slider', () => {
    const { container } = render(<HueSlider label="Colour" hue={100} centre={null} range={360} onChange={() => {}} />)
    expect(container.querySelector('.hueInherit, .hueChip, .hueRange')).toBeNull()
  })
})

describe('HueSlider: the Inherit toggle', () => {
  it('is a square in the parent hue, named and with the parent hue in its tooltip, and outlined in white only while it is on', () => {
    const { rerender } = render(<HueSlider label="Arc colour" hue={230} centre={210} range={60} onChange={() => {}} onInherit={() => {}} />)
    expect(inherit()).toHaveAttribute('title', 'Inherit parent colour (210°)')
    expect(inherit().style.getPropertyValue('--cr-reset')).toMatch(/^hsl\(210, /)
    expect(inherit()).toHaveAttribute('aria-pressed', 'false')
    expect(inherit()).not.toHaveClass('hueInherit--on')
    rerender(<HueSlider label="Arc colour" hue={210} centre={210} range={60} inherit onChange={() => {}} onInherit={() => {}} />)
    expect(inherit()).toHaveAttribute('aria-pressed', 'true')
    expect(inherit()).toHaveClass('hueInherit--on')
  })

  it('turns inheriting on and off', () => {
    const onInherit = vi.fn()
    const { rerender } = render(<HueSlider label="Arc colour" hue={230} centre={210} range={60} onChange={() => {}} onInherit={onInherit} />)
    fireEvent.click(inherit())
    rerender(<HueSlider label="Arc colour" hue={210} centre={210} range={60} inherit onChange={() => {}} onInherit={onInherit} />)
    fireEvent.click(inherit())
    expect(onInherit.mock.calls.map(c => c[0])).toEqual([true, false])
  })

  it('wraps a parent hue given past 360', () => {
    render(<HueSlider label="Arc colour" hue={10} centre={370} range={60} onChange={() => {}} onInherit={() => {}} />)
    expect(inherit()).toHaveAttribute('title', 'Inherit parent colour (10°)')
  })

  it('has no thumb while it is on, and the track cannot be moved', () => {
    const { container, rerender } = render(<HueSlider label="Arc colour" hue={230} centre={210} range={60} onChange={() => {}} onInherit={() => {}} />)
    expect(container.querySelector('.colorRangeThumb')).not.toBeNull()
    rerender(<HueSlider label="Arc colour" hue={210} centre={210} range={60} inherit onChange={() => {}} onInherit={() => {}} />)
    expect(container.querySelector('.colorRangeThumb')).toBeNull()
    expect(input('Arc colour')).toBeDisabled()
  })

  it('is disabled at a range of 360, which has no parent to follow', () => {
    render(<HueSlider label="Arc colour" hue={230} centre={210} range={360} onChange={() => {}} onInherit={() => {}} />)
    expect(inherit()).toBeDisabled()
    expect(inherit()).toHaveAttribute('title', 'A range of 360 has no parent colour to follow')
  })
})

describe('HueSlider: the degree chip', () => {
  it('shows the hue in degrees, read-only, in the colour itself', () => {
    render(<HueSlider label="Arc colour" hue={230} centre={210} range={60} onChange={() => {}} onInherit={() => {}} />)
    const chip = screen.getByRole('img', { name: 'Arc colour: 230 degrees' })
    expect(chip.textContent).toBe('230°')
    expect(chip.style.getPropertyValue('--cr-chip')).toMatch(/^hsl\(230, /)
  })

  it('shows the inherited hue while inheriting, and a stored 360 as 0', () => {
    const { rerender } = render(<HueSlider label="Arc colour" hue={210} centre={210} range={60} inherit onChange={() => {}} onInherit={() => {}} />)
    expect(screen.getByRole('img', { name: 'Arc colour: 210 degrees' })).toBeTruthy()
    rerender(<HueSlider label="Arc colour" hue={360} centre={210} range={360} onChange={() => {}} onInherit={() => {}} />)
    expect(screen.getByRole('img', { name: 'Arc colour: 0 degrees' }).textContent).toBe('0°')
  })
})

describe('HueSlider: the range button', () => {
  const show = (props: { range?: number; maxRange?: number; onRange?: (r: number) => void } = {}) =>
    render(<HueSlider label="Arc colour" hue={230} centre={210} range={props.range ?? 60} maxRange={props.maxRange} onChange={() => {}} onInherit={() => {}} onRange={props.onRange ?? (() => {})} />)
  const names = () => within(rangeGroup()).getAllByRole('radio').map(b => b.textContent)

  it('shows the chosen range as text until it is opened', () => {
    show()
    expect(names()).toEqual(['±60°'])
    expect(screen.getByRole('radio', { name: 'Range plus or minus 60 degrees' })).toHaveAttribute('aria-checked', 'true')
    cleanup()
    show({ range: 360 })
    expect(screen.getByRole('radio', { name: 'Range any hue, 360 degrees' }).textContent).toBe('360°')
  })

  it('opens on hover into every range on offer, the chosen one marked, and shuts when the pointer leaves', async () => {
    const user = userEvent.setup()
    show()
    await user.hover(rangeGroup())
    expect(names()).toEqual(['±30°', '±60°', '±90°', '±120°', '±180°', '360°'])
    expect(screen.getByRole('radio', { name: 'Range plus or minus 60 degrees' })).toHaveAttribute('aria-checked', 'true')
    await user.unhover(rangeGroup())
    expect(names()).toEqual(['±60°'])
  })

  it('opens on a press too', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('radio', { name: 'Range plus or minus 60 degrees' }))
    expect(names().length).toBe(6)
  })

  it('offers none wider than the parent range: up to 90, and a 180 parent never offers 360', async () => {
    const user = userEvent.setup()
    show({ maxRange: 90, range: 30 })
    await user.hover(rangeGroup())
    expect(names()).toEqual(['±30°', '±60°', '±90°'])
    cleanup()
    show({ maxRange: 180, range: 30 })
    await user.hover(rangeGroup())
    expect(names()).toEqual(['±30°', '±60°', '±90°', '±120°', '±180°'])
  })

  it('reports the range picked, and shuts', () => {
    const onRange = vi.fn()
    show({ onRange })
    fireEvent.mouseEnter(rangeGroup())
    fireEvent.click(screen.getByRole('radio', { name: 'Range plus or minus 120 degrees' }))
    expect(onRange).toHaveBeenCalledWith(120)
    expect(names()).toEqual(['±60°'])
  })

  it('does not report the range that is already chosen', () => {
    const onRange = vi.fn()
    show({ onRange })
    fireEvent.mouseEnter(rangeGroup())
    fireEvent.click(screen.getByRole('radio', { name: 'Range plus or minus 60 degrees' }))
    expect(onRange).not.toHaveBeenCalled()
    expect(names().length).toBe(6) // pressing the chosen one leaves it open
  })

  it('opens on focus and shuts on Escape', async () => {
    const user = userEvent.setup()
    show()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    expect(names().length).toBe(6)
    await user.keyboard('{Escape}')
    expect(names()).toEqual(['±60°'])
  })
})
