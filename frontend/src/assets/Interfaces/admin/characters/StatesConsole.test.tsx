import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { pick } from '../../../../test/designerUi'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { newRange } from './engine/rigEdit'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

vi.setConfig({ testTimeout: 30000 })

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// A Hand group (a palm and a finger with two forms), a slider that curls it, and (when asked for) a state Grip: Open as drawn, Closed curled with the palm off and the finger bent.
function handed(withState: boolean): ModelContent {
  let c: ModelContent = blank('Adult')
  c = addGroup(c, newGroup('gHand', 'Hand'))
  c = addObject(c, 'gHand', { id: 'oPalm', name: 'Palm', layer: 'body', shapes: [] })
  c = addShape(c, 'oPalm', newShape('palm', 'Palm shape', 'rounded', box(60, 100, 20, 20)))
  c = addObject(c, 'gHand', { id: 'oFinger', name: 'Finger', layer: 'body', shapes: [], axes: [{ id: 'aBend', name: 'Bend', initial: 'straight', options: [{ id: 'straight', name: 'Straight', ovr: [] }, { id: 'bent', name: 'Bent', ovr: [] }] }] })
  c = addShape(c, 'oFinger', newShape('finger', 'Finger shape', 'oval', box(62, 80, 4, 20)))
  c = { ...c, ranges: [{ ...newRange('rCurl', 'Curl', 'points', 'gHand'), min: 0, rest: 0, max: 100 }] }
  if (withState) {
    c = {
      ...c, groups: c.groups.map(g => (g.id !== 'gHand' ? g : {
        ...g, states: [{ id: 'stGrip', name: 'Grip', options: [
          { id: 'opOpen', name: 'Open', values: {}, hidden: [], forms: {} },
          { id: 'opClosed', name: 'Closed', values: { rCurl: 80 }, hidden: ['oPalm'], forms: { 'oFinger.aBend': 'bent' } },
        ] }],
      })),
    }
  }
  return c
}

async function open(c: ModelContent = handed(true)) {
  const backend = modelsBackend([draftEntry('a', c)])
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  await pick(user, 'Hand', 'group')
  return { backend, user }
}

const canvas = () => screen.getByRole('application')
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`) as SVGPathElement | null
const states = () => within(screen.getByRole('region', { name: 'States' }))
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const draft = (b: { entries: ModelEntry[] }) => b.entries[0].draft
const handState = (b: { entries: ModelEntry[] }) => draft(b).groups.find(g => g.id === 'gHand')!.states ?? []

afterEach(() => { vi.restoreAllMocks() })

describe('the states of a group, on its card', () => {
  it('lists the options of a state: the one that is on is ticked, and choosing another sets the group', async () => {
    const { user } = await open()
    expect(states().getByRole('button', { name: 'Set Grip to Open' })).toHaveAttribute('aria-pressed', 'true')
    expect(states().getByRole('button', { name: 'Set Grip to Closed' })).toHaveAttribute('aria-pressed', 'false')
    expect(pathOf('palm')).not.toBeNull()
    await user.click(states().getByRole('button', { name: 'Set Grip to Closed' }))
    expect(states().getByRole('button', { name: 'Set Grip to Closed' })).toHaveAttribute('aria-pressed', 'true')
    expect(states().getByRole('button', { name: 'Set Grip to Open' })).toHaveAttribute('aria-pressed', 'false')
    expect(pathOf('palm')).toBeNull()                                                  // the option switches the palm off
    expect(pathOf('finger')).not.toBeNull()
    await user.click(states().getByRole('button', { name: 'Set Grip to Open' }))
    expect(pathOf('palm')).not.toBeNull()                                              // and Open puts it back
  })

  it('counts what an option sets among what is away from rest, and Reset puts it back', async () => {
    const { user } = await open()
    await user.click(states().getByRole('button', { name: 'Set Grip to Closed' }))
    expect(screen.getAllByRole('button', { name: 'Reset test values' })[0]).toHaveTextContent('3 off rest')
    await user.click(screen.getAllByRole('button', { name: 'Reset test values' })[0])
    expect(states().getByRole('button', { name: 'Set Grip to Open' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('adds a state that keeps how the group looks now, and a second option from another look', async () => {
    const { user, backend } = await open(handed(false))
    expect(states().getByText(/None yet/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add a state to Hand' }))
    expect(states().getByRole('group', { name: 'State State 1' })).toBeInTheDocument()
    expect(states().getByRole('button', { name: 'Set State 1 to Option 1' })).toHaveAttribute('aria-pressed', 'true')      // the look it kept is the look now
    await user.click(screen.getByRole('button', { name: 'Show Palm' }))                       // the palm's eye: switch it off
    expect(states().getByRole('button', { name: 'Set State 1 to Option 1' })).toHaveAttribute('aria-pressed', 'true')       // the state controls nothing of the palm yet
    await user.click(states().getByRole('button', { name: 'Add an option to State 1' }))
    expect(states().getByRole('button', { name: 'Set State 1 to Option 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(states().getByRole('button', { name: 'Set State 1 to Option 1' })).toHaveAttribute('aria-pressed', 'false')      // now it does, and Option 1 leaves it shown
    await save(user)
    const [st] = handState(backend)
    expect(st.options.map(o => [o.name, o.hidden])).toEqual([['Option 1', []], ['Option 2', ['oPalm']]])
  })

  it('names a state and its options where they are, and keeps the names', async () => {
    const { user, backend } = await open()
    const name = screen.getByRole('textbox', { name: 'Name of state Grip' })
    await user.clear(name)
    await user.type(name, 'Fist')
    const option = screen.getByRole('textbox', { name: 'Name of option Closed of Fist' })
    await user.clear(option)
    await user.type(option, 'Clenched')
    await save(user)
    const [st] = handState(backend)
    expect(st.name).toBe('Fist'); expect(st.options.map(o => o.name)).toEqual(['Open', 'Clenched'])
  })

  it('gives an option the look now, when it is updated', async () => {
    const { user, backend } = await open()
    await user.click(states().getByRole('button', { name: 'Set Grip to Closed' }))
    await user.click(screen.getByRole('button', { name: 'Show Finger' }))                      // the finger's eye: switch it off too
    await user.click(states().getByRole('button', { name: 'Update Closed of Grip from the current look' }))
    await save(user)
    expect(handState(backend)[0].options[1]).toMatchObject({ values: { rCurl: 80 }, hidden: ['oPalm', 'oFinger'], forms: { 'oFinger.aBend': 'bent' } })
  })

  it('deletes an option, but not the last one, and a state', async () => {
    const { user, backend } = await open()
    await user.click(states().getByRole('button', { name: 'Delete option Closed of Grip' }))
    expect(states().getByRole('button', { name: 'Delete option Open of Grip' })).toBeDisabled()
    await user.click(states().getByRole('button', { name: 'Delete state Grip' }))
    await save(user)
    expect(handState(backend)).toEqual([])
  })

  it('has no states for a twin, which follows its original', async () => {
    const c = handed(true)
    const twinned: ModelContent = { ...c, groups: [...c.groups, { ...newGroup('gTwin', 'Hand twin'), mirrorOf: 'gHand' }] }
    const { user } = await open(twinned)
    expect(screen.getByRole('region', { name: 'States' })).toBeInTheDocument()
    await pick(user, 'Hand twin', 'group')
    expect(screen.queryByRole('region', { name: 'States' })).toBeNull()
  })
})
