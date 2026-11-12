import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterDoc, CharacterFigure, ConvertBody, FrozenPortrait, ModelContent, OutlineNode, PublishedModelOut } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { copyOf } from '../../../../designSystem/mockFigureModels'
import { charactersBackend } from '../../../../test/charactersBackend'
import CharactersConsole from './CharactersConsole'
import { __resetFigureModelsForTests } from './figure/figureModelStore'
import { blankFigure } from './figure/figureState'
import { defaultPortrait } from './portrait/defaults'

// Convert: the Portrait section's preview of a portrait next to the mannequin it would become, what it keeps in one step (the character, its story looks, its editions), and going back.
// The model is the basic one that comes with the app. The heavy renders get time.
vi.setConfig({ testTimeout: 60000 })

const seed: ModelContent = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../backend/app/seed/basic_model.json'), 'utf-8'))
const basic: PublishedModelOut = { id: 'basic', version: 1, publishedAt: '2026-01-10T09:00:00.000Z', content: seed }
const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, order: number, title: string): OutlineNode => ({
  id, kind, parentId, order, title, synopsis: '', draftRef: null, flag: null, color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null,
})
const OUTLINE = [node('b1', 'book', null, 0, 'Book One'), node('c1', 'chapter', 'b1', 0, 'First'), node('s1', 'scene', 'c1', 0, 'Arrival')]
const state = (id: string, over: Partial<CharacterDoc['states'][number]> = {}): CharacterDoc['states'][number] => ({ id, at: '', storyTime: '', mood: '', goal: '', where: '', note: '', inventory: [], snapshot: null, portrait: null, figure: null, ...over })
const FROZEN: Record<string, FrozenPortrait[]> = { chr_a: [{ bookId: 'b1', n: 1, portrait: { ...defaultPortrait(), skin: '#7a4f33' }, hasFigure: false, converted: false }] }

type User = ReturnType<typeof userEvent.setup>
const goto = (user: User, name: string) => user.click(within(screen.getByRole('toolbar', { name: 'What to work on' })).getByRole('button', { name }))
const posts = (b: ReturnType<typeof charactersBackend>, tail: string) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'POST' && String(c[0]).endsWith(tail)).map(c => JSON.parse((c[1] as RequestInit).body as string))

async function openConsole(cast: CharacterDoc[], more: Parameters<typeof charactersBackend>[1] = { published: [basic], frozen: FROZEN }) {
  const backend = charactersBackend(cast, more)
  render(<CharactersConsole projectId="p1" outline={OUTLINE} />)
  const user = userEvent.setup()
  await screen.findByRole('textbox', { name: 'Name of the character' })
  return { backend, user }
}

const ada = (over: Partial<CharacterDoc> = {}): CharacterDoc => ({
  ...newCharacter('chr_a', { name: 'Ada' }, 0),
  portrait: { ...defaultPortrait(), chest: 'full', hairStyle: 'twobraids', hairLength: 'chest', skin: '#7a4f33' },
  states: [state('s1', { portrait: { ...defaultPortrait(), age: 'older' } }), state('s2')],
  ...over,
})

beforeEach(() => __resetFigureModelsForTests())

describe('Convert a portrait to a mannequin', () => {
  it('shows the old portrait next to the mannequin it would become, and what does not carry over exactly, and changes nothing yet', async () => {
    const { backend, user } = await openConsole([ada()])
    await goto(user, 'Portrait')
    await user.click(await screen.findByRole('button', { name: 'Convert the portrait to a mannequin' }))
    const panel = within(await screen.findByRole('group', { name: 'Convert to a mannequin' }))
    expect(await panel.findByRole('img', { name: 'The portrait now' })).toBeInTheDocument()
    expect(await panel.findByRole('img', { name: 'The mannequin it would become' })).toBeInTheDocument()
    expect(panel.getByRole('img', { name: 'The whole mannequin' })).toBeInTheDocument()
    const lines = within(panel.getByRole('group', { name: 'What changes' })).getAllByRole('listitem').map(li => li.textContent)
    expect(lines).toEqual(['Hair: 2 braids is not in the model: it is drawn as loose hair.', 'Body: The full chest is not in the model: the chest is the average one.'])
    // the story look that holds a portrait and the edition card are converted with it
    expect(panel.getByRole('note')).toHaveTextContent('1 captured story look and the portrait in 1 published edition will be converted with it.')
    expect(backend.calls).toContain('GET /projects/p1/characters/chr_a/frozen')
    expect(posts(backend, '/convert')).toEqual([])
    expect(backend.cast.get('chr_a')!.figure).toBeNull()
  })

  it('converts the character, its story looks and its editions in one step, and opens the mannequin editor', async () => {
    const { backend, user } = await openConsole([ada()])
    await goto(user, 'Portrait')
    await user.click(await screen.findByRole('button', { name: 'Convert the portrait to a mannequin' }))
    const panel = within(await screen.findByRole('group', { name: 'Convert to a mannequin' }))
    await user.click(await panel.findByRole('img', { name: 'The mannequin it would become' }).then(() => panel.getByRole('button', { name: 'Convert to a mannequin' })))
    expect(await screen.findByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
    const [sent] = posts(backend, '/convert') as ConvertBody[]
    expect(sent.figure.converted).toBe(true)
    expect(Object.keys(sent.states)).toEqual(['s1'])
    expect(sent.editions.map(e => [e.bookId, e.n])).toEqual([['b1', 1]])
    // each portrait is converted for itself: the edition's was the default portrait, with short hair
    expect(sent.editions[0].figure.values.len_back_center).not.toBe(sent.figure.values.len_back_center)
    const kept = backend.cast.get('chr_a')!
    expect(kept.figure?.converted).toBe(true)
    expect(kept.states.map(s => s.figure !== null)).toEqual([true, false])
    expect(kept.portrait.hairStyle).toBe('twobraids')
    expect(backend.editionFigures.get('chr_a:b1:1')?.converted).toBe(true)
    expect(backend.copies.size).toBe(1)
  })

  it('cancels without changing anything', async () => {
    const { backend, user } = await openConsole([ada()])
    await goto(user, 'Portrait')
    await user.click(await screen.findByRole('button', { name: 'Convert the portrait to a mannequin' }))
    await user.click(await within(await screen.findByRole('group', { name: 'Convert to a mannequin' })).findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Convert to a mannequin' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Convert the portrait to a mannequin' })).toBeInTheDocument()
    expect(posts(backend, '/convert')).toEqual([])
    expect(backend.cast.get('chr_a')!.figure).toBeNull()
  })

  it('says so when the basic model is not published, and adds it', async () => {
    const { user } = await openConsole([ada()], { published: [], basic, frozen: FROZEN })
    await goto(user, 'Portrait')
    await user.click(await screen.findByRole('button', { name: 'Convert the portrait to a mannequin' }).catch(async () => {
      // with no model at all the Mannequin block offers the basic model first
      await user.click(await screen.findByRole('button', { name: 'Add the basic model' }))
      return screen.findByRole('button', { name: 'Convert the portrait to a mannequin' })
    }))
    expect(await within(await screen.findByRole('group', { name: 'Convert to a mannequin' })).findByRole('img', { name: 'The mannequin it would become' })).toBeInTheDocument()
  })

  it('goes back to the old portrait: the mannequin goes, and so do the converted story looks and editions', async () => {
    const copy = copyOf(seed)
    const converted: CharacterFigure = { ...blankFigure(copy.id, seed), converted: true }
    const { backend, user } = await openConsole([ada({ figure: converted, states: [state('s1', { portrait: defaultPortrait(), figure: converted }), state('s2')] })], { copies: [copy], published: [basic], frozen: FROZEN })
    await goto(user, 'Portrait')
    const mannequin = within(await screen.findByRole('group', { name: 'Mannequin' }))
    expect(mannequin.queryByRole('button', { name: 'Go back to the portrait' })).toBeNull()
    await user.click(await mannequin.findByRole('button', { name: 'Back to the old portrait' }))
    // asked first: nothing has changed
    expect(backend.calls.filter(c => c.endsWith('/revert'))).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Yes, back to the old portrait' }))
    await waitFor(() => expect(backend.calls).toContain('POST /projects/p1/characters/chr_a/revert'))
    expect(await screen.findByRole('img', { name: 'Ada, portrait' })).toBeInTheDocument()
    const kept = backend.cast.get('chr_a')!
    expect(kept.figure).toBeNull()
    expect(kept.states.map(s => s.figure)).toEqual([null, null])
    expect(screen.getByRole('button', { name: 'Convert the portrait to a mannequin' })).toBeInTheDocument()
  })

  it('keeps asking for a figure that was not converted: it is put away the old way', async () => {
    const copy = copyOf(seed)
    const { backend, user } = await openConsole([ada({ figure: blankFigure(copy.id, seed) })], { copies: [copy], published: [basic], frozen: FROZEN })
    await goto(user, 'Portrait')
    const mannequin = within(await screen.findByRole('group', { name: 'Mannequin' }))
    expect(await mannequin.findByRole('button', { name: 'Go back to the portrait' })).toBeInTheDocument()
    expect(mannequin.queryByRole('button', { name: 'Back to the old portrait' })).toBeNull()
    expect(backend.calls.filter(c => c.endsWith('/revert'))).toEqual([])
  })
})
