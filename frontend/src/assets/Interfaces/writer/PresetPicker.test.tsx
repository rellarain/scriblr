import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PublishedPresetOut } from '../../../api/types'
import { mockFetchBy } from '../../../test/mockFetch'
import { PresetPicker } from './PresetPicker'

const published = (id: string, name: string, description = ''): PublishedPresetOut => ({
  id, version: 1, publishedAt: '2026-10-12T09:00:00Z', content: { name, description, keywords: [], fields: ['Name'], subcategories: [] },
})
const LIST = [published('a', 'Characters', 'The people in the story.'), published('b', 'Settings'), published('c', 'Themes', 'What it is about.')]

function setup(list: PublishedPresetOut[] = LIST) {
  const fetchMock = mockFetchBy(() => ({ presets: list }))
  const onChoose = vi.fn()
  render(<PresetPicker onChoose={onChoose} />)
  return { fetchMock, onChoose, user: userEvent.setup() }
}
const opener = () => screen.getByRole('button', { name: 'Preset' })
const rows = () => screen.getAllByRole('menuitem')

describe('the + Preset picker', () => {
  it('is closed until it is asked for, and reads the published presets when it opens', async () => {
    const { fetchMock, user } = setup()
    expect(opener()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(opener())
    expect(opener()).toHaveAttribute('aria-expanded', 'true')
    await screen.findAllByRole('menuitem')
    expect(fetchMock.mock.calls.map(c => c[0])).toEqual(['/api/presets/published'])
  })

  it('says it is loading while the list is on its way', async () => {
    let release: (v: unknown) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { release = resolve })))
    const user = userEvent.setup()
    render(<PresetPicker onChoose={vi.fn()} />)
    await user.click(opener())
    expect(screen.getByRole('status')).toHaveTextContent('Loading presets')
    release({ ok: true, status: 200, json: async () => ({ presets: LIST }) })
    expect(await screen.findAllByRole('menuitem')).toHaveLength(3)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows each preset\'s name, with its description when it has one', async () => {
    const { user } = setup()
    await user.click(opener())
    await screen.findAllByRole('menuitem')
    expect(rows().map(r => r.textContent)).toEqual(['CharactersThe people in the story.', 'Settings', 'ThemesWhat it is about.'])
  })

  it('reads the list again each time it opens, so a preset published since shows up', async () => {
    const { fetchMock, user } = setup()
    await user.click(opener())
    await screen.findAllByRole('menuitem')
    await user.click(opener())
    expect(screen.queryByRole('menu')).toBeNull()
    await user.click(opener())
    await screen.findAllByRole('menuitem')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('adds the chosen preset straight away and closes', async () => {
    const { onChoose, user } = setup()
    await user.click(opener())
    await user.click((await screen.findAllByRole('menuitem'))[1])
    expect(onChoose).toHaveBeenCalledTimes(1)
    expect(onChoose.mock.calls[0][0]).toMatchObject({ name: 'Settings', fields: ['Name'] })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('puts the keyboard on the first preset, moves with the arrows, and Escape closes and returns to the button', async () => {
    const { user } = setup()
    await user.click(opener())
    await screen.findAllByRole('menuitem')
    await waitFor(() => expect(rows()[0]).toHaveFocus())
    await user.keyboard('{ArrowDown}')
    expect(rows()[1]).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(rows()[2]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(rows()[0]).toHaveFocus()
    await user.keyboard('{End}')
    expect(rows()[2]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(rows()[0]).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(opener()).toHaveFocus()
  })

  it('closes when something else is pressed', async () => {
    const { user } = setup()
    await user.click(opener())
    await screen.findAllByRole('menuitem')
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('says so when nothing is published, and points to where to publish', async () => {
    const { user } = setup([])
    await user.click(opener())
    expect(await screen.findByText(/No presets are published yet/)).toHaveTextContent('Admin › Configuration › Plot')
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
  })

  it('says so when the list cannot be read, and tries again on request', async () => {
    const calls = { n: 0 }
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls.n += 1
      return calls.n === 1 ? { ok: false, status: 500, statusText: 'x', json: async () => ({ detail: 'down' }) } : { ok: true, status: 200, json: async () => ({ presets: LIST }) }
    }))
    const user = userEvent.setup()
    render(<PresetPicker onChoose={vi.fn()} />)
    await user.click(opener())
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load the presets')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findAllByRole('menuitem')).toHaveLength(3)
  })

  it('ignores a list that arrives after it was closed', async () => {
    let release: (v: unknown) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { release = resolve })))
    const user = userEvent.setup()
    render(<PresetPicker onChoose={vi.fn()} />)
    await user.click(opener())
    await user.click(opener())
    release({ ok: true, status: 200, json: async () => ({ presets: LIST }) })
    await new Promise(r => setTimeout(r, 10))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
