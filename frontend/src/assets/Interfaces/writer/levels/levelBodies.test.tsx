import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyPlanner, newPhase, type Planner } from '../../../../lib/facets'
import { setKv } from '../../../../settings/settingsStore'
import { mockFetchBy } from '../../../../test/mockFetch'
import { TEMPLATE_KEY } from '../plan/useTemplate'
import { fillColorCss } from '../../../../theme/bookColors'
import { makeWorkspace, type WorkspaceOverrides } from '../../../../test/makeWorkspace'
import { ProjectMin, ProjectTiles } from './levelBodies'

// The project shelves beside the Dash: one tile per project.

const DEFAULT_HUE = 300
const project = (projectId: string, title: string, themeHue?: number) => ({ projectId, title, settings: themeHue === undefined ? {} : { themeHue } })

function tiles(projects: Array<ReturnType<typeof project>>, over: WorkspaceOverrides = {}) {
  return makeWorkspace({
    projects, projectsStatus: 'idle', projectOutlines: {}, projectProgress: {}, activeProjectId: null, activeBookId: null,
    // (The workspace's own rule: a project's colour, else the default.)
    projectHueOf: (p: { settings: { themeHue?: number | null } }) => p.settings.themeHue ?? DEFAULT_HUE,
    ...over,
  } as WorkspaceOverrides)
}
const fills = () => Array.from(document.querySelectorAll<HTMLElement>('.wrProjectTile')).map(t => t.style.getPropertyValue('--wr-fill'))

describe('ProjectTiles: the colour of each shelf', () => {
  it('is its own project\'s colour, and the default for a project that has none', () => {
    render(<ProjectTiles w={tiles([project('a', 'Alpha', 200), project('b', 'Beta', 10), project('c', 'Gamma')])} />)
    expect(fills()).toEqual([fillColorCss(200), fillColorCss(10), fillColorCss(DEFAULT_HUE)])
    expect(new Set(fills()).size).toBe(3)
  })

  it('is not the open project\'s colour: the tiles do not all take the colour of the one that is open', () => {
    render(<ProjectTiles w={tiles([project('a', 'Alpha', 200), project('b', 'Beta', 10)], { activeProjectId: 'a', projectHue: 200 })} />)
    expect(fills()).toEqual([fillColorCss(200), fillColorCss(10)])
  })

  it('follows a change of a project\'s colour', () => {
    const { rerender } = render(<ProjectTiles w={tiles([project('a', 'Alpha', 200), project('b', 'Beta', 10)])} />)
    rerender(<ProjectTiles w={tiles([project('a', 'Alpha', 90), project('b', 'Beta', 10)])} />)
    expect(fills()).toEqual([fillColorCss(90), fillColorCss(10)])
  })
})

describe('ProjectTiles: a new project from the template', () => {
  const template = (): Planner => ({ ...emptyPlanner(), phases: [newPhase('ph', 'Outlining', { offsetDays: 0, lengthDays: 30 }), newPhase('ph2', 'Draft', { offsetDays: 30, lengthDays: 60 })] })
  afterEach(() => { vi.useRealTimers() })

  function setup(withTemplate: boolean) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 1, 12, 0))
    const fetchMock = mockFetchBy(() => ({}))
    if (withTemplate) setKv(TEMPLATE_KEY, template())
    const createProject = vi.fn(async (_title: string, onCreated?: (id: string) => void) => { onCreated?.('new1') })
    render(<ProjectTiles w={tiles([], { createProject })} />)
    const sent = () => fetchMock.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT' && String(c[0]).endsWith('/planner')).map(c => ({ url: String(c[0]), body: JSON.parse(String((c[1] as RequestInit).body)) as Planner }))
    return { createProject, sent }
  }

  it('offers it only when the template has something in it', () => {
    setup(false)
    expect(screen.queryByRole('switch', { name: 'From the template' })).toBeNull()
  })

  it('gives the new project a copy of the template, dated from today, before it is opened', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const { createProject, sent } = setup(true)
    expect((screen.getByRole('switch', { name: 'From the template' }) as HTMLInputElement).checked).toBe(true)
    await user.type(screen.getByPlaceholderText('New project title…'), 'Saga')
    await user.click(screen.getByRole('button', { name: /New project/ }))
    expect(createProject).toHaveBeenCalledWith('Saga', expect.any(Function))
    await waitFor(() => expect(sent()).toHaveLength(1), { timeout: 3000 })
    expect(sent()[0].url).toMatch(/\/projects\/new1\/planner$/)
    expect(sent()[0].body.phases.map(p => [p.title, p.start, p.end])).toEqual([['Outlining', '2026-11-01', '2026-11-30'], ['Draft', '2026-12-01', '2027-01-29']])
  })

  it('makes an empty project when the switch is off', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const { createProject, sent } = setup(true)
    await user.click(screen.getByRole('switch', { name: 'From the template' }))
    await user.type(screen.getByPlaceholderText('New project title…'), 'Saga')
    await user.click(screen.getByRole('button', { name: /New project/ }))
    expect(createProject).toHaveBeenCalledWith('Saga', undefined)
    expect(sent()).toHaveLength(0)
  })
})

describe('ProjectMin: the open project at Min', () => {
  it('shows its books on a shelf with their progress, and the phase and milestones under them', async () => {
    const planner: Planner = { ...emptyPlanner(), phases: [{ ...newPhase('ph', 'Outlining', { start: '2026-10-01', end: '2026-12-01' }), status: 'active' }] }
    mockFetchBy(url => (url.endsWith('/planner') ? planner : {}))
    const book = { id: 'b1', kind: 'book', parentId: null, order: 0, title: 'Cold Harbor', synopsis: '', draftRef: null }
    render(<ProjectMin w={makeWorkspace({
      activeProjectId: 'p1', activeProject: { title: 'Saga' }, activeBookId: 'b1', books: [book], outlineNodes: [book],
      projectProgress: { p1: { b1: 0.5 } }, projectHue: 200, openBook: vi.fn(),
    } as unknown as WorkspaceOverrides)} />)
    expect(screen.getByRole('button', { name: /Cold Harbor/ })).toBeTruthy()
    expect((await screen.findAllByText(/Outlining/)).length).toBeGreaterThan(0)
  })
})
