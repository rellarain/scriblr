import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Per-edge outlines (slice 9a): the Look section says how many edges have the outline; with an edge selected it turns that edge's outline off and on, and Every edge and No
// edges set them all. The canvas draws the outline along the outlined edges only.
vi.setConfig({ testTimeout: 30000 })

const square = (id: string): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, outline: 0.75,
  pts: [[60, 100], [100, 100], [100, 140], [60, 140]].map(([x, y]) => ({ x, y, m: 's' as const })),
})
function one(): ModelContent {
  let c = addGroup(blank('Edges'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'A part', layer: 'body', shapes: [] })
  return addShape(c, 'o', square('a'))
}

async function open() {
  modelsBackend([draftEntry('m', one())])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return user
}

const canvas = () => screen.getByRole('application')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: at.x ?? 0, clientY: at.y ?? 0 }))
}
const clickAt = (wx: number, wy: number) => {
  pointer(canvas(), 'pointermove', pixelOf(wx, wy))
  pointer(canvas(), 'pointerdown', pixelOf(wx, wy))
  pointer(canvas(), 'pointerup', pixelOf(wx, wy))
}
const edges = () => within(screen.getByRole('group', { name: 'Edges with the outline' }))
const lineD = () => canvas().querySelector('path[data-line="a"]')?.getAttribute('d') ?? null

describe('outlining some edges of a shape', () => {
  it('turns the selected edge’s outline off and on, and sets every edge or none', async () => {
    const user = await open()
    // select the shape, then its right edge (point 1 to point 2)
    pointer(canvas().querySelector('path[data-shape="a"]')!, 'pointerdown', pixelOf(70, 110)); pointer(canvas(), 'pointerup')
    expect(edges().getByText('Every edge has the outline.')).toBeInTheDocument()
    expect(edges().getByText('Select an edge to outline it or not.')).toBeInTheDocument()
    expect(lineD()).toBe('M60 100L100 100L100 140L60 140L60 100Z')
    clickAt(100, 120)
    const toggle = edges().getByRole('button', { name: 'Outline this edge' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await user.click(toggle)
    expect(edges().getByRole('button', { name: 'Outline this edge' })).toHaveAttribute('aria-pressed', 'false')
    expect(edges().getByText('3 of 4 edges have the outline.')).toBeInTheDocument()
    // the outline runs from point 2 round to point 1, leaving the right edge out
    expect(lineD()).toBe('M100 140L60 140L60 100L100 100')

    await user.click(edges().getByRole('button', { name: 'No edges' }))
    expect(edges().getByText('No edge has the outline.')).toBeInTheDocument()
    expect(lineD()).toBeNull()
    await user.click(edges().getByRole('button', { name: 'Every edge' }))
    expect(edges().getByText('Every edge has the outline.')).toBeInTheDocument()
    expect(lineD()).toBe('M60 100L100 100L100 140L60 140L60 100Z')
  })
})
