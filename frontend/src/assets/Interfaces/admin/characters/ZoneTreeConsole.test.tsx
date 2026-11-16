import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// The shape editor's tree (Z2): a model opens with the five starter zones, its groups in Torso; cards stay listed beside their siblings; the chevron expands and collapses
// (remembered); selecting on the canvas opens the way down; a shape lists its points; cards are dragged across parents or moved with Alt + arrows, and the drawing follows the
// tree; a zone is selected, renamed and deleted with what is in it; new things go into the top zone.
vi.setConfig({ testTimeout: 30000 })

const box = (id: string, x: number, y: number, z = 40): ModelShape => ({
  id, name: `${id} shape`, closed: true, z, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + 20, y], [x + 20, y + 20], [x, y + 20]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
// Arm (Hand: a, b) and Leg (Foot: c); b is drawn behind a by its z
function model(): ModelContent {
  let c = addGroup(addGroup(blank('Zones'), newGroup('g1', 'Arm')), newGroup('g2', 'Leg'))
  c = addObject(c, 'g1', { id: 'o1', name: 'Hand', layer: 'body', shapes: [] })
  c = addObject(c, 'g2', { id: 'o2', name: 'Foot', layer: 'body', shapes: [] })
  c = addShape(addShape(c, 'o1', box('a', 40, 40)), 'o1', box('b', 50, 50, 10))
  return addShape(c, 'o2', box('c', 100, 100))
}
async function open(c: ModelContent = model()) {
  const backend = modelsBackend([draftEntry('m', c)])
  const user = userEvent.setup()
  const view = render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  // the zones are given once the model is open
  await screen.findByRole('group', { name: 'Zone Torso' })
  return { user, backend, view }
}
const tree = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
const cardsOf = (kind: string) => Array.from(document.querySelectorAll(`nav [data-card="${kind}"]`)).map(el => el.getAttribute('aria-label'))
const cardOf = (label: string) => tree().getByRole('group', { name: label })
const canvas = () => screen.getByRole('application')
const painted = () => Array.from(canvas().querySelectorAll('path[data-shape]')).map(p => p.getAttribute('data-shape'))
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
function pointer(el: Element | Window, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number; button?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: at.button ?? 0, clientX: at.x ?? 0, clientY: at.y ?? 0 }))
}
const rect = (top: number) => ({ left: 0, right: 300, top, bottom: top + 30, width: 300, height: 30, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

describe('zones', () => {
  it('are given to a model without them, its groups in Torso, and the drawing kept', async () => {
    await open()
    expect(cardsOf('zone')).toEqual(['Zone Head', 'Zone Hair', 'Zone Torso', 'Zone Arms', 'Zone Legs'])
    // Torso is expanded: its groups are listed (collapsed: their objects are not)
    expect(within(cardOf('Zone Torso')).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Group Leg', 'Group Arm'])
    expect(tree().queryByRole('group', { name: 'Object Hand' })).toBeNull()
    // b was behind a by its z: the tree keeps it behind
    expect(painted()).toEqual(['b', 'a', 'c'])
  })

  it('is selected, renamed and deleted with what is in it', async () => {
    const { user } = await open()
    await user.click(tree().getByRole('button', { name: 'Torso' }))
    const name = screen.getByRole('textbox', { name: 'Zone name' })
    expect(name).toHaveValue('Torso')
    await user.clear(name)
    await user.type(name, 'Body')
    expect(cardsOf('zone')).toContain('Zone Body')
    await user.click(screen.getByRole('button', { name: 'Delete zone Body' }))
    expect(cardsOf('zone')).toEqual(['Zone Head', 'Zone Hair', 'Zone Arms', 'Zone Legs'])
    expect(painted()).toEqual([])
  })

  it('are added at the top, and a group is added into one', async () => {
    const { user } = await open()
    await user.click(tree().getByRole('button', { name: 'New zone' }))
    expect(cardsOf('zone')[0]).toBe('Zone Zone 6')
    expect(screen.getByRole('textbox', { name: 'Zone name' })).toHaveValue('Zone 6')
    await user.click(tree().getByRole('button', { name: 'New group in Legs' }))
    expect(within(cardOf('Zone Legs')).getByRole('group', { name: 'Group Group 3' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Group name' })).toHaveValue('Group 3')
  })

  it('take a rectangle drawn with nothing selected, in a new group of the top zone', async () => {
    await open()
    pointer(canvas(), 'pointerdown', pixelOf(150, 150))
    pointer(canvas(), 'pointermove', pixelOf(160, 160))
    pointer(canvas(), 'pointermove', pixelOf(190, 180))
    pointer(canvas(), 'pointerup', pixelOf(190, 180))
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Rectangle')
    const head = cardOf('Zone Head')
    expect(within(head).getByRole('group', { name: 'Shape Rectangle' })).toBeInTheDocument()
    // the top zone is drawn in front
    expect(painted().slice(-1)[0]).not.toMatch(/^[abc]$/)
  })

  it('are found by the search', async () => {
    await open()
    fireEvent.change(tree().getByRole('textbox', { name: 'Search the model' }), { target: { value: 'tors' } })
    const hit = tree().getAllByRole('button').find(b => b.classList.contains('dzHit'))!
    expect(hit.getAttribute('data-kind')).toBe('zone')
  })
})

describe('the cards', () => {
  it('expand and collapse with the chevron, siblings staying listed, and remember it', async () => {
    const { user, view } = await open()
    await user.click(tree().getByRole('button', { name: 'Expand Arm' }))
    expect(tree().getByRole('button', { name: 'Collapse Arm' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(cardOf('Group Arm')).getByRole('group', { name: 'Object Hand' })).toBeInTheDocument()
    expect(cardOf('Group Leg')).toBeInTheDocument()
    // a collapsed zone stays as one card
    await user.click(tree().getByRole('button', { name: 'Collapse Torso' }))
    expect(cardOf('Zone Torso')).toBeInTheDocument()
    expect(tree().queryByRole('group', { name: 'Group Arm' })).toBeNull()
    expect(cardsOf('zone')).toHaveLength(5)
    // opened again later (the zones saved), the tree is as it was left
    await user.click(screen.getByRole('button', { name: 'Save' }))
    view.unmount()
    render(<DesignerConsole tools="shapes" />)
    await screen.findByRole('region', { name: 'Designer' })
    expect(await screen.findByRole('button', { name: 'Expand Torso' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('open the way down to a shape selected on the canvas, which lists its points', async () => {
    const { user } = await open()
    pointer(canvas().querySelector('path[data-shape="c"]')!, 'pointerdown', pixelOf(110, 110))
    pointer(canvas(), 'pointerup', pixelOf(110, 110))
    const card = cardOf('Shape c shape')
    expect(within(card).getByRole('button', { name: 'c shape' })).toHaveAttribute('aria-current', 'true')
    await user.click(within(card).getByRole('button', { name: 'Expand c shape' }))
    const points = within(card).getByRole('list', { name: 'Points of c shape' })
    // the centre (C1), then the four points
    expect(within(points).getAllByRole('button').map(b => b.textContent)).toEqual(['Centre', 'Point 1', 'Point 2', 'Point 3', 'Point 4'])
    await user.click(within(points).getByRole('button', { name: 'Point 2' }))
    expect(within(points).getByRole('button', { name: 'Point 2' })).toHaveAttribute('aria-current', 'true')
  })

  it('hide with the eye, a zone all its groups', async () => {
    const { user } = await open()
    await user.click(tree().getByRole('button', { name: 'Show Torso' }))
    expect(tree().getByRole('button', { name: 'Show Torso' })).toHaveAttribute('aria-pressed', 'false')
    expect(painted()).toEqual([])
    await user.click(tree().getByRole('button', { name: 'Show Torso' }))
    expect(painted()).toEqual(['b', 'a', 'c'])
  })

  it('move one place with Alt and the arrows, and the drawing follows', async () => {
    await open()
    // Leg is listed first (in front); moved down, it goes behind Arm
    fireEvent.keyDown(tree().getByRole('button', { name: 'Move Leg (Alt+Up or Down)' }), { key: 'ArrowDown', altKey: true })
    expect(within(cardOf('Zone Torso')).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Group Arm', 'Group Leg'])
    expect(painted()).toEqual(['c', 'b', 'a'])
  })

  it('are dragged into another parent: a shape onto another object', async () => {
    const { user } = await open()
    await user.click(tree().getByRole('button', { name: 'Expand Arm' }))
    await user.click(tree().getByRole('button', { name: 'Expand Hand' }))
    await user.click(tree().getByRole('button', { name: 'Expand Leg' }))
    // the Foot card's head is where the pointer will be
    const foot = cardOf('Object Foot').querySelector('.dzCardHead') as HTMLElement
    foot.getBoundingClientRect = () => rect(200)
    const grip = tree().getByRole('button', { name: 'Move a shape (Alt+Up or Down)' })
    pointer(grip, 'pointerdown', { x: 10, y: 10 })
    await act(async () => { pointer(window, 'pointermove', { x: 100, y: 210 }) })
    await act(async () => { pointer(window, 'pointermove', { x: 100, y: 212 }) })
    expect(foot.className).toContain('dzCardHead--into')
    await act(async () => { pointer(window, 'pointerup', { x: 100, y: 212 }) })
    // the object it went into is expanded, to show it there
    expect(tree().getByRole('button', { name: 'Collapse Foot' })).toBeInTheDocument()
    expect(within(cardOf('Object Foot')).getByRole('group', { name: 'Shape a shape' })).toBeInTheDocument()
    expect(within(cardOf('Object Hand')).queryByRole('group', { name: 'Shape a shape' })).toBeNull()
    // a is on top of Foot now: drawn last
    expect(painted()).toEqual(['b', 'c', 'a'])
  })
})
