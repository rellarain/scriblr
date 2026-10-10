import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as resourcesApi from '../../../../api/resourcesApi'
import { __resetSettingsForTests, getKv } from '../../../../settings/settingsStore'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { useDashTabs } from './dashTabs'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
  vi.spyOn(resourcesApi, 'getResources').mockResolvedValue({ schemaVersion: 1, nodes: [], content: {}, assessments: {} })
})

const w = { projects: [{ projectId: 'p1', title: 'Saga' }], projectOutlines: { p1: [] } } as unknown as WriterWorkspace

function Harness({ size }: { size: 'mid' | 'max' }) {
  const t = useDashTabs(w, size)
  return <div><header>{t.headerExtras}</header><main>{t.body}</main></div>
}

describe('the Dash tabs', () => {
  it('are schedule, checklist, analytics, scratchpad and the project template, ending with Settings and Help', () => {
    render(<Harness size="max" />)
    const names = within(screen.getByRole('toolbar', { name: 'Tabs' })).getAllByRole('button').map(b => b.getAttribute('aria-label'))
    expect(names).toEqual(['Schedule', 'Checklist', 'Analytics', 'Scratchpad', 'Project template', 'Settings', 'Help'])
  })

  it('open the schedule and the scratchpad side by side at Max', () => {
    render(<Harness size="max" />)
    expect(screen.getByRole('region', { name: 'Schedule' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Scratchpad' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Checklist' })).toBeNull()
  })

  it("add a task from the Checklist tab's own add box (the header has no New button)", async () => {
    const user = userEvent.setup()
    render(<Harness size="mid" />)
    await user.click(screen.getByRole('button', { name: 'Checklist' }))
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull()
    const box = screen.getByRole('textbox', { name: 'Add a task…' })
    await user.click(box)
    await user.type(box, 'Draft chapter 3{Enter}')
    expect(getKv<Array<{ label: string }>>('scriblr.writer.tasks')![0].label).toBe('Draft chapter 3')
  })

  it('keeps tasks and routines apart', async () => {
    const user = userEvent.setup()
    render(<Harness size="mid" />)
    expect(screen.getByRole('textbox', { name: 'Add a routine…' })).toBeTruthy() // the Schedule tab
    await user.click(screen.getByRole('button', { name: 'Checklist' }))
    expect(screen.queryByRole('textbox', { name: 'Add a routine…' })).toBeNull()
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
