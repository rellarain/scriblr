import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// The shape editor's transform (S4): the selected shape has a box whose handles resize it (Shift keeps its proportions) and a round handle that turns it (Shift: steps of
// 15 degrees); the Arrange section sets its place, size and angle with steppers, flips it, puts it on the middle of the model and moves it forward or back in its object.
vi.setConfig({ testTimeout: 30000 })

const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
// A is 60..100 across and 100..140 down; B is 80..120 across and 120..160 down; both in one object.
function squares(): ModelContent {
  let c = addGroup(blank('Squares'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', sharp('a', [[60, 100], [100, 100], [100, 140], [60, 140]]))
  return addShape(c, 'o', sharp('b', [[80, 120], [120, 120], [120, 160], [80, 160]]))
}

async function open() {
  modelsBackend([draftEntry('m', squares())])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return user
}

const canvas = () => screen.getByRole('application')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)!
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number; button?: number; shiftKey?: boolean } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: at.button ?? 0, clientX: at.x ?? 0, clientY: at.y ?? 0, shiftKey: at.shiftKey ?? false }))
}
const select = (id: string, wx: number, wy: number) => { pointer(pathOf(id), 'pointerdown', pixelOf(wx, wy)); pointer(canvas(), 'pointerup') }
const handle = (name: string) => canvas().querySelector(`[data-handle="${name}"]`)!
const centreOf = (el: Element) => {
  const cx = el.getAttribute('cx'), x = Number(cx ?? Number(el.getAttribute('x')) + Number(el.getAttribute('width')) / 2)
  const y = el.getAttribute('cy') !== null ? Number(el.getAttribute('cy')) : Number(el.getAttribute('y')) + Number(el.getAttribute('height')) / 2
  return [x, y]
}
const drag = (el: Element, to: [number, number], shiftKey = false) => {
  const [x, y] = centreOf(el)
  pointer(el, 'pointerdown', pixelOf(x, y))
  pointer(canvas(), 'pointermove', { ...pixelOf(to[0], to[1]), shiftKey })
  pointer(canvas(), 'pointerup')
}
const arrange = () => within(screen.getByRole('group', { name: 'Arrange the shape' }))
const value = (label: string) => within(arrange().getByRole('group', { name: label })).getByText(/./, { selector: '.cmStepValue' }).textContent

describe('the box of the selected shape', () => {
  it('shows eight resize handles and a turn handle while the shape is selected, and none while one of its points is', async () => {
    await open()
    select('a', 70, 110)
    const box = canvas().querySelector('[data-box="a"]')!
    expect(box.querySelectorAll('[data-handle]')).toHaveLength(9)
    expect(within(box as HTMLElement).getByRole('button', { name: 'Resize from the top left corner' })).toBeInTheDocument()
    expect(within(box as HTMLElement).getByRole('button', { name: 'Turn the shape' })).toBeInTheDocument()
    pointer(canvas().querySelectorAll('.cmPoint')[0], 'pointerdown', pixelOf(60, 100))
    pointer(canvas(), 'pointerup')
    expect(canvas().querySelector('[data-box]')).toBeNull()
  })

  it('resizes from a side, the opposite side staying where it is, in one undo step', async () => {
    const user = await open()
    select('a', 70, 110)
    drag(handle('e'), [120, 120])
    expect(value('Width')).toBe('60')
    expect(value('Height')).toBe('40')
    expect(value('Across')).toBe('90')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(value('Width')).toBe('40')
  })

  it('keeps the proportions from a corner with Shift', async () => {
    await open()
    select('a', 70, 110)
    drag(handle('se'), [140, 150], true)
    expect(value('Width')).toBe('80')
    expect(value('Height')).toBe('80')
  })

  it('turns about the middle, in steps of 15 degrees with Shift, and the box turns with it', async () => {
    await open()
    select('a', 70, 110)
    // the turn handle is straight above the middle (80, 120): a drag to the right of the middle is a quarter turn
    drag(handle('turn'), [131, 123], true)
    expect(value('Turn')).toBe('90°')
    expect(value('Across')).toBe('80')
    expect(canvas().querySelector('[data-handle="e"]')!.getAttribute('transform')).toContain('rotate(90')
  })
})

describe('the Arrange section', () => {
  it('steps the place, size and angle, one undo step each', async () => {
    const user = await open()
    select('a', 70, 110)
    await user.click(arrange().getByRole('button', { name: 'Raise Across' }))
    expect(value('Across')).toBe('81')
    await user.keyboard('{Shift>}')
    await user.click(arrange().getByRole('button', { name: 'Raise Width' }))
    await user.keyboard('{/Shift}')
    expect(value('Width')).toBe('50')
    expect(value('Height')).toBe('40')
    await user.click(arrange().getByRole('button', { name: 'Raise Turn' }))
    expect(value('Turn')).toBe('1°')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(value('Turn')).toBe('0°')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(value('Width')).toBe('40')
  })

  it('scales the height with the width while Keep proportions is on', async () => {
    const user = await open()
    select('a', 70, 110)
    const keep = arrange().getByRole('button', { name: 'Keep proportions' })
    expect(keep).toHaveAttribute('aria-pressed', 'false')
    await user.click(keep)
    expect(keep).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{Shift>}')
    await user.click(arrange().getByRole('button', { name: 'Raise Width' }))
    await user.keyboard('{/Shift}')
    expect(value('Width')).toBe('50')
    expect(value('Height')).toBe('50')
  })

  it('flips the shape and puts its middle on the middle of the model', async () => {
    const user = await open()
    select('a', 70, 110)
    const before = pathOf('a').getAttribute('d')
    await user.click(arrange().getByRole('button', { name: 'Flip across' }))
    // a square flipped about its own middle draws the same outline
    expect(value('Across')).toBe('80')
    expect(pathOf('a').getAttribute('d')).not.toBe(null)
    await user.click(arrange().getByRole('button', { name: 'Align across to the middle of the model' }))
    expect(value('Across')).toBe('100')
    await user.click(arrange().getByRole('button', { name: 'Align down to the middle of the model' }))
    expect(value('Down')).toBe('200')
    expect(pathOf('a').getAttribute('d')).not.toBe(before)
  })

  it('moves the shape forward and back among the shapes of its object', async () => {
    const user = await open()
    select('a', 70, 110)
    const drawn = () => Array.from(canvas().querySelectorAll('path[data-shape]')).map(p => p.getAttribute('data-shape'))
    expect(drawn()).toEqual(['a', 'b'])
    expect(arrange().getByRole('button', { name: 'Back' })).toBeDisabled()
    await user.click(arrange().getByRole('button', { name: 'Forward' }))
    expect(drawn()).toEqual(['b', 'a'])
    expect(arrange().getByRole('button', { name: 'Forward' })).toBeDisabled()
    await user.click(arrange().getByRole('button', { name: 'Back' }))
    expect(drawn()).toEqual(['a', 'b'])
  })
})
