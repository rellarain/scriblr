import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { content, draftEntry, liveEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { templateBox } from './engine/templates'
import { addGroup, addObject, addShape } from './modelContent'

// The writer's own models (phase 7a): the Designer console on a second library, `/my-models`, whose ids start with "my-".

// a model that can be published: one oval in one object in one group
function complete(name: string): ModelContent {
  let c = content(name)
  c = addGroup(c, { id: 'g', name: 'Head', parent: null, objects: [], pivot: null, attach: null })
  c = addObject(c, 'g', { id: 'o', name: 'Face', layer: 'body', shapes: [] })
  return addShape(c, 'o', newShape('s', 'Skull', 'oval', templateBox('oval', 100, 46, 40)))
}

async function open(catalog: ModelEntry[] = [liveEntry('basic', complete('Adult (basic)')), draftEntry('draft', complete('Unfinished'))], own: ModelEntry[] = []) {
  const backend = modelsBackend(catalog, own)
  const user = userEvent.setup()
  render(<DesignerConsole library="mine" />)
  await screen.findByRole('region', { name: 'My models' })
  return { backend, user }
}

const picker = () => screen.getByRole('menu', { name: "Scriblr's models" })
const nameBox = () => screen.getByRole('textbox', { name: 'Model name' })
// edits wait for Save (autosave is off unless the user turns it on)
const saveNow = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))

describe('the writer\'s own designer', () => {
  it('reads the writer\'s library, not the catalog, and says there is nothing in it yet', async () => {
    const { backend } = await open()
    expect(screen.getByRole('heading', { name: 'No models of your own yet' })).toBeInTheDocument()
    expect(backend.calls).toContain('GET /my-models')
    expect(backend.calls.some(c => c.includes('/character-models'))).toBe(false)
    expect(screen.queryByRole('button', { name: 'Add the basic model' })).not.toBeInTheDocument()
    for (const name of ['Duplicate a Scriblr model', 'New model', 'Import']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })

  it('starts a blank model whose id starts with "my-", and saves it to the library only', async () => {
    const { backend, user } = await open()
    await user.click(screen.getByRole('button', { name: 'New model' }))
    await saveNow(user)
    await waitFor(() => expect(backend.ownEntries).toHaveLength(1))
    expect(backend.ownEntries[0].id).toMatch(/^my-/)
    expect(backend.entries.map(e => e.id)).toEqual(['basic', 'draft'])
    expect(backend.calls.filter(c => c === 'PUT /my-models').length).toBeGreaterThan(0)
    expect(backend.calls.some(c => c === 'PUT /character-models')).toBe(false)
  })

  it('offers the published models that come with Scriblr and keeps a copy as a draft of its own', async () => {
    const { backend, user } = await open()
    await user.click(screen.getByRole('button', { name: 'Duplicate a Scriblr model' }))
    const items = within(await screen.findByRole('menu', { name: "Scriblr's models" })).getAllByRole('menuitem')
    // a draft the admin has not published is not offered
    expect(items.map(i => i.textContent)).toEqual([expect.stringContaining('Adult (basic)')])
    expect(items[0]).toHaveTextContent('1 shapes')
    await user.click(items[0])
    await saveNow(user)
    await waitFor(() => expect(backend.ownEntries).toHaveLength(1))
    const copy = backend.ownEntries[0]
    expect(copy.id).toMatch(/^my-/)
    expect(copy.published).toBeNull()
    expect(copy.draft.name).toBe('Adult (basic)')
    expect(copy.draft.shapes).toHaveLength(1)
    expect(nameBox()).toHaveValue('Adult (basic)')
    // the original is as it was
    expect(backend.entries[0].draft.name).toBe('Adult (basic)')
    expect(backend.entries[0].published?.version).toBe(1)
  })

  it('gives a second copy of the same model a name of its own', async () => {
    const { backend, user } = await open()
    for (let i = 0; i < 2; i++) {
      // once there is a model the menu is in the list of all the models
      if (i > 0) await user.click(screen.getByRole('button', { name: 'Show all the models' }))
      await user.click(screen.getByRole('button', { name: 'Duplicate a Scriblr model' }))
      await user.click(within(await screen.findByRole('menu', { name: "Scriblr's models" })).getAllByRole('menuitem')[0])
      await saveNow(user)
      await waitFor(() => expect(backend.ownEntries).toHaveLength(i + 1))
    }
    expect(backend.ownEntries.map(e => e.draft.name)).toEqual(['Adult (basic)', 'Adult (basic) (copy)'])
  })

  it('closes the list of Scriblr\'s models with Escape', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Duplicate a Scriblr model' }))
    expect(await screen.findByRole('menu', { name: "Scriblr's models" })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: "Scriblr's models" })).not.toBeInTheDocument()
  })

  it('says so when Scriblr\'s models cannot be read, and still lets the writer begin with a blank model', async () => {
    const { backend, user } = await open()
    backend.failNext('/character-models/published', 500, 'down')
    await user.click(screen.getByRole('button', { name: 'Duplicate a Scriblr model' }))
    expect(await screen.findByText("Scriblr's models could not be loaded.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New model' })).toBeEnabled()
  })

  it('publishes a model of its own as numbered versions in the library', async () => {
    const { backend, user } = await open()
    await user.click(screen.getByRole('button', { name: 'Duplicate a Scriblr model' }))
    await user.click(within(await screen.findByRole('menu', { name: "Scriblr's models" })).getAllByRole('menuitem')[0])
    await saveNow(user)
    await waitFor(() => expect(backend.ownEntries).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: /^Publish/ }))
    await waitFor(() => expect(backend.ownEntries[0].published?.version).toBe(1))
    const id = backend.ownEntries[0].id
    expect(backend.calls).toContain(`POST /my-models/${id}/publish`)
    expect(backend.calls.some(c => c.includes('/character-models') && c.endsWith('/publish'))).toBe(false)
  })

  it('lists the models that are in the library, with where each stands, and a duplicate stays in the library', async () => {
    const { backend, user } = await open([], [liveEntry('my-1', complete('Mine')), draftEntry('my-2', content('Sketch'))])
    expect(nameBox()).toHaveValue('Mine')
    await user.click(screen.getByRole('button', { name: 'Duplicate the model' }))
    await saveNow(user)
    await waitFor(() => expect(backend.ownEntries).toHaveLength(3))
    expect(backend.ownEntries.map(e => e.draft.name)).toEqual(['Mine', 'Mine (copy)', 'Sketch'])
    expect(backend.ownEntries.every(e => e.id.startsWith('my-'))).toBe(true)
    expect(backend.ownEntries[1].published).toBeNull()
  })

  it('shows the models in the tree with the tools for the writer\'s library (no basic-model button, a Scriblr menu)', async () => {
    const { user } = await open([], [liveEntry('my-1', complete('Mine'))])
    await user.click(screen.getByRole('button', { name: 'Show all the models' }))
    const models = within(screen.getByRole('navigation', { name: 'Model tree' })).getByRole('region', { name: 'Models' })
    expect(within(models).queryByRole('button', { name: 'Add the basic model' })).not.toBeInTheDocument()
    expect(within(models).getByRole('button', { name: 'Duplicate a Scriblr model' })).toBeInTheDocument()
    expect(within(models).getByRole('button', { name: 'New model' })).toBeInTheDocument()
  })
})
