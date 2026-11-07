import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { CharacterDoc, OutlineNode } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { charactersBackend } from '../../../../test/charactersBackend'
import CharactersConsole from './CharactersConsole'

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, order: number, title: string): OutlineNode => ({
  id, kind, parentId, order, title, synopsis: '', draftRef: null, flag: null, color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null,
})
const OUTLINE = [node('b1', 'book', null, 0, 'Book One'), node('c1', 'chapter', 'b1', 0, 'First'), node('c2', 'chapter', 'b1', 1, 'Second'), node('s1', 'scene', 'c1', 0, 'Arrival')]

const ada = (): CharacterDoc => newCharacter('chr_a', { name: 'Ada' }, 0)
const bram = (): CharacterDoc => newCharacter('chr_b', { name: 'Bram' }, 1)
const cleo = (): CharacterDoc => newCharacter('chr_c', { name: 'Cleo' }, 2)

const toLook = async (user: ReturnType<typeof userEvent.setup>) => { await user.click(await screen.findByRole('button', { name: 'Look' })) }
async function open(cast: CharacterDoc[] = [ada(), bram(), cleo()]) {
  const backend = charactersBackend(cast)
  render(<CharactersConsole projectId="p1" outline={OUTLINE} />)
  await screen.findByRole('heading', { name: 'Characters', level: 2 })
  const user = userEvent.setup()
  await toLook(user)
  await screen.findByRole('img', { name: /close-up/ })
  return { backend, user }
}
type Backend = ReturnType<typeof charactersBackend>
const save = () => screen.getByRole('button', { name: 'Save' })
const puts = (b: Backend) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT')
const lastPut = (b: Backend) => JSON.parse((puts(b).at(-1)![1] as RequestInit).body as string) as CharacterDoc
const goto = (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(within(screen.getByRole('toolbar', { name: 'What to work on' })).getByRole('button', { name }))

describe('the profile', () => {
  it('is edited in place, and typing in a field is one undo step', async () => {
    const { backend, user } = await open()
    await goto(user, 'Profile')
    await user.type(screen.getByRole('textbox', { name: 'Role in the story' }), 'Navigator')
    await user.type(screen.getByRole('textbox', { name: 'Personality' }), 'Dry and careful')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).profile).toMatchObject({ role: 'Navigator', personality: 'Dry and careful' })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('textbox', { name: 'Personality' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Role in the story' })).toHaveValue('Navigator')
  })

  it('has fields of your own and possessions, added and removed', async () => {
    const { backend, user } = await open()
    await goto(user, 'Profile')
    await user.click(screen.getByRole('button', { name: 'Add a field' }))
    await user.type(screen.getByRole('textbox', { name: 'Label of field 1' }), 'Motto')
    await user.type(screen.getByRole('textbox', { name: 'Text of field 1' }), 'Measure twice')
    await user.click(screen.getByRole('button', { name: 'Add a possession' }))
    await user.type(screen.getByRole('textbox', { name: 'Name of possession 1' }), 'Sextant')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).profile.fields).toMatchObject([{ label: 'Motto', value: 'Measure twice' }])
    expect(lastPut(backend).possessions).toMatchObject([{ name: 'Sextant' }])
    await user.click(screen.getByRole('button', { name: 'Remove field 1' }))
    await user.click(screen.getByRole('button', { name: 'Remove possession 1' }))
    expect(screen.queryByRole('textbox', { name: 'Label of field 1' })).not.toBeInTheDocument()
  })
})

describe('the relationships', () => {
  it('link a character to another with a kind, a label and a description, and the other sees the link', async () => {
    const { backend, user } = await open()
    await goto(user, 'Relationships')
    await user.click(await screen.findByRole('button', { name: 'Add a relationship' }))
    const who = await screen.findByRole('combobox', { name: 'Who relationship r1 is with' })
    await user.selectOptions(who, 'chr_b')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kind of relationship with Bram' }), 'rival')
    await user.type(screen.getByRole('textbox', { name: 'What Bram is to Ada' }), 'Old rival')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).relationships).toMatchObject([{ targetId: 'chr_b', kind: 'rival', label: 'Old rival' }])
    // Bram has the link in the list of who is linked to him.
    await user.click(within(screen.getByRole('navigation', { name: 'Cast' })).getByRole('button', { name: 'Open Bram' }))
    const incoming = within(await screen.findByRole('region', { name: 'Who is linked to them' }))
    expect(await incoming.findByText(/Rival: Old rival/)).toBeInTheDocument()
    expect(incoming.getByRole('button', { name: 'Ada' })).toBeInTheDocument()
  })

  it('draws the web of the cast and the family tree from family links', async () => {
    const mum = { ...ada(), relationships: [{ id: 'r1', targetId: 'chr_b', kind: 'family' as const, family: 'child' as const, label: '', description: '', changes: [] }] }
    const { user } = await open([mum, bram(), cleo()])
    await goto(user, 'Relationships')
    expect(await screen.findByRole('img', { name: /Web of relationships: Ada and Bram, Family/ })).toBeInTheDocument()
    const tree = within(screen.getByRole('region', { name: 'Family tree' }))
    expect(await tree.findByRole('group', { name: 'Children' })).toBeInTheDocument()
    expect(tree.getByRole('button', { name: 'Bram' })).toBeInTheDocument()
    await user.click(tree.getByRole('button', { name: 'Bram' }))
    expect(await screen.findByRole('heading', { name: 'Relationships of Bram' })).toBeInTheDocument()
  })

  it('change over the story, and read as they stand at a point', async () => {
    const withRel = { ...ada(), relationships: [{ id: 'r1', targetId: 'chr_b', kind: 'friend' as const, family: null, label: 'Friend', description: 'close', changes: [] }] }
    const { backend, user } = await open([withRel, bram()])
    await goto(user, 'Relationships')
    await user.click(await screen.findByRole('button', { name: /Changes over the story/ }))
    await user.click(screen.getByRole('button', { name: 'Add a change' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Where change 1 happens' }), 'c2')
    await user.type(screen.getByRole('textbox', { name: 'New label of change 1' }), 'Rival')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Read the relationships as they stand at' }), 'c2')
    expect(screen.getByText(/At this point: Rival/)).toBeInTheDocument()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).relationships[0].changes).toMatchObject([{ at: 'c2', label: 'Rival' }])
  })
})

describe('the story', () => {
  it('has states that carry forward, looked up at a point', async () => {
    const { backend, user } = await open()
    await goto(user, 'Story')
    await user.click(screen.getByRole('button', { name: 'Add a state' }))
    await user.type(screen.getByRole('textbox', { name: 'Mood in state s1' }), 'Calm')
    await user.type(screen.getByRole('textbox', { name: 'Carrying in state s1 (separate with commas)' }), 'rope, lamp, rope')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Look up the state at' }), 'c2')
    expect(screen.getByRole('status')).toHaveTextContent('From Book One > First: Calm')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).states[0]).toMatchObject({ at: 'c1', mood: 'Calm', inventory: ['rope', 'lamp'] })
  })

  it('shows what changed in how they look between two states that captured the look', async () => {
    const { user } = await open()
    await goto(user, 'Story')
    await user.click(screen.getByRole('button', { name: 'Add a state' }))
    await user.click(screen.getByRole('button', { name: 'Capture the look now' }))
    await user.click(screen.getByRole('button', { name: 'Add a state' }))
    await user.click(screen.getAllByRole('button', { name: 'Capture the look now' })[0])
    expect(await screen.findByText(/No change/)).toBeInTheDocument()
    await goto(user, 'Look')
    await user.click(screen.getByRole('button', { name: 'Hair and beard' }))
    await user.click(screen.getByRole('button', { name: 'Braid' }))
    await goto(user, 'Story')
    await user.click(screen.getAllByRole('button', { name: /Capture the look/ })[1])
    const gaps = within(screen.getByRole('region', { name: 'Changes of appearance' }))
    expect(await gaps.findByText('Hair: Short > Braid')).toBeInTheDocument()
  })

  it('has an arc in stages and a life timeline', async () => {
    const { backend, user } = await open()
    await goto(user, 'Story')
    await user.click(screen.getByRole('button', { name: 'Add an arc stage' }))
    await user.type(screen.getByRole('textbox', { name: 'Name of arc stage 1' }), 'Denial')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Where arc stage 1 begins' }), 's1')
    await user.click(screen.getByRole('button', { name: 'Add a life event' }))
    await user.type(screen.getByRole('textbox', { name: 'When life event 1 happened' }), 'Year 3')
    await user.type(screen.getByRole('textbox', { name: 'What happened in life event 1' }), 'Lost the ship')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).arc).toMatchObject([{ name: 'Denial', at: 's1' }])
    expect(lastPut(backend).events).toMatchObject([{ when: 'Year 3', title: 'Lost the ship' }])
    await user.click(screen.getByRole('button', { name: 'Remove arc stage 1' }))
    await user.click(screen.getByRole('button', { name: 'Remove life event 1' }))
    expect(screen.queryByRole('textbox', { name: 'Name of arc stage 1' })).not.toBeInTheDocument()
  })
})
