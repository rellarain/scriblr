import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry, ModelShape } from '../../../../api/types'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { pick } from '../../../../test/designerUi'

// Phase A3 in the console: the angle menu and the Turn slider, a shape drawn at a key angle by moving its points there, the Turning section (depth, roundness, the
// point's depth, what an object lies on) and editing held off between key angles.
vi.setConfig({ testTimeout: 30000 })

const sharp = (id: string, name: string, pts: Array<[number, number]>): ModelShape => ({ id, name, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
function figure(): ModelContent {
  let c = content('Adult')
  c = addGroup(c, newGroup('gBody', 'Upper body'))
  c = addObject(c, 'gBody', { id: 'oBody', name: 'Torso part', layer: 'body', shapes: [] })
  c = addShape(c, 'oBody', sharp('body', 'Body', [[60, 60], [140, 60], [140, 160], [60, 160]]))
  c = addObject(c, 'gBody', { id: 'oEye', name: 'Eye part', layer: 'body', shapes: [] })
  c = addShape(c, 'oEye', sharp('eye', 'Eye', [[90, 80], [110, 80], [110, 90], [90, 90]]))
  return c
}
async function open(entries: ModelEntry[] = [draftEntry('a', figure())]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}
const canvas = () => screen.getByRole('application')
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const saved = (b: { entries: ModelEntry[] }, id: string) => b.entries[0].draft.shapes.find(s => s.id === id)!
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', init: { x?: number; y?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: init.x ?? 0, clientY: init.y ?? 0 }))
}
function pixelOf(worldX: number, worldY: number) {
  const [x, y, w, h] = canvas().getAttribute('viewBox')!.split(' ').map(Number)
  return { x: ((worldX - x) / w) * 704, y: ((worldY - y) / h) * 616 }
}
async function dragPoint(user: ReturnType<typeof userEvent.setup>, n: number, dx: number) {
  const dot = screen.getByRole('button', { name: `Point ${n}` })
  const [cx, cy] = [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))]
  pointer(dot, 'pointerdown', pixelOf(cx, cy)); pointer(canvas(), 'pointermove', pixelOf(cx + dx, cy)); pointer(canvas(), 'pointerup', pixelOf(cx + dx, cy))
  void user
}

describe('the angle the figure is seen from', () => {
  it('is picked from the named angles or turned to any angle, and Front and Back stay in step', async () => {
    const { user } = await open()
    const angle = screen.getByRole('combobox', { name: 'Angle' }), turn = screen.getByRole('slider', { name: 'Turn' })
    expect(angle).toHaveDisplayValue('Front')
    await user.selectOptions(angle, 'right')
    expect(turn).toHaveValue('90')
    expect(screen.getByRole('button', { name: 'Front view' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.change(turn, { target: { value: '50' } })
    expect(angle).toHaveDisplayValue('50°')
    fireEvent.keyDown(turn, { key: 'PageUp' })
    expect(turn).toHaveValue('60')
    await user.click(screen.getByRole('button', { name: 'Back view' }))
    expect(angle).toHaveDisplayValue('Back')
    expect(turn).toHaveValue('180')
  })
})

describe('drawing a shape at a key angle', () => {
  it('keeps the moved points as its outline at that angle, and leaves the front alone', async () => {
    const { user, backend } = await open()
    await pick(user, 'Body', 'shape')
    await user.click(screen.getByRole('button', { name: 'Snap' }))
    await user.click(screen.getByRole('button', { name: 'Mirror editing' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Angle' }), 'right')
    expect(screen.getByText(/Seen at Right profile: turned from the front/)).toBeInTheDocument()
    await dragPoint(user, 2, 10)
    expect(screen.getByText(/Seen at Right profile: drawn here/)).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(saved(backend, 'body').turn?.angles).toHaveLength(1))
    expect(saved(backend, 'body').turn!.angles[0]).toMatchObject({ at: 90, tilt: 0 })
    expect(saved(backend, 'body').turn!.angles[0].pts).toHaveLength(4)
    expect(saved(backend, 'body').pts.map(p => [p.x, p.y])).toEqual([[60, 60], [140, 60], [140, 160], [60, 160]])
    // dropped again from the Turning section
    await user.click(screen.getByRole('button', { name: 'Drop the outline of Body at this angle' }))
    await save(user)
    await waitFor(() => expect(saved(backend, 'body').turn ?? null).toBeNull())
  })

  it('is held off between key angles', async () => {
    const { user, backend } = await open()
    await pick(user, 'Body', 'shape')
    fireEvent.change(screen.getByRole('slider', { name: 'Turn' }), { target: { value: '50' } })
    expect(screen.getAllByText(/Seen between key angles/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Point 2' })).toHaveClass('cmPoint--off')          // shown, not edited
    await dragPoint(user, 2, 10)
    await save(user)
    expect(saved(backend, 'body').turn ?? null).toBeNull()
  })
})

describe('the Turning section', () => {
  it('steps the depth, the roundness and the depth of the point picked', async () => {
    const { user, backend } = await open()
    await pick(user, 'Body', 'shape')
    await user.click(screen.getByRole('button', { name: 'Raise Depth' }))
    await user.click(screen.getByRole('button', { name: 'Lower Roundness' }))
    await user.click(screen.getByRole('button', { name: 'Raise Depth of point 1' }))
    await save(user)
    await waitFor(() => expect(saved(backend, 'body').turn).toMatchObject({ depth: 1, thick: 0.75, dz: [1, 0, 0, 0] }))
    await user.click(screen.getByRole('button', { name: "Use the layer's roundness for Body" }))
    await user.click(screen.getByRole('button', { name: 'Clear the point depths of Body' }))
    await save(user)
    await waitFor(() => expect(saved(backend, 'body').turn).toMatchObject({ thick: null, dz: [] }))
  })

  it('sets the shape an object lies on', async () => {
    const { user, backend } = await open()
    await pick(user, 'Eye part', 'object')
    await user.selectOptions(screen.getByRole('combobox', { name: 'The shape Eye part lies on' }), 'body')
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.objects.find(o => o.id === 'oEye')!.wrap).toBe('body'))
  })
})
