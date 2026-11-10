import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent } from '../../../../api/types'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { pick } from '../../../../test/designerUi'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

vi.setConfig({ testTimeout: 30000 })

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

function faced(): ModelContent {
  let c = content('Adult')
  c = addGroup(c, newGroup('gH', 'Head'))
  c = addObject(c, 'gH', { id: 'oE', name: 'Eye', layer: 'body', shapes: [] })
  c = addShape(c, 'oE', newShape('iris', 'Iris', 'oval', box(84, 50, 32, 16)))
  c = addShape(c, 'oE', newShape('pupil', 'Pupil', 'oval', box(94, 53, 12, 10)))
  return c
}

async function open() {
  const backend = modelsBackend([draftEntry('a', faced())])
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}

const bar = (kind: string) => within(screen.getByRole('group', { name: `The ${kind} that is open` }))
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))

describe('the top of the editor', () => {
  it('names what is open: the model first, then a group, an object or a shape', async () => {
    const { user } = await open()
    expect(bar('model').getByText('Model')).toBeInTheDocument()
    expect(bar('model').getByText('Adult')).toBeInTheDocument()
    await pick(user, 'Head', 'group')
    expect(bar('group').getByText('Group')).toBeInTheDocument()
    expect(bar('group').getByText('Head')).toBeInTheDocument()
    await pick(user, 'Eye', 'object')
    expect(bar('object').getByText('Eye')).toBeInTheDocument()
    await pick(user, 'Iris', 'shape')
    expect(bar('shape').getByText('Iris')).toBeInTheDocument()
  })

  it('offers neither delete nor lock for the model, and rolls the look for it', async () => {
    await open()
    expect(bar('model').queryByRole('button', { name: /^Delete/ })).toBeNull()
    expect(bar('model').queryByRole('button', { name: /^Lock/ })).toBeNull()
    expect(bar('model').getByRole('button', { name: 'Roll the look' })).toBeInTheDocument()
  })

  it('locks a group or an object, not a shape, and shows the lock as pressed', async () => {
    const { user } = await open()
    await pick(user, 'Head', 'group')
    expect(bar('group').getByRole('button', { name: 'Lock Head' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(bar('group').getByRole('button', { name: 'Lock Head' }))
    expect(bar('group').getByRole('button', { name: 'Lock Head' })).toHaveAttribute('aria-pressed', 'true')
    await pick(user, 'Eye', 'object')
    expect(bar('object').getByRole('button', { name: 'Lock Eye' })).toHaveAttribute('aria-pressed', 'false')
    await pick(user, 'Iris', 'shape')
    expect(bar('shape').queryByRole('button', { name: /^Lock/ })).toBeNull()
  })

  it('copies a shape, which is the one open then, and deletes the copy', async () => {
    const { user, backend } = await open()
    await pick(user, 'Iris', 'shape')
    await user.click(bar('shape').getByRole('button', { name: 'Copy Iris' }))
    expect(bar('shape').getByText(/^Iris/)).toBeInTheDocument()
    expect(screen.getAllByRole('textbox', { name: 'Shape name' })[0]).toHaveValue('Iris (copy)')
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.shapes).toHaveLength(3))
    await user.click(bar('shape').getByRole('button', { name: 'Delete Iris (copy)' }))
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.shapes).toHaveLength(2))
  })

  it('deletes a group with what is in it, and an object with its shapes', async () => {
    const { user, backend } = await open()
    await pick(user, 'Eye', 'object')
    await user.click(bar('object').getByRole('button', { name: 'Delete object Eye' }))
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.objects).toHaveLength(0))
    expect(backend.entries[0].draft.shapes).toHaveLength(0)
    await pick(user, 'Head', 'group')
    await user.click(bar('group').getByRole('button', { name: 'Delete group Head' }))
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.groups).toHaveLength(0))
  })

  it('puts the test values back to rest, and says how many are away', async () => {
    const { user } = await open()
    expect(bar('model').queryByRole('button', { name: 'Reset test values' })).toBeNull()
    await pick(user, 'Head', 'group')
    await user.click(screen.getByRole('button', { name: 'Show Eye' }))                    // the object's eye, among its siblings
    expect(bar('group').getByRole('button', { name: 'Reset test values' })).toHaveTextContent('1 off rest')
    await user.click(bar('group').getByRole('button', { name: 'Reset test values' }))
    expect(bar('group').queryByRole('button', { name: 'Reset test values' })).toBeNull()
  })
})
