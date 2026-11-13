import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterDoc, CharacterFigure, FigureModel, ModelEntry } from '../../../../../api/types'
import { previewModels } from '../../../../../designSystem/mockCharacterModels'
import { newCharacter } from '../../../../../designSystem/mockCharacters'
import { copyOf } from '../../../../../designSystem/mockFigureModels'
import { charactersBackend } from '../../../../../test/charactersBackend'
import { draftEntry } from '../../../../../test/characterModelsBackend'
import { defaultWriterLimits } from '../../../admin/characters/engine/writerLimits'
import CharactersConsole from '../CharactersConsole'
import { __resetFigureModelsForTests } from './figureModelStore'
import { blankFigure } from './figureState'

// Edit this model, in the Mannequin group of the figure editor's first step: it opens the model a character is drawn from in My models, as a copy of its own when the model is
// Scriblr's (or one of the writer's that is no longer in the library), as it is when the model is the writer's and still there.
vi.setConfig({ testTimeout: 60000 })

const model = previewModels()[0].draft
const scriblrs = copyOf(model)                       // a model of Scriblr's: its id is not the writer's
const mine = (id = 'my-knight'): FigureModel => copyOf(model, id, 3)
const figureOf = (copy: FigureModel): CharacterFigure => blankFigure(copy.id, copy.content)
const ada = (copy: FigureModel): CharacterDoc => ({ ...newCharacter('chr_a', { name: 'Ada' }, 0), figure: figureOf(copy) })
const kept = (id: string, name: string): ModelEntry => draftEntry(id, { ...model, name })

beforeEach(() => { localStorage.clear(); __resetFigureModelsForTests() })

async function openPortrait(copy: FigureModel, own: ModelEntry[] = []) {
  const backend = charactersBackend([ada(copy)], { copies: [copy], own })
  render(<CharactersConsole projectId="p1" />)
  const user = userEvent.setup()
  await screen.findByRole('textbox', { name: 'Name of the character' })
  await user.click(within(screen.getByRole('toolbar', { name: 'What to work on' })).getByRole('button', { name: 'Portrait' }))
  return { backend, user, button: () => screen.findByRole('button', { name: 'Edit this model' }) }
}
const designer = () => screen.findByRole('region', { name: 'My models' }, { timeout: 20000 })
const nameBox = () => screen.getByRole('textbox', { name: 'Model name' })

describe('Edit this model', () => {
  it('copies a model of Scriblr\'s into My models as a draft of the writer\'s own, and opens the copy', async () => {
    const { backend, user, button } = await openPortrait(scriblrs, [kept('my-old', 'Something else')])
    expect(screen.getByText(/Makes a copy of it in My models/)).toBeInTheDocument()
    await user.click(await button())
    await designer()
    expect(backend.ownEntries).toHaveLength(2)
    const made = backend.ownEntries[1]
    expect(made.id).toMatch(/^my-/)
    expect(made.published).toBeNull()
    expect(made.draft.name).toBe(scriblrs.content.name)
    expect(made.draft.shapes).toHaveLength(scriblrs.content.shapes.length)
    // the copy is the one that is open
    expect(nameBox()).toHaveValue(scriblrs.content.name)
    // the character keeps drawing from its own copy of the model
    expect(backend.copies.size).toBe(1)
  })

  it('names the copy so that it does not repeat a name in the library', async () => {
    const { backend, user, button } = await openPortrait(scriblrs, [kept('my-old', scriblrs.content.name)])
    await user.click(await button())
    await designer()
    expect(backend.ownEntries[1].draft.name).toBe(`${scriblrs.content.name} (copy)`)
    expect(nameBox()).toHaveValue(`${scriblrs.content.name} (copy)`)
  })

  it('opens a model of the writer\'s own that is still in the library as it is, without making a copy', async () => {
    const { backend, user, button } = await openPortrait(mine(), [kept('my-other', 'Other'), kept('my-knight', 'The knight')])
    expect(screen.getByText('This model is one of yours: it opens in My models.')).toBeInTheDocument()
    await user.click(await button())
    await designer()
    expect(backend.ownEntries.map(e => e.id)).toEqual(['my-other', 'my-knight'])
    expect(nameBox()).toHaveValue('The knight')
  })

  it('copies a model of the writer\'s own that has been deleted from the library, like any other', async () => {
    const { backend, user, button } = await openPortrait(mine(), [kept('my-other', 'Other')])
    await user.click(await button())
    await designer()
    expect(backend.ownEntries).toHaveLength(2)
    expect(backend.ownEntries[1].id).toMatch(/^my-/)
    expect(backend.ownEntries[1].id).not.toBe('my-knight')
  })

  it('says so, and changes nothing, when the library holds as many models as the admin allows', async () => {
    const { backend, user, button } = await openPortrait(scriblrs, [kept('my-a', 'A'), kept('my-b', 'B')])
    backend.limits = { ...defaultWriterLimits(), models: 2 }
    await user.click(await button())
    expect(await screen.findByRole('alert')).toHaveTextContent('Your library is full: the admin allows at most 2 models. Delete one in My models first.')
    expect(screen.queryByRole('region', { name: 'My models' })).toBeNull()
    expect(backend.ownEntries).toHaveLength(2)
  })

  it('says so when the library cannot be read, and stays where it is', async () => {
    const { backend, user, button } = await openPortrait(scriblrs)
    backend.failNext('/my-models', 500, 'down')
    await user.click(await button())
    expect(await screen.findByRole('alert')).toHaveTextContent('down')
    expect(screen.queryByRole('region', { name: 'My models' })).toBeNull()
  })

  it('leaves the character as it was: the way back to the portrait still has it', async () => {
    const { user, button } = await openPortrait(scriblrs)
    await user.click(await button())
    await designer()
    // My models gives the page over to the designer; the toolbar has the character's sections again
    await user.click(within(screen.getByRole('toolbar', { name: 'What to work on' })).getByRole('button', { name: 'Portrait' }))
    expect(await screen.findByRole('region', { name: 'Edit the figure' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'My models' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
  })

  it('asks again for the first model when My models is opened from the toolbar later', async () => {
    const { backend, user, button } = await openPortrait(scriblrs, [kept('my-old', 'Something else')])
    await user.click(await button())
    await designer()
    expect(nameBox()).toHaveValue(scriblrs.content.name)
    await user.click(within(screen.getByRole('toolbar', { name: 'What to work on' })).getByRole('button', { name: 'Appearance' }))
    await user.click(within(screen.getByRole('toolbar', { name: 'What to work on' })).getByRole('button', { name: 'My models' }))
    await designer()
    // not the copy that was asked for before: the library's own first model
    expect(nameBox()).toHaveValue('Something else')
    expect(backend.ownEntries).toHaveLength(2)
  })
})
