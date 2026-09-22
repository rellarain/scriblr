import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../settings/settingsStore'
import AUI from './AUI'

const saveNow = vi.fn()
vi.mock('./admin/useAuiConfig', () => ({
  useAuiConfig: () => ({
    saveNow, saveStatus: { state: 'saved' }, restoreDraft: vi.fn(), publishing: false, publishTab: vi.fn(), publishError: null,
    publishInfo: () => ({ version: 2, publishedAt: null, unpublished: false }),
  }),
}))
vi.mock('./admin/AuiConfigEditor', () => ({
  default: ({ tab }: { tab: string }) => <div>editor for {tab}</div>,
  AuiConfigReadOnly: ({ tab }: { tab: string }) => <div>read-only tree for {tab}</div>,
}))
vi.mock('./admin/RoleAssignment', () => ({ default: () => <div>role assignment</div> }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  saveNow.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})
afterEach(() => { vi.unstubAllGlobals() })

const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement
const SECTIONS = ['dashboard', 'processor', 'organizer', 'manager', 'director', 'office', 'configuration', 'resources']

describe('AUI (the Admin panel as tiles)', () => {
  it('shows the eight sections as tiles listing their pages, without Help pages', () => {
    render(<AUI size="half" onSetSize={() => {}} />)
    expect(SECTIONS.map(id => tile(id)?.getAttribute('data-tile-id'))).toEqual(SECTIONS)
    expect(within(tile('manager')).getByText('Assignment')).toBeTruthy()
    expect(within(tile('resources')).getByText('Project Plan')).toBeTruthy()
    expect(within(tile('manager')).queryByText('Help')).toBeNull()
  })

  it('keeps the panel-size buttons in a slim rail', async () => {
    const onSetSize = vi.fn()
    const user = userEvent.setup()
    render(<AUI size="half" onSetSize={onSetSize} />)
    const rail = screen.getByRole('navigation', { name: 'Admin panel size' })
    expect(within(rail).getByRole('button', { name: 'Half screen' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(rail).getByRole('button', { name: 'Single column' }))
    expect(onSetSize).toHaveBeenCalledWith('column')
  })

  it('opens a page: its text, the role assignment editor, and Help at the corner', async () => {
    const user = userEvent.setup()
    render(<AUI size="full" onSetSize={() => {}} />)
    await user.click(within(tile('manager')).getByRole('button', { name: 'Manager' }))
    const manager = screen.getByRole('region', { name: 'Manager' })
    await user.click(within(manager).getByRole('button', { name: 'Assignment' }))
    expect(within(screen.getByRole('region', { name: 'Assignment' })).getByText('role assignment')).toBeTruthy()
    await user.click(within(screen.getByRole('region', { name: 'Assignment' })).getByRole('button', { name: 'Help' }))
    expect(within(screen.getByRole('region', { name: 'Help' })).getByText(/using the Manager console/)).toBeTruthy()
  })

  it('shows a config page read-only with its publish badge and lock, and saves when it is left', async () => {
    const user = userEvent.setup()
    render(<AUI size="full" onSetSize={() => {}} />)
    await user.click(within(tile('resources')).getByRole('button', { name: 'Resources' }))
    await user.click(within(screen.getByRole('region', { name: 'Resources' })).getByRole('button', { name: 'User' }))
    const page = screen.getByRole('region', { name: 'User' })
    expect(within(page).getByText('read-only tree for userPageConfig')).toBeTruthy()
    expect(within(page).getByText('Published v2')).toBeTruthy()

    await user.click(within(page).getByRole('button', { name: /Read-only -- click to enable editing/ }))
    expect(within(page).getByText('editor for userPageConfig')).toBeTruthy()
    expect(within(page).getByRole('button', { name: 'Publish' })).toBeTruthy()

    saveNow.mockClear()
    await user.click(within(page).getByRole('button', { name: 'Back to tiles' }))
    expect(saveNow).toHaveBeenCalled()
  })
})
