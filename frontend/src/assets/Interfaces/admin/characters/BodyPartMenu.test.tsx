import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent } from '../../../../api/types'
import { MOCK_PARTS } from '../../../../designSystem/mockCharacterModels'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { addBodyPart } from './BodyPartMenu'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { LIMITS } from './engine/limits'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// The Body part menu (slice 9a): the parts the server lists, each added as a group and an object of its own, made to the model's proportion guide (the parts are drawn for a
// head of 56 units with the crown at 10), and selected.
vi.setConfig({ testTimeout: 30000 })

function model(guide: ModelContent['guide'] = null): ModelContent {
  let c = addGroup({ ...content('Parts'), guide }, newGroup('g', 'Torso'))
  c = addObject(c, 'g', { id: 'o', name: 'Torso', layer: 'body', shapes: [] })
  return addShape(c, 'o', newShape('s', 'Chest', 'rectangle', { x: 70, y: 70, w: 60, h: 100 }))
}
let n = 0
const make = (prefix: string) => `${prefix}_t${++n}`

describe('adding a body part', () => {
  it('keeps the part as drawn on a model without a guide', () => {
    const r = addBodyPart(model(), MOCK_PARTS[0], make)
    if ('refused' in r) throw new Error(r.refused)
    const g = r.content.groups.find(x => x.id === r.groupId)!
    expect(g.name).toBe('Hand')
    const shapes = r.content.objects.find(o => o.id === g.objects[0])!.shapes.map(id => r.content.shapes.find(s => s.id === id)!)
    expect(shapes.map(s => s.name)).toEqual(['Palm (left)', 'Index finger (left)'])
    expect(shapes[0].pts[0]).toMatchObject({ x: MOCK_PARTS[0].shapes[0].pts[0].x, y: MOCK_PARTS[0].shapes[0].pts[0].y })
  })
  it('makes it to the guide: a head of 28 with the crown at 20 halves it about the middle and the crown', () => {
    const r = addBodyPart(model({ top: 20, head: 28, lines: [] }), MOCK_PARTS[0], make)
    if ('refused' in r) throw new Error(r.refused)
    const palm = r.content.shapes.find(s => s.name === 'Palm (left)')!
    const src = MOCK_PARTS[0].shapes[0]
    expect(palm.pts[0].x).toBeCloseTo(100 + (src.pts[0].x - 100) / 2)
    expect(palm.pts[0].y).toBeCloseTo(20 + (src.pts[0].y - 10) / 2)
    expect(palm.outline).toBeCloseTo(0.6)
  })
  it('is refused when the model would have too many shapes', () => {
    const full = { ...model(), shapes: Array.from({ length: LIMITS.shapesMax }, (_, i) => ({ ...newShape(`x${i}`, 'X', 'square', { x: 0, y: 0, w: 4, h: 4 }) })) }
    expect(addBodyPart(full, MOCK_PARTS[0], make)).toHaveProperty('refused')
  })
})

describe('the Body part menu', () => {
  it('lists the parts and adds the chosen one as a group, selected', async () => {
    modelsBackend([draftEntry('m', model({ top: 10, head: 56, lines: [] }))])
    const user = userEvent.setup()
    render(<DesignerConsole tools="shapes" />)
    await screen.findByRole('region', { name: 'Designer' })
    await user.click(within(screen.getByRole('toolbar', { name: 'Designer tools' })).getByRole('button', { name: 'Body part' }))
    const menu = within(screen.getByRole('dialog', { name: 'Body parts' }))
    const items = await menu.findAllByRole('button')
    expect(items.map(b => b.textContent)).toEqual(['Handpalm, 5 fingers', 'Lock of hair'])
    await user.click(items[1])
    expect(screen.queryByRole('dialog', { name: 'Body parts' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Group name' })).toHaveValue('Lock of hair'))
    expect(screen.getByRole('application').querySelectorAll('path[data-shape]')).toHaveLength(2)
  })
})
