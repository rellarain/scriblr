import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { modelsBackend } from '../../../../test/characterModelsBackend'
import WriterLimitsConsole from './WriterLimitsConsole'
import { WRITER_LIMIT_ROWS, defaultWriterLimits } from './engine/writerLimits'

vi.setConfig({ testTimeout: 30000 })

// Configuration > Writers' designer: the limits for the models writers design, one stepper each, kept between a floor and the admin's own limit.

async function open() {
  const backend = modelsBackend([], [])
  const user = userEvent.setup()
  render(<WriterLimitsConsole />)
  await screen.findByRole('region', { name: 'Writer model limits' })
  return { backend, user }
}
const row = (label: string) => screen.getByRole('group', { name: label })
const value = (label: string) => within(row(label)).getByText(/^\d+$/).textContent
const lower = (user: ReturnType<typeof userEvent.setup>, label: string, shift = false) =>
  shift ? user.keyboard('{Shift>}').then(() => user.click(within(row(label)).getByRole('button', { name: `Lower ${label}` }))).then(() => user.keyboard('{/Shift}')) : user.click(within(row(label)).getByRole('button', { name: `Lower ${label}` }))
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))

describe('the limits for the models writers design', () => {
  it('start at the admin\'s own limit, each with a stepper and the limit it cannot pass', async () => {
    await open()
    for (const r of WRITER_LIMIT_ROWS) {
      expect(value(r.label), r.label).toBe(String(r.ceiling))
      expect(within(row(r.label)).getByRole('button', { name: `Raise ${r.label}` })).toBeDisabled()
    }
    expect(screen.getByRole('button', { name: /Back to your own limits/ })).toBeDisabled()
    expect(screen.getAllByText(/Your own limit: \d+ \(not lowered\)/)).toHaveLength(WRITER_LIMIT_ROWS.length)
  })

  it('step down and up by one, and by more with Shift, and stop at the floor', async () => {
    const { user } = await open()
    await lower(user, 'Shapes in a model')
    expect(value('Shapes in a model')).toBe('790')
    await lower(user, 'Shapes in a model', true)
    expect(value('Shapes in a model')).toBe('740')
    await user.click(within(row('Shapes in a model')).getByRole('button', { name: 'Raise Shapes in a model' }))
    expect(value('Shapes in a model')).toBe('750')
    expect(screen.getByText('Your own limit: 800')).toBeInTheDocument()
    // the floor of a shape's points is 3
    for (let i = 0; i < 20; i++) await lower(user, 'Points in a shape', true)
    expect(value('Points in a shape')).toBe('3')
    expect(within(row('Points in a shape')).getByRole('button', { name: 'Lower Points in a shape' })).toBeDisabled()
  })

  it('are kept when saved, and read again when the page is opened', async () => {
    const { user, backend } = await open()
    await lower(user, 'Objects in a group', true)
    await lower(user, 'Models in a writer\'s library')
    await save(user)
    await waitFor(() => expect(backend.limits).toMatchObject({ objectsPerGroup: 44, models: 99 }))
    expect(backend.limits.shapes).toBe(800)
    expect(backend.calls).toContain('PUT /my-models/limits')
    // opened again
    document.body.innerHTML = ''
    render(<WriterLimitsConsole />)
    await screen.findByRole('region', { name: 'Writer model limits' })
    expect(value('Objects in a group')).toBe('44')
    expect(value('Models in a writer\'s library')).toBe('99')
  })

  it('go back to the admin\'s own limits with one button', async () => {
    const { user, backend } = await open()
    await lower(user, 'Sliders in a model', true)
    await lower(user, 'Groups in a model')
    await user.click(screen.getByRole('button', { name: /Back to your own limits/ }))
    expect(WRITER_LIMIT_ROWS.map(r => value(r.label))).toEqual(WRITER_LIMIT_ROWS.map(r => String(r.ceiling)))
    await save(user)
    await waitFor(() => expect(backend.limits).toEqual(defaultWriterLimits()))
  })

  it('say so when they cannot be read, and read them again on request', async () => {
    const backend = modelsBackend([], [])
    backend.failNext('/my-models/limits', 500, 'down')
    const user = userEvent.setup()
    render(<WriterLimitsConsole />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The limits could not be loaded.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('region', { name: 'Writer model limits' })
  })
})
