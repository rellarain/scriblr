import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { normalizeContent } from './modelContent'

// The Body section (slice 9f): a model started from a body has body sliders in groups (the frame, the soft tissue, the age, the regions on asking), each held to its
// band unless the ranges are unlocked, and bodies to blend; they change the test character on the canvas, never the model.
vi.setConfig({ testTimeout: 60000 })

const seed = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../backend/app/seed/body_templates.json'), 'utf-8')) as { templates: Array<{ id: string; content: ModelContent }> }
const man = normalizeContent(seed.templates.find(t => t.id === 'man')!.content)

async function open(c: ModelContent = man) {
  const backend = modelsBackend([draftEntry('m', c)])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return { user, backend }
}
const body = () => within(screen.getByRole('group', { name: 'Body' }))
const slider = (name: string) => body().getByRole('slider', { name })
const chest = () => screen.getByRole('application').querySelector('path[data-shape="chest"]')!.getAttribute('d')

describe('the Body section', () => {
  it('lists the body sliders in their groups, with the values as they read', async () => {
    await open()
    const frame = within(body().getByRole('group', { name: 'Frame · the skeleton' }))
    expect(frame.getAllByRole('slider').map(s => s.getAttribute('aria-valuetext'))).toEqual(['175 cm', '0', '±0'])
    expect(frame.getByText(/^7\.5 heads\./)).toBeInTheDocument()
    const soft = within(body().getByRole('group', { name: 'Soft tissue' }))
    expect(soft.getAllByRole('slider').map(s => s.getAttribute('aria-label') ?? s.id)).toHaveLength(4)
    expect(slider('Body fat')).toHaveAttribute('aria-valuetext', '18%')
    expect(slider('Fat sits')).toHaveAttribute('aria-valuetext', 'even')
    expect(slider('Age')).toHaveAttribute('aria-valuetext', '34 yrs')
    // the regions wait to be asked for
    expect(body().queryByRole('slider', { name: 'Shoulders' })).toBeNull()
    await userEvent.setup().click(body().getByRole('button', { name: 'More sliders, by region' }))
    expect(slider('Shoulders')).toHaveAttribute('aria-valuetext', '±0')
  })

  it('changes the test character, and the fat reads as a share of the body for its sex', async () => {
    const { backend } = await open()
    const before = chest()
    fireEvent.change(slider('Masc. – fem.'), { target: { value: '100' } })
    expect(slider('Masc. – fem.')).toHaveAttribute('aria-valuetext', '100')
    expect(slider('Body fat')).toHaveAttribute('aria-valuetext', '28%')
    expect(chest()).not.toBe(before)
    // the model itself is not changed
    expect(backend.calls.some(c => c.startsWith('PUT'))).toBe(false)
  })

  it('holds a slider to its band until the ranges are unlocked, and locking again brings it back', async () => {
    const { user } = await open()
    fireEvent.change(slider('Height'), { target: { value: '208' } })
    expect(slider('Height')).toHaveAttribute('aria-valuetext', '200 cm')
    await user.click(body().getByRole('button', { name: 'Unlock the ranges' }))
    fireEvent.change(slider('Height'), { target: { value: '208' } })
    expect(slider('Height')).toHaveAttribute('aria-valuetext', '208 cm')
    await user.click(body().getByRole('button', { name: 'Unlock the ranges' }))
    expect(slider('Height')).toHaveAttribute('aria-valuetext', '200 cm')
  })

  it('blends up to three bodies, and Reset the body puts the sliders back', async () => {
    const { user } = await open()
    const bodies = within(body().getByRole('group', { name: 'Bodies' }))
    await user.click(bodies.getByRole('button', { name: 'Heavy' }))
    expect(slider('Body fat')).toHaveAttribute('aria-valuetext', '32%')
    await user.click(bodies.getByRole('button', { name: 'Athletic' }))
    // half and half: (14 - 6) / 2 above the average
    expect(slider('Body fat')).toHaveAttribute('aria-valuetext', '22%')
    expect(bodies.getByRole('img', { name: 'Blend: Heavy 50%, Athletic 50%' })).toBeInTheDocument()
    // the point moved toward Athletic (the right end of the line)
    fireEvent.keyDown(bodies.getByRole('img', { name: /^Blend:/ }), { key: 'ArrowRight', shiftKey: true })
    expect(bodies.getByRole('img', { name: /^Blend: Heavy \d+%, Athletic \d+%$/ }).getAttribute('aria-label')).not.toBe('Blend: Heavy 50%, Athletic 50%')
    await user.click(bodies.getByRole('button', { name: 'Slim' }))
    expect(bodies.getByRole('button', { name: 'Elder' })).toBeDisabled()
    await user.click(body().getByRole('button', { name: 'Reset the body' }))
    expect(slider('Body fat')).toHaveAttribute('aria-valuetext', '18%')
    expect(bodies.getByRole('button', { name: 'Heavy' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('is not there for a model with no body sliders', async () => {
    await open(blank('Plain'))
    await screen.findByRole('heading', { name: 'Overview' })
    expect(screen.queryByRole('group', { name: 'Body' })).toBeNull()
  })
})
