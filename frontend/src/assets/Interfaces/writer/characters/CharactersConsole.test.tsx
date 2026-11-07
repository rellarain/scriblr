import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { CharacterDoc } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { charactersBackend } from '../../../../test/charactersBackend'
import CharactersConsole from './CharactersConsole'

const ada = (): CharacterDoc => newCharacter('chr_a', { name: 'Ada' }, 0)
const bram = (): CharacterDoc => newCharacter('chr_b', { name: 'Bram' }, 1)

type User = ReturnType<typeof userEvent.setup>

// A console opens on the words (Appearance); `portrait` goes on to the Portrait section, where these tests work.
async function open(cast: CharacterDoc[] = [ada(), bram()], portrait = true) {
  const backend = charactersBackend(cast)
  render(<CharactersConsole projectId="p1" />)
  await screen.findByRole('heading', { name: 'Characters', level: 2 })
  const user = userEvent.setup()
  if (portrait && cast.length > 0) await user.click(await screen.findByRole('button', { name: 'Portrait' }))
  return { backend, user }
}
type Backend = ReturnType<typeof charactersBackend>
const save = () => screen.getByRole('button', { name: 'Save' })
const puts = (b: Backend) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT')
const lastPut = (b: Backend) => JSON.parse((puts(b).at(-1)![1] as RequestInit).body as string) as CharacterDoc
const tab = (user: User, name: string) => user.click(screen.getByRole('tab', { name }))
// Pick a choice from a picture dropdown: open it by its label and press the choice.
async function pick(user: User, label: string, choice: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${label}: `) }))
  await user.click(within(screen.getByRole('listbox', { name: label })).getByRole('option', { name: choice }))
}

describe('the Characters console', () => {
  it('lists the cast and opens the first character, drawn as a portrait card', async () => {
    await open()
    const list = within(await screen.findByRole('navigation', { name: 'Cast' }))
    expect(list.getAllByRole('button', { name: /^Open / }).map(b => b.textContent)).toEqual(['Ada', 'Bram'])
    expect(await screen.findByRole('img', { name: 'Ada, portrait' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'The portrait card' })).getByText('Ada')).toBeInTheDocument()
  })

  it('says so when there is no cast, and makes a character with the plus', async () => {
    const { backend, user } = await open([])
    expect(await screen.findByText(/Make a character to start/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New character' }))
    expect(await screen.findByRole('textbox', { name: 'Name of the character' })).toHaveValue('Unnamed character')
    await user.click(screen.getByRole('button', { name: 'Portrait' }))
    expect(await screen.findByRole('img', { name: 'Unnamed character, portrait' })).toBeInTheDocument()
    expect(backend.of('POST')).toHaveLength(1)
  })

  it('shows the role and the age from the profile under the name', async () => {
    const doc = ada()
    doc.profile = { ...doc.profile, role: 'Navigator', age: '29' }
    await open([doc])
    expect(await screen.findByText('Navigator · age 29')).toBeInTheDocument()
  })

  it('keeps a pick waiting until Save, then saves the character whole', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    expect(save()).toBeDisabled()
    await tab(user, 'Hair')
    await pick(user, 'Style', 'Two-strand twists')
    expect(puts(backend)).toHaveLength(0)
    expect(save()).toBeEnabled()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait.hairStyle).toBe('twists')
    expect(lastPut(backend).portrait.hairLength).toBe('short')
  })

  it('opens the Face tab first, and a tab shows only its own parts', async () => {
    const { user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    expect(screen.getByRole('tab', { name: 'Face' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: /^Age: / })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Eyes: / })).not.toBeInTheDocument()
    await tab(user, 'Features')
    expect(screen.getByRole('button', { name: /^Eyes: / })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Age: / })).not.toBeInTheDocument()
    await tab(user, 'Hair')
    for (const label of ['Length', 'Texture', 'Style', 'Front', 'Hairline', 'Hairline height', 'Edges', 'Greying', 'Facial hair']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}: `) })).toBeInTheDocument()
    }
    await tab(user, 'Body')
    expect(screen.getByRole('button', { name: /^Build: / })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Chest: / })).toBeInTheDocument()
  })

  it('moves between the tabs with the arrow keys', async () => {
    const { user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    screen.getByRole('tab', { name: 'Face' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Features' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Features' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Card' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Face' })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps the tab when another character is opened', async () => {
    const { user } = await open()
    await screen.findByRole('img', { name: 'Ada, portrait' })
    await tab(user, 'Hair')
    await user.click(within(screen.getByRole('navigation', { name: 'Cast' })).getByRole('button', { name: 'Open Bram' }))
    expect(await screen.findByRole('img', { name: 'Bram, portrait' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Hair' })).toHaveAttribute('aria-selected', 'true')
  })

  it('a slider changes the portrait, and many moves of it are one undo step', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await tab(user, 'Features')
    const size = screen.getByRole('slider', { name: 'Eye size' })
    fireEvent.change(size, { target: { value: '1.1' } })
    fireEvent.change(size, { target: { value: '1.2' } })
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait.eyeSize).toBe(1.2)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(2))
    expect(lastPut(backend).portrait.eyeSize).toBe(1)
  })

  it('each pick is a step of its own in the undo', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await tab(user, 'Features')
    await pick(user, 'Eyes', 'Round')
    await pick(user, 'Nose', 'Button')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait).toMatchObject({ eyes: 'round', nose: 'straight' })
  })

  it('chooses an expression and an age from the Face tab', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await pick(user, 'Expression', 'Angry')
    await pick(user, 'Age', 'Elderly')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait).toMatchObject({ expression: 'angry', age: 'elderly' })
  })

  it('shows only the hair styles the length allows, and refits a style the new length does not allow', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await tab(user, 'Hair')
    await pick(user, 'Style', 'Two-strand twists')
    await user.click(screen.getByRole('button', { name: /^Style: / }))
    const styles = within(screen.getByRole('listbox', { name: 'Style' })).getAllByRole('option').map(o => o.textContent)
    expect(styles).toContain('Two-strand twists')
    expect(styles).not.toContain('1 braid')
    await user.keyboard('{Escape}')
    await pick(user, 'Length', 'Bald')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait).toMatchObject({ hairLength: 'bald', hairStyle: 'plain' })
  })

  it('a colour can be chosen and a following colour can be put back to following', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await tab(user, 'Features')
    await user.click(within(screen.getByRole('group', { name: 'Brow colour' })).getByRole('button', { name: 'Brow colour #111111' }))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait.browColor).toBe('#111111')
    await user.click(within(screen.getByRole('group', { name: 'Brow colour' })).getByRole('button', { name: 'Same as the hair' }))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(2))
    expect(lastPut(backend).portrait.browColor).toBeNull()
  })

  it('the Card tab sets the tile colour and renames the character', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await tab(user, 'Card')
    await user.click(within(screen.getByRole('group', { name: 'Tile colour' })).getByRole('button', { name: 'Tile colour #cfe0dc' }))
    const name = screen.getByRole('textbox', { name: 'Name of the character' })
    await user.clear(name)
    await user.type(name, 'Ada Marsh')
    await user.tab()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend)).toMatchObject({ name: 'Ada Marsh', portrait: { tileColor: '#cfe0dc' } })
    expect(await screen.findByRole('img', { name: 'Ada Marsh, portrait' })).toBeInTheDocument()
  })

  it('renames the character when the field is left, and a blank name is put back', async () => {
    const { backend, user } = await open(undefined, false)
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

  it('keeps the old look in the saved character, untouched', async () => {
    const doc = ada()
    doc.look = { height: 1.1, hair: 'braid' }
    const { backend, user } = await open([doc])
    await screen.findByRole('img', { name: /Ada/ })
    await pick(user, 'Expression', 'Smile')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).look).toEqual({ height: 1.1, hair: 'braid' })
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

  it('a copy keeps the portrait', async () => {
    const doc = ada()
    doc.portrait = { ...doc.portrait, hairColor: '#8f3a1e', age: 'older' }
    const { backend, user } = await open([doc])
    await user.click(within(await screen.findByRole('navigation', { name: 'Cast' })).getByRole('button', { name: 'Copy Ada' }))
    await waitFor(() => expect(backend.of('POST')).toHaveLength(1))
    const copy = [...backend.cast.values()].find(c => c.name === 'Ada (copy)')
    expect(copy?.portrait).toMatchObject({ hairColor: '#8f3a1e', age: 'older' })
  })

  it('keeps the edit and rings Save when saving fails', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await pick(user, 'Expression', 'Sad')
    backend.failNext('/projects/p1/characters/chr_a', 500, 'Could not write')
    await user.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not write')
    expect(save()).toBeEnabled()
  })
})
