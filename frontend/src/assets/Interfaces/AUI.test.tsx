import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../settings/settingsStore'
import AUI from './AUI'
import { mockFetch } from '../../test/mockFetch'

vi.mock('./admin/RoleAssignment', () => ({ default: () => <div>role assignment</div> }))
// Resources' own internals (its tree, backend calls) are covered by
// useResources.test.ts and its own component tests -- mocked here so this
// file only exercises AUI's own section/page tile layout.
vi.mock('./admin/resources/ResourcesConsole', () => ({ default: () => <div>resources console</div> }))
// The plot presets page (covered by its own tests) is mocked for the same reason.
vi.mock('./admin/plot/PlotPresetsConsole', () => ({ default: () => <div>plot presets console</div> }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
})
afterEach(() => { vi.unstubAllGlobals() })

const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement
const SECTIONS = ['dashboard', 'processor', 'organizer', 'manager', 'director', 'office', 'configuration', 'resources']

describe('AUI (the Admin panel as tiles)', () => {
  it('shows the eight sections as tiles with their pages, and each section Help text in it', () => {
    render(<AUI />)
    expect(SECTIONS.map(id => tile(id)?.getAttribute('data-tile-id'))).toEqual(SECTIONS)
    expect(within(tile('manager')).getByText('Assignment')).toBeTruthy()
    expect(within(tile('manager')).getByText(/using the Manager console/)).toBeTruthy()
  })

  it('shows the role assignment editor in the Manager tile', () => {
    render(<AUI />)
    expect(within(tile('manager')).getByText('role assignment')).toBeTruthy()
  })

  it('shows Configuration > Plot as the plot presets page, without a second heading above it', async () => {
    render(<AUI />)
    expect(within(tile('configuration')).getByText('Overview')).toBeTruthy()
    const plot = within(tile('configuration')).getByRole('region', { name: 'Plot' })
    expect(await within(plot).findByText('plot presets console')).toBeTruthy()
    expect(plot.querySelector('h2')).toBeNull()
  })

  it('shows Resources as the article/quiz builder', async () => {
    render(<AUI />)
    expect(await within(tile('resources')).findByText('resources console')).toBeTruthy()
  })

  it('has a tab bar with an icon per tile, to minimize and bring back a tile', async () => {
    const user = userEvent.setup()
    render(<AUI />)
    const bar = screen.getByRole('toolbar', { name: 'Admin panel tiles tabs' })
    expect(within(bar).getAllByRole('button')).toHaveLength(SECTIONS.length)
    await user.click(within(bar).getByRole('button', { name: 'Office' }))
    expect(tile('office')).toBeNull()
  })
})
