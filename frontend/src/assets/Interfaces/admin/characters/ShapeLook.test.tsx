import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent } from '../../../../api/types'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { templateBox } from './engine/templates'
import { addGroup, addObject, addShape } from './modelContent'
import { pick } from '../../../../test/designerUi'

// The shape editor's templates and the look of a shape (S3): New shape offers the basics and a polygon and a star with a count; a shape made there has a thin outline,
// which the panel turns off and on and makes thicker, beside the shape's opacity.
vi.setConfig({ testTimeout: 30000 })

function oneShape(): ModelContent {
  let c = content('Demo')
  c = addGroup(c, { id: 'g', name: 'Head', parent: null, objects: [], pivot: null, attach: null })
  c = addObject(c, 'g', { id: 'o', name: 'Face', layer: 'body', shapes: [] })
  return addShape(c, 'o', newShape('s', 'Skull', 'oval', templateBox('oval', 100, 46, 40)))
}

async function open() {
  modelsBackend([draftEntry('a', oneShape())])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return user
}

const canvas = () => screen.getByRole('application')
const tools = () => within(screen.getByRole('toolbar', { name: 'Designer tools' }))

describe('New shape in the shape editor', () => {
  it('offers the basics, then a polygon and a star whose count the steppers change', async () => {
    const user = await open()
    await user.click(tools().getByRole('button', { name: 'New shape' }))
    const menu = within(screen.getByRole('menu', { name: 'Template shapes' }))
    expect(menu.getAllByRole('menuitem').map(b => b.textContent)).toEqual([
      'Square', 'Rectangle', 'Circle', 'Ellipse', 'Equilateral triangle', 'Right triangle', 'Pentagon', 'Hexagon', 'Polygon, 7 sides', 'Star, 5 points',
    ])
    await user.click(menu.getByRole('button', { name: 'Raise Polygon sides' }))
    await user.click(menu.getByRole('button', { name: 'Lower Star points' }))
    expect(menu.getByRole('menuitem', { name: 'Polygon, 8 sides' })).toBeInTheDocument()
    expect(menu.getByRole('menuitem', { name: 'Star, 4 points' })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Lower Star points' })).toBeDisabled()
  })

  it('makes the shape with its count of corners and a thin outline, drawn on the canvas', async () => {
    const user = await open()
    await user.click(tools().getByRole('button', { name: 'New shape' }))
    const menu = within(screen.getByRole('menu', { name: 'Template shapes' }))
    await user.click(menu.getByRole('button', { name: 'Raise Polygon sides' }))
    await user.click(menu.getByRole('menuitem', { name: 'Polygon, 8 sides' }))
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Polygon, 8 sides')
    expect(within(screen.getByRole('group', { name: 'Points' })).getAllByRole('button')).toHaveLength(8)
    const lines = canvas().querySelectorAll('path[data-line]')
    expect(lines).toHaveLength(1)
    expect(lines[0].getAttribute('stroke-width')).toBe('0.75')
    expect(lines[0].getAttribute('fill')).toBe('none')
    // the outline is never what a click lands on
    expect(lines[0].getAttribute('pointer-events')).toBe('none')
  })
})

describe('the look of a shape', () => {
  it('turns the outline off and on, makes it thicker, and steps the opacity', async () => {
    const user = await open()
    await user.click(tools().getByRole('button', { name: 'New shape' }))
    await user.click(within(screen.getByRole('menu', { name: 'Template shapes' })).getByRole('menuitem', { name: 'Square' }))
    const look = within(screen.getByRole('group', { name: 'Look of the shape' }))
    const outline = look.getByRole('button', { name: 'Outline' })
    const width = () => within(look.getByRole('group', { name: 'Outline width' })).getByText(/./, { selector: '.cmStepValue' }).textContent
    expect(outline).toHaveAttribute('aria-pressed', 'true')
    expect(width()).toBe('0.75')

    await user.click(outline)
    expect(outline).toHaveAttribute('aria-pressed', 'false')
    expect(width()).toBe('None')
    expect(canvas().querySelector('path[data-line]')).toBeNull()
    expect(look.getByRole('button', { name: 'Raise Outline width' })).toBeDisabled()

    await user.click(outline)
    await user.click(look.getByRole('button', { name: 'Raise Outline width' }))
    expect(width()).toBe('1')
    await user.keyboard('{Shift>}')
    await user.click(look.getByRole('button', { name: 'Raise Outline width' }))
    await user.keyboard('{/Shift}')
    expect(width()).toBe('2')
    expect(canvas().querySelector('path[data-line]')!.getAttribute('stroke-width')).toBe('2')

    const opacity = () => within(look.getByRole('group', { name: 'Opacity of the shape' })).getByText(/%$/).textContent
    expect(opacity()).toBe('100%')
    expect(look.getByRole('button', { name: 'Raise Opacity of the shape' })).toBeDisabled()
    await user.click(look.getByRole('button', { name: 'Lower Opacity of the shape' }))
    expect(opacity()).toBe('95%')
    // the opacity fades the fill, not the outline
    expect(canvas().querySelector('path[data-line]')!.getAttribute('stroke-opacity')).toBe('1')
  })

  it('leaves a shape from before the outline without one, until it is turned on', async () => {
    const user = await open()
    await pick(user, 'Skull', 'shape')
    expect(screen.getByRole('button', { name: 'Outline' })).toHaveAttribute('aria-pressed', 'false')
    expect(canvas().querySelector('path[data-line]')).toBeNull()
  })
})
