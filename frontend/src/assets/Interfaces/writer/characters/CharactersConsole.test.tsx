import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { CharacterDoc } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { charactersBackend } from '../../../../test/charactersBackend'
import CharactersConsole from './CharactersConsole'

const ada = (): CharacterDoc => newCharacter('chr_a', { name: 'Ada' }, 0)
const bram = (): CharacterDoc => newCharacter('chr_b', { name: 'Bram' }, 1)

async function open(cast: CharacterDoc[] = [ada(), bram()]) {
  const backend = charactersBackend(cast)
  render(<CharactersConsole projectId="p1" />)
  await screen.findByRole('heading', { name: 'Characters', level: 2 })
  return { backend, user: userEvent.setup() }
}
type Backend = ReturnType<typeof charactersBackend>
const save = () => screen.getByRole('button', { name: 'Save' })
const puts = (b: Backend) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT')
const lastPut = (b: Backend) => JSON.parse((puts(b).at(-1)![1] as RequestInit).body as string) as CharacterDoc
const drawer = (name: string) => within(screen.getByRole('region', { name }))
async function openDrawer(user: ReturnType<typeof userEvent.setup>, name: string) {
  const btn = within(screen.getByRole('region', { name })).getByRole('button', { name })
  if (btn.getAttribute('aria-expanded') !== 'true') await user.click(btn)
}

describe('the Characters console', () => {
  it('lists the cast and opens the first character, drawn as a close-up', async () => {
    await open()
    const list = within(await screen.findByRole('navigation', { name: 'Cast' }))
    expect(list.getAllByRole('button', { name: /^Open / }).map(b => b.textContent)).toEqual(['Ada', 'Bram'])
    expect(await screen.findByRole('img', { name: 'Ada, close-up, front' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name of the character' })).toHaveValue('Ada')
  })

  it('says so when there is no cast, and makes a character with the plus', async () => {
    const { backend, user } = await open([])
    expect(await screen.findByText(/Make a character to start/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New character' }))
    expect(await screen.findByRole('img', { name: /Unnamed character, close-up/ })).toBeInTheDocument()
    expect(backend.of('POST')).toHaveLength(1)
  })

  it('keeps an edit waiting until Save, then saves the character whole', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    expect(save()).toBeDisabled()
    await openDrawer(user, 'Hair and beard')
    await user.click(drawer('Hair and beard').getByRole('button', { name: 'Braid' }))
    expect(puts(backend)).toHaveLength(0)
    expect(save()).toBeEnabled()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).look.hair).toBe('braid')
  })

  it('renames the character when the field is left, and a blank name is put back', async () => {
    const { backend, user } = await open()
    const name = await screen.findByRole('textbox', { name: 'Name of the character' })
    await user.clear(name)
    await user.type(name, 'Ada Marsh')
    await user.tab()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).name).toBe('Ada Marsh')
    expect(await within(screen.getByRole('navigation', { name: 'Cast' })).findByRole('button', { name: 'Open Ada Marsh' })).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: 'Name of the character' }))
    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Name of the character' })).toHaveValue('Ada Marsh')
  })

  it('opens only one drawer at a time', async () => {
    const { user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await openDrawer(user, 'Body')
    expect(drawer('Body').getByRole('group', { name: 'Build' })).toBeInTheDocument()
    await openDrawer(user, 'Eyes and brows')
    expect(drawer('Eyes and brows').getByRole('group', { name: 'Eyes' })).toBeInTheDocument()
    expect(drawer('Body').queryByRole('group', { name: 'Build' })).not.toBeInTheDocument()
  })

  it('a slider changes the look, and many moves of it are one undo step', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await openDrawer(user, 'Body')
    const height = drawer('Body').getByRole('slider', { name: 'Height' })
    fireEvent.change(height, { target: { value: '1.1' } })
    fireEvent.change(height, { target: { value: '1.2' } })
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).look.height).toBe(1.2)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(2))
    expect(lastPut(backend).look.height).toBe(1)
  })

  it('chooses an expression from the strip under the picture, and from the expressions view', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await user.click(within(screen.getByRole('group', { name: 'Expression' })).getByRole('button', { name: 'Angry' }))
    await user.click(screen.getByRole('button', { name: 'Expressions' }))
    const strip = within(screen.getByRole('group', { name: 'Expressions' }))
    expect(strip.getByRole('button', { name: 'Angry' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(strip.getByRole('button', { name: 'Laughing' }))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).look.expression).toBe('laughing')
  })

  it('shows the full body, and four views side by side in the turnaround', async () => {
    const { user } = await open()
    await user.click(await screen.findByRole('button', { name: 'Full body' }))
    expect(await screen.findByRole('img', { name: 'Ada, full body, front' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Side' }))
    expect(screen.getByRole('img', { name: 'Ada, full body, side' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Facing right/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Turnaround' }))
    for (const v of ['Front', 'Three-quarter', 'Side', 'Back']) expect(screen.getByRole('img', { name: `Ada, ${v}` })).toBeInTheDocument()
  })

  it('dresses the character: a garment, its colour, accessories and a thing held', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await openDrawer(user, 'Clothes and accessories')
    const clothes = drawer('Clothes and accessories')
    await user.click(clothes.getByRole('button', { name: 'Hoodie' }))
    await user.click(clothes.getByRole('button', { name: 'Brimmed hat' }))
    await user.click(clothes.getByRole('button', { name: 'Top colour #802020' }))
    const outer = clothes.getByRole('group', { name: 'Outerwear' })
    await user.click(within(outer).getByRole('button', { name: 'Cape' }))
    await user.click(within(clothes.getByRole('group', { name: 'Footwear' })).getByRole('button', { name: 'None' }))
    await openDrawer(user, 'Pose and things held')
    await user.click(within(drawer('Pose and things held').getByRole('group', { name: 'Right hand' })).getByRole('button', { name: 'Sword' }))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    const look = lastPut(backend).look
    expect(look.outfit).toMatchObject({ top: 'hoodie', outer: 'cape', shoes: null })
    expect(look.outfit.accessories).toEqual(['hat'])
    expect(look.outfit.colors.top).toBe('#802020')
    expect(look.heldRight).toBe('sword')
  })

  it('a streak colour can be set and taken away', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await openDrawer(user, 'Hair and beard')
    const hair = drawer('Hair and beard')
    expect(hair.queryByRole('slider', { name: 'How many streaks' })).not.toBeInTheDocument()
    await user.click(hair.getByRole('button', { name: 'Streak colour #c4452d' }))
    expect(hair.getByRole('slider', { name: 'How many streaks' })).toBeInTheDocument()
    await user.click(hair.getByRole('button', { name: 'No streaks' }))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).look.streakColor).toBeNull()
  })

  it('adds a mark, edits it, draws a tattoo of its own and removes it', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await openDrawer(user, 'Marks and tattoos')
    const marks = drawer('Marks and tattoos')
    await user.selectOptions(marks.getByRole('combobox', { name: 'Kind of mark to add' }), 'tattoo')
    await user.click(marks.getByRole('button', { name: 'Add a mark' }))
    const edit = within(await screen.findByRole('region', { name: 'Chosen mark' }))
    await user.selectOptions(edit.getByRole('combobox', { name: 'Where the mark goes' }), 'chest')
    await user.click(edit.getByRole('button', { name: 'Star' }))
    const pad = edit.getByRole('img', { name: 'Pad to draw a tattoo on' })
    const ptr = (type: string, x: number, y: number) => fireEvent(pad, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }))
    ptr('pointerdown', 10, 10)
    ptr('pointermove', 60, 60)
    ptr('pointerup', 60, 60)
    expect(edit.getByText('1 of 12 lines')).toBeInTheDocument()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).look.marks[0]).toMatchObject({ kind: 'tattoo', design: 'star', area: 'chest' })
    expect(lastPut(backend).look.marks[0].strokes).toHaveLength(1)
    await user.click(edit.getByRole('button', { name: 'Clear the drawing' }))
    await user.click(marks.getByRole('button', { name: /^Remove Tattoo on Chest/ }))
    expect(screen.queryByRole('region', { name: 'Chosen mark' })).not.toBeInTheDocument()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(2))
    expect(lastPut(backend).look.marks).toEqual([])
  })

  it('copies a character and deletes one after asking', async () => {
    const { backend, user } = await open()
    const list = within(await screen.findByRole('navigation', { name: 'Cast' }))
    await user.click(list.getByRole('button', { name: 'Copy Ada' }))
    expect(await list.findByRole('button', { name: 'Open Ada (copy)' })).toBeInTheDocument()
    expect(backend.of('POST')).toHaveLength(1)
    await user.click(list.getByRole('button', { name: 'Delete Bram' }))
    await user.click(list.getByRole('button', { name: 'Cancel delete' }))
    expect(backend.of('DELETE')).toHaveLength(0)
    await user.click(list.getByRole('button', { name: 'Delete Bram' }))
    await user.click(list.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(backend.of('DELETE')).toHaveLength(1))
    await waitFor(() => expect(list.queryByRole('button', { name: 'Open Bram' })).not.toBeInTheDocument())
  })

  it('keeps the edit and rings Save when saving fails', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await openDrawer(user, 'Hair and beard')
    await user.click(drawer('Hair and beard').getByRole('button', { name: 'Bob' }))
    backend.failNext('/projects/p1/characters/chr_a', 500, 'Could not write')
    await user.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not write')
    expect(save()).toBeEnabled()
  })
})
