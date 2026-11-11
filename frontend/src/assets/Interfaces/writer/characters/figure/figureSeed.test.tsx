import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CharacterFigure, FigureModel, ModelContent } from '../../../../../api/types'
import type { Characters } from '../useCharacters'
import { FigureEditor } from './FigureEditor'
import { blankFigure } from './figureState'

// The writer's editor on the basic model that comes with the app (backend/app/seed/basic_model.json): its sheets, its parts, its options and its ages.
vi.setConfig({ testTimeout: 30000 })

const content: ModelContent = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../../backend/app/seed/basic_model.json'), 'utf-8'))
const basic: FigureModel = { id: 'seed1', modelId: 'basic', version: 1, name: 'Adult (basic)', publishedAt: null, content }

function setup(start: CharacterFigure = blankFigure(basic.id, content)) {
  const seen = { figure: start }
  function Host() {
    const [figure, set] = useState(start)
    seen.figure = figure
    const setFigure: Characters['setFigure'] = (next) => {
      if (next === null) return
      set(prev => { const made = typeof next === 'function' ? next(prev) : next; seen.figure = made; return made })
    }
    return <FigureEditor projectId="p1" figure={figure} model={basic} label="Ada, figure" setFigure={setFigure} />
  }
  const user = userEvent.setup()
  render(<Host />)
  return { seen, user }
}

const card = () => document.querySelector('.charFigCard') as HTMLElement
const sheet = (name: string) => screen.getByRole('button', { name: `${name} sheet` })
const viewBox = () => document.querySelector('.charFigLayer--figure')!.getAttribute('viewBox')!.split(' ').map(Number)
const hotNames = () => [...card().querySelectorAll('.charFigHot')].map(h => h.getAttribute('aria-label'))

describe('the writer meets the basic model', () => {
  it('lays a sheet on the card for each of its frames, the biggest first', () => {
    setup()
    expect(screen.getByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
    expect([...card().querySelectorAll('.charFigSheet')].map(s => s.getAttribute('aria-label'))).toEqual(['Full body sheet', 'Hands sheet', 'Bust sheet', 'Face sheet', 'Feet sheet'])
  })

  it('names the parts of the face and their other sides, and a twin is never called one', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Face' }))
    await user.click(sheet('Face'))
    const names = hotNames()
    for (const part of ['Head', 'Ears (left)', 'Ears (right)', 'Brows (left)', 'Brows (right)', 'Eyes (left)', 'Eyes (right)', 'Nose', 'Mouth']) expect(names.some(n => n?.startsWith(part)), part).toBe(true)
    expect(names.filter(n => /twin/i.test(n ?? ''))).toEqual([])
  })

  it('changes an eye shape from the part, and every option of the old engine is offered', async () => {
    const { user, seen } = setup()
    await user.click(screen.getByRole('button', { name: 'Face' }))
    await user.click(sheet('Face'))
    await user.click([...card().querySelectorAll('.charFigHot')].find(b => /^Eyes \(left\)/.test(b.getAttribute('aria-label') ?? ''))! as HTMLElement)
    const eyes = screen.getByRole('combobox', { name: /Eye shape/i })
    expect(within(eyes).getAllByRole('option')).toHaveLength(14)
    await user.selectOptions(eyes, 'hooded')
    expect(seen.figure.forms['eyes.shape']).toBe('hooded')
  })

  it('offers the nine ages, the builds and the expressions of the model in the first step', () => {
    setup()
    const ages = screen.getByRole('combobox', { name: /^Age/i })
    expect(within(ages).getAllByRole('option').map(o => o.textContent)).toEqual(expect.arrayContaining(['Infant', 'Toddler', 'Child', 'Teen', 'Young adult', 'Adult', 'Middle-aged', 'Older', 'Elderly']))
    expect(within(screen.getByRole('combobox', { name: /^Build/i })).getAllByRole('option').length).toBeGreaterThanOrEqual(4)
    expect(within(screen.getByRole('combobox', { name: /^Expression/i })).getAllByRole('option').length).toBeGreaterThanOrEqual(13)
  })

  it('frames a child as a child: choosing the age moves and shrinks the bust the card looks through', async () => {
    const { user, seen } = setup()
    await user.click(screen.getByRole('button', { name: 'Bust' }))
    const adult = viewBox()
    await user.selectOptions(screen.getByRole('combobox', { name: /^Age/i }), 'age_child')
    expect(seen.figure.values.height).toBe(62)
    const child = viewBox()
    expect(child[3]).toBeLessThan(adult[3])
    expect(child[1]).toBeGreaterThan(adult[1])
  })

  it('rolls a new look that still draws', async () => {
    const { user, seen } = setup()
    await user.click(screen.getByRole('button', { name: 'Roll a new look' }))
    expect(Object.keys(seen.figure.colours).length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
  })
})
