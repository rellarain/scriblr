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
vi.mock('./admin/instructor/InstructorConsole', () => ({ default: () => <div>instructor console</div> }))
vi.mock('./admin/plot/PlotPresetsConsole', () => ({ default: () => <div>plot presets console</div> }))
vi.mock('./admin/characters/DesignerConsole', () => ({ default: () => <div>character models console</div> }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
})
afterEach(() => { vi.unstubAllGlobals() })

const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement
const SECTIONS = ['dashboard', 'processor', 'organizer', 'manager', 'director', 'office', 'configuration', 'designer', 'resources', 'instructor']

describe('AUI (the Admin panel as tiles)', () => {
  it('shows the ten sections as consoles with their pages as tiles, and every section Help text in the Help console', () => {
    render(<AUI />)
    expect(SECTIONS.map(id => tile(id)?.getAttribute('data-tile-id'))).toEqual(SECTIONS)
    expect(within(tile('manager')).getByText('Assignment')).toBeTruthy()
    // Help is a console of its own, not a tile of a section.
    expect(within(tile('manager')).queryByText(/using the Manager console/)).toBeNull()
    expect(within(tile('help')).getByText(/using the Manager console/)).toBeTruthy()
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

  it('shows the Designer as a console of its own beside Configuration, with a slot in its title bar for the console tools', async () => {
    render(<AUI />)
    expect(within(tile('designer')).getByRole('heading', { name: /Designer/ })).toBeTruthy()
    expect(await within(tile('designer')).findByText('character models console')).toBeTruthy()
    expect(tile('designer').querySelector('.gtTitle .gtRailSlot--tools')).not.toBeNull()
    // it left Configuration: the characters page is not one of that console's tiles any more
    expect(within(tile('configuration')).queryByRole('region', { name: 'Characters' })).toBeNull()
    expect(screen.getByRole('toolbar', { name: 'Admin panel consoles tabs' }).querySelector('[aria-label="Designer"]')).not.toBeNull()
  })

  it('shows Resources as the article/quiz builder', async () => {
    render(<AUI />)
    expect(await within(tile('resources')).findByText('resources console')).toBeTruthy()
  })

  it('shows Instructor as the Training builder', async () => {
    render(<AUI />)
    expect(await within(tile('instructor')).findByText('instructor console')).toBeTruthy()
  })

  it('has a rail of consoles in the header (Help last) and a rail of tiles in each console title bar, to turn a tile off and on', async () => {
    const user = userEvent.setup()
    render(<AUI />)
    const bar = screen.getByRole('toolbar', { name: 'Admin panel consoles tabs' })
    expect(within(bar).getAllByRole('button')).toHaveLength(SECTIONS.length + 1)
    expect(within(bar).getAllByRole('button').at(-1)?.getAttribute('aria-label')).toBe('Help')
    const pages = within(tile('manager').querySelector('.gtTitle') as HTMLElement).getByRole('toolbar', { name: 'Manager tiles tabs' })
    expect(within(pages).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Allotment', 'Assignment', 'Team Schedule'])
    await user.click(within(pages).getByRole('button', { name: 'Assignment' }))
    expect(tile('assignment')).toBeNull()
    await user.click(within(bar).getByRole('button', { name: 'Office' }))
    expect(tile('office')).toBeNull()
  })
})
