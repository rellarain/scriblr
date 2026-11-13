import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { setPivot } from './engine/rigEdit'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { pick } from '../../../../test/designerUi'

vi.setConfig({ testTimeout: 30000 })

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// A torso (a chest with a shadow down its side, and a pelvis) with an upper arm hung from it and a forearm under that; a bone along the upper arm.
function figure(): ModelContent {
  let c = blank('Adult')
  c = addGroup(c, newGroup('gT', 'Torso'))
  c = addGroup(c, newGroup('gU', 'Upper arm', 'gT'))
  c = addGroup(c, newGroup('gF', 'Forearm', 'gU'))
  c = addObject(c, 'gT', { id: 'oChest', name: 'Chest part', layer: 'body', shapes: [] }); c = addShape(c, 'oChest', newShape('chest', 'Chest shape', 'rounded', box(80, 40, 40, 60)))
  c = addShape(c, 'oChest', { ...newShape('shadow', 'Chest shadow', 'rectangle', box(110, 40, 12, 110)), shade: { kind: 'shadow', t: 0.2 } })
  c = addObject(c, 'gT', { id: 'oPelvis', name: 'Pelvis part', layer: 'body', shapes: [] }); c = addShape(c, 'oPelvis', newShape('pelvis', 'Pelvis shape', 'rounded', box(80, 100, 40, 40)))
  c = addObject(c, 'gU', { id: 'oU', name: 'Upper part', layer: 'body', shapes: [] }); c = addShape(c, 'oU', newShape('upper', 'Upper shape', 'rounded', box(55, 60, 10, 80)))
  c = addObject(c, 'gF', { id: 'oF', name: 'Fore part', layer: 'body', shapes: [] }); c = addShape(c, 'oF', newShape('fore', 'Fore shape', 'rounded', box(55, 140, 10, 80)))
  c = setPivot(setPivot(setPivot(c, 'gT', 100, 80), 'gU', 60, 60), 'gF', 60, 140)
  return { ...c, bones: [{ id: 'bUp', name: 'Upper arm', start: 'gU', end: { kind: 'group', id: 'gF', i: 0 } }] }
}

async function open() {
  const backend = modelsBackend([draftEntry('a', figure())])
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}
const tab = (name: string) => screen.getByRole('tab', { name })
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const draft = (b: { entries: ModelEntry[] }) => b.entries[0].draft

describe('foreshortening in the Designer', () => {
  it('a Depth slider for a bone turns it toward the viewer: the arm is drawn shorter', async () => {
    const { backend, user } = await open()
    await pick(user, 'Upper arm', 'group')
    await user.click(tab('Proportions'))
    await user.click(within(screen.getByRole('region', { name: 'Bone Upper arm' })).getByRole('button', { name: /Add a Depth slider/ }))
    await save(user)
    const r = draft(backend).ranges[0]
    expect(r).toMatchObject({ name: 'Upper arm depth', min: -60, max: 60, unit: '°' })
    expect(r.drives).toEqual([expect.objectContaining({ kind: 'depth', id: 'bUp', atMin: -60, atMax: 60 })])
    // the Ranges tab says what it does, and the Try it slider shortens the arm on the canvas
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: /All \(/ }))
    expect(screen.getByText(/Turns Upper arm toward the viewer by -60° at the minimum and \+60° at the maximum/)).toBeInTheDocument()
    const before = document.querySelector('path[data-shape="upper"]')!.getAttribute('d')
    fireEvent.change(screen.getByRole('slider', { name: 'Try Upper arm depth' }), { target: { value: '60' } })
    expect(document.querySelector('path[data-shape="upper"]')!.getAttribute('d')).not.toBe(before)
  })
})

describe('a shadow across parts in the Designer', () => {
  it('a shading shape is let lie on another part from its Paint section, and stops', async () => {
    const { backend, user } = await open()
    await pick(user, 'Chest shadow')
    await user.click(tab('Colour'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Another part Chest shadow lies on' }), 'Pelvis part')
    await save(user)
    expect(draft(backend).shapes.find(s => s.id === 'shadow')!.over).toEqual(['oPelvis'])
    await user.click(within(screen.getByRole('group', { name: 'Lies on' })).getByRole('button', { name: 'Pelvis part' }))
    await save(user)
    expect(draft(backend).shapes.find(s => s.id === 'shadow')!.over).toEqual([])
  })
})
