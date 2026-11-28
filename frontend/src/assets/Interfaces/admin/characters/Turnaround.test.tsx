import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Eight angles in the shape editor (slice 9e): the view bar's front, back and angle are back; the Overview's Angles section shows the figure from every 45° and turns the
// canvas there; turned, a shape has its Turning section and the tools that work on the front outline step aside (posing waits for the front: PosingSection.test.tsx).
vi.setConfig({ testTimeout: 30000 })

const box = (id: string, x: number, y: number, w: number, h: number, extra: Partial<ModelShape> = {}): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, outline: 1,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })), ...extra,
})
// a body and an arm, the arm drawn at the right profile as a narrower outline
function model(): ModelContent {
  let c = addGroup(blank('Turned'), newGroup('g', 'Body'))
  c = addObject(c, 'g', { id: 'o', name: 'Body', layer: 'body', shapes: [] })
  c = addShape(c, 'o', box('torso', 70, 60, 60, 120))
  const side = [[94, 100], [106, 100], [106, 200], [94, 200]].map(([x, y]) => ({ x, y, m: 's' as const }))
  return addShape(c, 'o', box('arm', 130, 70, 14, 100, { turn: { depth: 0, thick: null, dz: [], seen: null, angles: [{ at: 90, tilt: 0, pts: side }] } }))
}
async function open() {
  modelsBackend([draftEntry('m', model())])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return user
}
const angles = () => within(screen.getByRole('group', { name: 'Angles' }))
const canvas = () => screen.getByRole('application')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }

describe('the Angles section', () => {
  it('shows the figure from eight angles and turns the canvas to the one chosen', async () => {
    const user = await open()
    const names = angles().getAllByRole('button').map(b => b.getAttribute('aria-label'))
    expect(names).toEqual(['Seen from the front', 'Seen from the front right', 'Seen from the right profile', 'Seen from the back right', 'Seen from the back',
      'Seen from the back left', 'Seen from the left profile', 'Seen from the front left'])
    expect(angles().getByRole('button', { name: 'Seen from the front' })).toHaveAttribute('aria-pressed', 'true')
    // each picture is the figure from its angle: two shapes in each
    for (const b of angles().getAllByRole('button')) expect(b.querySelectorAll('path.cmAngleShape').length).toBe(2)
    await user.click(angles().getByRole('button', { name: 'Seen from the right profile' }))
    expect(screen.getByRole('combobox', { name: 'Angle' })).toHaveValue('right')
    expect(angles().getByRole('button', { name: 'Seen from the right profile' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Front view' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('a shape seen at an angle', () => {
  it('has its Turning section, and the front-only tools step aside', async () => {
    const user = await open()
    await user.click(angles().getByRole('button', { name: 'Seen from the right profile' }))
    // the arm drawn at the side: its outline there, about the middle
    const arm = canvas().querySelector('path[data-shape="arm"]')!
    const at = pixelOf(100, 150)
    fireEvent(arm, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: at.x, clientY: at.y }))
    fireEvent(canvas(), new MouseEvent('pointerup', { bubbles: true, button: 0 }))
    expect(screen.getByRole('heading', { name: 'Shape' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Turning' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Combine' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Symmetry' })).toBeNull()
    // back at the front, they return
    await user.click(screen.getByRole('button', { name: 'Front view' }))
    expect(screen.getByRole('group', { name: 'Combine' })).toBeInTheDocument()
  })
})
