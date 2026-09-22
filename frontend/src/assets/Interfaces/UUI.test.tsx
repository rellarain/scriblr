import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../settings/settingsStore'
import UUI from './UUI'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})
afterEach(() => { vi.unstubAllGlobals() })

const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement

describe('UUI (the User panel as tiles)', () => {
  it('shows Dashboard, Account and Training as section tiles listing their pages', () => {
    render(<UUI />)
    expect(['dashboard', 'account', 'training'].map(id => tile(id).getAttribute('data-shape'))).toEqual(['landscape', 'landscape', 'landscape'])
    expect(within(tile('dashboard')).getByText('Activity Log')).toBeTruthy()
    expect(within(tile('account')).getByText('Portfolio')).toBeTruthy()
    expect(within(tile('training')).getByText('Admin Training')).toBeTruthy()
    // Settings and Help are no longer sub-pages or tabs.
    expect(screen.queryByText('Help')).toBeNull()
  })

  it('expands a section into its pages as child tiles, which expand into their editors', async () => {
    const user = userEvent.setup()
    render(<UUI />)
    await user.click(within(tile('account')).getByRole('button', { name: 'Account' }))
    const account = screen.getByRole('region', { name: 'Account' })
    expect(['profile', 'subscription', 'portfolio'].map(id => within(account).getByRole('group', { name: id[0].toUpperCase() + id.slice(1) }).getAttribute('data-tile-id'))).toEqual(['profile', 'subscription', 'portfolio'])
    await user.click(within(account).getByRole('button', { name: 'Profile' }))
    const profile = screen.getByRole('region', { name: 'Profile' })
    expect(within(profile).getByText('Manage your profile details here.', { selector: 'p' })).toBeTruthy()
    expect(within(profile).getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('User › Account › Profile')
  })

  it('has the section switcher as a strip of mini tiles', async () => {
    const user = userEvent.setup()
    render(<UUI />)
    await user.click(within(tile('dashboard')).getByRole('button', { name: 'Dashboard' }))
    const strip = screen.getAllByRole('tablist', { name: 'Tiles' })[0]
    expect(within(strip).getAllByRole('tab').map(t => t.textContent?.trim())).toEqual(['Dashboard', 'Account', 'Training'])
    await user.click(within(strip).getByRole('tab', { name: /Training/ }))
    expect(screen.getByRole('region', { name: 'Training' })).toBeTruthy()
  })

  it('puts Account settings at the corner, and its theme pointer opens the Dashboard with its Settings showing', async () => {
    const user = userEvent.setup()
    render(<UUI />)
    await user.click(within(tile('account')).getByRole('button', { name: 'Account' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const settings = screen.getByRole('region', { name: 'Settings' })
    expect(within(settings).getByRole('button', { name: /Handedness/ })).toBeTruthy()
    await user.click(within(settings).getByRole('button', { name: 'Open theme settings' }))
    expect(screen.getByRole('region', { name: 'Dashboard' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Settings' })).getByText('Change theme by time of day')).toBeTruthy()
  })

  it('has Help text for a section at the corner', async () => {
    const user = userEvent.setup()
    render(<UUI />)
    await user.click(within(tile('training')).getByRole('button', { name: 'Training' }))
    await user.click(screen.getByRole('button', { name: 'Help' }))
    expect(within(screen.getByRole('region', { name: 'Help' })).getByText(/using the Training console/)).toBeTruthy()
  })
})
