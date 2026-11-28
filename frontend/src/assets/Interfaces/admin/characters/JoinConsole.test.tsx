import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { pick } from '../../../../test/designerUi'

// Joins in the shape editor (slice 9c): the Overview turns one outline round parts that touch on and off and renames the join sets; a shape's Look puts it in a set (a
// new one too) and in another from behind; a group's Joint cap puts a cap at its pivot.
vi.setConfig({ testTimeout: 30000 })

const sq = (id: string, x: number, y: number, w: number, h: number, extra: Partial<ModelShape> = {}): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, outline: 1,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })), ...extra,
})
function model(): ModelContent {
  let c = addGroup(blank('Joined'), newGroup('torso', 'Torso'))
  c = addObject(c, 'torso', { id: 'o_torso', name: 'Torso', layer: 'body', shapes: [] })
  c = addShape(c, 'o_torso', sq('chest', 80, 100, 40, 80, { z: 10, join: 'Body' }))
  c = addGroup(c, { ...newGroup('arm', 'Arm'), parent: 'torso', pivot: [120, 110] })
  c = addObject(c, 'arm', { id: 'o_arm', name: 'Arm', layer: 'body', shapes: [] })
  return addShape(c, 'o_arm', sq('upper', 112, 104, 16, 60, { z: 20 }))
}
async function open() {
  modelsBackend([draftEntry('m', model())])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return user
}
const canvas = () => screen.getByRole('application')
const joins = () => within(screen.getByRole('group', { name: 'Joins' }))
const halos = () => canvas().querySelectorAll('[data-join="halo"]')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
function select(id: string, wx: number, wy: number) {
  const at = pixelOf(wx, wy)
  fireEvent(canvas().querySelector(`path[data-shape="${id}"]`)!, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: at.x, clientY: at.y }))
  fireEvent(canvas(), new MouseEvent('pointerup', { bubbles: true, button: 0 }))
}

describe('joins', () => {
  it('turns one outline on, puts a shape in the set, and renames the set', async () => {
    const user = await open()
    expect(joins().getByRole('textbox', { name: 'Name of the join set Body' })).toHaveValue('Body')
    expect(joins().getByText('1 shape')).toBeInTheDocument()
    expect(halos()).toHaveLength(0)
    await user.click(joins().getByRole('button', { name: 'One outline round parts that touch' }))
    expect(joins().getByRole('button', { name: 'One outline round parts that touch' })).toHaveAttribute('aria-pressed', 'true')
    expect(halos()).toHaveLength(1)
    // the arm joins the body: its own outline gives way to the set's
    select('upper', 120, 150)
    const set = within(screen.getByRole('group', { name: 'Join set' }))
    await user.selectOptions(set.getByRole('combobox', { name: 'Joins' }), 'Body')
    expect(canvas().querySelector('path[data-line="upper"]')).toBeNull()
    expect(halos()[0].getAttribute('d')!.split('M').length - 1).toBe(2)
    // a new set from behind
    await user.selectOptions(set.getByRole('combobox', { name: 'From behind' }), '\u0000new')
    expect(within(screen.getByRole('group', { name: 'Join set' })).getByRole('combobox', { name: 'From behind' })).toHaveValue('Set 1')

    // a click on the grid goes back to the Overview
    fireEvent(canvas(), new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 3, clientY: 3 }))
    fireEvent(canvas(), new MouseEvent('pointerup', { bubbles: true, button: 0 }))
    const name = joins().getByRole('textbox', { name: 'Name of the join set Body' })
    await user.clear(name)
    await user.type(name, 'Figure{Enter}')
    expect(joins().getByRole('textbox', { name: 'Name of the join set Figure' })).toBeInTheDocument()
    expect(joins().getByText('2 shapes')).toBeInTheDocument()
  })

  it('puts a joint cap at a group’s pivot', async () => {
    const user = await open()
    await user.click(joins().getByRole('button', { name: 'One outline round parts that touch' }))
    select('upper', 120, 150)
    await user.selectOptions(within(screen.getByRole('group', { name: 'Join set' })).getByRole('combobox', { name: 'Joins' }), 'Body')
    await pick(user, 'Arm', 'group')
    const cap = within(screen.getByRole('group', { name: 'Joint cap' }))
    await user.click(cap.getByRole('button', { name: 'Joint cap' }))
    expect(canvas().querySelector('[data-join="cap"]')).not.toBeNull()
    // painted through the stylesheet's fill (the limb's colour), never picked
    expect(canvas().querySelector('[data-join="cap"]')).toHaveClass('cmJoinPaint')
    expect(halos()[0]).toHaveClass('cmJoinPaint')
    expect(within(cap.getByRole('group', { name: 'Cap size' })).getByText('105%')).toBeInTheDocument()
    await user.click(cap.getByRole('button', { name: 'Raise Cap size' }))
    expect(within(cap.getByRole('group', { name: 'Cap size' })).getByText('110%')).toBeInTheDocument()
    await user.click(cap.getByRole('button', { name: 'Joint cap' }))
    expect(canvas().querySelector('[data-join="cap"]')).toBeNull()
  })
})
