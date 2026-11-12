import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CharacterDoc, CharacterFigure, ModelContent, PublishedModelOut } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { setKv } from '../../../../settings/settingsStore'
import { charactersBackend } from '../../../../test/charactersBackend'
import CharactersConsole from './CharactersConsole'
import { START_GENRE_KEY, startModelOf } from './figure/figureStart'

vi.setConfig({ testTimeout: 60000 })

// How a new character starts (phase 6c-5): the plus makes a mannequin of the basic model with a first look rolled within the genre chosen beside it, and the plain portrait when there is
// no basic model to start from or the mannequin cannot be made.
const seed: ModelContent = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../backend/app/seed/basic_model.json'), 'utf-8'))
const basic: PublishedModelOut = { id: 'basic', version: 1, publishedAt: '2026-01-10T09:00:00.000Z', content: seed }
const other: PublishedModelOut = { id: 'dragon', version: 1, publishedAt: '2026-01-10T09:00:00.000Z', content: { ...seed, name: 'Dragon' } }

type Backend = ReturnType<typeof charactersBackend>
async function open(cast: CharacterDoc[] = [], more: Parameters<typeof charactersBackend>[1] = { published: [basic] }) {
  const backend = charactersBackend(cast, more)
  const view = render(<CharactersConsole projectId="p1" />)
  await screen.findByRole('heading', { name: 'Characters', level: 2 })
  return { backend, user: userEvent.setup(), view }
}
// What the page asked the server to make: the bodies of the POSTs to the characters.
const made = (b: Backend): Array<{ name?: string; figure?: CharacterFigure; portrait?: unknown }> =>
  b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'POST' && String(c[0]).endsWith('/projects/p1/characters')).map(c => JSON.parse((c[1] as RequestInit).body as string))
const genreSelect = () => screen.findByRole('combobox', { name: 'Genre of a new character' })
const plus = () => screen.getByRole('button', { name: 'New character' })

describe('startModelOf', () => {
  it('is the basic model among the published ones, and nothing when it is not there', () => {
    expect(startModelOf([other, basic])).toBe(basic)
    expect(startModelOf([other])).toBeNull()
    expect(startModelOf([])).toBeNull()
    expect(startModelOf(null)).toBeNull()
    expect(startModelOf(undefined)).toBeNull()
  })
})

describe('a new character', () => {
  it('is a mannequin of the basic model with a look rolled for it, the model copied to the project once', async () => {
    const { backend, user } = await open()
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(1))
    const { figure } = made(backend)[0]
    expect(figure).toBeDefined()
    expect([...backend.copies.keys()]).toEqual([figure!.model])
    expect(figure!.genre ?? null).toBeNull()
    // rolled, not the model as it was saved: it has colours chosen
    expect(Object.keys(figure!.colours).length).toBeGreaterThan(0)
    // the new character is open, and its figure is what its portrait page draws
    await user.click(await screen.findByRole('button', { name: 'Portrait' }))
    expect(await screen.findByRole('img', { name: 'Unnamed character, figure' })).toBeInTheDocument()
  })

  it('shares one copy of the model between the characters made on it, each with a look of its own', async () => {
    const { backend, user } = await open()
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(1))
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(2))
    const [a, b] = made(backend).map(m => m.figure!)
    expect(a.model).toBe(b.model)
    expect(backend.copies.size).toBe(1)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('is rolled within the genre chosen beside the plus, and the genre is remembered', async () => {
    const { backend, user, view } = await open()
    const select = await genreSelect()
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['Any genre', 'Fiction', 'Fantasy', 'Non-fiction'])
    expect(select).toHaveValue('')
    await user.selectOptions(select, 'g_fantasy')
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(1))
    expect(made(backend)[0].figure!.genre).toBe('g_fantasy')
    // another time the same genre is there
    view.unmount()
    await open([], { published: [basic] })
    expect(await genreSelect()).toHaveValue('g_fantasy')
  })

  it('is rolled in any genre when the one that was remembered is not the model\'s any more', async () => {
    setKv(START_GENRE_KEY, 'g_gone')
    const { backend, user } = await open()
    expect(await genreSelect()).toHaveValue('')
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(1))
    expect(made(backend)[0].figure!.genre ?? null).toBeNull()
  })

  it('starts as a portrait, with no genre to choose and nothing said, when the basic model is not published', async () => {
    const { backend, user } = await open([], { published: [other] })
    await screen.findByText(/Make a character to start/)
    expect(screen.queryByRole('combobox', { name: 'Genre of a new character' })).toBeNull()
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(1))
    expect(made(backend)[0].figure).toBeUndefined()
    expect(backend.copies.size).toBe(0)
    expect(backend.calls.filter(c => c.includes('figure-models') && c.startsWith('POST'))).toEqual([])
    await user.click(await screen.findByRole('button', { name: 'Portrait' }))
    expect(await screen.findByRole('img', { name: 'Unnamed character, portrait' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('starts as a portrait, and says so, when the mannequin cannot be made', async () => {
    const { backend, user } = await open()
    backend.failNext('/projects/p1/figure-models', 500, 'The copy could not be made.')
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(1))
    expect(made(backend)[0].figure).toBeUndefined()
    expect(await screen.findByRole('alert')).toHaveTextContent('The mannequin could not be made, so this character starts with a portrait.')
    // the character is made all the same, and is open
    expect(await screen.findByRole('textbox', { name: 'Name of the character' })).toHaveValue('Unnamed character')
  })

  it('leaves the characters that are there as they are', async () => {
    const ada = newCharacter('chr_a', { name: 'Ada' }, 0)
    const { backend, user } = await open([ada])
    await screen.findByRole('button', { name: 'Open Ada' })
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(1))
    expect(backend.cast.get('chr_a')!.figure ?? null).toBeNull()
    expect(within(screen.getByRole('navigation', { name: 'Cast' })).getAllByRole('button', { name: /^Open / })).toHaveLength(2)
  })
})
