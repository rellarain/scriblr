import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as resourcesApi from '../../../../api/resourcesApi'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { useDashTabs } from './dashTabs'
import { mockFetch } from '../../../../test/mockFetch'
import { makeWorkspace, type WorkspaceOverrides } from '../../../../test/makeWorkspace'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
  vi.spyOn(resourcesApi, 'getResources').mockResolvedValue({ schemaVersion: 1, nodes: [], content: {}, assessments: {} })
})

const w = makeWorkspace({ projects: [{ projectId: 'p1', title: 'Saga' }], projectOutlines: { p1: [] }, projectHueOf: () => 200 })

function Harness({ size }: { size: 'mid' | 'max' }) {
  const t = useDashTabs(w, size)
  return <div><header>{t.headerExtras}</header><main>{t.body}</main></div>
}

describe('the Dash tabs', () => {
  it('are schedule (the agenda and analytics are in it), readers, scratchpad and the project, ending with Settings and Help', () => {
    render(<Harness size="max" />)
    const names = within(screen.getByRole('toolbar', { name: 'Tabs' })).getAllByRole('button').map(b => b.getAttribute('aria-label'))
    expect(names).toEqual(['Schedule', 'Readers', 'Scratchpad', 'Project', 'Settings', 'Help'])
  })

  it('open the schedule alone at Max, with the full width for its tiles, and the scratchpad beside it from its tab', async () => {
    const user = userEvent.setup()
    render(<Harness size="max" />)
    expect(screen.getAllByRole('region', { name: 'Schedule' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('region', { name: 'Scratchpad' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Checklist' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Scratchpad' }))
    expect(screen.getByRole('region', { name: 'Scratchpad' })).toBeTruthy()
  })

  it('puts goals, the agenda, the backlog and analytics (with the activity and the review in it) in a tile each at Max', () => {
    render(<Harness size="max" />)
    const tiles = Array.from(document.querySelectorAll('[data-tile-id]')).map(t => t.getAttribute('data-tile-id'))
    expect(tiles).toEqual(expect.arrayContaining(['goals', 'schedule', 'backlog', 'analytics']))
    // The backlog is its own tile, not part of the schedule's.
    const schedule = Array.from(document.querySelectorAll('[data-tile-id="schedule"]')).at(-1) as HTMLElement // the console's own (the Dash's tile of that name holds it)
    const backlog = document.querySelector('[data-tile-id="backlog"]') as HTMLElement
    expect(within(backlog).getByRole('textbox', { name: 'New task' })).toBeTruthy()
    expect(within(schedule).queryByRole('textbox', { name: 'New task' })).toBeNull()
    expect(schedule.contains(backlog)).toBe(false)
  })

  it('shows today and the counts at Mid', () => {
    render(<Harness size="mid" />)
    expect(screen.getByText(/Open this tab at full size/)).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'New task' })).toBeNull()
  })

  it('search the scratchpad notes', async () => {
    const user = userEvent.setup()
    render(<Harness size="mid" />)
    await user.click(screen.getByRole('button', { name: 'Scratchpad' }))
    expect(screen.queryByRole('button', { name: 'New note' })).toBeNull() // the header has no New button
    await user.click(screen.getByRole('button', { name: 'Note' })) // the tab's own
    await waitFor(() => expect(document.activeElement?.getAttribute('placeholder')).toBe('Title'))
    const first = document.activeElement
    await user.keyboard('Storm scene')
    await user.click(screen.getByRole('button', { name: 'Note' }))
    // The focus moves to the new note's title (not just away from the first: it passes through the body while it moves).
    await waitFor(() => { expect(document.activeElement).not.toBe(first); expect(document.activeElement?.getAttribute('placeholder')).toBe('Title') })
    await user.keyboard('Harbor map')
    expect(screen.getAllByPlaceholderText('Title').length).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Search this tab' }))
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'harbor')
    const titles = screen.getAllByPlaceholderText('Title') as HTMLInputElement[]
    expect(titles.map(t => t.value)).toEqual(['Harbor map'])
  })

  it('show the theme settings and the help articles', async () => {
    const user = userEvent.setup()
    render(<Harness size="mid" />)
    await user.click(screen.getByRole('button', { name: 'Help' }))
    expect(await screen.findByText(/The Dash is your desk/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('region', { name: 'Settings' })).toBeTruthy()
  })
})
