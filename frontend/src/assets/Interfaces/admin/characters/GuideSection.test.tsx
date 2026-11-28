import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent } from '../../../../api/types'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { guideTargets, guideYs, headGuide } from './engine/guides'
import { solve } from './engine/rig'
import { headsText } from './GuideSection'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// The proportion guide (slice 9a): the head-units layer draws a model's guide (a line every head from the crown, its named lines as marks), its lines are snap targets, and
// the shape editor's Overview shows it, turns it on and off, sets a head's height and its lines, adds one to a model that has none and removes it.
vi.setConfig({ testTimeout: 30000 })

function torso(guide: ModelContent['guide'] = { top: 10, head: 56, lines: [{ name: 'Chin', y: 66 }, { name: 'Waist', y: 164 }] }): ModelContent {
  let c = addGroup({ ...content('Guided'), guide }, newGroup('g', 'Torso'))
  c = addObject(c, 'g', { id: 'o', name: 'Torso', layer: 'body', shapes: [] })
  return addShape(c, 'o', newShape('s', 'Chest', 'rectangle', { x: 70, y: 70, w: 60, h: 100 }))
}

describe('the guide in the engine', () => {
  it('draws a line every head from the crown, with the named lines as marks', () => {
    const c = torso()
    const g = headGuide(c, solve(c, {}, 'front', {}))!
    expect(g.unit).toBe(56)
    expect(g.top).toBe(10)
    expect(g.marks.map(m => [m.name, m.at])).toEqual([['Chin', 1], ['Waist', 2.75]])
    expect(g.lines[0].y).toBe(10)
  })
  it('gives its lines as snap targets: every head down to seven and a half heads, and every named line', () => {
    const c = torso()
    const solved = solve(c, {}, 'front', {})
    const ys = guideYs(c, solved)
    expect(ys).toContain(10)
    expect(ys).toContain(66)
    expect(ys).toContain(164)
    expect(ys).toContain(10 + 8 * 56)
    expect(guideTargets(c, solved, ['s'], [], true).ys).toContain(164)
    expect(guideTargets(c, solved, ['s']).ys).not.toContain(164)
    expect(guideYs(torso(null), solved)).toEqual([])
  })
  it('writes heads as wholes and eighths', () => {
    expect(headsText(2.75)).toBe('2¾')
    expect(headsText(0.125)).toBe('⅛')
    expect(headsText(3)).toBe('3')
    expect(headsText(1.333)).toBe('1.33')
  })
})

async function open(c: ModelContent) {
  modelsBackend([draftEntry('m', c)])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return user
}
const section = () => within(screen.getByRole('group', { name: 'Proportion guide' }))
const headsLayer = () => screen.getByRole('application').querySelector('[data-layer="heads"]')

describe('the guide in the Overview', () => {
  it('shows and hides the guide, and changes a head and a line', async () => {
    const user = await open(torso())
    const show = section().getByRole('button', { name: 'Show the guide' })
    if (show.getAttribute('aria-pressed') !== 'true') await user.click(show)
    expect(section().getByRole('button', { name: 'Show the guide' })).toHaveAttribute('aria-pressed', 'true')
    expect(headsLayer()!.querySelector('[data-mark="Waist"]')).not.toBeNull()
    expect(section().getByRole('button', { name: 'Snap to the guide' })).toHaveAttribute('aria-pressed', 'true')

    // the waist two and three quarter heads down, then a quarter head lower
    const waist = within(section().getByRole('group', { name: 'Height of Waist' }))
    expect(waist.getByText('2¾')).toBeInTheDocument()
    await user.click(waist.getByRole('button', { name: 'Raise Height of Waist' }))
    await user.click(waist.getByRole('button', { name: 'Raise Height of Waist' }))
    expect(within(section().getByRole('group', { name: 'Height of Waist' })).getByText('3')).toBeInTheDocument()
    await user.clear(section().getByRole('textbox', { name: 'Name of line 2' }))
    await user.type(section().getByRole('textbox', { name: 'Name of line 2' }), 'Navel')
    expect(headsLayer()!.querySelector('[data-mark="Navel"]')).not.toBeNull()

    await user.click(section().getByRole('button', { name: 'Raise Head height' }))
    expect(within(section().getByRole('group', { name: 'Head height' })).getByText('57')).toBeInTheDocument()

    await user.click(section().getByRole('button', { name: 'Remove Chin' }))
    expect(section().queryByRole('textbox', { name: 'Name of line 2' })).toBeNull()
    await user.click(section().getByRole('button', { name: 'Show the guide' }))
    expect(headsLayer()).toBeNull()
  })

  it('adds the canon guide to a model that has none, and removes it', async () => {
    const user = await open(torso(null))
    expect(section().getByText(/This model has no proportion guide/)).toBeInTheDocument()
    await user.click(section().getByRole('button', { name: 'Add a guide' }))
    const names = section().getAllByRole('textbox').map(t => (t as HTMLInputElement).value)
    expect(names).toEqual(['Chin', 'Chest', 'Waist', 'Crotch', 'Knees', 'Soles'])
    // the crown at the model's highest point
    expect(within(section().getByRole('group', { name: 'Height of Chin' })).getByText('1')).toBeInTheDocument()
    await user.click(section().getByRole('button', { name: 'Remove the guide' }))
    expect(section().getByRole('button', { name: 'Add a guide' })).toBeInTheDocument()
  })
})
