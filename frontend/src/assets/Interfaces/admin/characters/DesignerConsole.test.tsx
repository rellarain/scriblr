import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { content, draftEntry, liveEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { templateBox } from './engine/templates'
import { addGroup, addObject, addShape } from './modelContent'
import { openDrawer } from '../../../../test/designerUi'

// a model that can be published: one oval in one object in one group
function complete(name: string, shape = newShape('s', 'Skull', 'oval', templateBox('oval', 100, 46, 40))): ModelContent {
  let c = content(name)
  c = addGroup(c, { id: 'g', name: 'Head', parent: null, objects: [], pivot: null, attach: null })
  c = addObject(c, 'g', { id: 'o', name: 'Face', layer: 'body', shapes: [] })
  return addShape(c, 'o', shape)
}

// a shape with this many points on a circle (corner points, so nothing depends on handles)
function polygon(count: number) {
  const base = newShape('s', 'Round', 'circle', templateBox('circle', 100, 100, 40))
  const pts = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2
    return { x: Math.round((100 + Math.sin(a) * 40) * 100) / 100, y: Math.round((100 - Math.cos(a) * 40) * 100) / 100, m: 's' as const }
  })
  return { ...base, pts, template: undefined }
}

async function open(entries: ModelEntry[] = [liveEntry('a', complete('Adult')), draftEntry('b', content('Stylised'))]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  const view = render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user, view }
}

const list = () => screen.getByRole('complementary', { name: 'Models' })
const rowOf = (name: string) => within(list()).getByRole('button', { name: new RegExp(`^${name}`) })
const tree = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
const canvas = () => screen.getByRole('application')
const shapePaths = () => Array.from(canvas().querySelectorAll('path[data-shape]'))
const pointDot = (n: number) => screen.getByRole('button', { name: `Point ${n}` })
const puts = (b: { calls: string[] }) => b.calls.filter(c => c === 'PUT /character-models')
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))

// jsdom has no PointerEvent: the canvas listens for pointer events, which a MouseEvent with the same name reaches. It has no layout either, so the
// canvas reads its size as 704 x 616; these helpers turn a point of the figure into the pixel that lands on it.
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', init: { x?: number; y?: number; button?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: init.button ?? 0, clientX: init.x ?? 0, clientY: init.y ?? 0 }))
}
function pixelOf(worldX: number, worldY: number) {
  const [x, y, w, h] = canvas().getAttribute('viewBox')!.split(' ').map(Number)
  return { x: ((worldX - x) / w) * 704, y: ((worldY - y) / h) * 616 }
}
const dotAt = (n: number) => ({ x: Number(pointDot(n).getAttribute('cx')), y: Number(pointDot(n).getAttribute('cy')) })

describe('the list', () => {
  it('lists the models, each with where it stands, and opens the first', async () => {
    await open()
    expect(within(list()).getByText('Models · 2')).toBeInTheDocument()
    expect(rowOf('Adult')).toHaveTextContent('Published v1')
    expect(rowOf('Stylised')).toHaveTextContent('Not published')
    expect(rowOf('Adult')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('textbox', { name: 'Model name' })).toHaveValue('Adult')
    expect(shapePaths()).toHaveLength(1)
  })

  it('opens another model when its row is chosen', async () => {
    const { user } = await open()
    await user.click(rowOf('Stylised'))
    expect(screen.getByRole('textbox', { name: 'Model name' })).toHaveValue('Stylised')
    expect(shapePaths()).toHaveLength(0)
    expect(screen.getByText(/No shape yet/)).toBeInTheDocument()
  })

  it('says it is empty and makes the first model', async () => {
    const { user, backend } = await open([])
    expect(screen.getByRole('heading', { name: 'No models yet' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New model' }))
    expect(screen.getByRole('textbox', { name: 'Model name' })).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(backend.entries).toHaveLength(1))
  })

  it('shows what is loading and what failed', async () => {
    const backend = modelsBackend([])
    backend.failNext('/character-models', 500, 'The models file is damaged.')
    render(<DesignerConsole />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading the models')
    expect(await screen.findByRole('alert')).toHaveTextContent('The models file is damaged.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'No models yet' })).toBeInTheDocument()
  })
})

describe('drawing', () => {
  async function startWithOval() {
    const ctx = await open([draftEntry('a', complete('Adult'))])
    await ctx.user.click(tree().getByRole('button', { name: 'Skull' }))
    return ctx
  }

  it('adds a shape from a template into a new group and object, and selects it', async () => {
    const { user, backend } = await open([draftEntry('a', content('Adult'))])
    await user.click(screen.getByRole('button', { name: 'New shape' }))
    await user.click(screen.getByRole('menuitem', { name: 'Circle' }))
    expect(shapePaths()).toHaveLength(1)
    expect(tree().getByRole('button', { name: 'Circle' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Circle')
    expect(screen.getByText('4 of 60')).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.shapes).toHaveLength(1))
    expect(backend.entries[0].draft.groups).toHaveLength(1)
    expect(backend.entries[0].draft.objects).toHaveLength(1)
  })

  it('drags a point to where the pointer goes, and a twin follows with mirror editing', async () => {
    const { user } = await startWithOval()
    await user.click(screen.getByRole('button', { name: 'Snap' }))   // snapping off: the point lands exactly under the pointer
    const before = dotAt(2), twin = dotAt(4)
    const target = pixelOf(before.x + 7, before.y + 11)
    pointer(pointDot(2), 'pointerdown', pixelOf(before.x, before.y))
    pointer(canvas(), 'pointermove', target)
    pointer(canvas(), 'pointerup', target)
    expect(dotAt(2).x).toBeCloseTo(before.x + 7, 1)
    expect(dotAt(2).y).toBeCloseTo(before.y + 11, 1)
    expect(dotAt(4).x).toBeCloseTo(200 - dotAt(2).x, 1)   // the twin mirrors across the line at x = 100
    expect(dotAt(4).y).toBeCloseTo(dotAt(2).y, 1)
    expect(twin.y).not.toBeCloseTo(dotAt(4).y, 1)
  })

  it('nudges the selected point with the arrow keys and undoes it as one step', async () => {
    const { user } = await startWithOval()
    await user.click(screen.getByRole('button', { name: 'Select point 2' }))
    const before = dotAt(2)
    canvas().focus()
    fireEvent.keyDown(canvas(), { key: 'ArrowDown' })
    fireEvent.keyDown(canvas(), { key: 'ArrowDown', shiftKey: true })
    expect(dotAt(2).y).toBeCloseTo(before.y + 5.5, 1)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(dotAt(2).y).toBeCloseTo(before.y + 0.5, 1)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(dotAt(2).y).toBeCloseTo(before.y, 1)
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(dotAt(2).y).toBeCloseTo(before.y + 0.5, 1)
  })

  it('undoes a whole drag in one step', async () => {
    const { user } = await startWithOval()
    const before = dotAt(2)
    pointer(pointDot(2), 'pointerdown', pixelOf(before.x, before.y))
    for (const dy of [3, 6, 9, 12]) pointer(canvas(), 'pointermove', pixelOf(before.x + 3, before.y + dy))
    pointer(canvas(), 'pointerup', pixelOf(before.x + 3, before.y + 12))
    expect(dotAt(2).y).not.toBeCloseTo(before.y, 1)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(dotAt(2).y).toBeCloseTo(before.y, 1)
    expect(dotAt(2).x).toBeCloseTo(before.x, 1)
  })

  it('removes a shape and brings it back with undo', async () => {
    const { user } = await open([draftEntry('a', complete('Adult'))])
    await user.click(tree().getByRole('button', { name: 'Delete Skull' }))
    expect(shapePaths()).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(shapePaths()).toHaveLength(1)
  })

  it('cycles point editor, move shape and unselected with the right button, and unselects on the grid', async () => {
    const { user } = await open([draftEntry('a', complete('Adult'))])
    const shape = shapePaths()[0]
    const rightClick = (el: Element) => { pointer(el, 'pointerdown', { button: 2 }); pointer(canvas(), 'pointerup', { button: 2 }) }
    const note = () => document.querySelector('.cmStageNote')!

    rightClick(shape)
    expect(note()).toHaveTextContent('Point editor')
    expect(screen.getByRole('button', { name: 'Point editor' })).toHaveAttribute('aria-pressed', 'true')
    rightClick(shape)
    expect(note()).toHaveTextContent('Move shape')
    expect(screen.getByRole('button', { name: 'Move shape' })).toHaveAttribute('aria-pressed', 'true')
    rightClick(shape)
    expect(note()).toHaveTextContent('Nothing is selected')

    rightClick(shape)
    expect(note()).toHaveTextContent('Point editor')
    rightClick(canvas())
    expect(note()).toHaveTextContent('Nothing is selected')
    await user.click(tree().getByRole('button', { name: 'Head' }))
    expect(note()).toHaveTextContent('Pick a shape')
  })

  it('moves the whole shape in move mode', async () => {
    const { user } = await open([draftEntry('a', complete('Adult'))])
    await user.click(tree().getByRole('button', { name: 'Skull' }))
    await user.click(screen.getByRole('button', { name: 'Move shape' }))
    const shape = shapePaths()[0], before = shape.getAttribute('d')
    const start = pixelOf(100, 46)
    pointer(shape, 'pointerdown', start)
    pointer(canvas(), 'pointermove', { x: start.x + 20, y: start.y + 20 })
    pointer(canvas(), 'pointerup', { x: start.x + 20, y: start.y + 20 })
    expect(shapePaths()[0].getAttribute('d')).not.toBe(before)
  })

  it('adds a point on a double-clicked edge and deletes the selected point with Delete', async () => {
    const { user } = await startWithOval()
    await user.click(screen.getByRole('button', { name: 'Mirror editing' }))   // off: exactly one point is added
    expect(screen.getByText('4 of 60')).toBeInTheDocument()
    const at = pixelOf(100 + 20, 46)
    fireEvent(shapePaths()[0], new MouseEvent('dblclick', { bubbles: true, clientX: at.x, clientY: at.y }))
    expect(screen.getByText('5 of 60')).toBeInTheDocument()
    canvas().focus()
    fireEvent.keyDown(canvas(), { key: 'Delete' })
    expect(screen.getByText('4 of 60')).toBeInTheDocument()
  })
})

describe('the limits', () => {
  it('warns above 24 points and stops adding at 60', async () => {
    const { user } = await open([draftEntry('a', complete('Adult', polygon(25)))])
    await user.click(tree().getByRole('button', { name: 'Round' }))
    expect(screen.getByText('25 of 60')).toBeInTheDocument()
    expect(screen.getAllByText(/More than 24 points/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Add a point after it/ })).toBeEnabled()
  })

  it('refuses a 61st point and blocks Publish for a shape at the limit', async () => {
    const { user } = await open([draftEntry('a', complete('Adult', polygon(60)))])
    await user.click(tree().getByRole('button', { name: 'Round' }))
    expect(screen.getByText(/The most points a shape may have \(60\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add a point after it/ })).toBeDisabled()
    await openDrawer(user)
    expect(within(screen.getByRole('region', { name: 'Checks' })).getAllByText(/the limit is 60/).length).toBeGreaterThan(0)
  })
})

describe('saving and publishing', () => {
  it('saves a renamed model with Save', async () => {
    const { user, backend } = await open([draftEntry('a', complete('Adult'))])
    const name = screen.getByRole('textbox', { name: 'Model name' })
    await user.clear(name)
    await user.type(name, 'Grown-up')
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.name).toBe('Grown-up'))
    expect(puts(backend).length).toBeGreaterThan(0)
  })

  it('does not offer Publish for a model that has no name', async () => {
    const { user } = await open([draftEntry('a', content(''))])
    await openDrawer(user)
    expect(screen.getByRole('button', { name: /Publish/ })).toBeDisabled()
    expect(within(screen.getByRole('region', { name: 'Checks' })).getByText(/Publish is refused/)).toBeInTheDocument()
  })

  it('publishes, shows the version, and unpublishes', async () => {
    const { user, backend } = await open([draftEntry('a', complete('Adult'))])
    await user.click(screen.getByRole('button', { name: /^Publish/ }))
    await waitFor(() => expect(rowOf('Adult')).toHaveTextContent('Published v1'))
    expect(backend.calls).toContain('POST /character-models/a/publish')
    await user.click(screen.getByRole('button', { name: /^Unpublish/ }))
    await waitFor(() => expect(rowOf('Adult')).toHaveTextContent('Unpublished'))
  })

  it('shows unpublished changes and can discard them or bring an older version back', async () => {
    const { user } = await open([liveEntry('a', complete('Adult'))])
    const name = screen.getByRole('textbox', { name: 'Model name' })
    await user.type(name, ' II')
    expect(rowOf('Adult II')).toHaveTextContent('unpublished changes')
    await user.click(screen.getByRole('button', { name: /Discard changes/ }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Model name' })).toHaveValue('Adult'))
    await user.click(screen.getByRole('button', { name: 'Versions' }))
    expect(within(screen.getByRole('group', { name: 'Versions of Adult' })).getByText('Current')).toBeInTheDocument()
  })

  it('reports a publish the server refuses', async () => {
    const { user, backend } = await open([draftEntry('a', complete('Adult'))])
    backend.failNext('/character-models/a/publish', 422, 'Another model is already published as Adult.')
    await user.click(screen.getByRole('button', { name: /^Publish/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Another model is already published as Adult.')
  })

  it('asks before deleting a model', async () => {
    const { user, backend } = await open()
    await user.click(screen.getByRole('button', { name: 'Delete the model' }))
    expect(backend.entries).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Delete the model' }))
    await save(user)
    await waitFor(() => expect(backend.entries.map(e => e.id)).toEqual(['b']))
    expect(screen.getByRole('textbox', { name: 'Model name' })).toHaveValue('Stylised')
  })

  it('copies a model next to the original', async () => {
    const { user, backend } = await open()
    await user.click(screen.getByRole('button', { name: 'Duplicate the model' }))
    await save(user)
    await waitFor(() => expect(backend.entries).toHaveLength(3))
    expect(backend.entries[1].draft.name).toBe('Adult (copy)')
    expect(backend.entries[1].published).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Model name' })).toHaveValue('Adult (copy)')
  })
})

describe('the preview strip and the tree', () => {
  it('draws six previews of the model and a new set on request', async () => {
    const { user } = await open([draftEntry('a', complete('Adult'))])
    await openDrawer(user)
    const strip = screen.getByRole('region', { name: 'Previews' })
    expect(within(strip).getAllByRole('img')).toHaveLength(6)
    const before = within(strip).getAllByRole('img').map(s => s.innerHTML).join()
    await user.click(within(strip).getByRole('button', { name: 'Draw a new set of previews' }))
    expect(within(strip).getAllByRole('img').map(s => s.innerHTML).join()).not.toBe(before)
    expect(within(strip).getByRole('button', { name: 'Smallest' })).toBeInTheDocument()
  })

  it('says there is nothing to preview for an empty model', async () => {
    const { user } = await open([draftEntry('a', content('Empty'))])
    await openDrawer(user)
    expect(within(screen.getByRole('region', { name: 'Previews' })).getByText(/Nothing to preview/)).toBeInTheDocument()
  })

  it('finds rows with the search and reorders shapes in an object', async () => {
    let c = complete('Adult')
    c = addShape(c, 'o', newShape('t', 'Chin', 'oval', templateBox('oval', 100, 70, 20)))
    const { user, backend } = await open([draftEntry('a', c)])
    await user.type(screen.getByRole('textbox', { name: 'Search the model' }), 'chin')
    expect(tree().queryByRole('button', { name: 'Skull' })).toBeNull()   // the shape named Skull is filtered out; Chin stays
    expect(tree().getByRole('button', { name: 'Chin' })).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: 'Search the model' }))
    await user.click(tree().getByRole('button', { name: /Move Skull up in the draw order/ }))
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.objects[0].shapes).toEqual(['t', 's']))
  })
})
