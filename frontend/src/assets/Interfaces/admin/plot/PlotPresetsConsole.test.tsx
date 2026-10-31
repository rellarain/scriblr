import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PresetContent, PresetEntry } from '../../../../api/types'
import { dragAt, layOutChips } from '../../../../test/chips'
import { content, draftEntry, liveEntry, presetsBackend } from '../../../../test/presetsBackend'
import PlotPresetsConsole from './PlotPresetsConsole'
import * as presetFile from './presetFile'

vi.mock('./presetFile', async importOriginal => ({ ...(await importOriginal<typeof import('./presetFile')>()), downloadTextFile: vi.fn() }))

const sub = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, name, description: '', keywords: [], fields: [], fieldsets: [], clusters: [], ...over })
const cluster = (id: string, name: string) => ({ id, name, description: '', keywords: [], fields: [], fieldsets: [] })

const characters = content('Characters', {
  description: 'The cast', keywords: ['cast'], fields: ['Name', 'Role'],
  subcategories: [sub('s1', 'Heroes', { fields: ['Want'], clusters: [cluster('k1', 'Core')] }), sub('s2', 'Villains')],
})
const initial = (): PresetEntry[] => [liveEntry('a', characters), liveEntry('b', content('Settings', { fields: ['Place'] })), draftEntry('c', content('Heist crew'))]

async function open(entries = initial()) {
  const backend = presetsBackend(entries)
  const user = userEvent.setup()
  const view = render(<PlotPresetsConsole />)
  await screen.findByRole('heading', { name: 'Plot presets' })
  return { backend, user, view }
}

const list = () => screen.getByRole('complementary', { name: 'Presets' })
const rowOf = (name: string) => within(list()).getByRole('button', { name: new RegExp(`^${name}`) })
const save = () => screen.getByRole('button', { name: 'Save' })
const dataTransfer = () => { const data = new Map<string, string>(); return { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', setDragImage: () => {} } }

beforeEach(() => { vi.mocked(presetFile.downloadTextFile).mockClear() })

describe('the list', () => {
  it('lists the presets, each with where it stands, and opens the first as a card tree', async () => {
    await open()
    expect(within(list()).getByText('Presets · 3')).toBeInTheDocument()
    expect(rowOf('Characters')).toHaveTextContent('Published v1')
    expect(rowOf('Heist crew')).toHaveTextContent('Not published')
    expect(rowOf('Characters')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('textbox', { name: 'Preset name' })).toHaveValue('Characters')
    expect(screen.getByRole('textbox', { name: 'Preset description' })).toHaveValue('The cast')
    const fields = screen.getByRole('group', { name: 'Preset fields' })
    expect(within(fields).getByText('Name')).toBeInTheDocument()
    expect(within(fields).getByText('Role')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'subcategory Heroes' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'cluster Core' })).toBeInTheDocument()
  })

  it('opens another preset when its row is chosen', async () => {
    const { user } = await open()
    await user.click(rowOf('Settings'))
    expect(screen.getByRole('textbox', { name: 'Preset name' })).toHaveValue('Settings')
    expect(rowOf('Settings')).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByRole('region', { name: 'subcategory Heroes' })).toBeNull()
  })

  it('shows what is loading and what failed', async () => {
    presetsBackend([])
    const { unmount } = render(<PlotPresetsConsole />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading the plot presets')
    expect(await screen.findByText('No presets yet')).toBeInTheDocument()
    unmount()

    const backend = presetsBackend(initial())
    backend.failNext('/presets', 500, 'The presets file is damaged.')
    render(<PlotPresetsConsole />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The presets file is damaged.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Plot presets' })).toBeInTheDocument()
  })

  it('offers a new preset or an import when there are none', async () => {
    const { user } = await open([])
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New preset' }))
    expect(screen.getByRole('textbox', { name: 'Preset name' })).toHaveValue('')
    expect(within(list()).getByText('Presets · 1')).toBeInTheDocument()
  })

  it('folds the list into a picker button that opens it, for a narrow page', async () => {
    const { user } = await open()
    const pick = screen.getByRole('button', { name: /Characters/, expanded: false })
    expect(pick).toHaveAttribute('aria-controls', 'plp-list')
    await user.click(pick)
    expect(pick).toHaveAttribute('aria-expanded', 'true')
    await user.click(rowOf('Settings'))
    expect(screen.getByRole('button', { name: /Settings/, expanded: false })).toBeInTheDocument()
  })
})

describe('making and editing a preset', () => {
  it('starts a new one with its name focused, and asks for a name before it can be published', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'New' }))
    const name = screen.getByRole('textbox', { name: 'Preset name' })
    await waitFor(() => expect(name).toHaveFocus())
    expect(rowOf('Untitled preset')).toHaveTextContent('Not published')
    expect(screen.getByRole('button', { name: /^Publish v1/ })).toBeDisabled()
    expect(screen.getByText('The preset needs a name.', { selector: '.plpErr' })).toBeInTheDocument()
    await user.type(name, 'Factions')
    expect(rowOf('Factions')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Publish v1/ })).toBeEnabled()
  })

  it('edits the description, keywords and fields, and saves them when Save is pressed', async () => {
    const { backend, user } = await open()
    await user.click(rowOf('Settings'))
    expect(save()).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Preset description' }), 'Where it happens')
    await user.type(screen.getByRole('textbox', { name: 'Add keyword…' }), 'place{Enter}')
    await user.type(screen.getByRole('textbox', { name: 'Add field…' }), 'Mood{Enter}')
    expect(within(screen.getByRole('group', { name: 'Preset keywords' })).getByText('place')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Preset fields' })).getByText('Mood')).toBeInTheDocument()
    expect(rowOf('Settings')).toHaveTextContent('unpublished changes')
    expect(backend.calls.filter(c => c === 'PUT /presets')).toHaveLength(0)
    await user.click(save())
    await waitFor(() => expect(backend.entries[1].draft).toMatchObject({ description: 'Where it happens', keywords: ['place'], fields: ['Place', 'Mood'] }))
    await waitFor(() => expect(save()).toBeDisabled())
  })

  it('removes a keyword and a field from their chips', async () => {
    const { user } = await open()
    await user.click(within(screen.getByRole('group', { name: 'Preset keywords' })).getByRole('button', { name: 'Remove cast' }))
    await user.click(within(screen.getByRole('group', { name: 'Preset fields' })).getByRole('button', { name: 'Remove Name' }))
    expect(screen.getByRole('group', { name: 'Preset keywords' })).not.toHaveTextContent('cast')
    expect(screen.getByRole('group', { name: 'Preset fields' })).toHaveTextContent('Role')
    expect(screen.getByRole('group', { name: 'Preset fields' })).not.toHaveTextContent('Name')
  })

  it('refuses a name another preset has, and puts the old one back when the field is left', async () => {
    const { user } = await open()
    const name = screen.getByRole('textbox', { name: 'Preset name' })
    fireEvent.change(name, { target: { value: 'settings' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Another preset is already called that.')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(rowOf('Characters')).toBeInTheDocument()
    fireEvent.blur(name)
    expect(name).toHaveValue('Characters')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('limits a name to 50 characters, a field to 30 and a description to 255', async () => {
    await open()
    expect(screen.getByRole('textbox', { name: 'Preset name' })).toHaveAttribute('maxlength', '50')
    expect(within(screen.getByRole('group', { name: 'Preset fields' })).getByRole('textbox')).toHaveAttribute('maxlength', '30')
    expect(screen.getByRole('textbox', { name: 'Preset description' })).toHaveAttribute('maxlength', '255')
  })
})

describe('subcategories and clusters', () => {
  it('adds a subcategory and a cluster from their buttons', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Subcategory' }))
    expect(screen.getAllByRole('region', { name: /^subcategory/ })).toHaveLength(3)
    const villains = screen.getByRole('region', { name: 'subcategory Villains' })
    await user.click(within(villains).getByRole('button', { name: 'Cluster' }))
    expect(within(villains).getByRole('region', { name: 'cluster without a name' })).toBeInTheDocument()
  })

  it('marks a card without a name and says what stops publishing', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Subcategory' }))
    expect(screen.getByRole('button', { name: /^Publish v2/ })).toBeDisabled()
    expect(document.querySelector('.plpStatus')).toHaveTextContent('Cannot publish yet. Subcategory 3 needs a name.')
    const blank = screen.getByRole('region', { name: 'subcategory without a name' })
    expect(within(blank).getByText('Subcategory 3 needs a name.')).toBeInTheDocument()
  })

  it('uses the Outline keys: Enter a sibling, Shift+Enter a child, Backspace removes an empty card', async () => {
    const { user } = await open()
    const names = () => screen.getAllByRole('textbox', { name: 'Subcategory name' }).map(e => (e as HTMLInputElement).value)
    const first = screen.getAllByRole('textbox', { name: 'Subcategory name' })[0]
    first.focus()
    await user.keyboard('{Enter}')
    expect(names()).toEqual(['Heroes', '', 'Villains'])
    await waitFor(() => expect(screen.getAllByRole('textbox', { name: 'Subcategory name' })[1]).toHaveFocus())
    await user.keyboard('Allies{Shift>}{Enter}{/Shift}')
    await waitFor(() => expect(screen.getAllByRole('textbox', { name: 'Cluster name' })).toHaveLength(2))
    await waitFor(() => expect(screen.getAllByRole('textbox', { name: 'Cluster name' })[1]).toHaveFocus())
    await user.keyboard('{Backspace}')
    expect(screen.getAllByRole('textbox', { name: 'Cluster name' })).toHaveLength(1)
    await waitFor(() => expect(screen.getAllByRole('textbox', { name: 'Subcategory name' })[1]).toHaveFocus())
    await user.keyboard('{Enter}')
    expect(names()).toEqual(['Heroes', 'Allies', '', 'Villains'])
    await user.keyboard('{Backspace}')
    expect(names()).toEqual(['Heroes', 'Allies', 'Villains'])
  })

  it('asks before deleting a card with something in it, and deletes an empty one at once', async () => {
    const { user } = await open()
    const heroes = screen.getByRole('region', { name: 'subcategory Heroes' })
    await user.click(within(heroes).getByRole('button', { name: 'Delete subcategory Heroes' }))
    const ask = within(heroes).getByRole('alertdialog', { name: 'Delete subcategory Heroes' })
    expect(ask).toHaveTextContent('Delete Heroes and what is in it?')
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('region', { name: 'subcategory Heroes' })).toBeInTheDocument()
    await user.click(within(heroes).getByRole('button', { name: 'Delete subcategory Heroes' }))
    await user.click(within(heroes).getByRole('button', { name: 'Confirm' }))
    expect(screen.queryByRole('region', { name: 'subcategory Heroes' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'cluster Core' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Subcategory' }))
    await user.click(screen.getByRole('button', { name: 'Delete subcategory without a name' }))
    expect(screen.queryByRole('region', { name: 'subcategory without a name' })).toBeNull()
  })
})

describe('publishing', () => {
  it('shows what will change, and publishes when confirmed', async () => {
    const { backend, user } = await open()
    await user.click(rowOf('Heist crew'))
    await user.click(screen.getByRole('button', { name: /^Publish v1/ }))
    const dialog = screen.getByRole('dialog', { name: 'Publish Heist crew' })
    expect(dialog).toHaveTextContent('Publish Heist crew as v1?')
    expect(dialog).toHaveTextContent('Added: the preset')
    expect(dialog).toHaveTextContent('Projects that already added Heist crew keep their copy.')
    await user.click(within(dialog).getByRole('button', { name: 'Publish v1' }))
    await waitFor(() => expect(rowOf('Heist crew')).toHaveTextContent('Published v1'))
    expect(backend.calls).toContain('POST /presets/c/publish')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists what changed since the last version, and can be cancelled or closed with Escape', async () => {
    const { backend, user } = await open()
    await user.type(screen.getByRole('textbox', { name: 'Preset description' }), ' edited')
    await user.click(within(screen.getByRole('group', { name: 'Preset fields' })).getByRole('button', { name: 'Remove Role' }))
    await user.click(screen.getByRole('button', { name: /^Publish v2/ }))
    const dialog = screen.getByRole('dialog', { name: 'Publish Characters' })
    expect(dialog).toHaveTextContent('Changed: description, fields (1 removed)')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Publish v2/ }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(backend.calls.some(c => c.endsWith('/publish'))).toBe(false)
  })

  it('keeps Tab inside the dialog', async () => {
    const { user } = await open()
    await user.click(rowOf('Heist crew'))
    await user.click(screen.getByRole('button', { name: /^Publish v1/ }))
    const dialog = screen.getByRole('dialog')
    const [cancel, publish] = within(dialog).getAllByRole('button')
    expect(publish).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab({ shift: true })
    expect(publish).toHaveFocus()
  })

  it('will not publish what has not changed', async () => {
    await open()
    expect(screen.getByRole('button', { name: /^Publish v2/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Publish v2/ })).toHaveAttribute('title', 'Nothing has changed since v1')
  })

  it('shows the reason when the server refuses to publish', async () => {
    const { backend, user } = await open()
    await user.click(rowOf('Heist crew'))
    backend.failNext('/presets/c/publish', 422, 'Another preset is already published as "Heist crew".')
    await user.click(screen.getByRole('button', { name: /^Publish v1/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish v1' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Another preset is already published as "Heist crew".')
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('unpublishes a preset, which then waits to be published again', async () => {
    const { backend, user } = await open()
    await user.click(screen.getByRole('button', { name: 'Unpublish' }))
    await waitFor(() => expect(rowOf('Characters')).toHaveTextContent('Unpublished (was v1)'))
    expect(backend.entries[0].published).toBeNull()
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Publish v2/ })).toBeEnabled()
  })

  it('discards changes after asking, going back to the published copy', async () => {
    const { user } = await open()
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Preset description' }), ' more')
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    const ask = screen.getByRole('alertdialog', { name: 'Confirm' })
    expect(ask).toHaveTextContent('Discard your changes to Characters and go back to v1?')
    await user.click(within(ask).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Preset description' })).toHaveValue('The cast'))
    expect(rowOf('Characters')).toHaveTextContent('Published v1')
  })

  it('clears a preset that was never published, keeping its name, since it has no published copy to go back to', async () => {
    const { user, backend } = await open()
    await user.click(rowOf('Heist crew'))
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Preset description' }), 'A crew')
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    const ask = screen.getByRole('alertdialog', { name: 'Confirm' })
    expect(ask).toHaveTextContent('Clear Heist crew? It has no published copy to go back to')
    await user.click(within(ask).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Preset description' })).toHaveValue(''))
    expect(screen.getByRole('textbox', { name: 'Preset name' })).toHaveValue('Heist crew')
    expect(backend.entries.find(e => e.id === 'c')?.draft).toEqual(content('Heist crew'))
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
  })

  it('lists the versions and brings an earlier one into the draft, asking first when that would lose edits', async () => {
    const a = liveEntry('a', content('Cast', { description: 'second' }), { nextVersion: 3 })
    a.published = { version: 2, publishedAt: '2026-10-20T09:00:00Z', content: content('Cast', { description: 'second' }) }
    a.history = [{ version: 1, publishedAt: '2026-10-12T09:00:00Z', content: content('Cast', { description: 'first' }) }]
    const { user } = await open([a])
    await user.click(screen.getByRole('button', { name: 'Versions' }))
    const menu = screen.getByRole('group', { name: 'Versions of Cast' })
    expect(menu).toHaveTextContent('v2')
    expect(menu).toHaveTextContent('Current')
    expect(menu).toHaveTextContent('v1')
    await user.click(within(menu).getByRole('button', { name: 'Bring into draft' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Preset description' })).toHaveValue('first'))
    expect(rowOf('Cast')).toHaveTextContent('unpublished changes')

    await user.type(screen.getByRole('textbox', { name: 'Preset description' }), '!')
    await user.click(screen.getByRole('button', { name: 'Versions' }))
    await user.click(within(screen.getByRole('group', { name: 'Versions of Cast' })).getByRole('button', { name: 'Bring into draft' }))
    expect(screen.getByRole('alertdialog', { name: 'Confirm' })).toHaveTextContent('Bring v1 into the draft? Your unpublished changes to Cast will be replaced.')
    await user.click(within(screen.getByRole('alertdialog', { name: 'Confirm' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('textbox', { name: 'Preset description' })).toHaveValue('first!')
  })
})

describe('deleting, duplicating and ordering presets', () => {
  it('asks before deleting, in words that say whether it was published, and opens the next one', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Delete preset Characters' }))
    const ask = screen.getByRole('alertdialog', { name: 'Confirm' })
    expect(ask).toHaveTextContent('Delete Characters? It also leaves the + Preset list')
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(rowOf('Characters')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete preset Characters' }))
    await user.click(within(screen.getByRole('alertdialog', { name: 'Confirm' })).getByRole('button', { name: 'Confirm' }))
    expect(within(list()).queryByRole('button', { name: /^Characters/ })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Preset name' })).toHaveValue('Settings')
  })

  it('says a preset that was never published does not affect the Plot sidebar', async () => {
    const { user } = await open()
    await user.click(rowOf('Heist crew'))
    await user.click(screen.getByRole('button', { name: 'Delete preset Heist crew' }))
    expect(screen.getByRole('alertdialog', { name: 'Confirm' })).toHaveTextContent('It was never published, so the Plot sidebar is not affected.')
  })

  it('deletes an empty preset that was never published at once', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'New' }))
    await user.click(screen.getByRole('button', { name: 'Delete preset without a name' }))
    expect(within(list()).queryByText('Untitled preset')).toBeNull()
    expect(within(list()).getByText('Presets · 3')).toBeInTheDocument()
  })

  it('duplicates a preset next to it, unpublished, with its name focused', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(within(list()).getAllByRole('button', { name: /^Characters/ }).map(b => b.textContent?.trim())).toEqual(['Characters Published v1', 'Characters (copy) Not published'])
    expect(screen.getByRole('textbox', { name: 'Preset name' })).toHaveValue('Characters (copy)')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Preset name' })).toHaveFocus())
  })

  it('moves a preset by dragging its grip onto another, or Alt+Down on the grip', async () => {
    const { user } = await open()
    const order = () => within(list()).getAllByRole('button', { name: /Published|Not published/ }).map(b => b.textContent?.replace(/\s*(Published v1|Not published)$/, ''))
    const dt = dataTransfer()
    fireEvent.dragStart(screen.getByRole('button', { name: 'Move Heist crew (Alt+Up or Down)' }), { dataTransfer: dt })
    const target = rowOf('Characters').closest('li')!
    fireEvent.dragOver(target, { dataTransfer: dt })
    fireEvent.drop(target, { dataTransfer: dt })
    expect(order()).toEqual(['Heist crew', 'Characters', 'Settings'])

    screen.getByRole('button', { name: 'Move Heist crew (Alt+Up or Down)' }).focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(order()).toEqual(['Characters', 'Heist crew', 'Settings'])
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(order()).toEqual(['Heist crew', 'Characters', 'Settings'])
  })

  it('moves a field chip by dragging it, and a subcategory by its grip', async () => {
    const { user } = await open()
    const fields = () => within(screen.getByRole('group', { name: 'Preset fields' })).getAllByRole('button', { name: /^Remove/ }).map(b => b.getAttribute('aria-label')?.replace('Remove ', ''))
    const grips = within(screen.getByRole('group', { name: 'Preset fields' })).getAllByTitle('Drag to reorder')
    const dt = dataTransfer()
    fireEvent.dragStart(grips[1], { dataTransfer: dt })
    const group = screen.getByRole('group', { name: 'Preset fields' })
    const at = layOutChips(group)
    const first = within(group).getByText('Name').closest('.plpChip')!
    dragAt('dragOver', first, at.leftHalf(0), dt)
    dragAt('drop', first, at.leftHalf(0), dt)
    expect(fields()).toEqual(['Role', 'Name'])

    within(screen.getByRole('group', { name: 'Preset fields' })).getByRole('button', { name: 'Remove Name' }).focus()
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    expect(fields()).toEqual(['Name', 'Role'])

    const names = () => screen.getAllByRole('textbox', { name: 'Subcategory name' }).map(e => (e as HTMLInputElement).value)
    screen.getByRole('button', { name: 'Move subcategory Villains (Alt+Up or Down)' }).focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(names()).toEqual(['Villains', 'Heroes'])
  })
})

describe('import and export', () => {
  const lastDownload = () => vi.mocked(presetFile.downloadTextFile).mock.calls.at(-1)!

  it('exports every preset, or one, as a file without ids', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Export all' }))
    expect(lastDownload()[0]).toBe('scriblr-plot-presets.json')
    const all = JSON.parse(lastDownload()[1])
    expect(all.presets.map((p: PresetContent) => p.name)).toEqual(['Characters', 'Settings', 'Heist crew'])
    expect(lastDownload()[1]).not.toContain('"id"')

    await user.click(screen.getByRole('button', { name: 'Export' }))
    expect(lastDownload()[0]).toBe('scriblr-plot-preset-characters.json')
    expect(JSON.parse(lastDownload()[1]).presets).toHaveLength(1)
  })

  const file = (body: string) => new File([body], 'presets.json', { type: 'application/json' })
  const importFile = (user: ReturnType<typeof userEvent.setup>, body: string) => user.upload(screen.getByLabelText('Import plot presets from a file'), file(body))

  it('adds the presets in a file as drafts, renaming a name that is taken, and says so', async () => {
    const { backend, user } = await open()
    await importFile(user, JSON.stringify({ scriblrPlotPresets: 1, presets: [{ name: 'Characters', fields: ['Hair'] }, { name: 'Mystery clues' }, { name: '' }] }))
    await waitFor(() => expect(document.querySelector('.plpToast')).not.toBeNull())
    const notice = document.querySelector('.plpToast') as HTMLElement
    expect(notice).toHaveTextContent('Imported 2 presets as drafts. They stay unpublished until you publish them.')
    expect(notice).toHaveTextContent('Characters (copy) · Mystery clues')
    expect(notice).toHaveTextContent('Skipped: The preset at position 3 has no name.')
    expect(rowOf('Characters \\(copy\\)')).toHaveTextContent('Not published')
    expect(rowOf('Characters \\(copy\\)')).toHaveAttribute('aria-current', 'true')
    await waitFor(() => expect(backend.entries.map(e => e.draft.name)).toEqual(['Characters', 'Settings', 'Heist crew', 'Characters (copy)', 'Mystery clues']))
    expect(backend.entries[3].published).toBeNull()
    await user.click(within(notice).getByRole('button', { name: 'Dismiss' }))
    expect(document.querySelector('.plpToast')).toBeNull()
  })

  it('says what is wrong with a file that is not a preset file, and imports nothing', async () => {
    const { backend, user } = await open()
    await importFile(user, '{"hello": 1}')
    expect(await screen.findByRole('alert')).toHaveTextContent('This is not a Scriblr plot preset file.')
    await importFile(user, JSON.stringify({ scriblrPlotPresets: 1, presets: [{ name: '' }] }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Nothing in the file could be imported.'))
    expect(backend.calls.filter(c => c === 'PUT /presets')).toHaveLength(0)
  })

  it('opens the file chooser from the Import buttons', async () => {
    const { user } = await open()
    const input = screen.getByLabelText('Import plot presets from a file') as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    await user.click(screen.getByRole('button', { name: 'Import' }))
    expect(click).toHaveBeenCalled()
  })
})

describe('saving', () => {
  it('flushes what is waiting when a preset is published, and tells you when a save fails', async () => {
    const { backend, user } = await open()
    backend.failNext('/presets', 500, 'disk full')
    await user.type(screen.getByRole('textbox', { name: 'Preset description' }), ' more')
    await user.click(save())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('title', 'disk full'))
    await user.click(save())
    await waitFor(() => expect(backend.entries[0].draft.description).toBe('The cast more'))
  })
})

describe('fieldsets', () => {
  const cast = (over: Partial<PresetContent> = {}) => content('Cast', { fields: ['Name'], fieldsets: [{ name: 'Look', fields: ['Hair', 'Eyes'] }, { name: 'Mind', fields: ['Fear'] }], ...over })
  const names = () => screen.getAllByRole('textbox', { name: 'Fieldset name' }).map(i => (i as HTMLInputElement).value)

  it('adds a set to the preset, names it, puts a field in it, and saves it with the draft', async () => {
    const { backend, user } = await open()
    await user.click(rowOf('Settings'))
    await user.click(screen.getByRole('button', { name: 'Fieldset' }))
    const name = screen.getByRole('textbox', { name: 'Fieldset name' })
    expect(name).toHaveAttribute('maxlength', '30')
    await user.type(name, 'Mood')
    await user.type(screen.getByRole('textbox', { name: 'Add field to set…' }), 'Tone{Enter}')
    expect(within(screen.getByRole('group', { name: 'Preset fieldset Mood fields' })).getByText('Tone')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Fieldset Mood' })).getByText('1 field')).toBeInTheDocument()
    await user.click(save())
    await waitFor(() => expect(backend.entries[1].draft).toMatchObject({ fields: ['Place'], fieldsets: [{ name: 'Mood', fields: ['Tone'] }] }))
  })

  it('folds a set to hide its fields, and opens it again', async () => {
    const { user } = await open([liveEntry('a', cast())])
    const look = () => screen.getByRole('group', { name: 'Fieldset Look' })
    expect(within(look()).getByText('Hair')).toBeInTheDocument()
    await user.click(within(look()).getByRole('button', { name: 'Collapse fieldset Look' }))
    expect(within(look()).queryByText('Hair')).toBeNull()
    expect(screen.getByRole('group', { name: 'Preset fieldset Mind fields' })).toBeInTheDocument()
    await user.click(within(look()).getByRole('button', { name: 'Expand fieldset Look' }))
    expect(within(look()).getByText('Hair')).toBeInTheDocument()
  })

  it('removes a field from a set, and deleting the set keeps its fields as the card\'s own', async () => {
    const { user } = await open([liveEntry('a', cast())])
    await user.click(within(screen.getByRole('group', { name: 'Preset fieldset Look fields' })).getByRole('button', { name: 'Remove Hair' }))
    await user.click(screen.getByRole('button', { name: 'Delete fieldset Look' }))
    expect(screen.queryByRole('group', { name: 'Fieldset Look' })).toBeNull()
    expect(names()).toEqual(['Mind'])
    const loose = screen.getByRole('group', { name: 'Preset fields' })
    expect(loose).toHaveTextContent('Name')
    expect(loose).toHaveTextContent('Eyes')
    expect(loose).not.toHaveTextContent('Hair')
  })

  it('moves a set with Alt+Down on its grip', async () => {
    await open([liveEntry('a', cast())])
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move fieldset Look (Alt+Up or Down)' }), { key: 'ArrowDown', altKey: true })
    expect(names()).toEqual(['Mind', 'Look'])
  })

  it('counts a set\'s fields in the card\'s count, and gives each card its own sets', async () => {
    const { user } = await open([liveEntry('a', cast({ subcategories: [{ id: 's1', name: 'Heroes', description: '', keywords: [], fields: [], fieldsets: [], clusters: [] }] }))])
    const card = screen.getByRole('region', { name: 'preset Cast' })
    expect(card.querySelector('.plpHead .plpCount')).toHaveTextContent('4 fields')
    await user.click(within(screen.getByRole('region', { name: 'subcategory Heroes' })).getByRole('button', { name: 'Fieldset' }))
    expect(names()).toEqual(['Look', 'Mind', ''])
  })

  it('refuses to publish an unnamed set that holds fields, naming the card', async () => {
    await open([draftEntry('c', cast({ fieldsets: [{ name: '', fields: ['Hair'] }] }))])
    expect(screen.getByText('Fieldset 1 on the preset needs a name.', { selector: '.plpErr' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Publish v1/ })).toBeDisabled()
  })

  it('stops at 20 sets on a card', async () => {
    await open([liveEntry('a', cast({ fieldsets: Array.from({ length: 20 }, (_, i) => ({ name: `Set ${i}`, fields: [] })) }))])
    expect(screen.getByRole('button', { name: 'Fieldset' })).toBeDisabled()
  })
})

describe('dragging a chip: the chips slide out of the way', () => {
  const cast = () => content('Cast', { fields: ['Name', 'Role', 'Age'] })
  const stage = async () => {
    await open([liveEntry('a', cast())])
    const group = screen.getByRole('group', { name: 'Preset fields' })
    const at = layOutChips(group)
    const chip = (name: string) => within(group).getByText(name).closest('.plpChip') as HTMLElement
    const grip = (name: string) => within(chip(name)).getByTitle('Drag to reorder')
    const slide = (name: string) => chip(name).style.transform
    const order = () => within(group).getAllByRole('button', { name: /^Remove/ }).map(b => b.getAttribute('aria-label')?.replace('Remove ', ''))
    return { group, at, chip, grip, slide, order, dt: dataTransfer(), add: group.querySelector('.plpChipAdd') as HTMLElement }
  }

  it('opens a gap where the chip will land, the chips it passes taking the places beside them', async () => {
    const { group, at, chip, grip, slide, dt } = await stage()
    fireEvent.dragStart(grip('Age'), { dataTransfer: dt })
    expect(group).not.toHaveClass('plpChips--sliding')
    dragAt('dragOver', chip('Name'), at.leftHalf(0), dt)
    expect(group).toHaveClass('plpChips--sliding')
    expect(chip('Age')).toHaveClass('plpChip--lifted')
    expect([slide('Name'), slide('Role'), slide('Age')]).toEqual(['translate(60px, 0px)', 'translate(-60px, 30px)', ''])
  })

  it('drops where the gap is, last below the chips included, and puts the slides away', async () => {
    const { group, at, chip, grip, slide, order, dt } = await stage()
    fireEvent.dragStart(grip('Name'), { dataTransfer: dt })
    dragAt('dragOver', chip('Role'), at.afterAll(), dt)
    dragAt('drop', chip('Role'), at.afterAll(), dt)
    expect(order()).toEqual(['Role', 'Age', 'Name'])
    expect([slide('Role'), slide('Age'), slide('Name')]).toEqual(['', '', ''])
    expect(group).not.toHaveClass('plpChips--sliding')
    expect(chip('Name')).not.toHaveClass('plpChip--lifted')

    // one place along: in front of the one after the next (the chips are new elements, as their keys name their places: laid out again)
    layOutChips(group)
    fireEvent.dragStart(grip('Role'), { dataTransfer: dt })
    dragAt('dragOver', chip('Age'), at.rightHalf(1), dt)
    dragAt('drop', chip('Age'), at.rightHalf(1), dt)
    expect(order()).toEqual(['Age', 'Role', 'Name'])
  })

  it('puts the slides away when the pointer leaves the chips or the drag is cancelled', async () => {
    const { group, at, chip, grip, slide, order, dt } = await stage()
    fireEvent.dragStart(grip('Age'), { dataTransfer: dt })
    dragAt('dragOver', chip('Name'), at.leftHalf(0), dt)
    fireEvent.dragLeave(group, { dataTransfer: dt, relatedTarget: document.body })
    expect([slide('Name'), slide('Role')]).toEqual(['', ''])
    dragAt('dragOver', chip('Name'), at.leftHalf(0), dt)
    fireEvent.dragEnd(grip('Age'), { dataTransfer: dt })
    expect(group).not.toHaveClass('plpChips--sliding')
    expect([slide('Name'), slide('Role')]).toEqual(['', ''])
    expect(order()).toEqual(['Name', 'Role', 'Age'])
  })

  it('slides the option chips of a multi-select the same way, and leaves the keyword chips alone', async () => {
    await open([liveEntry('a', content('Cast', { keywords: ['cast', 'crew'], fields: [{ name: 'Genre', kind: 'multi' as const, options: ['Fantasy', 'Romance', 'Crime'] }] }))])
    const group = screen.getByRole('group', { name: 'Genre options' })
    const at = layOutChips(group)
    const chip = (name: string) => within(group).getByText(name).closest('.plpChip') as HTMLElement
    const dt = dataTransfer()
    fireEvent.dragStart(within(chip('Crime')).getByTitle('Drag to reorder'), { dataTransfer: dt })
    dragAt('dragOver', chip('Fantasy'), at.leftHalf(0), dt)
    expect([chip('Fantasy'), chip('Romance')].map(c => c.style.transform)).toEqual(['translate(60px, 0px)', 'translate(-60px, 30px)'])
    dragAt('drop', chip('Fantasy'), at.leftHalf(0), dt)
    expect(within(group).getAllByRole('button', { name: /^Remove/ }).map(b => b.getAttribute('aria-label'))).toEqual(['Remove Crime', 'Remove Fantasy', 'Remove Romance'])
    // keywords are not reorderable: no grip, no drop handling
    const keywords = screen.getByRole('group', { name: 'Preset keywords' })
    expect(within(keywords).queryAllByTitle('Drag to reorder')).toHaveLength(0)
  })
})

describe('fields of other kinds', () => {
  const genre = { name: 'Genre', kind: 'multi' as const, options: ['Fantasy', 'Crime'] }
  const cast = () => content('Cast', { fields: ['Name', genre], fieldsets: [{ name: 'Tone', fields: [{ name: 'Mood', kind: 'dropdown' as const, options: ['Calm'] }] }] })

  it('shows each field\'s kind on its chip, and the options of a multi-select or dropdown under the chips', async () => {
    await open([liveEntry('a', cast())])
    expect(screen.getByRole('combobox', { name: 'Kind of Name' })).toHaveValue('points')
    expect(screen.getByRole('combobox', { name: 'Kind of Genre' })).toHaveValue('multi')
    expect(within(screen.getByRole('group', { name: 'Genre options' })).getByText('Fantasy')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Kind of Mood' })).toHaveValue('dropdown')
    expect(within(screen.getByRole('group', { name: 'Mood options' })).getByText('Calm')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Name options' })).toBeNull()
  })

  it('changes a field to a multi-select, adds options, removes one, and saves them with the draft', async () => {
    const { backend, user } = await open([liveEntry('a', cast())])
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kind of Name' }), 'dropdown')
    const options = () => screen.getByRole('group', { name: 'Name options' })
    await user.type(within(options()).getByRole('textbox', { name: 'Add option…' }), 'First{Enter}')
    await user.type(within(options()).getByRole('textbox', { name: 'Add option…' }), 'Second{Enter}')
    await user.click(within(options()).getByRole('button', { name: 'Remove First' }))
    await user.click(save())
    await waitFor(() => expect(backend.entries[0].draft.fields[0]).toEqual({ name: 'Name', kind: 'dropdown', options: ['Second'] }))
  })

  it('turns a field back into a plain one, which is just its name again', async () => {
    const { backend, user } = await open([liveEntry('a', cast())])
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kind of Genre' }), 'points')
    expect(screen.queryByRole('group', { name: 'Genre options' })).toBeNull()
    await user.click(save())
    await waitFor(() => expect(backend.entries[0].draft.fields).toEqual(['Name', 'Genre']))
  })

  it('gives a field in a set its own kind and options', async () => {
    const { backend, user } = await open([liveEntry('a', content('Cast', { fieldsets: [{ name: 'Tone', fields: ['Pace'] }] }))])
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kind of Pace' }), 'multi')
    await user.type(within(screen.getByRole('group', { name: 'Pace options' })).getByRole('textbox', { name: 'Add option…' }), 'Slow{Enter}')
    await user.click(save())
    await waitFor(() => expect(backend.entries[0].draft.fieldsets?.[0].fields).toEqual([{ name: 'Pace', kind: 'multi', options: ['Slow'] }]))
  })

  it('refuses to publish a multi-select with no options, naming the card', async () => {
    await open([draftEntry('c', content('Cast', { fields: [{ name: 'Genre', kind: 'multi' as const, options: [] }] }))])
    expect(screen.getByText('The multi-select Genre on the preset needs an option.', { selector: '.plpErr' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Publish v1/ })).toBeDisabled()
  })
})
