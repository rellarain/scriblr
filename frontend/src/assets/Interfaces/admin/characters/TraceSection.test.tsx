import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { fitBox } from './TraceSection'

// A picture to trace (slice 9b): chosen in the Overview (or under a shape's sections), fitted to the proportion guide, drawn under the canvas faded and locked; its opacity,
// size and lock are set there, unlocked it is dragged into place, and it can be taken away. It is kept beside the draft, never in the model.
vi.setConfig({ testTimeout: 30000 })

function model(): ModelContent {
  let c = addGroup({ ...blank('Traced'), guide: { top: 10, head: 56, lines: [{ name: 'Soles', y: 430 }] } }, newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  return addShape(c, 'o', newShape('s', 'Chest', 'rectangle', { x: 70, y: 70, w: 60, h: 100 }))
}
const png = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'sketch-front.png', { type: 'image/png' })
const section = () => within(screen.getByRole('group', { name: 'Picture to trace' }))
const picture = () => screen.getByRole('application').querySelector('image[data-trace]')

describe('fitting a picture to the guide', () => {
  it('makes it as tall as the guide, on the middle', () => {
    expect(fitBox({ top: 10, head: 56, lines: [{ name: 'Soles', y: 430 }] }, 100, 0.5)).toEqual({ x: -5, y: 10, w: 210, h: 420 })
    expect(fitBox(null, 100, 1)).toEqual({ x: -110, y: 10, w: 420, h: 420 })
  })
})

describe('the picture to trace', () => {
  it('is chosen, faded, unlocked and moved, hidden and taken away, and kept beside the draft', async () => {
    const backend = modelsBackend([draftEntry('m', model())])
    const user = userEvent.setup()
    render(<DesignerConsole tools="shapes" />)
    await screen.findByRole('region', { name: 'Designer' })
    expect(picture()).toBeNull()
    await user.upload(section().getByLabelText('Choose a picture to trace'), png())
    await waitFor(() => expect(picture()).not.toBeNull())
    expect(backend.calls).toContain('PUT /character-models/m/trace')
    expect(section().getByText('sketch-front.png')).toBeInTheDocument()
    // faded and locked: a click goes through to the shapes
    expect(picture()!.getAttribute('opacity')).toBe('0.35')
    expect(picture()!.getAttribute('pointer-events')).toBe('none')
    // fitted to the guide: as tall as it, half as wide when its size cannot be read
    expect(picture()!.getAttribute('height')).toBe('420')

    await user.click(section().getByRole('button', { name: 'Raise Opacity of the picture' }))
    expect(picture()!.getAttribute('opacity')).toBe('0.4')
    await user.click(section().getByRole('button', { name: 'Locked' }))
    expect(picture()!.getAttribute('pointer-events')).toBe('auto')
    const x0 = Number(picture()!.getAttribute('x'))
    const svg = screen.getByRole('application'), [vx, , vw] = svg.getAttribute('viewBox')!.split(' ').map(Number)
    const px = (wx: number) => ((wx - vx) / vw) * 704
    fireEvent(picture()!, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: px(100), clientY: 300 }))
    fireEvent(svg, new MouseEvent('pointermove', { bubbles: true, button: 0, clientX: px(120), clientY: 300 }))
    fireEvent(svg, new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: px(120), clientY: 300 }))
    expect(Number(picture()!.getAttribute('x'))).toBeCloseTo(x0 + 20, 0)
    await waitFor(() => expect(backend.calls).toContain('PATCH /character-models/m/trace'))

    await user.click(section().getByRole('button', { name: 'Shown' }))
    expect(picture()).toBeNull()
    await user.click(section().getByRole('button', { name: 'Shown' }))
    await user.click(section().getByRole('button', { name: 'Take the picture away' }))
    await waitFor(() => expect(picture()).toBeNull())
    expect(section().getByRole('button', { name: 'Choose a picture' })).toBeInTheDocument()
    // never part of the model
    expect(JSON.stringify(backend.entries[0].draft)).not.toContain('base64')
  })

  it('refuses a file that is not a picture', async () => {
    modelsBackend([draftEntry('m', model())])
    const user = userEvent.setup({ applyAccept: false })
    render(<DesignerConsole tools="shapes" />)
    await screen.findByRole('region', { name: 'Designer' })
    await user.upload(section().getByLabelText('Choose a picture to trace'), new File(['x'], 'notes.txt', { type: 'text/plain' }))
    expect(await section().findByRole('alert')).toHaveTextContent('Choose a PNG, JPEG, WebP or GIF picture.')
  })
})
