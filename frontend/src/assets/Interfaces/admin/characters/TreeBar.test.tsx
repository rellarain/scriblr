import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { pick } from '../../../../test/designerUi'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { addRange, addTurn, newRange, type Edit } from './engine/rigEdit'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

vi.setConfig({ testTimeout: 30000 })

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// A head (an eye with three forms of one axis, and a skull) and a body (a shirt); a slider that tilts the head. The model has a variant (the shirt off), the body a pose, the eye a style.
function faced(): ModelContent {
  let c = content('Adult')
  c = addGroup(c, newGroup('gH', 'Head')); c = addGroup(c, newGroup('gB', 'Body'))
  c = addObject(c, 'gH', { id: 'oE', name: 'Eye', layer: 'body', shapes: [] })
  c = addShape(c, 'oE', newShape('iris', 'Iris', 'oval', box(84, 50, 32, 16)))
  c = addShape(c, 'oE', newShape('pupil', 'Pupil', 'oval', box(94, 53, 12, 10)))
  c = addObject(c, 'gH', { id: 'oS', name: 'Skull', layer: 'body', shapes: [] })
  c = addShape(c, 'oS', newShape('skull', 'Skull shape', 'oval', box(76, 20, 48, 56)))
  c = addObject(c, 'gB', { id: 'oT', name: 'Shirt', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oT', newShape('shirt', 'Shirt part', 'rounded', box(66, 86, 68, 70)))
  c = must(addRange(c, newRange('tilt', 'Tilt', 'turn', 'gH')))
  c = must(addTurn(c, 'tilt', 'gH'))
  return {
    ...c,
    objects: c.objects.map(o => (o.id === 'oE' ? {
      ...o,
      axes: [{
        id: 'aShape', name: 'Eye shape', initial: 'std',
        options: [{ id: 'std', name: 'Standard', ovr: [] }, { id: 'wide', name: 'Wide', ovr: [] }, { id: 'shut', name: 'Shut', ovr: [{ shape: 'pupil', pts: [] }] }],
      }],
    } : o)),
    presets: [
      { id: 'pBare', name: 'Bare', kind: 'Outfit', values: {}, hidden: ['oT'] },
      { id: 'pTurned', name: 'Turned', kind: 'Pose', values: { tilt: 15 }, hidden: [], scope: 'gH' },
      { id: 'pNoPupil', name: 'No pupil', kind: 'Style', values: {}, hidden: [], scope: 'oE', forms: { 'oE.aShape': 'shut' } },
    ],
  }
}

async function open(entries: ModelEntry[] = [draftEntry('a', faced())]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}

const nav = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
const canvas = () => screen.getByRole('application')
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
// the names of the cards listed in a level (the open card's children are not counted: only the cards of that list)
const listed = (level: string) => Array.from(nav().getByRole('region', { name: level }).querySelectorAll(':scope > ul > li > [data-card]')).map(el => el.getAttribute('aria-label'))
const cardOf = (kind: string, name: string) => nav().getByRole('group', { name: `${kind} ${name}` })
const mainOf = (kind: string, name: string) => within(cardOf(kind, name)).getByRole('button', { name })

describe('the nested cards', () => {
  it('lists the groups topmost first, which is the stored order reversed', async () => {
    await open()
    expect(listed('Groups')).toEqual(['Group Body', 'Group Head'])
  })

  it('shows only the open card with what is inside it: the siblings come back when nothing is open', async () => {
    const { user } = await open()
    await user.click(mainOf('Group', 'Head'))
    expect(nav().queryByRole('region', { name: 'Groups' })).toBeNull()                      // Body is not listed beside the open Head
    expect(cardOf('Group', 'Head')).toHaveTextContent('2 objects')
    expect(listed('Objects')).toEqual(['Object Skull', 'Object Eye'])                       // topmost first
    await user.click(mainOf('Object', 'Eye'))
    expect(nav().queryByRole('region', { name: 'Objects' })).toBeNull()
    expect(listed('Shapes')).toEqual(['Shape Pupil', 'Shape Iris'])
    await user.click(mainOf('Shape', 'Iris'))
    expect(nav().queryByRole('region', { name: 'Shapes' })).toBeNull()
    expect(mainOf('Shape', 'Iris')).toHaveAttribute('aria-current', 'true')
  })

  it('steps back up when the deepest open card is pressed again, to what holds it and then to the model', async () => {
    const { user } = await open()
    await pick(user, 'Iris', 'shape')
    expect(mainOf('Shape', 'Iris')).toHaveAttribute('aria-current', 'true')
    await user.click(mainOf('Shape', 'Iris'))
    expect(listed('Shapes')).toEqual(['Shape Pupil', 'Shape Iris'])                         // the object Eye is the open one now
    await user.click(mainOf('Object', 'Eye'))
    expect(listed('Objects')).toEqual(['Object Skull', 'Object Eye'])
    await user.click(mainOf('Group', 'Head'))
    expect(listed('Groups')).toEqual(['Group Body', 'Group Head'])
  })

  it('makes an open card above the deepest the deepest, closing what was under it', async () => {
    const { user } = await open()
    await pick(user, 'Iris', 'shape')
    await user.click(mainOf('Group', 'Head'))                                               // Head is open but Iris is deeper: pressing Head makes it the open one
    expect(listed('Objects')).toEqual(['Object Skull', 'Object Eye'])
  })

  it('goes down to a card from the search, opening the path to it', async () => {
    const { user } = await open()
    await user.type(screen.getByRole('textbox', { name: 'Search the model' }), 'pup')
    const hits = nav().getByRole('list', { name: 'Search results' })
    expect(within(hits).getAllByRole('button')).toHaveLength(1)
    expect(within(hits).getByRole('button')).toHaveAttribute('data-name', 'Pupil')
    expect(within(hits).getByRole('button')).toHaveTextContent('Shape · Head › Eye')
    await user.click(within(hits).getByRole('button'))
    expect(mainOf('Shape', 'Pupil')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('textbox', { name: 'Search the model' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Pupil')
  })

  it('says when nothing has the text in its name', async () => {
    const { user } = await open()
    await user.type(screen.getByRole('textbox', { name: 'Search the model' }), 'zzz')
    expect(nav().getByText('Nothing in the model has that in its name.')).toBeInTheDocument()
  })
})

describe('the button at the top right of a card', () => {
  const tool = (kind: string, name: string) => within(cardOf(kind, name)).getAllByRole('button').find(b => b.classList.contains('dzCardTool'))!

  it('hides and shows a group first, and a right-click moves it on to add one beside it, then to a twin, then round again', async () => {
    const { user } = await open()
    expect(tool('Group', 'Head')).toHaveAttribute('aria-label', 'Show Head')
    expect(tool('Group', 'Head')).toHaveAttribute('aria-pressed', 'true')
    await user.click(tool('Group', 'Head'))
    expect(tool('Group', 'Head')).toHaveAttribute('aria-pressed', 'false')
    expect(pathOf('skull')).toBeNull()
    expect(pathOf('shirt')).not.toBeNull()
    fireEvent.contextMenu(tool('Group', 'Head'))
    expect(tool('Group', 'Head')).toHaveAttribute('aria-label', 'New group next to Head')
    fireEvent.contextMenu(tool('Group', 'Head'))
    expect(tool('Group', 'Head')).toHaveAttribute('aria-label', 'Make a twin of Head')
    fireEvent.contextMenu(tool('Group', 'Head'))
    expect(tool('Group', 'Head')).toHaveAttribute('aria-label', 'Show Head')
  })

  it('adds a group beside the one it is on when it is set to add', async () => {
    const { user, backend } = await open()
    fireEvent.contextMenu(tool('Group', 'Head'))
    await user.click(tool('Group', 'Head'))
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.groups).toHaveLength(3))
  })

  it('makes a twin of a group when it is set to copy', async () => {
    const { user, backend } = await open()
    fireEvent.contextMenu(tool('Group', 'Head')); fireEvent.contextMenu(tool('Group', 'Head'))
    await user.click(tool('Group', 'Head'))
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.groups.find(g => g.mirrorOf === 'gH')).toBeDefined())
  })

  it('has no hide or show on the open object, nor on a shape: they add one beside or copy', async () => {
    const { user } = await open()
    await pick(user, 'Eye', 'object')
    expect(tool('Object', 'Eye')).toHaveAttribute('aria-label', 'New object next to Eye')
    fireEvent.contextMenu(tool('Object', 'Eye'))
    expect(tool('Object', 'Eye')).toHaveAttribute('aria-label', 'Make a twin of Eye')
    fireEvent.contextMenu(tool('Object', 'Eye'))
    expect(tool('Object', 'Eye')).toHaveAttribute('aria-label', 'New object next to Eye')           // two modes only
    await pick(user, 'Iris', 'shape')
    expect(tool('Shape', 'Iris')).toHaveAttribute('aria-label', 'New shape next to Iris')
  })

  it('hides an object that is listed beside the others, and shows it again', async () => {
    const { user } = await open()
    await pick(user, 'Head', 'group')
    expect(tool('Object', 'Skull')).toHaveAttribute('aria-label', 'Show Skull')
    await user.click(tool('Object', 'Skull'))
    expect(pathOf('skull')).toBeNull()
    expect(pathOf('iris')).not.toBeNull()
    await user.click(tool('Object', 'Skull'))
    expect(pathOf('skull')).not.toBeNull()
  })

  it('hides the whole model with the open model\'s own button', async () => {
    const { user } = await open()
    await user.click(within(cardOf('Model', 'Adult')).getAllByRole('button').find(b => b.classList.contains('dzCardTool'))!)
    expect(['iris', 'skull', 'shirt'].map(pathOf)).toEqual([null, null, null])
  })
})

describe('sliding a card between its siblings', () => {
  it('moves a group with Alt + Up on its grip, topmost first, and saves the stored order', async () => {
    const { user, backend } = await open()
    screen.getByRole('button', { name: 'Move Head (Alt+Up or Down)' }).focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(listed('Groups')).toEqual(['Group Head', 'Group Body'])
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.groups.map(g => g.id)).toEqual(['gB', 'gH']))        // stored last is topmost
  })

  it('moves an object in its group the same way', async () => {
    const { user, backend } = await open()
    await pick(user, 'Head', 'group')
    screen.getByRole('button', { name: 'Move Eye (Alt+Up or Down)' }).focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(listed('Objects')).toEqual(['Object Eye', 'Object Skull'])
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.groups.find(g => g.id === 'gH')!.objects).toEqual(['oS', 'oE']))
  })
})

describe('the states a card carries', () => {
  it('lists the model\'s variants, applies one with a click and turns it off with another', async () => {
    const { user } = await open()
    const variants = () => nav().getByRole('region', { name: 'Variants' })
    expect(within(variants()).getByRole('button', { name: 'Bare' })).toBeInTheDocument()
    expect(pathOf('shirt')).not.toBeNull()
    await user.click(within(variants()).getByRole('button', { name: 'Bare' }))
    expect(pathOf('shirt')).toBeNull()                                                       // the variant hides the shirt
    expect(within(variants()).getByRole('button', { name: 'Bare' })).toHaveAttribute('aria-current', 'true')
    await user.click(within(variants()).getByRole('button', { name: 'Bare' }))
    expect(pathOf('shirt')).not.toBeNull()
  })

  it('keeps the look as a variant with the plus beside the heading', async () => {
    const { user, backend } = await open()
    await user.click(screen.getByRole('button', { name: 'Save the current look as a variant' }))
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.presets!.filter(p => !p.scope)).toHaveLength(2))
  })

  it('lists a group\'s poses inside its card and an object\'s styles inside its card', async () => {
    const { user } = await open()
    await pick(user, 'Head', 'group')
    expect(within(cardOf('Group', 'Head')).getByRole('region', { name: 'Poses' })).toHaveTextContent('Turned')
    await pick(user, 'Eye', 'object')
    expect(within(cardOf('Object', 'Eye')).getByRole('region', { name: 'Styles' })).toHaveTextContent('No pupil')
  })

  it('applies a style, which picks the form it keeps, and shows the expression that is shown now', async () => {
    const { user } = await open()
    await pick(user, 'Eye', 'object')
    const expressions = () => within(cardOf('Object', 'Eye')).getByRole('region', { name: 'Expressions' })
    expect(expressions()).toHaveTextContent('Standard')
    await user.click(within(cardOf('Object', 'Eye')).getByRole('button', { name: 'No pupil' }))
    expect(pathOf('pupil')).toBeNull()                                                       // the Shut form empties the pupil
    expect(expressions()).toHaveTextContent('Shut')
  })

  it('lists the other forms of an axis when its card is pressed, and shows the one chosen', async () => {
    const { user } = await open()
    await pick(user, 'Eye', 'object')
    const expressions = () => within(cardOf('Object', 'Eye')).getByRole('region', { name: 'Expressions' })
    await user.click(within(expressions()).getByRole('button', { name: 'Standard' }))
    expect(within(expressions()).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Expression Standard', 'Expression Wide', 'Expression Shut'])
    await user.click(within(expressions()).getByRole('button', { name: 'Shut' }))
    expect(pathOf('pupil')).toBeNull()
    expect(within(expressions()).getAllByRole('group')).toHaveLength(1)
    expect(expressions()).toHaveTextContent('Shut')
  })
})

describe('the models at the top of the tree', () => {
  it('carries the open model\'s card with its status and a way to all the models', async () => {
    await open()
    expect(cardOf('Model', 'Adult')).toHaveTextContent('Not published')
    expect(screen.getByRole('button', { name: 'Show all the models' })).toHaveAttribute('aria-expanded', 'false')
  })
})
