import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { CharacterDoc } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { charactersBackend } from '../../../../test/charactersBackend'
import CharactersConsole from './CharactersConsole'
import { PANELS_KEY } from './portraitPanels'

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
// Open a section of the portrait page (a section that is open stays open); the others close.
async function section(user: User, name: string) {
  const button = screen.getByRole('button', { name })
  if (button.getAttribute('aria-expanded') !== 'true') await user.click(button)
}
const isOpen = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-expanded') === 'true'
// Pick a choice from a picture dropdown: open it by its label and press the choice.
async function pick(user: User, label: string, choice: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${label}: `) }))
  await user.click(within(screen.getByRole('listbox', { name: label })).getByRole('option', { name: choice }))
}
const dropdown = (label: string) => screen.queryByRole('button', { name: new RegExp(`^${label}: `) })

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
    await section(user, 'Hair')
    await pick(user, 'Style', 'Two-strand twists')
    expect(puts(backend)).toHaveLength(0)
    expect(save()).toBeEnabled()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait.hairStyle).toBe('twists')
    expect(lastPut(backend).portrait.hairLength).toBe('short')
  })
})

describe('the portrait page of sections', () => {
  it('opens on the Head, with its subsections open, and a section shows only its own parts', async () => {
    const { user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    expect(isOpen('Head')).toBe(true)
    for (const name of ['Hair', 'Face', 'Body', 'Card']) expect(isOpen(name)).toBe(false)
    expect(dropdown('Age')).toBeInTheDocument()
    expect(dropdown('Head shape')).toBeInTheDocument()
    expect(dropdown('Ears')).toBeInTheDocument()
    expect(dropdown('Eyes')).not.toBeInTheDocument()
    await section(user, 'Face')
    for (const label of ['Expression', 'Eyes', 'Brows', 'Nose', 'Mouth']) expect(dropdown(label), label).toBeInTheDocument()
    expect(dropdown('Age')).not.toBeInTheDocument()
    await section(user, 'Hair')
    for (const label of ['Length', 'Texture', 'Style', 'Front', 'Hairline', 'Hairline height', 'Edges', 'Greying', 'Facial hair']) expect(dropdown(label), label).toBeInTheDocument()
    await section(user, 'Body')
    for (const label of ['Build', 'Chest', 'Top']) expect(dropdown(label), label).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Shoulder width' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Neck width' })).toBeInTheDocument()
  })

  it('opens one section at a time: opening one closes the other, and pressing the open one closes it', async () => {
    const { user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await user.click(screen.getByRole('button', { name: 'Face' }))
    expect(isOpen('Face')).toBe(true)
    expect(isOpen('Head')).toBe(false)
    expect(screen.queryByRole('region', { name: 'Head' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Face' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Face' }))
    expect(isOpen('Face')).toBe(false)
    expect(screen.queryByRole('region', { name: 'Face' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Head' })).not.toBeInTheDocument()
  })

  it('wires a section to what it opens, for a screen reader', async () => {
    const { user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    const head = screen.getByRole('button', { name: 'Head' })
    expect(head).toHaveAttribute('aria-controls', screen.getByRole('region', { name: 'Head' }).id)
    await user.click(head)
    expect(head).not.toHaveAttribute('aria-controls')
    // A section is a heading with a button in it, a subsection a smaller one inside it.
    await user.click(screen.getByRole('button', { name: 'Face' }))
    expect(screen.getByRole('heading', { name: 'Face', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Eyes', level: 4 })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Eyes' })).toBeInTheDocument()
  })

  it('closes and opens a subsection on its own, leaving the others open', async () => {
    const { user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await section(user, 'Face')
    const eyes = screen.getByRole('button', { name: 'Eyes' })
    expect(eyes).toHaveAttribute('aria-expanded', 'true')
    await user.click(eyes)
    expect(eyes).toHaveAttribute('aria-expanded', 'false')
    expect(dropdown('Eyes')).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Eye size' })).not.toBeInTheDocument()
    expect(dropdown('Nose')).toBeInTheDocument()
    expect(dropdown('Mouth')).toBeInTheDocument()
    await user.click(eyes)
    expect(dropdown('Eyes')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Eye size' })).toBeInTheDocument()
  })

  it('does not write a label twice where a subsection has the name of its only field', async () => {
    const { user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    const age = screen.getByRole('group', { name: 'Age' })
    expect(within(age).getByRole('button', { name: /^Age: / })).toBeInTheDocument()
    expect(age.querySelector('.charLabel')).toBeNull()
    // A subsection of several fields names each one.
    await user.click(screen.getByRole('button', { name: 'Hair' }))
    expect(within(screen.getByRole('group', { name: 'Texture and style' })).getByText('Texture')).toBeInTheDocument()
  })

  it('is remembered: the page opens the way it was left', async () => {
    const first = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await section(first.user, 'Face')
    await first.user.click(screen.getByRole('button', { name: 'Nose' }))
    expect(JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}')).toEqual({ open: 'face', closed: ['face.nose'] })
    // Another console, as when the app is opened again.
    document.body.innerHTML = ''
    render(<CharactersConsole projectId="p1" initialSection="portrait" />)
    await screen.findByRole('img', { name: /Ada/ })
    expect(isOpen('Face')).toBe(true)
    expect(isOpen('Head')).toBe(false)
    expect(screen.getByRole('button', { name: 'Nose' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Mouth' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens on the default when what was remembered is nonsense', async () => {
    localStorage.setItem(PANELS_KEY, '{"open": 7, "closed": "no"}')
    await open()
    await screen.findByRole('img', { name: /Ada/ })
    expect(isOpen('Head')).toBe(true)
  })

  it('keeps the open section when another character is opened', async () => {
    const { user } = await open()
    await screen.findByRole('img', { name: 'Ada, portrait' })
    await section(user, 'Hair')
    await user.click(within(screen.getByRole('navigation', { name: 'Cast' })).getByRole('button', { name: 'Open Bram' }))
    expect(await screen.findByRole('img', { name: 'Bram, portrait' })).toBeInTheDocument()
    expect(isOpen('Hair')).toBe(true)
  })

  it('lets the settings scroll beside the card: the stylesheet gives them a scroll and not the card', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const css = readFileSync(path.resolve(__dirname, 'characters.scss'), 'utf-8')
    const rule = (selector: string) => new RegExp(`^${selector.replace('.', '\\.')} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? ''
    expect(rule('.charAcc')).toMatch(/overflow-y: auto/)
    expect(rule('.charAcc')).toMatch(/min-height: 0/)
    expect(rule('.charPortrait')).toMatch(/min-height: 0/)
    expect(rule('.charPortraitStage')).not.toMatch(/overflow/)
    // The card never scrolls away with the settings, and it never covers them.
    expect(rule('.charPortraitStage')).not.toMatch(/sticky/)
  })
})

describe('the parts of the portrait', () => {
  it('a slider changes the portrait, and many moves of it are one undo step', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await section(user, 'Face')
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
    await section(user, 'Face')
    await pick(user, 'Eyes', 'Round')
    await pick(user, 'Nose', 'Button')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait).toMatchObject({ eyes: 'round', nose: 'straight' })
  })

  it('chooses an age in the Head and an expression in the Face', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await pick(user, 'Age', 'Elderly')
    await section(user, 'Face')
    await pick(user, 'Expression', 'Angry')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait).toMatchObject({ expression: 'angry', age: 'elderly' })
  })

  it('shows only the hair styles the length allows, and refits a style the new length does not allow', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await section(user, 'Hair')
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
    await section(user, 'Face')
    await user.click(within(screen.getByRole('group', { name: 'Brow colour' })).getByRole('button', { name: 'Brow colour #111111' }))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait.browColor).toBe('#111111')
    await user.click(within(screen.getByRole('group', { name: 'Brow colour' })).getByRole('button', { name: 'Same as the hair' }))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(2))
    expect(lastPut(backend).portrait.browColor).toBeNull()
  })

  it('the Card section sets the tile colour and renames the character', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await section(user, 'Card')
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

  it('sets the width of the shoulders and of the neck with sliders, and they are saved', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await section(user, 'Body')
    fireEvent.change(screen.getByRole('slider', { name: 'Shoulder width' }), { target: { value: '1.2' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Neck width' }), { target: { value: '0.85' } })
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait).toMatchObject({ shoulderWidth: 1.2, neckWidth: 0.85 })
  })

  it('offers many necklines, and saves the one that is chosen', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await section(user, 'Body')
    await user.click(screen.getByRole('button', { name: /^Top: / }))
    const tops = within(screen.getByRole('listbox', { name: 'Top' })).getAllByRole('option').map(o => o.textContent)
    expect(tops.length).toBeGreaterThanOrEqual(12)
    for (const name of ['Crew neck', 'V-neck', 'Deep V', 'Square neck', 'Sweetheart', 'Boat neck', 'Cowl neck', 'Off the shoulder', 'Strapless', 'Polo collar', 'Turtleneck']) expect(tops).toContain(name)
    await user.click(within(screen.getByRole('listbox', { name: 'Top' })).getByRole('option', { name: 'Cowl neck' }))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait.top).toBe('cowl')
  })
})

describe('the placement and the ends of the hair', () => {
  const longHair = (): CharacterDoc => {
    const doc = ada()
    doc.portrait = { ...doc.portrait, hairLength: 'hip', hairTexture: '1B' }
    return doc
  }

  it('are not a choice for short hair, and a note says why', async () => {
    const { user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await section(user, 'Hair')
    expect(dropdown('Placement')).not.toBeInTheDocument()
    expect(dropdown('Ends')).not.toBeInTheDocument()
    expect(screen.getByText(/Placement and ends are a choice for loose hair from the chin down/)).toBeInTheDocument()
  })

  it('are a choice for long loose hair, with six placements and three ends', async () => {
    const { user } = await open([longHair()])
    await screen.findByRole('img', { name: /Ada/ })
    await section(user, 'Hair')
    expect(screen.queryByText(/Placement and ends are a choice/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Placement: / }))
    expect(within(screen.getByRole('listbox', { name: 'Placement' })).getAllByRole('option').map(o => o.textContent)).toEqual([
      'All front, even', 'All front, left', 'All front, right', 'Left front', 'Right front', 'All behind',
    ])
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /^Ends: / }))
    expect(within(screen.getByRole('listbox', { name: 'Ends' })).getAllByRole('option').map(o => o.textContent)).toEqual(['Straight', 'Curve in', 'Curve out'])
  })

  it('are saved with the character', async () => {
    const { backend, user } = await open([longHair()])
    await screen.findByRole('img', { name: /Ada/ })
    await section(user, 'Hair')
    await pick(user, 'Placement', 'All behind')
    await pick(user, 'Ends', 'Curve out')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait).toMatchObject({ hairPlacement: 'behind', hairEnds: 'out', hairLength: 'hip' })
  })

  it('go back to the usual when the hair is cut short, and when the style does not allow them', async () => {
    const { backend, user } = await open([longHair()])
    await screen.findByRole('img', { name: /Ada/ })
    await section(user, 'Hair')
    await pick(user, 'Placement', 'Left front')
    await pick(user, 'Ends', 'Curve in')
    await pick(user, 'Style', '2 braids')
    expect(dropdown('Placement')).not.toBeInTheDocument()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).portrait).toMatchObject({ hairStyle: 'twobraids', hairPlacement: 'front', hairEnds: 'straight' })
    await pick(user, 'Length', 'Short')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(2))
    expect(lastPut(backend).portrait).toMatchObject({ hairLength: 'short', hairStyle: 'plain', hairPlacement: 'front', hairEnds: 'straight' })
  })

  it('give a triangle only the front and behind', async () => {
    const { user } = await open([longHair()])
    await screen.findByRole('img', { name: /Ada/ })
    await section(user, 'Hair')
    await pick(user, 'Length', 'Chest')
    await pick(user, 'Style', 'Triangle shape')
    await user.click(screen.getByRole('button', { name: /^Placement: / }))
    expect(within(screen.getByRole('listbox', { name: 'Placement' })).getAllByRole('option').map(o => o.textContent)).toEqual(['All front, even', 'All behind'])
  })
})

describe('the character in the cast', () => {
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
    await section(user, 'Face')
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
    doc.portrait = { ...doc.portrait, hairColor: '#8f3a1e', age: 'older', hairEnds: 'out', shoulderWidth: 1.2 }
    const { backend, user } = await open([doc])
    await user.click(within(await screen.findByRole('navigation', { name: 'Cast' })).getByRole('button', { name: 'Copy Ada' }))
    await waitFor(() => expect(backend.of('POST')).toHaveLength(1))
    const copy = [...backend.cast.values()].find(c => c.name === 'Ada (copy)')
    expect(copy?.portrait).toMatchObject({ hairColor: '#8f3a1e', age: 'older', hairEnds: 'out', shoulderWidth: 1.2 })
  })

  it('keeps the edit and rings Save when saving fails', async () => {
    const { backend, user } = await open()
    await screen.findByRole('img', { name: /Ada/ })
    await section(user, 'Face')
    await pick(user, 'Expression', 'Sad')
    backend.failNext('/projects/p1/characters/chr_a', 500, 'Could not write')
    await user.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not write')
    expect(save()).toBeEnabled()
  })
})
