import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Recurrence } from '../../../../lib/facets'
import { RepeatPicker, presetOf } from './RepeatPicker'

const base: Recurrence = { kind: 'daily', every: 1, unit: 'day', days: [], rangeMax: null, anchor: '2026-11-04', until: null }

function Harness({ start, ...rest }: { start: Recurrence | null; allowNone?: boolean; allowInterval?: boolean }) {
  const [value, setValue] = useState<Recurrence | null>(start)
  return (
    <>
      <RepeatPicker value={value} anchor="2026-11-04" onChange={setValue} {...rest} />
      <output aria-label="value">{JSON.stringify(value)}</output>
    </>
  )
}
const value = (): Recurrence | null => JSON.parse(screen.getByLabelText('value').textContent ?? 'null')

describe('presetOf', () => {
  it('reads a recurrence as the preset it is', () => {
    expect(presetOf(null)).toBe('none')
    expect(presetOf(base)).toBe('daily')
    expect(presetOf({ ...base, every: 3 })).toBe('custom')
    expect(presetOf({ ...base, kind: 'weekly', days: [0, 1, 2, 3, 4] })).toBe('weekdays')
    expect(presetOf({ ...base, kind: 'weekly', days: [2] })).toBe('weekly')
    expect(presetOf({ ...base, kind: 'weekly', every: 2, days: [2] })).toBe('custom')
    expect(presetOf({ ...base, kind: 'interval', every: 7 })).toBe('interval')
  })
})

describe('RepeatPicker', () => {
  it('offers Does not repeat only where the thing can be one-off, and After an interval only where it can come round after one', () => {
    const { unmount } = render(<Harness start={base} />)
    expect(screen.queryByRole('radio', { name: 'Does not repeat' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'After an interval' })).toBeNull()
    unmount()
    render(<Harness start={base} allowNone allowInterval />)
    expect(screen.getByRole('radio', { name: 'Does not repeat' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'After an interval' })).toBeTruthy()
  })

  it('chooses a preset and shows the days for a weekly one, which keep at least one on', async () => {
    render(<Harness start={base} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Weekly' }))
    expect(value()).toMatchObject({ kind: 'weekly', every: 1, days: [2] }) // 2026-11-04 is a Wednesday
    await user.click(screen.getByRole('button', { name: 'Friday' }))
    expect(value()?.days).toEqual([2, 4])
    await user.click(screen.getByRole('button', { name: 'Wednesday' }))
    await user.click(screen.getByRole('button', { name: 'Friday' }))
    expect(value()?.days).toEqual([4]) // the last one stays on
  })

  it('opens Custom into every N days or weeks', async () => {
    render(<Harness start={base} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Custom' }))
    expect(value()).toMatchObject({ kind: 'daily', every: 2 })
    fireEvent.change(screen.getByLabelText('Every'), { target: { value: '1' } })
    expect(screen.getByLabelText('Every')).toBeTruthy() // a one does not close Custom
    fireEvent.change(screen.getByLabelText('Every'), { target: { value: '3' } })
    await user.selectOptions(screen.getByLabelText('Days or weeks'), 'weekly')
    expect(value()).toMatchObject({ kind: 'weekly', every: 3, days: [2] })
  })

  it('opens After an interval into a range and a unit', async () => {
    render(<Harness start={base} allowInterval />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'After an interval' }))
    expect(value()).toMatchObject({ kind: 'interval', every: 7, unit: 'day', rangeMax: null })
    await user.type(screen.getByLabelText('Up to'), '10')
    await user.selectOptions(screen.getByLabelText('Unit'), 'week')
    expect(value()).toMatchObject({ rangeMax: 10, unit: 'week' })
    await user.clear(screen.getByLabelText('Up to'))
    await user.type(screen.getByLabelText('Up to'), '3')
    await user.tab()
    expect(value()?.rangeMax).toBeNull() // a range that ends before it starts is no range
  })

  it('sets and clears an end date', async () => {
    render(<Harness start={base} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Repeat until'), '2026-12-01')
    expect(value()?.until).toBe('2026-12-01')
    await user.click(screen.getByRole('button', { name: 'Repeat without an end' }))
    expect(value()?.until).toBeNull()
  })

  it('goes back to a one-off when a shift picks Does not repeat', async () => {
    render(<Harness start={base} allowNone />)
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Does not repeat' }))
    expect(value()).toBeNull()
  })
})
