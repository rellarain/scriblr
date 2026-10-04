import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests, getKv } from '../../../settings/settingsStore'
import { PLOT_ORDER_KEY, PlotOrderToggle, usePlotOrder } from './plotOrder'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

function Reader() { return <span data-testid="order">{usePlotOrder()[0]}</span> }

describe('PlotOrderToggle', () => {
  it('orders by time to start with, and one choice is shared by every list that reads it', async () => {
    const user = userEvent.setup()
    render(<><PlotOrderToggle /><Reader /></>)
    expect(screen.getByRole('button', { name: 'By time' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('order').textContent).toBe('time')
    await user.click(screen.getByRole('button', { name: 'In story' }))
    expect(screen.getByRole('button', { name: 'In story' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('order').textContent).toBe('story')
    expect(getKv<string>(PLOT_ORDER_KEY)).toBe('story')
  })

  it('is remembered across a remount', async () => {
    const user = userEvent.setup()
    const first = render(<PlotOrderToggle />)
    await user.click(screen.getByRole('button', { name: 'In story' }))
    first.unmount()
    render(<PlotOrderToggle />)
    expect(screen.getByRole('button', { name: 'In story' }).getAttribute('aria-pressed')).toBe('true')
  })
})
