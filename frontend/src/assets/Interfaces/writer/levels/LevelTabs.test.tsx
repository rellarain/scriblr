import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { CalendarIcon, PencilIcon, GearIcon } from '../../../icons'
import { useTabbedLevel, type LevelTab } from './LevelTabs'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

const tabs: LevelTab[] = [
  { id: 'one', label: 'One', Icon: CalendarIcon, searchable: true, render: c => <div>one body [{c.query}]</div> },
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

  it('opens the default tiles at Max, side by side on a split grid, and toggles a tile with its tab', async () => {
    const user = userEvent.setup()
    render(<Harness size="max" />)
    const tile = (name: string) => screen.getByRole('region', { name }) as HTMLElement
    expect(parseFloat(tile('One').style.left)).toBe(0)
    expect(parseFloat(tile('Two').style.left)).toBeGreaterThan(0)
    expect(parseFloat(tile('One').style.top)).toBe(parseFloat(tile('Two').style.top))

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(tile('Settings')).toBeTruthy() // the third tile joins the grid
    await user.click(screen.getByRole('button', { name: 'One' }))
    expect(screen.queryByRole('region', { name: 'One' })).toBeNull()
    expect(screen.getByRole('button', { name: 'One' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('gives a lone open tile the whole area, and tells tiles which size they are drawn at', async () => {
    const user = userEvent.setup()
    const sized: LevelTab[] = [{ id: 'a', label: 'A', Icon: CalendarIcon, render: c => <div>a at {c.size}</div> }, { id: 'b', label: 'B', Icon: PencilIcon, render: () => <div>b</div> }]
    function Sized() {
      const t = useTabbedLevel({ storageKey: 'test.sized', tabs: sized, size: 'max', defaultOpen: ['a'] })
      return <div><header>{t.headerExtras}</header><main>{t.body}</main></div>
    }
    render(<Sized />)
    const only = screen.getByRole('region', { name: 'A' }) as HTMLElement
    expect(parseFloat(only.style.width)).toBe(1000)
    expect(document.querySelector('[role="separator"]')).toBeNull()
    expect(screen.getByText('a at max')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'B' }))
    expect(parseFloat((screen.getByRole('region', { name: 'A' }) as HTMLElement).style.width)).toBeLessThan(1000)
    expect(document.querySelector('[role="separator"]')).toBeTruthy()
  })

  it('lets the open tiles be moved by their title bars and resized by their divider, remembered across a remount', () => {
    const first = render(<Harness size="max" />)
    const tile = (name: string) => screen.getByRole('region', { name }) as HTMLElement
    const twoLeft = parseFloat(tile('Two').style.left)
    const data = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('One').querySelector('.wrTabTileTitle')!, { dataTransfer: data })
    fireEvent.dragOver(tile('Two'), { dataTransfer: data })
    fireEvent.drop(tile('Two'), { dataTransfer: data })
    expect(parseFloat(tile('One').style.left)).toBe(twoLeft)
    expect(parseFloat(tile('Two').style.left)).toBe(0)
    const divider = document.querySelector('[role="separator"]') as HTMLElement
    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    const saved = { oneLeft: parseFloat(tile('One').style.left), twoWidth: parseFloat(tile('Two').style.width) }
    first.unmount()
    render(<Harness size="max" />)
    expect(parseFloat(tile('One').style.left)).toBe(saved.oneLeft)
    expect(parseFloat(tile('Two').style.left)).toBe(0)
    expect(parseFloat(tile('Two').style.width)).toBe(saved.twoWidth)
  })

  it('has no New (add) button in the header: a tab adds things from its own body', () => {
    render(<Harness size="mid" />)
    expect(screen.queryByRole('button', { name: /^new\b/i })).toBeNull()
    expect(document.querySelector('.wrQuickActions .wrTabBtn[aria-label^="New"]')).toBeNull()
  })

  it('offers Search only on the tabs that have it, and filters through the search box', async () => {
    const user = userEvent.setup()
    render(<Harness size="mid" />)
    await user.click(screen.getByRole('button', { name: 'Search this tab' }))
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'Harbor')
    expect(screen.getByText('one body [harbor]')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Two' }))
    expect(screen.queryByRole('button', { name: 'Search this tab' })).toBeNull()
  })

  it('keeps the header actions (Save) with the tabs', () => {
    render(<Harness size="max" />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })
})
