import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterDoc, CharacterFigure, OutlineNode, PublishedModelOut, ReaderCharacter } from '../../../../../api/types'
import { previewModels } from '../../../../../designSystem/mockCharacterModels'
import { newCharacter } from '../../../../../designSystem/mockCharacters'
import { copyOf } from '../../../../../designSystem/mockFigureModels'
import { charactersBackend } from '../../../../../test/charactersBackend'
import { CharacterCard } from '../../readers/WorldViews'
import CharactersConsole from '../CharactersConsole'
import { defaultPortrait } from '../portrait/defaults'
import { SceneCast } from '../SceneCast'
import { CharacterArt } from './CharacterArt'
import { __resetFigureModelsForTests, registerCopies } from './figureModelStore'
import { atAge, blankFigure } from './figureState'

// The figure of a character in the places that draw a character: the art (the figure when its model copy is here, else the portrait), the cast list, the overview, Compare and
// Age, a scene's heads, the story's states, a reader's card, and the Portrait section that makes one. The heavy renders get time.
vi.setConfig({ testTimeout: 30000 })

const model = previewModels()[0].draft
const copy = copyOf(model)
const published: PublishedModelOut[] = [{ id: 'adult', version: 1, publishedAt: '2026-01-10T09:00:00.000Z', content: model }]
const figure = (over: Partial<CharacterFigure> = {}): CharacterFigure => ({ ...blankFigure(copy.id, model), ...over })
const person = (id: string, name: string, order: number, over: Partial<CharacterDoc> = {}): CharacterDoc => ({ ...newCharacter(id, { name }, order), ...over })
const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, order: number, title: string): OutlineNode => ({
  id, kind, parentId, order, title, synopsis: '', draftRef: null, flag: null, color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null,
})
const OUTLINE = [node('b1', 'book', null, 0, 'Book One'), node('c1', 'chapter', 'b1', 0, 'First'), node('s1', 'scene', 'c1', 0, 'Arrival')]

type Backend = ReturnType<typeof charactersBackend>
type User = ReturnType<typeof userEvent.setup>
const puts = (b: Backend) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT')
const lastPut = (b: Backend) => JSON.parse((puts(b).at(-1)![1] as RequestInit).body as string) as CharacterDoc
const posts = (b: Backend, tail: string) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'POST' && String(c[0]).endsWith(tail)).map(c => JSON.parse((c[1] as RequestInit).body as string))
const goto = (user: User, name: string) => user.click(within(screen.getByRole('toolbar', { name: 'What to work on' })).getByRole('button', { name }))
const drawn = (el: ParentNode) => el.querySelector('svg[data-figure]')

async function openConsole(cast: CharacterDoc[], more: Parameters<typeof charactersBackend>[1] = { copies: [copy], published }) {
  const backend = charactersBackend(cast, more)
  render(<CharactersConsole projectId="p1" outline={OUTLINE} />)
  const user = userEvent.setup()
  await screen.findByRole('textbox', { name: 'Name of the character' })
  return { backend, user }
}

beforeEach(() => __resetFigureModelsForTests())

describe('the art of a character', () => {
  it('draws the figure when its model copy is here, with shapes that have colours of their own', () => {
    registerCopies([copy])
    const { container } = render(<CharacterArt portrait={defaultPortrait()} figure={figure()} label="Ada, figure" />)
    expect(screen.getByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
    const art = drawn(container)!
    expect(art).not.toBeNull()
    const paths = [...art.querySelectorAll<SVGPathElement>('path.charFigureShape')]
    expect(paths.length).toBeGreaterThan(10)
    expect(paths.every(p => !/NaN|undefined/.test(p.getAttribute('d') ?? ''))).toBe(true)
    expect(paths.some(p => (p.getAttribute('style') ?? '').includes('--shape-fill'))).toBe(true)
    expect(art.querySelector('rect[data-tile]')?.getAttribute('fill')).toBe('#e6d6c3')
  })
  it('draws the portrait while the copy is not here, and the figure once it arrives', () => {
    const { container, rerender } = render(<CharacterArt portrait={defaultPortrait()} figure={figure()} label="Ada" />)
    expect(drawn(container)).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
    act(() => registerCopies([copy]))
    rerender(<CharacterArt portrait={defaultPortrait()} figure={figure()} label="Ada" />)
    expect(drawn(container)).not.toBeNull()
  })
  it('draws from the copies it is given when the store has none (a reader\'s book)', () => {
    const { container } = render(<CharacterArt portrait={defaultPortrait()} figure={figure()} copies={{ [copy.id]: copy }} label="Ada" />)
    expect(drawn(container)).not.toBeNull()
  })
  it('a character without a figure, and a crop of a portrait part, are the portrait', () => {
    registerCopies([copy])
    expect(drawn(render(<CharacterArt portrait={defaultPortrait()} figure={null} label="a" />).container)).toBeNull()
    expect(drawn(render(<CharacterArt portrait={defaultPortrait()} figure={figure()} crop="eyes" label="b" />).container)).toBeNull()
  })
  it('the head is a different crop of the same figure', () => {
    registerCopies([copy])
    const whole = drawn(render(<CharacterArt portrait={defaultPortrait()} figure={figure()} label="w" />).container)!
    const head = drawn(render(<CharacterArt portrait={defaultPortrait()} figure={figure()} crop="head" label="h" />).container)!
    expect(head.getAttribute('viewBox')).not.toBe(whole.getAttribute('viewBox'))
  })
  it('a bust is the model\'s bust frame, a card the whole figure, and the bust of a portrait is its card', () => {
    registerCopies([copy])
    const width = (el: Element | null) => Number(el!.getAttribute('viewBox')!.split(' ')[2])
    const bust = width(drawn(render(<CharacterArt portrait={defaultPortrait()} figure={figure()} crop="bust" label="b" />).container))
    const whole = width(drawn(render(<CharacterArt portrait={defaultPortrait()} figure={figure()} crop="card" label="w" />).container))
    expect(bust).toBeLessThan(whole)
    expect(render(<CharacterArt portrait={defaultPortrait()} figure={null} crop="bust" label="p" />).container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 200 200')
  })
})

describe('the cast', () => {
  it('draws a character with a figure in the list with the card colour of the figure, and one without as before', async () => {
    const ada = person('chr_a', 'Ada', 0, { figure: figure({ tile: '#cfe0dc' }) })
    const bram = person('chr_b', 'Bram', 1)
    await openConsole([ada, bram])
    const list = within(await screen.findByRole('navigation', { name: 'Cast' }))
    const rowOf = (name: string) => list.getByRole('button', { name: `Open ${name}` }).closest('li')!
    await waitFor(() => expect(drawn(rowOf('Ada'))).not.toBeNull())
    expect(rowOf('Ada').style.getPropertyValue('--cardBg')).toBe('#cfe0dc')
    expect(drawn(rowOf('Bram'))).toBeNull()
    expect(rowOf('Bram').querySelector('svg')).not.toBeNull()
  })

  it('draws the figure on the overview cards and in Compare, and says how two figures differ', async () => {
    const ada = person('chr_a', 'Ada', 0, { figure: figure() })
    const bram = person('chr_b', 'Bram', 1, { figure: atAge(model, figure(), 'p_form44') })
    const { user } = await openConsole([ada, bram])
    await goto(user, 'The cast')
    const overview = within(await screen.findByRole('region', { name: 'Cast overview' }))
    await waitFor(() => expect(overview.getAllByRole('button').every(b => drawn(b) !== null)).toBe(true))
    const compare = within(screen.getByRole('region', { name: 'Compare two characters' }))
    await waitFor(() => expect(compare.getByText('Age: Adult > Elder')).toBeInTheDocument())
    expect(compare.getByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
  })

  it('says when two characters are drawn another way, one as a mannequin and one as a portrait', async () => {
    const { user } = await openConsole([person('chr_a', 'Ada', 0, { figure: figure() }), person('chr_b', 'Bram', 1)])
    await goto(user, 'The cast')
    expect(await within(screen.getByRole('region', { name: 'Compare two characters' })).findByText('One is drawn as a mannequin and the other as a portrait.')).toBeInTheDocument()
  })

  it('shows a character at another age from the model\'s own ages, and changes the figure or makes a copy', async () => {
    const { backend, user } = await openConsole([person('chr_a', 'Ada', 0, { figure: figure() })])
    await goto(user, 'The cast')
    const age = within(await screen.findByRole('region', { name: 'Age' }))
    await user.click(await age.findByRole('button', { name: /^Show Ada as: / }))
    await user.click(within(screen.getByRole('listbox', { name: 'Show Ada as' })).getByRole('option', { name: 'Elder' }))
    expect(age.getByRole('img', { name: 'Ada, elder' })).toBeInTheDocument()
    await user.click(age.getByRole('button', { name: 'Make a copy at this age' }))
    await waitFor(() => expect(posts(backend, '/characters')).toHaveLength(1))
    expect(posts(backend, '/characters')[0].figure.model).toBe(copy.id)
    expect(posts(backend, '/characters')[0].name).toBe('Ada, elder')
  })

  it('changes the open character to the age and saves the figure', async () => {
    const { backend, user } = await openConsole([person('chr_a', 'Ada', 0, { figure: figure() })])
    await goto(user, 'The cast')
    const age = within(await screen.findByRole('region', { name: 'Age' }))
    await user.click(await age.findByRole('button', { name: /^Show Ada as: / }))
    await user.click(within(screen.getByRole('listbox', { name: 'Show Ada as' })).getByRole('option', { name: 'Child' }))
    await user.click(age.getByRole('button', { name: 'Change Ada to this' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(puts(backend).length).toBeGreaterThan(0))
    expect(Object.keys(lastPut(backend).figure!.values).length).toBeGreaterThan(0)
  })

  it('says a model with no ages has none to choose from', async () => {
    const bare = copyOf({ ...model, presets: [] }, 'bare')
    const { user } = await openConsole([person('chr_a', 'Ada', 0, { figure: figure({ model: bare.id }) })], { copies: [bare], published: [] })
    await goto(user, 'The cast')
    expect(await within(await screen.findByRole('region', { name: 'Age' })).findByText('This model has no ages to choose from.')).toBeInTheDocument()
  })
})

describe('the Portrait section', () => {
  it('makes a mannequin from a published model: the copy is kept in the project and the character is saved with a rolled figure', async () => {
    const { backend, user } = await openConsole([person('chr_a', 'Ada', 0)], { published })
    await goto(user, 'Portrait')
    const panel = within(await screen.findByRole('group', { name: 'Mannequin' }))
    expect(await panel.findByRole('combobox', { name: 'Model for the mannequin' })).toHaveValue('adult')
    await user.selectOptions(panel.getByRole('combobox', { name: 'Genre of the first look' }), 'g_fantasy')
    await user.click(panel.getByRole('button', { name: 'Make a mannequin' }))
    expect(await screen.findByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
    expect(posts(backend, '/figure-models')).toEqual([{ modelId: 'adult' }])
    expect(backend.copies.size).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(puts(backend).length).toBeGreaterThan(0))
    const saved = lastPut(backend).figure!
    expect(saved.model).toBe(copy.id)
    expect(saved.genre).toBe('g_fantasy')
    expect(Object.keys(saved.colours).length).toBeGreaterThan(0)
    // the portrait is kept, and its own dice are put away while the mannequin is the picture
    expect(lastPut(backend).portrait.skin).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Randomise the portrait' })).toBeNull()
  })

  it('says so when no model is published', async () => {
    const { user } = await openConsole([person('chr_a', 'Ada', 0)], { published: [] })
    await goto(user, 'Portrait')
    expect(await screen.findByText(/No model is published yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make a mannequin' })).toBeNull()
  })

  it('rolls a new look within the genre, and goes back to the portrait', async () => {
    const { backend, user } = await openConsole([person('chr_a', 'Ada', 0, { figure: figure({ genre: 'g_fiction' }) })])
    await goto(user, 'Portrait')
    const panel = within(await screen.findByRole('group', { name: 'Mannequin' }))
    expect(await panel.findByText(/Drawn from Adult \(basic\), version 1/)).toBeInTheDocument()
    expect(panel.getByRole('combobox', { name: 'Genre to roll within' })).toHaveValue('g_fiction')
    await user.click(panel.getByRole('button', { name: 'Roll a new look' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(puts(backend).length).toBeGreaterThan(0))
    const rolled = lastPut(backend).figure!
    expect(rolled.genre).toBe('g_fiction')
    expect(JSON.stringify(rolled)).not.toBe(JSON.stringify(figure({ genre: 'g_fiction' })))
    for (const c of Object.values(rolled.colours)) if (c.src === 'colour') expect(c.id).not.toMatch(/_f\d+$/)
    await user.click(panel.getByRole('button', { name: 'Go back to the portrait' }))
    expect(await screen.findByRole('img', { name: 'Ada, portrait' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(lastPut(backend).figure ?? null).toBeNull())
  })

  it('a copy of a character keeps the figure, and the copy of the model is shared', async () => {
    const { backend, user } = await openConsole([person('chr_a', 'Ada', 0, { figure: figure({ values: { r_head: 95 } }) })])
    await user.click(await screen.findByRole('button', { name: 'Copy Ada' }))
    await waitFor(() => expect(posts(backend, '/characters')).toHaveLength(1))
    expect(posts(backend, '/characters')[0].figure).toMatchObject({ model: copy.id, values: { r_head: 95 } })
    expect(posts(backend, '/figure-models')).toHaveLength(0)
  })
})

describe('the words', () => {
  it('writes the empty Appearance fields from the mannequin when the character has one', async () => {
    const { backend, user } = await openConsole([person('chr_a', 'Ada', 0, { figure: figure({ colours: { k_skin: { src: 'colour', id: 'c_skin_2' } } }) })])
    await user.click(await screen.findByRole('button', { name: 'Write the empty fields from the mannequin' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(puts(backend).length).toBeGreaterThan(0))
    expect(lastPut(backend).profile.build).toBe('Average')
    expect(lastPut(backend).profile.skin).toMatch(/ skin$/)
    expect(lastPut(backend).profile.height).toBe('')
  })
})

describe('a scene and the story', () => {
  it('a scene head is the face of the figure', async () => {
    const backend = charactersBackend([person('chr_a', 'Ada', 0, { figure: figure(), appearances: ['s1'] })], { copies: [copy] })
    const { container } = render(<SceneCast projectId="p1" nodeId="s1" />)
    await waitFor(() => expect(drawn(container)).not.toBeNull())
    expect(backend.of('GET').some(c => c.endsWith('/figure-models'))).toBe(true)
    const face = drawn(container)!.getAttribute('viewBox')!.split(' ').map(Number)
    expect(face[2]).toBeLessThan(80)
  })

  it('captures the figure in a state, shows it, and forgets it', async () => {
    const { backend, user } = await openConsole([person('chr_a', 'Ada', 0, { figure: figure() })])
    await goto(user, 'Story')
    await user.click(screen.getByRole('button', { name: 'Add a state' }))
    await user.click(screen.getByRole('button', { name: 'Capture the figure now' }))
    const state = within(screen.getByRole('listitem', { name: 'State 1' }))
    expect(await state.findByRole('img', { name: 'Figure kept for state 1' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(puts(backend).length).toBeGreaterThan(0))
    expect(lastPut(backend).states[0].figure?.model).toBe(copy.id)
    expect(lastPut(backend).states[0].portrait ?? null).toBeNull()
    await user.click(state.getByRole('button', { name: 'Forget the figure' }))
    expect(state.queryByRole('img', { name: 'Figure kept for state 1' })).toBeNull()
  })

  it('tells what changed between two captured figures', async () => {
    const aged = atAge(model, figure(), 'p_form44')
    const doc = person('chr_a', 'Ada', 0, {
      figure: figure(),
      states: [
        { id: 's1', at: 'c1', storyTime: '', mood: '', goal: '', where: '', note: '', inventory: [], portrait: null, figure: figure() },
        { id: 's2', at: 's1', storyTime: '', mood: '', goal: '', where: '', note: '', inventory: [], portrait: null, figure: aged },
      ],
    })
    const { user } = await openConsole([doc])
    await goto(user, 'Story')
    expect(await screen.findByText('Age: Adult > Elder')).toBeInTheDocument()
  })
})

describe('a reader\'s card', () => {
  const card = (over: Partial<ReaderCharacter> = {}): ReaderCharacter => ({ id: 'chr_a', name: 'Ada', portrait: defaultPortrait(), figure: figure(), fields: [], relationships: [], ...over })
  it('draws the figure from the copies the book carries', () => {
    const { container } = render(<CharacterCard card={card()} copies={{ [copy.id]: copy }} />)
    expect(drawn(container)).not.toBeNull()
    expect(screen.getByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
  })
  it('draws the portrait for a character without a figure, or whose copy the book does not carry', () => {
    expect(drawn(render(<CharacterCard card={card({ figure: null })} copies={{}} />).container)).toBeNull()
    expect(drawn(render(<CharacterCard card={card()} copies={{}} />).container)).toBeNull()
  })
})
