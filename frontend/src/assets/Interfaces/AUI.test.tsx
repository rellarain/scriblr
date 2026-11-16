import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../settings/settingsStore'
import AUI from './AUI'
import { mockFetch } from '../../test/mockFetch'

// The Office's tiles (covered by OfficeTiles.test.tsx): each shows its name, and puts its tabs in the slot it is given.
vi.mock('./admin/office/OfficeTiles', async () => {
  const { createPortal } = await import('react-dom')
  const make = (name: string) => function Tile({ host }: { host: HTMLElement | null }) {
    return <>{host && createPortal(<span>{name} tabs</span>, host)}<div>{name} tile</div></>
  }
  return { SiteTile: make('site'), DepartmentTile: make('department'), TeamTile: make('team'), ChannelTile: make('channel'), DeskTile: make('desk'), StaffTile: make('staff'), UserTile: make('user') }
})
vi.mock('./admin/plan/PlanPages', () => ({ NodePlanPage: () => <div>plan page</div>, MyWorkPage: () => <div>my work page</div>, TimelinePage: () => <div>timeline page</div>, BoardPage: () => <div>board page</div> }))
// Resources' own internals (its tree, backend calls) are covered by
// useResources.test.ts and its own component tests -- mocked here so this
// file only exercises AUI's own section/page tile layout.
vi.mock('./admin/resources/ResourcesConsole', () => ({ default: () => <div>resources console</div> }))
// The plot presets page (covered by its own tests) is mocked for the same reason.
vi.mock('./admin/instructor/InstructorConsole', () => ({ default: () => <div>instructor console</div> }))
vi.mock('./admin/plot/PlotPresetsConsole', () => ({ default: () => <div>plot presets console</div> }))
vi.mock('./admin/characters/DesignerConsole', () => ({ default: (p: { tools?: string }) => <div>character models console ({p.tools ?? 'all'})</div> }))
vi.mock('./admin/characters/WriterLimitsConsole', () => ({ default: () => <div>writer limits console</div> }))
vi.mock('./admin/channels/ChannelsConsole', () => ({ default: () => <div>channels console</div> }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
})
afterEach(() => { vi.unstubAllGlobals() })

const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement
const SECTIONS = ['dashboard', 'projectPlan', 'organizer', 'office', 'configuration', 'designer', 'resources', 'instructor']

describe('AUI (the Admin panel as tiles)', () => {
  it('shows the eight sections as consoles with their pages as tiles, and every section Help text in the Help console', async () => {
    render(<AUI />)
    expect(SECTIONS.map(id => tile(id)?.getAttribute('data-tile-id'))).toEqual(SECTIONS)
    expect(within(tile('office')).getByText('Desk')).toBeTruthy()
    // Help is a console of its own, not a tile of a section.
    expect(within(tile('office')).queryByText(/The Office has seven tiles/)).toBeNull()
    expect(await within(tile('help')).findByText(/The Office has seven tiles/)).toBeTruthy()
    expect(within(tile('help')).getByText(/using the Project Plan console/)).toBeTruthy()
  })

  it('has the seven Office tiles, a Project Plan in place of the Processor and a house for the Dashboard', () => {
    render(<AUI />)
    for (const gone of ['processor', 'manager', 'director']) expect(tile(gone)).toBeNull()
    const tabs = (id: string, name: string) =>
      within(within(tile(id).querySelector('.gtTitle') as HTMLElement).getByRole('toolbar', { name: `${name} tiles tabs` }))
        .getAllByRole('button').map(b => b.getAttribute('aria-label'))
    expect(tabs('office', 'Office')).toEqual(['Site', 'Department', 'Team', 'Channel', 'Desk', 'Admin/Helper', 'User'])
    for (const name of ['site', 'department', 'team', 'channel', 'desk', 'staff', 'user']) expect(within(tile('office')).getByText(`${name} tile`)).toBeTruthy()
    // the Organizer keeps only Bookclub Management
    expect(within(tile('organizer')).getByText('Manage bookclubs here.')).toBeTruthy()
    expect(within(tile('projectPlan')).getByRole('heading', { name: /Project Plan/ })).toBeTruthy()
    for (const page of ['plan page', 'my work page', 'timeline page', 'board page']) expect(within(tile('projectPlan')).getByText(page)).toBeTruthy()
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

  it("puts each Office tile's tabs in its own title bar", () => {
    render(<AUI />)
    const ids: Array<[string, string]> = [['officeSite', 'site'], ['officeDepartment', 'department'], ['officeTeam', 'team'], ['officeChannel', 'channel'], ['officeDesk', 'desk'], ['officeStaff', 'staff'], ['officeUser', 'user']]
    for (const [id, name] of ids) {
      const title = tile(id).querySelector('.gtTitle') as HTMLElement
      expect(within(title).getByText(`${name} tabs`)).toBeTruthy()
      expect(within(tile(id).querySelector('.gtBody') as HTMLElement).queryByText(`${name} tabs`)).toBeNull()
    }
  })

  it('shows Configuration > Plot as the plot presets page, without a second heading above it', async () => {
    render(<AUI />)
    expect(within(tile('configuration')).getByText('Overview')).toBeTruthy()
    const plot = within(tile('configuration')).getByRole('region', { name: 'Plot' })
    expect(await within(plot).findByText('plot presets console')).toBeTruthy()
    expect(plot.querySelector('h2')).toBeNull()
  })

  it('shows Configuration > Channels as the channel list editor', async () => {
    render(<AUI />)
    const channels = within(tile('configuration')).getByRole('region', { name: 'Channels' })
    expect(await within(channels).findByText('channels console')).toBeTruthy()
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
    await user.click(within(pages).getByRole('button', { name: 'Desk' }))
    expect(tile('officeDesk')).toBeNull()
    await user.click(within(bar).getByRole('button', { name: 'Office' }))
    expect(tile('office')).toBeNull()
  })
})
