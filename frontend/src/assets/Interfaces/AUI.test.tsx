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
vi.mock('./admin/characters/DesignerConsole', () => ({ default: (p: { tools?: string }) => <div>character models console ({p.tools ?? 'all'})</div> }))
vi.mock('./admin/characters/WriterLimitsConsole', () => ({ default: () => <div>writer limits console</div> }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
})
afterEach(() => { vi.unstubAllGlobals() })

const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement
const SECTIONS = ['dashboard', 'projectPlan', 'organizer', 'office', 'configuration', 'designer', 'resources', 'instructor']

describe('AUI (the Admin panel as tiles)', () => {
  it('shows the eight sections as consoles with their pages as tiles, and every section Help text in the Help console', () => {
    render(<AUI />)
    expect(SECTIONS.map(id => tile(id)?.getAttribute('data-tile-id'))).toEqual(SECTIONS)
    expect(within(tile('office')).getByText('Assignment')).toBeTruthy()
    // Help is a console of its own, not a tile of a section.
    expect(within(tile('office')).queryByText(/using the Office console/)).toBeNull()
    expect(within(tile('help')).getByText(/using the Office console/)).toBeTruthy()
    expect(within(tile('help')).getByText(/using the Project Plan console/)).toBeTruthy()
  })

  it('has the Manager and Director pages in the Office, a Project Plan in place of the Processor (its Voting in the Organizer) and a house for the Dashboard', () => {
    render(<AUI />)
    for (const gone of ['processor', 'manager', 'director']) expect(tile(gone)).toBeNull()
    const office = within(within(tile('office').querySelector('.gtTitle') as HTMLElement).getByRole('toolbar', { name: 'Office tiles tabs' }))
    expect(office.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual([
      'Allotment', 'Assignment', 'Team Schedule', 'Department Details', 'Department Roster', 'Department Analytics', 'Department', 'Monitor Training', 'Department Schedules', 'Hire/Term Admin',
    ])
    expect(within(tile('projectPlan')).getByRole('heading', { name: /Project Plan/ })).toBeTruthy()
    expect(within(tile('projectPlan')).getByText(/its phases, milestones and tasks on a timeline/)).toBeTruthy()
    expect(within(tile('organizer')).getByText(/Approve and\/or deny explicated/)).toBeTruthy()
    const bar = screen.getByRole('toolbar', { name: 'Admin panel consoles tabs' })
    // the Dashboard is a house (the Reader's home icon) and the Project Plan bars on a graph
    expect(within(bar).getByRole('button', { name: 'Dashboard' }).querySelector('path')?.getAttribute('d')).toBe('M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6')
    expect(within(bar).getByRole('button', { name: 'Project Plan' }).querySelectorAll('rect')).toHaveLength(3)
  })

  it('sets the tiles of a console 10px apart and 10px from its edge, in a frame of the title bar colour, each tile one colour', () => {
    render(<AUI />)
    const office = tile('office'), body = office.querySelector(':scope > .gtBody') as HTMLElement
    expect(body.classList.contains('gtBody--framed')).toBe(true)
    const pages = [...office.querySelectorAll<HTMLElement>('.gtBody [data-tile-id]')]
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.every(p => p.classList.contains('gtTile--even'))).toBe(true)
    // the first tile starts 10px in from the console's edge, and the stage leaves 10px past the last one
    expect(pages[0].style.left).toBe('10px')
    expect(pages[0].style.top).toBe('10px')
    const stage = office.querySelector('.gtStage') as HTMLElement, last = pages[pages.length - 1]
    expect(parseFloat(stage.style.height) - (parseFloat(last.style.top) + parseFloat(last.style.height))).toBe(10)
    // the Designer, Resources and Instructor are not consoles of tiles, and other panels keep the grid as it was
    expect(tile('designer').querySelector('.gtBody--framed')).toBeNull()
  })

  it('shows the role assignment editor in the Office tile', () => {
    render(<AUI />)
    expect(within(tile('office')).getByText('role assignment')).toBeTruthy()
  })

  it('shows Configuration > Plot as the plot presets page, without a second heading above it', async () => {
    render(<AUI />)
    expect(within(tile('configuration')).getByText('Overview')).toBeTruthy()
    const plot = within(tile('configuration')).getByRole('region', { name: 'Plot' })
    expect(await within(plot).findByText('plot presets console')).toBeTruthy()
    expect(plot.querySelector('h2')).toBeNull()
  })

  it("leaves out Configuration > Writers' designer while the writers' own designer is off the screen", () => {
    render(<AUI />)
    expect(within(tile('configuration')).queryByRole('region', { name: "Writers' designer" })).toBeNull()
  })

  it('shows the Designer as a console of its own beside Configuration, with a slot in its title bar for the console tools', async () => {
    render(<AUI />)
    expect(within(tile('designer')).getByRole('heading', { name: /Designer/ })).toBeTruthy()
    // the Designer is only a shape editor for now
    expect(await within(tile('designer')).findByText('character models console (shapes)')).toBeTruthy()
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
    const pages = within(tile('office').querySelector('.gtTitle') as HTMLElement).getByRole('toolbar', { name: 'Office tiles tabs' })
    await user.click(within(pages).getByRole('button', { name: 'Assignment' }))
    expect(tile('assignment')).toBeNull()
    await user.click(within(bar).getByRole('button', { name: 'Office' }))
    expect(tile('office')).toBeNull()
  })
})
