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
import { picker } from './testPickers'

vi.setConfig({ testTimeout: 30000 })

// The choice lists of the editor are dropdowns of pictures (phase 6c-5): each choice drawn on this character, only while the list is open.
const content: ModelContent = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../../backend/app/seed/basic_model.json'), 'utf-8'))
const basic: FigureModel = { id: 'seed1', modelId: 'basic', version: 1, name: 'Adult (basic)', publishedAt: null, content }

function setup(start: CharacterFigure = blankFigure(basic.id, content)) {
  function Host() {
    const [figure, set] = useState(start)
    const setFigure: Characters['setFigure'] = next => { if (next !== null) set(prev => (typeof next === 'function' ? next(prev) : next)) }
    return <FigureEditor projectId="p1" figure={figure} model={basic} label="Ada, figure" setFigure={setFigure} />
  }
  const user = userEvent.setup()
  render(<Host />)
  return { user }
}

const thumbs = (scope: HTMLElement) => [...scope.querySelectorAll<SVGSVGElement>('svg[data-figure]')]
const viewBoxOf = (svg: SVGSVGElement) => svg.getAttribute('viewBox')!.split(' ').map(Number)
async function openEyes(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Face' }))
  await user.click(screen.getByRole('button', { name: 'Face sheet' }))
  await user.click([...document.querySelectorAll('.charFigHot')].find(b => /^Eyes \(left\)/.test(b.getAttribute('aria-label') ?? ''))! as HTMLElement)
}

describe('a dropdown of pictures', () => {
  it('draws nothing until it is opened, and its choices only while it is open', async () => {
    const { user } = setup()
    await openEyes(user)
    const button = picker(/^Eye shape/i)
    expect(thumbs(button)).toHaveLength(0)
    expect(screen.queryByRole('listbox')).toBeNull()
    await user.click(button)
    const list = screen.getByRole('listbox')
    const options = within(list).getAllByRole('option')
    expect(options).toHaveLength(14)
    for (const o of options) expect(thumbs(o), o.textContent ?? '').toHaveLength(1)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(thumbs(button)).toHaveLength(0)
  })

  it('draws each choice of a part through the same crop round that part, so the pictures line up, and each differently', async () => {
    const { user } = setup()
    await openEyes(user)
    await user.click(picker(/^Eye shape/i))
    const pictures = within(screen.getByRole('listbox')).getAllByRole('option').map(o => thumbs(o)[0])
    const boxes = new Set(pictures.map(p => p.getAttribute('viewBox')))
    expect(boxes.size).toBe(1)
    const [, , w, h] = viewBoxOf(pictures[0])
    // the eyes, with room round them: not the whole figure
    expect(w).toBeLessThan(100)
    expect(h).toBeLessThan(100)
    expect(w).toBeGreaterThanOrEqual(30)
    // the shapes differ from one choice to the next
    const drawn = new Set(pictures.map(p => [...p.querySelectorAll('path')].map(x => x.getAttribute('d')).join('|')))
    expect(drawn.size).toBeGreaterThan(5)
  })

  it('looks at the head for an expression and at the whole figure for an age', async () => {
    const { user } = setup()
    await user.click(picker(/^Expression/i))
    const head = viewBoxOf(thumbs(within(screen.getByRole('listbox')).getAllByRole('option')[0])[0])
    await user.keyboard('{Escape}')
    await user.click(picker(/^Age/i))
    const whole = viewBoxOf(thumbs(within(screen.getByRole('listbox')).getAllByRole('option')[0])[0])
    expect(whole[3]).toBeGreaterThan(head[3] * 2)
  })

  it('says custom, and marks no choice, when the figure is none of the ready looks', async () => {
    const start = blankFigure(basic.id, content)
    const { user } = setup({ ...start, values: { ...start.values, height: 77 } })
    const age = picker(/^Age/i)
    expect(age).toHaveAttribute('data-value', '')
    expect(age).toHaveTextContent('Custom')
    await user.click(age)
    expect(within(screen.getByRole('listbox')).queryAllByRole('option', { selected: true })).toHaveLength(0)
  })

  it('marks the choice that is on', async () => {
    const { user } = setup()
    await openEyes(user)
    await user.click(picker(/^Eye shape/i))
    const on = within(screen.getByRole('listbox')).getAllByRole('option', { selected: true })
    expect(on).toHaveLength(1)
    expect(on[0]).toHaveAttribute('data-value', 'almond')
  })
})
