import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { CalendarIcon, PencilIcon, GearIcon } from '../../../icons'
import { useTabbedLevel, type LevelTab } from './LevelTabs'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  onNew.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

const onNew = vi.fn()
const tabs: LevelTab[] = [
  { id: 'one', label: 'One', Icon: CalendarIcon, newLabel: 'New one', onNew, searchable: true, render: c => <div>one body [{c.query}] #{c.newTick}</div> },
  { id: 'two', label: 'Two', Icon: PencilIcon, render: () => <div>two body</div> },
  { id: 'set', label: 'Settings', Icon: GearIcon, end: true, render: () => <div>settings body</div> },
]

function Harness({ size }: { size: 'min' | 'mid' | 'max' }) {
  const t = useTabbedLevel({ storageKey: 'test.level', tabs, size, defaultOpen: ['one', 'two'], save: <button type="button">Save</button> })
  return <div><header>{t.headerExtras}</header><main>{t.body}</main></div>
}

describe('useTabbedLevel', () => {
  it('shows nothing at Min', () => {
    render(<Harness size="min" />)
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(screen.queryByText(/body/)).toBeNull()
  })

  it('shows one tab at a time at Mid, the first to start with', async () => {
    const user = userEvent.setup()
    render(<Harness size="mid" />)
    expect(screen.getByText(/one body/)).toBeTruthy()
    expect(screen.queryByText('two body')).toBeNull()
    expect(screen.getByRole('button', { name: 'One' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Two' }))
    expect(screen.getByText('two body')).toBeTruthy()
    expect(screen.queryByText(/one body/)).toBeNull()
  })

  it('remembers the tab across a remount', async () => {
    const user = userEvent.setup()
    const first = render(<Harness size="mid" />)
    await user.click(screen.getByRole('button', { name: 'Two' }))
    first.unmount()
    render(<Harness size="mid" />)
    expect(screen.getByText('two body')).toBeTruthy()
  })

  it('opens the default tiles at Max, in two columns, and toggles a tile with its tab', async () => {
    const user = userEvent.setup()
    render(<Harness size="max" />)
    const columns = document.querySelectorAll<HTMLElement>('.wrTabColumn')
    expect(columns.length).toBe(2)
    expect(within(columns[0]).getByRole('region', { name: 'One' })).toBeTruthy()
    expect(within(columns[1]).getByRole('region', { name: 'Two' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(within(columns[0]).getByRole('region', { name: 'Settings' })).toBeTruthy() // the third tile starts the first column again
    await user.click(screen.getByRole('button', { name: 'One' }))
    expect(screen.queryByRole('region', { name: 'One' })).toBeNull()
    expect(screen.getByRole('button', { name: 'One' }).getAttribute('aria-pressed')).toBe('false')
  })

  it("tells the current tab that New was pressed, and runs the tab's own action", async () => {
    const user = userEvent.setup()
    render(<Harness size="mid" />)
    await user.click(screen.getByRole('button', { name: 'New one' }))
    expect(screen.getByText(/#1/)).toBeTruthy()
    expect(onNew).toHaveBeenCalledOnce()
  })

  it('offers New and Search only on the tabs that have them, and filters through the search box', async () => {
    const user = userEvent.setup()
    render(<Harness size="mid" />)
    await user.click(screen.getByRole('button', { name: 'Search this tab' }))
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'Harbor')
    expect(screen.getByText('one body [harbor] #0')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Two' }))
    expect(screen.queryByRole('button', { name: 'New one' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Search this tab' })).toBeNull()
  })

  it('keeps the header actions (Save) with the tabs', () => {
    render(<Harness size="max" />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })
})
