import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../settings/settingsStore'
import AUI from './AUI'

vi.mock('./admin/RoleAssignment', () => ({ default: () => <div>role assignment</div> }))
// Resources' own internals (its tree, backend calls) are covered by
// useResources.test.ts and its own component tests -- mocked here so this
// file only exercises AUI's own section/page tile layout.
vi.mock('./admin/resources/ResourcesConsole', () => ({ default: () => <div>resources console</div> }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})
afterEach(() => { vi.unstubAllGlobals() })

const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement
const SECTIONS = ['dashboard', 'processor', 'organizer', 'manager', 'director', 'office', 'configuration', 'resources']

describe('AUI (the Admin panel as tiles)', () => {
  it('shows the eight sections as tiles listing their pages, without Help pages', () => {
    render(<AUI />)
    expect(SECTIONS.map(id => tile(id)?.getAttribute('data-tile-id'))).toEqual(SECTIONS)
    expect(within(tile('manager')).getByText('Assignment')).toBeTruthy()
    expect(within(tile('manager')).queryByText('Help')).toBeNull()
  })

  it('opens a page: its text, the role assignment editor, and Help at the corner', async () => {
    const user = userEvent.setup()
    render(<AUI />)
    await user.click(within(tile('manager')).getByRole('button', { name: 'Open Manager' }))
    const manager = screen.getByRole('region', { name: 'Manager' })
    await user.click(within(manager).getByRole('button', { name: 'Open Assignment' }))
    expect(within(screen.getByRole('region', { name: 'Assignment' })).getByText('role assignment')).toBeTruthy()
    await user.click(within(screen.getByRole('region', { name: 'Assignment' })).getByRole('button', { name: 'Help' }))
    expect(within(screen.getByRole('region', { name: 'Help' })).getByText(/using the Manager console/)).toBeTruthy()
  })

  it('opens Resources straight into the article/quiz builder, with its own Help text', async () => {
    const user = userEvent.setup()
    render(<AUI />)
    expect(within(tile('resources')).getByText(/Exam\/Test\/Quiz/)).toBeTruthy()
    await user.click(within(tile('resources')).getByRole('button', { name: 'Open Resources' }))
    const resources = screen.getByRole('region', { name: 'Resources' })
    expect(within(resources).getByText('resources console')).toBeTruthy()
    await user.click(within(resources).getByRole('button', { name: 'Help' }))
    expect(within(screen.getByRole('region', { name: 'Help' })).getByText(/Guides, Tutorials, FAQs/)).toBeTruthy()
  })
})
