import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { normalizeContent } from './modelContent'

// The Measurements section (slice 9f-2): the test character's body in cm under the Body section, its shape class, and a typed measurement moving its slider.
vi.setConfig({ testTimeout: 60000 })

const seed = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../backend/app/seed/body_templates.json'), 'utf-8')) as { templates: Array<{ id: string; content: ModelContent }> }
const man = normalizeContent(seed.templates.find(t => t.id === 'man')!.content)

async function open(c: ModelContent = man) {
  modelsBackend([draftEntry('m', c)])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return user
}
const section = () => within(screen.getByRole('group', { name: 'Measurements' }))

describe('the Measurements section', () => {
  it('lists the body in cm, with a field for each measurement a slider moves, and the shape class', async () => {
    await open()
    expect(section().getByRole('textbox', { name: 'Height in cm' })).toHaveValue('175')
    for (const name of ['Neck', 'Shoulders', 'Bust / chest', 'Natural waist', 'Hip', 'Arm length', 'Inseam']) expect(section().getByRole('textbox', { name: `${name} in cm` })).toBeInTheDocument()
    expect(section().queryByRole('textbox', { name: 'Calf in cm' })).toBeNull()
    expect(section().getByText('Calf')).toBeInTheDocument()
    expect(section().getByRole('note', { name: 'Shape' })).toHaveTextContent(/^Shape: rectangle · bust \d+ · waist \d+ · hip \d+ cm/)
  })

  it('moves the slider for a typed measurement, and says so when the band stops it', async () => {
    const user = await open()
    const waist = section().getByRole('textbox', { name: 'Natural waist in cm' })
    const before = Number((waist as HTMLInputElement).value)
    await user.clear(waist)
    await user.type(waist, `${before + 4}{Enter}`)
    await waitFor(() => expect(Math.abs(Number((section().getByRole('textbox', { name: 'Natural waist in cm' }) as HTMLInputElement).value) - (before + 4))).toBeLessThan(0.7))
    // the Waist slider moved (the regions open on asking)
    await user.click(screen.getByRole('button', { name: 'More sliders, by region' }))
    expect(within(screen.getByRole('group', { name: 'Body' })).getByRole('slider', { name: 'Waist' })).not.toHaveAttribute('aria-valuetext', '±0')
    const height = section().getByRole('textbox', { name: 'Height in cm' })
    await user.clear(height)
    await user.type(height, '230{Enter}')
    expect(section().getByRole('status')).toHaveTextContent('Height: as near to 230 cm as the band of its slider allows.')
    expect(section().getByRole('textbox', { name: 'Height in cm' })).toHaveValue('200')
  })

  it('is not there for a model with no body sliders', async () => {
    await open(blank('Plain'))
    await screen.findByRole('heading', { name: 'Overview' })
    expect(screen.queryByRole('group', { name: 'Measurements' })).toBeNull()
  })
})
