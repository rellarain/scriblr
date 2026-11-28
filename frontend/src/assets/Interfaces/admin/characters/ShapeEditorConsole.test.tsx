import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { templateBox } from './engine/templates'
import { addGroup, addObject, addShape } from './modelContent'
import { pick, newBlankModel } from '../../../../test/designerUi'

// The Designer as the app shows it for now: only a shape editor (designerFeatures.ts). The other tools are off the screen; their own tests render the console with every tool.

function oneShape(name: string): ModelContent {
  let c = content(name)
  c = addGroup(c, { id: 'g', name: 'Head', parent: null, objects: [], pivot: null, attach: null })
  c = addObject(c, 'g', { id: 'o', name: 'Face', layer: 'body', shapes: [] })
  return addShape(c, 'o', newShape('s', 'Skull', 'oval', templateBox('oval', 100, 46, 40)))
}

async function open(entries: ModelEntry[] = [draftEntry('a', oneShape('Demo'))]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}

describe('the shape editor', () => {
  it('starts empty with New model and Import, and no basic model to add', async () => {
    const { user } = await open([])
    expect(screen.getByRole('heading', { name: 'No models yet' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add the basic model' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
    await newBlankModel(user)
    expect(await screen.findByRole('textbox', { name: 'Model name' })).toBeInTheDocument()
  })

  it('shows the shape tools only', async () => {
    await open()
    const tools = within(screen.getByRole('toolbar', { name: 'Designer tools' }))
    for (const name of ['Snap', 'Snap to grid', 'New shape']) expect(tools.getByRole('button', { name })).toBeInTheDocument()
    for (const name of ['Weights', 'Skin weights', 'Taper', 'Pose mode', 'Mirror editing']) expect(tools.queryByRole('button', { name })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Advanced tools' })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Inspector tabs' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Roll the look' })).toBeNull()
  })

  it('has the shape layers in the view bar, no front, back or angle, and a Checks drawer without previews', async () => {
    const { user } = await open()
    const layers = within(screen.getByRole('group', { name: 'Canvas layers (the leftmost is drawn on top)' })).getAllByRole('button').map(b => b.getAttribute('aria-label'))
    expect(layers.sort()).toEqual(['Alignment guides', 'Curve handles', 'Gridlines', 'Pivots and anchors', 'Proportion guide', 'Shape outlines', 'Shape points', 'Symmetry axes', 'The figure'])
    expect(screen.queryByRole('button', { name: 'Front view' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back view' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Angle' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Fit to screen' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Zoom' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Checks/ }))
    const drawer = document.getElementById('dz-drawer')!
    expect(drawer.getAttribute('aria-label')).toBe('Checks')
    expect(within(drawer).queryByRole('button', { name: /Re-roll/ })).toBeNull()
  })

  it('keeps the tree to groups, objects and shapes, without twins', async () => {
    const { user } = await open()
    const tree = within(screen.getByRole('navigation', { name: 'Model tree' }))
    expect(tree.queryByRole('region', { name: 'Variants' })).toBeNull()
    await pick(user, 'Skull', 'shape')
    expect(tree.queryByRole('region', { name: 'Poses' })).toBeNull()
    expect(tree.queryByRole('region', { name: 'Styles' })).toBeNull()
    expect(tree.queryByRole('button', { name: /Make a twin/ })).toBeNull()
  })

  it('edits a shape with its name, its look (outline and opacity) and points', async () => {
    const { user } = await open()
    await pick(user, 'Skull', 'shape')
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Skull')
    expect(screen.getByRole('group', { name: 'Opacity of the shape' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Outline' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Opacity of the shape' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Points' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Which view shows the shape' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Put a template on the shape' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Weight of point/ })).toBeNull()
  })
})
