import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { content, liveEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'

// Phase O4a: a newer basic model came with the app but waits, because the admin had changed the basic model; the Designer offers to put it in.
vi.setConfig({ testTimeout: 30000 })

async function open(basicUpdate: boolean, id = 'basic') {
  const backend = modelsBackend([liveEntry(id, content(id === 'basic' ? 'Adult (basic)' : 'Mine'))])
  backend.basicUpdate = basicUpdate
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}

describe('a newer basic model', () => {
  it('is offered on the basic model when it waits, and put in after asking: the draft replaced and published as the next version', async () => {
    const { backend, user } = await open(true)
    const notice = within(await screen.findByRole('group', { name: 'A newer basic model' }))
    expect(notice.getByRole('status')).toHaveTextContent(/left as it is because it had been changed/)
    await user.click(notice.getByRole('button', { name: /Update the basic model/ }))
    const ask = within(screen.getByRole('group', { name: 'Update the basic model?' }))
    await user.click(ask.getByRole('button', { name: 'Replace the draft and publish' }))
    await waitFor(() => expect(screen.queryByRole('group', { name: 'A newer basic model' })).toBeNull())
    const basic = backend.entries.find(e => e.id === 'basic')!
    expect(basic.published!.version).toBe(2)
    expect(basic.draft.description).toBe('The newer basic adult.')
    expect(basic.history.map(h => h.version)).toEqual([1])
    expect(backend.calls).toContain('POST /character-models/basic/update')
  })

  it('can be put off, and is not offered when none waits or for another model', async () => {
    const first = await open(true)
    await first.user.click(await screen.findByRole('button', { name: /Update the basic model/ }))
    await first.user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(first.backend.entries[0].published!.version).toBe(1)
    expect(screen.getByRole('button', { name: /Update the basic model/ })).toBeInTheDocument()
  })

  it('is not offered when none waits', async () => {
    const { backend } = await open(false)
    await waitFor(() => expect(backend.calls).toContain('GET /character-models/basic/update'))
    expect(screen.queryByRole('group', { name: 'A newer basic model' })).toBeNull()
  })

  it('is not asked about when there is no basic model', async () => {
    const { backend } = await open(true, 'mine')
    expect(backend.calls).not.toContain('GET /character-models/basic/update')
    expect(screen.queryByRole('group', { name: 'A newer basic model' })).toBeNull()
  })
})
