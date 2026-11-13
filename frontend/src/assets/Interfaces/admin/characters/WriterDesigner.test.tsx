import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry, WriterModelLimits } from '../../../../api/types'
import { draftEntry, liveEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { openDrawer, pick } from '../../../../test/designerUi'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { templateBox } from './engine/templates'
import { defaultWriterLimits } from './engine/writerLimits'
import { addGroup, addObject, addShape, blankContent } from './modelContent'

vi.setConfig({ testTimeout: 30000 })

// The designer of a writer's own models (My models) held to the limits the admin set for writers, and with the advanced tabs put away until the writer asks for them.

// A model of `objects` objects in one group, each of `perObject` ovals.
function model(objects: number, perObject: number, name = 'Wide'): ModelContent {
  let c = addGroup(blankContent(name), { id: 'g', name: 'Body', parent: null, objects: [], pivot: null, attach: null })
  for (let o = 0; o < objects; o++) {
    c = addObject(c, 'g', { id: `o${o}`, name: `Object ${o}`, layer: 'body', shapes: [] })
    for (let i = 0; i < perObject; i++) c = addShape(c, `o${o}`, newShape(`s${o}_${i}`, `Shape ${o}-${i}`, 'oval', templateBox('oval', 100, 46, 40)))
  }
  return c
}

const limited = (over: Partial<WriterModelLimits>): WriterModelLimits => ({ ...defaultWriterLimits(), ...over })

async function open(own: ModelEntry[], limits: WriterModelLimits = defaultWriterLimits(), props: { openId?: string } = {}) {
  const backend = modelsBackend([], own)
  backend.limits = limits
  const user = userEvent.setup()
  render(<DesignerConsole library="mine" {...props} />)
  await screen.findByRole('region', { name: 'My models' })
  return { backend, user }
}

const tabs = () => within(screen.getByRole('tablist', { name: 'Inspector tabs' })).getAllByRole('tab').map(t => t.textContent?.trim())
const note = () => screen.getAllByRole('status').map(s => s.textContent).join(' ')
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))

describe('the limits the admin set', () => {
  it('stop the shapes of an object where the limit is, and say how far the object is from it', async () => {
    const { user } = await open([draftEntry('my-1', model(1, 2))], limited({ shapesPerObject: 2 }))
    await pick(user, 'Object 0', 'object')
    expect(screen.getByText(/2 of 2 shapes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a shape to Object 0' })).toBeDisabled()
  })

  it('leave the shapes of an object that is under the limit free to grow', async () => {
    const { user } = await open([draftEntry('my-1', model(1, 2))], limited({ shapesPerObject: 3 }))
    await pick(user, 'Object 0', 'object')
    expect(screen.getByText(/2 of 3 shapes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a shape to Object 0' })).toBeEnabled()
  })

  it('stop the objects of a group and the groups of a model', async () => {
    const { user } = await open([draftEntry('my-1', model(2, 1))], limited({ objectsPerGroup: 2, groups: 1 }))
    // the groups are listed first
    expect(screen.getByRole('button', { name: 'New group' })).toBeDisabled()
    await pick(user, 'Body', 'group')
    expect(screen.getByText(/2 of 2 objects/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New object in Body' })).toBeDisabled()
  })

  it('refuse an edit that would pass a limit the buttons did not stop, with a note', async () => {
    // two shapes in two objects, and the model may hold two: copying a shape would make three
    const { user, backend } = await open([draftEntry('my-1', model(2, 1))], limited({ shapes: 2 }))
    await pick(user, 'Shape 0-0', 'shape')
    await user.click(screen.getByRole('button', { name: 'Copy Shape 0-0' }))
    expect(await screen.findByText('A model of your own may have at most 2 shapes.')).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(backend.ownEntries[0].draft.shapes).toHaveLength(2))
  })

  it('let a model that is over a limit be trimmed, and then published', async () => {
    const { user, backend } = await open([draftEntry('my-1', model(1, 3))], limited({ shapes: 2 }))
    await openDrawer(user)
    const checks = screen.getByRole('region', { name: 'Checks' })
    expect(within(checks).getByText('The model has 3 shapes: the limit for a model of your own is 2.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Publish/ })).toBeDisabled()
    // a shape can be deleted though the model is over
    await pick(user, 'Shape 0-2', 'shape')
    await user.click(screen.getByRole('button', { name: 'Delete Shape 0-2' }))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Checks' })).queryByText(/The model has 3 shapes/)).toBeNull())
    expect(screen.getByRole('button', { name: /Publish/ })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /Publish/ }))
    await waitFor(() => expect(backend.ownEntries[0].published?.version).toBe(1))
  })

  it('show the size of a character\'s copy against the limit of the writer', async () => {
    const { user } = await open([draftEntry('my-1', model(1, 2))], limited({ copyKb: 16 }))
    await openDrawer(user)
    expect(within(screen.getByRole('region', { name: 'Checks' })).getByText(/your limit is 16/)).toBeInTheDocument()
  })

  it('are the admin\'s own where the admin has set none', async () => {
    const { user } = await open([draftEntry('my-1', model(1, 2))])
    await pick(user, 'Object 0', 'object')
    expect(screen.getByText(/2 of 72 shapes/)).toBeInTheDocument()
  })

  it('are the admin\'s own when they cannot be read, and the designer still opens', async () => {
    const backend = modelsBackend([], [draftEntry('my-1', model(1, 2))])
    backend.failNext('/my-models/limits', 500, 'down')
    const user = userEvent.setup()
    render(<DesignerConsole library="mine" />)
    await screen.findByRole('region', { name: 'My models' })
    await pick(user, 'Object 0', 'object')
    expect(screen.getByText(/2 of 72 shapes/)).toBeInTheDocument()
  })
})

describe('a full library', () => {
  const two = () => [liveEntry('my-1', model(1, 1, 'One')), draftEntry('my-2', model(1, 1, 'Two'))]

  it('cannot take another model: the buttons that add one are off, and a duplicate says why', async () => {
    const { user, backend } = await open(two(), limited({ models: 2 }))
    await user.click(screen.getByRole('button', { name: 'Show all the models' }))
    expect(screen.getByRole('button', { name: 'New model' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Import models from a file' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Duplicate a Scriblr model' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Duplicate the model' }))
    expect(await screen.findByText('Your library is full: the admin allows at most 2 models.')).toBeInTheDocument()
    expect(backend.ownEntries).toHaveLength(2)
  })

  it('has room for one more under the limit', async () => {
    const { user } = await open(two(), limited({ models: 3 }))
    await user.click(screen.getByRole('button', { name: 'Show all the models' }))
    expect(screen.getByRole('button', { name: 'New model' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'New model' }))
    await save(user)
  })
})

describe('the advanced tools', () => {
  const own = () => [draftEntry('my-1', model(1, 1))]
  const ADVANCED = ['Rig', 'Fields', 'Proportions', 'Frames']

  it('are put away at first: the Rig, Fields, Proportions and Frames tabs are not offered', async () => {
    const { user } = await open(own())
    await pick(user, 'Shape 0-0', 'shape')
    const shown = tabs()
    for (const name of ADVANCED) expect(shown, name).not.toContain(name)
    expect(shown).toEqual(expect.arrayContaining(['Shape', 'Ranges', 'Forms', 'Presets', 'Colour']))
    expect(screen.getByRole('button', { name: 'Show advanced tools' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('come with the switch, and go again with it', async () => {
    const { user } = await open(own())
    await pick(user, 'Shape 0-0', 'shape')
    await user.click(screen.getByRole('button', { name: 'Show advanced tools' }))
    expect(screen.getByRole('button', { name: 'Show advanced tools' })).toHaveAttribute('aria-pressed', 'true')
    for (const name of ADVANCED) expect(tabs(), name).toContain(name)
    // on a tab that is put away, the open tab is the Shape tab
    await user.click(screen.getByRole('tab', { name: 'Frames' }))
    expect(screen.getByRole('tab', { name: 'Frames' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('button', { name: 'Show advanced tools' }))
    expect(screen.getByRole('tab', { name: 'Shape' })).toHaveAttribute('aria-selected', 'true')
    expect(tabs()).not.toContain('Frames')
  })

  it('stay as they were left on this computer', async () => {
    const first = await open(own())
    await first.user.click(screen.getByRole('button', { name: 'Show advanced tools' }))
    expect(window.localStorage.getItem('scriblr.designer.advanced')).toBe('true')
    // the designer is opened again
    document.body.innerHTML = ''
    const second = await open(own())
    expect(screen.getByRole('button', { name: 'Show advanced tools' })).toHaveAttribute('aria-pressed', 'true')
    await pick(second.user, 'Shape 0-0', 'shape')
    expect(tabs()).toContain('Rig')
  })

  it('are all there in the admin\'s designer, which has no switch', async () => {
    const backend = modelsBackend([draftEntry('a', model(1, 1))])
    expect(backend.ownEntries).toEqual([])
    const user = userEvent.setup()
    render(<DesignerConsole />)
    await screen.findByRole('region', { name: 'Designer' })
    await pick(user, 'Shape 0-0', 'shape')
    for (const name of ADVANCED) expect(tabs(), name).toContain(name)
    expect(screen.queryByRole('button', { name: 'Show advanced tools' })).toBeNull()
  })
})

describe('opening a model', () => {
  it('opens the model it is asked for first', async () => {
    await open([draftEntry('my-1', model(1, 1, 'First')), draftEntry('my-2', model(1, 1, 'Second'))], defaultWriterLimits(), { openId: 'my-2' })
    expect(screen.getByRole('textbox', { name: 'Model name' })).toHaveValue('Second')
  })

  it('opens the first model when it is asked for one that is not there', async () => {
    await open([draftEntry('my-1', model(1, 1, 'First'))], defaultWriterLimits(), { openId: 'my-9' })
    expect(screen.getByRole('textbox', { name: 'Model name' })).toHaveValue('First')
  })
})
