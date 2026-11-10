import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelEntry, ModelFrame } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import CharacterModelsConsole from './CharacterModelsConsole'
import { newShape } from './engine/edit'
import { gridStep } from './engine/gridSnap'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// A torso with an arm beside it, in two groups, and one frame already: Bust (a box round the torso) that leaves the arm out.
function figure(frames: ModelFrame[] = []): ModelContent {
  let c = blank('Adult')
  c = addGroup(c, newGroup('gT', 'Torso')); c = addGroup(c, newGroup('gA', 'Arm'))
  c = addObject(c, 'gT', { id: 'oT', name: 'Torso part', layer: 'body', shapes: [] }); c = addShape(c, 'oT', newShape('torso', 'Torso shape', 'rounded', box(70, 40, 60, 100)))
  c = addObject(c, 'gA', { id: 'oA', name: 'Arm part', layer: 'body', shapes: [] }); c = addShape(c, 'oA', newShape('arm', 'Arm shape', 'rounded', box(134, 50, 14, 70)))
  return { ...c, frames }
}
const bust: ModelFrame = { id: 'fB', name: 'Bust', x: 60, y: 30, w: 90, h: 120, hide: ['gA'] }

async function open(c: ModelContent = figure([bust])) {
  const backend = modelsBackend([draftEntry('a', c)])
  const user = userEvent.setup()
  render(<CharacterModelsConsole />)
  await screen.findByRole('heading', { name: 'Character models' })
  await user.click(screen.getByRole('tab', { name: 'Frames' }))
  return { backend, user }
}

const canvas = () => screen.getByRole('application')
const tab = (name: string) => screen.getByRole('tab', { name })
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const frames = (b: { entries: ModelEntry[] }) => b.entries[0].draft.frames ?? []
const hit = (name = 'Bust') => screen.getByRole('button', { name: new RegExp(`^Frame ${name}\\.`) })
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: at.x ?? 0, clientY: at.y ?? 0 }))
}
const selectBust = (user: ReturnType<typeof userEvent.setup>) => user.click(within(screen.getByRole('region', { name: 'Frame Bust' })).getByRole('button', { name: 'Edit on the canvas' }))

describe('the Frames tab', () => {
  it('lists the frames and draws their rectangles on the canvas only while the tab is open', async () => {
    const { user } = await open()
    expect(screen.getByRole('region', { name: 'Frame Bust' })).toBeInTheDocument()
    expect(hit()).toHaveAttribute('aria-pressed', 'false')
    await user.click(tab('Shape'))
    expect(screen.queryByRole('button', { name: /^Frame Bust\./ })).toBeNull()
  })

  it('adds a frame round the figure, and selects it', async () => {
    const { backend, user } = await open(figure())
    await user.click(screen.getByRole('button', { name: 'Add a frame' }))
    expect(screen.getByRole('region', { name: 'Frame Frame 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Frame Frame 1\. Drag it/ })).toHaveAttribute('aria-pressed', 'true')
    await save(user)
    const f = frames(backend)[0]
    expect(f).toMatchObject({ name: 'Frame 1', hide: [] })
    expect(f.x).toBeLessThan(70); expect(f.x + f.w).toBeGreaterThan(148); expect(f.y).toBeLessThan(40); expect(f.y + f.h).toBeGreaterThan(140)
  })

  it('adds a frame round the selection', async () => {
    const { backend, user } = await open(figure())
    await user.click(tab('Shape'))
    await user.click(within(screen.getByRole('navigation', { name: 'Model tree' })).getByRole('button', { name: 'Arm shape' }))
    await user.click(tab('Frames'))
    await user.click(screen.getByRole('button', { name: 'Add a frame' }))
    await save(user)
    const f = frames(backend)[0]
    expect(f.x).toBeGreaterThan(120); expect(f.w).toBeLessThan(40)
  })

  it('moves a frame by dragging its rectangle, in one undo step', async () => {
    const { backend, user } = await open()
    await selectBust(user)
    const [, , vw] = viewBox()
    const from = pixelOf(100, 30)
    pointer(hit(), 'pointerdown', from)
    pointer(canvas(), 'pointermove', { x: from.x + 40, y: from.y + 20 })
    pointer(canvas(), 'pointerup')
    await save(user)
    const f = frames(backend)[0]
    expect(f.x).toBeCloseTo(60 + (40 * vw) / 704, 0); expect(f.y).toBeGreaterThan(30)
    expect(f.w).toBe(90); expect(f.h).toBe(120)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await save(user)
    expect(frames(backend)[0]).toMatchObject({ x: 60, y: 30 })
  })

  it('lands a frame that is moved, and the side that is resized, on the grid lines when Snap to grid is on', async () => {
    const { backend, user } = await open()
    await selectBust(user)
    fireEvent.click(screen.getByRole('button', { name: 'Snap to grid' }))
    const step = gridStep(viewBox()[2])
    const onLine = (v: number) => Math.abs(v / step - Math.round(v / step)) < 1e-6
    const from = pixelOf(100, 30)
    pointer(hit(), 'pointerdown', from)
    pointer(canvas(), 'pointermove', { x: from.x + 37.3, y: from.y + 21.7 })
    pointer(canvas(), 'pointerup')
    await save(user)
    let f = frames(backend)[0]
    expect(onLine(f.x) && onLine(f.y)).toBe(true)
    expect(f.x).not.toBe(60)
    expect([f.w, f.h]).toEqual([90, 120])
    // the right side of the frame, dragged by its handle
    const east = screen.getByRole('button', { name: 'Resize Bust from its e' })
    const at = pixelOf(f.x + f.w, f.y + f.h / 2)
    pointer(east, 'pointerdown', at)
    pointer(canvas(), 'pointermove', { x: at.x + 29.1, y: at.y })
    pointer(canvas(), 'pointerup')
    await save(user)
    f = frames(backend)[0]
    expect(onLine(f.x + f.w)).toBe(true)
    expect(f.w).not.toBe(90)
  })

  it('does not move a frame that is not selected: a click on its outline selects it', async () => {
    const { backend, user } = await open()
    const from = pixelOf(100, 30)
    pointer(hit(), 'pointerdown', from)
    pointer(canvas(), 'pointermove', { x: from.x + 40, y: from.y })
    pointer(canvas(), 'pointerup')
    await save(user)
    expect(frames(backend)[0]).toMatchObject({ x: 60, y: 30 })
    expect(screen.getByRole('button', { name: /^Frame Bust\. Drag it/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('resizes a frame from a handle, the opposite side staying where it was', async () => {
    const { backend, user } = await open()
    await selectBust(user)
    const [, , vw] = viewBox()
    const se = screen.getByRole('button', { name: 'Resize Bust from its se' })
    const from = pixelOf(150, 150)
    pointer(se, 'pointerdown', from)
    pointer(canvas(), 'pointermove', { x: from.x + 30, y: from.y + 30 })
    pointer(canvas(), 'pointerup')
    await save(user)
    const f = frames(backend)[0]
    expect(f.x).toBe(60); expect(f.y).toBe(30)
    expect(f.w).toBeCloseTo(90 + (30 * vw) / 704, 0); expect(f.h).toBeGreaterThan(120)
  })

  it('never lets a frame shrink below the smallest size', async () => {
    const { backend, user } = await open()
    await selectBust(user)
    const nw = screen.getByRole('button', { name: 'Resize Bust from its nw' })
    const from = pixelOf(60, 30)
    pointer(nw, 'pointerdown', from)
    pointer(canvas(), 'pointermove', { x: from.x + 4000, y: from.y + 4000 })
    pointer(canvas(), 'pointerup')
    await save(user)
    const f = frames(backend)[0]
    expect(f.w).toBe(8); expect(f.h).toBe(8)
    expect(f.x + f.w).toBeCloseTo(150, 5); expect(f.y + f.h).toBeCloseTo(150, 5)
  })

  it('nudges with the arrow keys, resizes with Shift and steps by five with Alt', async () => {
    const { backend, user } = await open()
    await selectBust(user)
    hit().focus()
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{Shift>}{ArrowRight}{ArrowDown}{/Shift}')
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await user.keyboard('{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}')
    await save(user)
    expect(frames(backend)[0]).toMatchObject({ x: 61, y: 35, w: 96, h: 121 })
  })

  it('ignores the arrow keys on a frame that is not the one being edited, and Enter selects it', async () => {
    const { backend, user } = await open()
    hit().focus()
    await user.keyboard('{ArrowRight}')
    await save(user)
    expect(frames(backend)[0].x).toBe(60)
    hit().focus()
    await user.keyboard('{Enter}')
    expect(hit()).toHaveAttribute('aria-pressed', 'true')
  })

  it('renames a frame and deletes it after asking', async () => {
    const { backend, user } = await open()
    const input = screen.getByRole('textbox', { name: 'Name of frame Bust' })
    await user.clear(input); await user.type(input, 'Face')
    await save(user)
    expect(frames(backend)[0].name).toBe('Face')
    await user.click(screen.getByRole('button', { name: 'Delete frame Face' }))
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    await save(user)
    expect(frames(backend)).toEqual([])
  })

  it('chooses what the frame leaves out', async () => {
    const { backend, user } = await open()
    await selectBust(user)
    const hides = within(screen.getByRole('group', { name: 'Groups and objects left out of the frame' }))
    expect(hides.getByRole('button', { name: 'Arm' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(hides.getByRole('button', { name: 'Arm' }))
    await user.click(hides.getByRole('button', { name: 'Torso part' }))
    await save(user)
    expect(frames(backend)[0].hide).toEqual(['oT'])
  })
})

describe('looking through a frame', () => {
  it('crops the picture to the frame on the card colour, without what the frame leaves out', async () => {
    const { user } = await open()
    expect(canvas().querySelector('path[data-shape="arm"]')).not.toBeNull()
    await user.click(within(screen.getByRole('region', { name: 'Frame Bust' })).getByRole('button', { name: 'View through' }))
    expect(canvas().querySelector('path[data-shape="arm"]')).toBeNull()
    expect(canvas().querySelector('path[data-shape="torso"]')).not.toBeNull()
    const tile = canvas().querySelector('[data-tile]')!
    expect(tile.getAttribute('style')).toContain('#e6d6c3')
    expect([tile.getAttribute('x'), tile.getAttribute('y'), tile.getAttribute('width'), tile.getAttribute('height')]).toEqual(['60', '30', '90', '120'])
    expect(canvas().querySelector('clipPath')).not.toBeNull()
    const [vx, vy, vw, vh] = viewBox()
    expect(vx).toBeLessThan(60); expect(vx + vw).toBeGreaterThan(150); expect(vy).toBeLessThan(30); expect(vy + vh).toBeGreaterThan(150)
    // no frame rectangles while looking through one, and the stage says so
    expect(screen.queryByRole('button', { name: /^Frame Bust\./ })).toBeNull()
    expect(screen.getByText(/Looking through Bust/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Whole figure' }))
    expect(canvas().querySelector('[data-tile]')).toBeNull()
    expect(canvas().querySelector('path[data-shape="arm"]')).not.toBeNull()
  })

  it('sees the same part of the body from behind', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Back view' }))
    const r = hit()
    expect(Number(r.getAttribute('x'))).toBeCloseTo(200 - (60 + 90), 5)
    expect(Number(r.getAttribute('width'))).toBe(90)
    await user.click(within(screen.getByRole('region', { name: 'Frame Bust' })).getByRole('button', { name: 'View through' }))
    expect(canvas().querySelector('[data-tile]')!.getAttribute('x')).toBe('50')
  })

  it('shows the previews through a frame too', async () => {
    const { user } = await open()
    const chips = within(screen.getByRole('group', { name: 'Frame to look through' }))
    expect(chips.getByRole('button', { name: 'Whole' })).toHaveAttribute('aria-pressed', 'true')
    const strip = screen.getByRole('region', { name: 'Previews' })
    expect(strip.querySelector('[data-tile]')).toBeNull()
    await user.click(chips.getByRole('button', { name: 'Bust' }))
    expect(strip.querySelectorAll('[data-tile]').length).toBe(6)
    // the arm is left out of every tile
    expect(strip.querySelectorAll('path').length).toBeGreaterThan(0)
    await user.click(chips.getByRole('button', { name: 'Whole' }))
    expect(strip.querySelector('[data-tile]')).toBeNull()
  })

  it('has no frame row in the previews when the model has no frame', async () => {
    await open(figure())
    expect(screen.queryByRole('group', { name: 'Frame to look through' })).toBeNull()
  })
})

describe('the card colour', () => {
  it('is a test colour until it is kept as the starter colour', async () => {
    const { backend, user } = await open()
    expect(screen.getByRole('img', { name: 'Card colour #e6d6c3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use as the starter card colour' })).toBeDisabled()
    fireEvent.change(screen.getByRole('slider', { name: 'Lightness of the card' }), { target: { value: '30' } })
    const changed = screen.getByRole('img', { name: /^Card colour #/ }).getAttribute('aria-label')!.replace('Card colour ', '')
    expect(changed).not.toBe('#e6d6c3')
    // the picture through a frame takes the test colour at once
    await user.click(within(screen.getByRole('region', { name: 'Frame Bust' })).getByRole('button', { name: 'View through' }))
    expect(canvas().querySelector('[data-tile]')!.getAttribute('style')).toContain(changed)
    await save(user)
    expect(backend.entries[0].draft.tile ?? '#e6d6c3').toBe('#e6d6c3')
    await user.click(screen.getByRole('button', { name: 'Use as the starter card colour' }))
    await save(user)
    expect(backend.entries[0].draft.tile).toBe(changed)
    expect(screen.getByRole('button', { name: 'Use as the starter card colour' })).toBeDisabled()
  })

  it('goes back to the starter colour', async () => {
    const { user } = await open()
    fireEvent.change(screen.getByRole('slider', { name: 'Saturation of the card' }), { target: { value: '10' } })
    expect(screen.queryByRole('img', { name: 'Card colour #e6d6c3' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Start over from the starter colour' }))
    expect(screen.getByRole('img', { name: 'Card colour #e6d6c3' })).toBeInTheDocument()
  })
})
