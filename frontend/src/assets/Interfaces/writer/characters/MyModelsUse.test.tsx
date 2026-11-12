import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterDoc, CharacterFigure, ModelContent, PublishedModelOut } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { charactersBackend } from '../../../../test/charactersBackend'
import CharactersConsole from './CharactersConsole'
import { START_MODEL_KEY, startModelOf } from './figure/figureStart'
import { choiceLabel, getModelChoices } from './figure/modelChoices'

vi.setConfig({ testTimeout: 60000 })

// The writer's own models in the places a character is drawn from a model (phase 7a): the lists of models beside the plus, in Make a mannequin and in Use another model list them after
// Scriblr's, marked "(mine)", and a character made on one keeps its own copy of it in the project.
const seed: ModelContent = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../backend/app/seed/basic_model.json'), 'utf-8'))
const at = '2026-01-10T09:00:00.000Z'
const basic: PublishedModelOut = { id: 'basic', version: 1, publishedAt: at, content: seed }
const knight: PublishedModelOut = { id: 'my-knight', version: 3, publishedAt: at, content: { ...seed, name: 'My knight', genres: [{ id: 'g_epic', name: 'Epic' }] } }

beforeEach(() => { localStorage.clear() })

type Backend = ReturnType<typeof charactersBackend>
async function open(cast: CharacterDoc[] = [], more: Parameters<typeof charactersBackend>[1] = { published: [basic], mine: [knight] }) {
  const backend = charactersBackend(cast, more)
  const view = render(<CharactersConsole projectId="p1" />)
  await screen.findByRole('heading', { name: 'Characters', level: 2 })
  return { backend, user: userEvent.setup(), view }
}
const made = (b: Backend): Array<{ figure?: CharacterFigure }> =>
  b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'POST' && String(c[0]).endsWith('/projects/p1/characters')).map(c => JSON.parse((c[1] as RequestInit).body as string))
const modelSelect = () => screen.findByRole('combobox', { name: 'Model a new character starts with' })
const plus = () => screen.getByRole('button', { name: 'New character' })

describe('the models a character can be drawn from', () => {
  it('are the published models of the catalog, then the writer\'s own, each of those marked', async () => {
    charactersBackend([], { published: [basic], mine: [knight] })
    const list = await getModelChoices()
    expect(list.map(m => [m.id, m.mine])).toEqual([['basic', false], ['my-knight', true]])
    expect(list.map(choiceLabel)).toEqual(['Adult (basic)', 'My knight (mine)'])
    expect(list[1].version).toBe(3)
  })

  it('are the catalog\'s alone when the writer\'s library cannot be read', async () => {
    const backend = charactersBackend([], { published: [basic], mine: [knight] })
    backend.failNext('/my-models/published', 500, 'down')
    expect((await getModelChoices()).map(m => m.id)).toEqual(['basic'])
  })

  it('fail when the catalog cannot be read, whatever the writer has', async () => {
    const backend = charactersBackend([], { published: [basic], mine: [knight] })
    backend.failNext('/character-models/published', 500, 'down')
    await expect(getModelChoices()).rejects.toThrow('down')
  })

  it('name the model, or its id when it has no name', () => {
    expect(choiceLabel({ ...knight, mine: true, content: { ...knight.content, name: '' } })).toBe('my-knight (mine)')
    expect(choiceLabel({ ...basic, mine: false })).toBe('Adult (basic)')
  })
})

describe('startModelOf', () => {
  it('is the model asked for, else the basic model, else none', () => {
    expect(startModelOf([basic, knight], 'my-knight')).toBe(knight)
    expect(startModelOf([basic, knight], 'my-gone')).toBe(basic)
    expect(startModelOf([basic, knight])).toBe(basic)
    expect(startModelOf([knight], 'my-gone')).toBeNull()
    expect(startModelOf([knight], 'my-knight')).toBe(knight)
  })
})

describe('the model a new character starts with', () => {
  it('is offered beside the plus once there is a choice, the basic model first and the writer\'s own marked', async () => {
    await open()
    const select = await modelSelect()
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['Adult (basic)', 'My knight (mine)'])
    expect(select).toHaveValue('basic')
  })

  it('is not offered while the basic model is the only one', async () => {
    await open([], { published: [basic] })
    await screen.findByRole('combobox', { name: 'Genre of a new character' })
    expect(screen.queryByRole('combobox', { name: 'Model a new character starts with' })).toBeNull()
  })

  it('makes a character drawn from the model chosen, with its own copy of it in the project', async () => {
    const { backend, user } = await open()
    await user.selectOptions(await modelSelect(), 'my-knight')
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(1))
    const { figure } = made(backend)[0]
    expect(figure).toBeDefined()
    const copy = backend.copies.get(figure!.model)
    expect(copy?.modelId).toBe('my-knight')
    expect(copy?.version).toBe(3)
    expect(copy?.name).toBe('My knight')
    // the basic model was not copied for it
    expect([...backend.copies.values()].some(c => c.modelId === 'basic')).toBe(false)
  })

  it('takes the genres of the model chosen, and rolls within one of them', async () => {
    const { backend, user } = await open()
    const genre = await screen.findByRole('combobox', { name: 'Genre of a new character' })
    expect(within(genre).getAllByRole('option').map(o => o.textContent)).toEqual(['Any genre', 'Fiction', 'Fantasy', 'Non-fiction'])
    await user.selectOptions(await modelSelect(), 'my-knight')
    await waitFor(() => expect(within(screen.getByRole('combobox', { name: 'Genre of a new character' })).getAllByRole('option').map(o => o.textContent)).toEqual(['Any genre', 'Epic']))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Genre of a new character' }), 'g_epic')
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(1))
    expect(made(backend)[0].figure!.genre).toBe('g_epic')
  })

  it('is remembered on this computer', async () => {
    const { user, view } = await open()
    await user.selectOptions(await modelSelect(), 'my-knight')
    expect(localStorage.getItem(START_MODEL_KEY) ?? '').toContain('my-knight')
    view.unmount()
    await open()
    expect(await modelSelect()).toHaveValue('my-knight')
  })

  it('goes back to the basic model when the one that was remembered is not published any more', async () => {
    const first = await open()
    await first.user.selectOptions(await modelSelect(), 'my-knight')
    first.view.unmount()
    const { backend, user } = await open([], { published: [basic, { ...knight, id: 'my-other', content: { ...knight.content, name: 'Other' } }], mine: [{ ...knight, id: 'my-other', content: { ...knight.content, name: 'Other' } }] })
    expect(await modelSelect()).toHaveValue('basic')
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(1))
    expect([...backend.copies.values()].map(c => c.modelId)).toEqual(['basic'])
  })

  it('shows, and uses, the first model when there is a choice but the basic model is not one of them', async () => {
    const second: PublishedModelOut = { ...knight, id: 'my-bard', content: { ...knight.content, name: 'My bard' } }
    const { backend, user } = await open([], { published: [], mine: [knight, second] })
    const select = await modelSelect()
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['My knight (mine)', 'My bard (mine)'])
    expect(select).toHaveValue('my-knight')
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(1))
    expect([...backend.copies.values()].map(c => c.modelId)).toEqual(['my-knight'])
  })

  it('starts as a portrait when the basic model is not published, even if the writer has a model of their own', async () => {
    const { backend, user } = await open([], { published: [], mine: [knight] })
    await user.click(plus())
    await waitFor(() => expect(made(backend)).toHaveLength(1))
    // the basic model is the one a character starts on unless another is picked, and there is nothing to pick from (one model gives no dropdown)
    expect(screen.queryByRole('combobox', { name: 'Model a new character starts with' })).toBeNull()
    expect(made(backend)[0].figure).toBeUndefined()
    expect(backend.copies.size).toBe(0)
  })
})

describe('Make a mannequin', () => {
  it('lists the writer\'s own models after Scriblr\'s, marked, and copies the one chosen', async () => {
    const ada = newCharacter('chr_a', { name: 'Ada' }, 0)
    const { backend, user } = await open([ada])
    await user.click(await screen.findByRole('button', { name: 'Open Ada' }))
    await user.click(await screen.findByRole('button', { name: 'Portrait' }))
    const select = await screen.findByRole('combobox', { name: 'Model for the mannequin' })
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['Adult (basic)', 'My knight (mine)'])
    await user.selectOptions(select, 'my-knight')
    await user.click(screen.getByRole('button', { name: 'Make a mannequin' }))
    await waitFor(() => expect([...backend.copies.values()].map(c => c.modelId)).toEqual(['my-knight']))
    expect(await screen.findByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
  })
})

describe('My models in the Characters console', () => {
  it('is reached from the bar even before there is a character, and gives the page over to the designer', async () => {
    await open([], { published: [basic] })
    const button = screen.getByRole('button', { name: 'My models' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    // nothing else is on the bar when there is no character to work on
    expect(screen.queryByRole('button', { name: 'Portrait' })).toBeNull()
    await userEvent.setup().click(button)
    expect(await screen.findByRole('region', { name: 'My models' }, { timeout: 15000 })).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-pressed', 'true')
    // the cast list and the character's save controls make way for it
    expect(screen.queryByRole('navigation', { name: 'Cast' })).toBeNull()
  })

  it('goes back to the character the writer was on', async () => {
    const ada = newCharacter('chr_a', { name: 'Ada' }, 0)
    const { user } = await open([ada])
    await user.click(await screen.findByRole('button', { name: 'Open Ada' }))
    await user.click(await screen.findByRole('button', { name: 'My models' }))
    expect(await screen.findByRole('region', { name: 'My models' }, { timeout: 15000 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(await screen.findByRole('navigation', { name: 'Cast' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'My models' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open Ada' })).toBeInTheDocument()
  })
})
