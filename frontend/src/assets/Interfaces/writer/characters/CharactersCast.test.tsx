import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterDoc, OutlineNode } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { charactersBackend } from '../../../../test/charactersBackend'
import { SceneCast } from './SceneCast'
import CharactersConsole from './CharactersConsole'
import { buildCharacterFile } from './charFile'

const saved = vi.hoisted(() => vi.fn())
vi.mock('../maps/mapExport', async importOriginal => ({ ...(await importOriginal<typeof import('../maps/mapExport')>()), saveBlob: saved }))
beforeEach(() => saved.mockClear())

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, order: number, title: string): OutlineNode => ({
  id, kind, parentId, order, title, synopsis: '', draftRef: null, flag: null, color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null,
})
const OUTLINE = [node('b1', 'book', null, 0, 'Book One'), node('c1', 'chapter', 'b1', 0, 'First'), node('s1', 'scene', 'c1', 0, 'Arrival')]
const person = (id: string, name: string, order: number, over: Partial<CharacterDoc> = {}): CharacterDoc => ({ ...newCharacter(id, { name }, order), ...over })
const trio = () => [person('chr_a', 'Ada', 0), person('chr_b', 'Bram', 1), person('chr_c', 'Cleo', 2)]

type Backend = ReturnType<typeof charactersBackend>
const puts = (b: Backend) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT')
const lastPut = (b: Backend) => JSON.parse((puts(b).at(-1)![1] as RequestInit).body as string) as CharacterDoc
const bodies = (b: Backend, method: string) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === method).map(c => JSON.parse((c[1] as RequestInit).body as string))

const toLook = async (user: ReturnType<typeof userEvent.setup>) => { await user.click(await screen.findByRole('button', { name: 'Look' })) }
async function openConsole(cast = trio()) {
  const backend = charactersBackend(cast)
  render(<CharactersConsole projectId="p1" outline={OUTLINE} />)
  const user = userEvent.setup()
  await toLook(user)
  await screen.findByRole('img', { name: /close-up/ })
  return { backend, user }
}
const goto = (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(within(screen.getByRole('toolbar', { name: 'What to work on' })).getByRole('button', { name }))

describe('the cast section', () => {
  it('shows every character, opens one from its card', async () => {
    const { user } = await openConsole()
    await goto(user, 'The cast')
    const overview = within(await screen.findByRole('region', { name: 'Cast overview' }))
    expect(overview.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Open Ada', 'Open Bram', 'Open Cleo'])
    await user.click(overview.getByRole('button', { name: 'Open Bram' }))
    expect(await screen.findByRole('heading', { name: 'Age Bram up or down' })).toBeInTheDocument()
  })

  it('compares two characters and says what differs', async () => {
    const bram = person('chr_b', 'Bram', 1)
    bram.look = { ...bram.look, hair: 'braid', height: 1.2 }
    bram.profile = { ...bram.profile, role: 'Mate' }
    const { user } = await openConsole([person('chr_a', 'Ada', 0), bram, person('chr_c', 'Cleo', 2)])
    await goto(user, 'The cast')
    const compare = within(await screen.findByRole('region', { name: 'Compare two characters' }))
    await user.selectOptions(compare.getByRole('combobox', { name: 'Second character' }), 'chr_b')
    expect(compare.getByText('Hair: Short > Braid')).toBeInTheDocument()
    expect(compare.getByText('Height: 100% > 120%')).toBeInTheDocument()
    expect(compare.getByText('Role: none > Mate')).toBeInTheDocument()
    expect(compare.getByRole('img', { name: 'Bram, full body' })).toBeInTheDocument()
    await user.selectOptions(compare.getByRole('combobox', { name: 'Second character' }), 'chr_c')
    expect(compare.getByText('They look and read the same.')).toBeInTheDocument()
  })

  it('ages the open character: a preview, a change that is kept, and a copy at that age', async () => {
    const { backend, user } = await openConsole()
    await goto(user, 'The cast')
    const age = within(await screen.findByRole('region', { name: 'Age' }))
    expect(age.getByRole('button', { name: /Change Ada to this/ })).toBeDisabled()
    const slider = age.getByRole('slider', { name: 'Years' })
    fireEvent.change(slider, { target: { value: '30' } })
    expect(age.getByRole('img', { name: /Ada, \d+ years older, full body/ })).toBeInTheDocument()
    await user.click(age.getByRole('button', { name: 'Make a copy at this age' }))
    await waitFor(() => expect(bodies(backend, 'POST').at(-1)?.name).toMatch(/^Ada, \d+ years older$/))
    expect(bodies(backend, 'POST').at(-1).look.hairColor).not.toBe(trio()[0].look.hairColor)
  })

  it('changes the open character to the aged look, as one edit to save', async () => {
    const { backend, user } = await openConsole()
    await goto(user, 'The cast')
    const age = within(await screen.findByRole('region', { name: 'Age' }))
    fireEvent.change(age.getByRole('slider', { name: 'Years' }), { target: { value: '40' } })
    await user.click(age.getByRole('button', { name: /Change Ada to this/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).look.hairColor).not.toBe(trio()[0].look.hairColor)
  })
})

describe('where they appear, and who is in a scene', () => {
  it('tags a character on a scene from the story section, and takes the tag off', async () => {
    const { backend, user } = await openConsole()
    await goto(user, 'Story')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Put them in a chapter or scene' }), 's1')
    expect(screen.getByRole('button', { name: /Take them out of Book One > First > Arrival/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).appearances).toEqual(['s1'])
    await user.click(screen.getByRole('button', { name: /Take them out of/ }))
    expect(screen.queryByRole('button', { name: /Take them out of/ })).not.toBeInTheDocument()
  })

  it('shows the heads of the characters tagged on a scene, read only', async () => {
    charactersBackend([person('chr_a', 'Ada', 0, { appearances: ['s1'] }), person('chr_b', 'Bram', 1)])
    render(<SceneCast projectId="p1" nodeId="s1" />)
    const group = await screen.findByRole('group', { name: 'Characters in this scene' })
    expect(within(group).getByText('Ada')).toBeInTheDocument()
    expect(within(group).queryByText('Bram')).not.toBeInTheDocument()
    expect(within(group).queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows nothing when nobody is in the scene and it cannot be edited', async () => {
    charactersBackend(trio())
    const { container } = render(<SceneCast projectId="p1" nodeId="s1" />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('tags and untags from the scene card, saving the character at once', async () => {
    const backend = charactersBackend(trio())
    const user = userEvent.setup()
    render(<SceneCast projectId="p1" nodeId="s1" editable />)
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Tag a character in this scene' }), 'chr_b')
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend)).toMatchObject({ id: 'chr_b', appearances: ['s1'] })
    await user.click(await screen.findByRole('button', { name: 'Take Bram out of this scene' }))
    await waitFor(() => expect(puts(backend)).toHaveLength(2))
    expect(lastPut(backend).appearances).toEqual([])
  })

  it('says so when the tag could not be saved, and puts it back', async () => {
    const backend = charactersBackend(trio())
    const user = userEvent.setup()
    render(<SceneCast projectId="p1" nodeId="s1" editable />)
    const select = await screen.findByRole('combobox', { name: 'Tag a character in this scene' })
    backend.failNext('/projects/p1/characters/chr_a', 500, 'no')
    await user.selectOptions(select, 'chr_a')
    expect(await screen.findByText('That could not be saved.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Take Ada out of this scene' })).not.toBeInTheDocument()
  })
})

describe('character files in the console', () => {
  it('saves one character, or the whole cast, to a file', async () => {
    const { user } = await openConsole([person('chr_a', 'Ada', 0, { relationships: [{ id: 'r1', targetId: 'chr_b', kind: 'friend', family: null, label: '', description: '', changes: [] }] }), person('chr_b', 'Bram', 1)])
    const list = within(await screen.findByRole('navigation', { name: 'Cast' }))
    await user.click(list.getByRole('button', { name: 'Save Ada to a file' }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    const read = (blob: Blob) => new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(blob) })
    const one = JSON.parse(await read(saved.mock.calls[0][0] as Blob))
    expect(one.characters.map((c: CharacterDoc) => c.id)).toEqual(['chr_a'])
    expect(one.characters[0].relationships).toEqual([])
    await user.click(list.getByRole('button', { name: 'Save the whole cast to a file' }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(2))
    expect(saved.mock.calls[1][1]).toBe('cast.scriblr-characters.json')
  })

  it('reads a file, asks about a character the project has already, and brings the characters in', async () => {
    const { backend, user } = await openConsole([person('chr_a', 'Ada', 0)])
    const file = buildCharacterFile([person('chr_a', 'Ada (old)', 0), person('chr_z', 'Zed', 1)])
    await user.upload(screen.getByLabelText('Character file'), new File([JSON.stringify(file)], 'x.scriblr-characters.json', { type: 'application/json' }))
    const form = within(await screen.findByRole('form', { name: 'Import characters' }))
    expect(form.getByRole('combobox', { name: /Ada \(old\), whom the project has already/ })).toHaveValue('both')
    await user.click(form.getByRole('button', { name: 'Import the characters' }))
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Import characters' })).not.toBeInTheDocument())
    expect(backend.of('POST')).toHaveLength(2)
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Cast' })).getAllByRole('button', { name: /^Open / })).toHaveLength(3))
  })

  it('says so when the file is not a character file', async () => {
    const { user } = await openConsole([person('chr_a', 'Ada', 0)])
    await user.upload(screen.getByLabelText('Character file'), new File(['{"nope":1}'], 'x.json', { type: 'application/json' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not a Scriblr character file')
  })
})
