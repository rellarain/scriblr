import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'

// New model (slice 9a): the form starts a model from a body (the body templates the server lists, read when the model is made) or a blank canvas. A body's model is named
// after it (not repeating a name here) and keeps its proportion guide; when the bodies cannot be loaded the form offers the blank canvas alone.
vi.setConfig({ testTimeout: 30000 })

async function open(entries = [draftEntry('a', content('Existing'))]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return { user, backend }
}
const form = () => within(screen.getByRole('dialog', { name: 'New model' }))
// New model is in the list of all the models
async function startNew(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Show all the models' }))
  await user.click(within(screen.getByRole('region', { name: 'Models' })).getByRole('button', { name: 'New model' }))
}

describe('New model', () => {
  it('lists the bodies with a note and a picture, and makes a model from the chosen one with its guide', async () => {
    const { user, backend } = await open()
    await startNew(user)
    const body = await form().findByRole('combobox', { name: 'Body' })
    expect(within(body).getAllByRole('option').map(o => o.textContent)).toEqual(['Average man · 7½ heads', 'Average woman · 7½ heads'])
    expect(form().getByRole('button', { name: 'A body' })).toHaveAttribute('aria-pressed', 'true')
    expect(form().getByText(/A stand-in average man\./)).toBeInTheDocument()
    await user.selectOptions(body, 'woman')
    expect(form().getByText(/A stand-in average woman\./)).toBeInTheDocument()
    await user.click(form().getByRole('button', { name: 'Make the model' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New model' })).toBeNull())
    expect(screen.getByRole('textbox', { name: 'Model name' })).toHaveValue('Average woman')
    expect(backend.calls).toContain('GET /character-models/body-templates/woman')
    expect(screen.getByRole('application').querySelector('path[data-shape="chest"]')).not.toBeNull()
  })

  it('names a second model from the same body so that it does not repeat a name', async () => {
    const { user } = await open([draftEntry('a', content('Average man'))])
    await startNew(user)
    await form().findByRole('combobox', { name: 'Body' })
    await user.click(form().getByRole('button', { name: 'Make the model' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Model name' })).toHaveValue('Average man (copy)'))
  })

  it('offers the blank canvas alone when the bodies cannot be loaded, and Cancel closes it', async () => {
    const { user, backend } = await open()
    backend.failNext('/character-models/body-templates', 500, 'down')
    await startNew(user)
    expect(await form().findByRole('alert')).toHaveTextContent('The bodies could not be loaded')
    expect(form().getByRole('button', { name: 'A body' })).toBeDisabled()
    await user.click(form().getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'New model' })).toBeNull()
  })
})
