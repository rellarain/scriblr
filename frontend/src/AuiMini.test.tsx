import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueueView, WorkToday } from './support/supportTypes'

const setOnBreak = vi.fn(async (on: boolean) => on || !on)
let view: Partial<QueueView> | null = null
vi.mock('./support/supportStores', () => ({
  useQueues: () => ({ view, status: 'ready', error: null }),
  loadQueues: vi.fn(async () => {}),
  setOnBreak: (on: boolean) => setOnBreak(on),
}))

import AuiMini, { duration } from './AuiMini'

const work = (over: Partial<WorkToday> = {}): WorkToday => ({ scheduled: 240, complete: 90, remaining: 150, breakEarned: 15, breakUsed: 5, breakRate: 10, onBreak: false, ...over })
const me = (w: WorkToday | undefined, onShift = true) => ({ me: { id: 'adm-sam', name: 'Sam', kind: 'admin', allotment: 20, onShift, work: w } } as unknown as QueueView)

beforeEach(() => { setOnBreak.mockClear(); view = null })

describe("AuiMini, AUI's part of the band", () => {
  it('shows the work done against what remains, and the break used against the break earned', () => {
    view = me(work())
    render(<AuiMini />)
    expect(screen.getByRole('meter', { name: 'Work' })).toHaveAttribute('aria-valuetext', '1h 30m done, 2h 30m to go')
    expect(screen.getByRole('meter', { name: 'Work' })).toHaveAttribute('aria-valuemax', '240')
    expect(screen.getByRole('meter', { name: 'Break' })).toHaveAttribute('aria-valuetext', '5m of 15m earned')
  })

  it('starts and ends a break', () => {
    view = me(work())
    const { rerender } = render(<AuiMini />)
    fireEvent.click(screen.getByRole('button', { name: 'Start a break' }))
    expect(setOnBreak).toHaveBeenCalledWith(true)
    view = me(work({ onBreak: true }))
    rerender(<AuiMini />)
    expect(screen.getByRole('button', { name: 'End the break' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'End the break' }))
    expect(setOnBreak).toHaveBeenLastCalledWith(false)
  })

  it('marks a break used past what was earned, and offers no break off shift', () => {
    view = me(work({ breakUsed: 20 }), false)
    const { container } = render(<AuiMini />)
    expect(container.querySelector('.auiMeterFill--over')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start a break' })).toBeDisabled()
  })

  it('says so on a day with no helper time', () => {
    view = me(work({ scheduled: 0, complete: 0, remaining: 0, breakEarned: 0, breakUsed: 0 }))
    render(<AuiMini />)
    expect(screen.getByText('No helper time today')).toBeInTheDocument()
    expect(screen.queryByRole('meter')).toBeNull()
  })

  it('writes minutes as hours and minutes', () => {
    expect([duration(5), duration(60), duration(125)]).toEqual(['5m', '1h 00m', '2h 05m'])
  })
})
