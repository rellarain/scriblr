import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CharacterFigure, FigureModel, ModelContent } from '../../../../../api/types'
import type { Characters } from '../useCharacters'
import { choose, maybePicker, optionNames, picker } from './testPickers'
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
    expect(await optionNames(user, /^Eye shape/i)).toHaveLength(14)
    await choose(user, /^Eye shape/i, 'hooded')
    expect(seen.figure.forms['eyes.shape']).toBe('hooded')
  })

  it('offers the nine ages, the builds and the expressions of the model in the first step', async () => {
    setup()
    const user = userEvent.setup()
    expect(await optionNames(user, /^Age/i)).toEqual(expect.arrayContaining(['Infant', 'Toddler', 'Child', 'Teen', 'Young adult', 'Adult', 'Middle-aged', 'Older', 'Elderly']))
    expect((await optionNames(user, /^Build/i)).length).toBeGreaterThanOrEqual(4)
    expect((await optionNames(user, /^Expression/i)).length).toBeGreaterThanOrEqual(13)
  })

  it('frames a child as a child: choosing the age moves and shrinks the bust the card looks through', async () => {
    const { user, seen } = setup()
    await user.click(screen.getByRole('button', { name: 'Bust' }))
    const adult = viewBox()
    await choose(user, /^Age/i, 'age_child')
    expect(seen.figure.values.height).toBe(62)
    const child = viewBox()
    expect(child[3]).toBeLessThan(adult[3])
    expect(child[1]).toBeGreaterThan(adult[1])
  })

  it('offers the ready hairstyles and the facial hair in the first step, and a hairstyle sets the sections of the hair together', async () => {
    const { user, seen } = setup()
    const styles = /^Hair style/i
    expect(await optionNames(user, styles)).toEqual(expect.arrayContaining(['Short', 'Buzzed', 'Pixie', 'Undercut', 'Mohawk', 'Bob', 'Long and wavy', 'Curls', 'Afro', 'Bald']))
    await choose(user, styles, 'hair_bob')
    expect(seen.figure.values.len_front_center).toBe(100)
    expect(seen.figure.values.len_back_center).toBe(58)
    await choose(user, styles, 'hair_bald')
    expect(seen.figure.hidden).toEqual(expect.arrayContaining(['hair.front.center', 'hair.back.center']))
    const facial = /^Facial hair/i
    expect(await optionNames(user, facial)).toHaveLength(14)
    await choose(user, facial, 'facial_goatee')
    expect(seen.figure.forms).toMatchObject({ 'beard.style': 'goatee', 'moustache.style': 'goatee' })
  })

  it('lists the parts that are off until chosen as extras in the first step, and a choice there puts the part on the figure', async () => {
    const { user, seen } = setup()
    const extras = within(screen.getByRole('group', { name: 'Extras' }))
    for (const name of ['Beard style', 'Moustache style', 'Horns', 'Crown', 'Laurel wreath', 'Flower crown', 'Hood', 'Necklace', 'Number of eyes']) expect(picker(name, extras), name).toBeInTheDocument()
    const art = () => card().querySelector('.charFigLayer--figure')!.innerHTML
    const before = art()
    await choose(user, 'Horns', 'ram', extras)
    expect(seen.figure.forms['horns.style']).toBe('ram')
    expect(art()).not.toBe(before)
    // the fantasy ears are a part of the ears, reached from them
    expect(maybePicker('Fantasy ears', extras)).toBeNull()
  })

  it('offers a held item for each hand as an extra, and a pose that holds a hand up with it', async () => {
    const { user, seen } = setup()
    const extras = within(screen.getByRole('group', { name: 'Extras' }))
    const art = () => card().querySelector('.charFigLayer--figure')!.innerHTML
    const before = art()
    for (const name of ['Held item (left hand)', 'Held item (right hand)']) expect(await optionNames(user, name, extras)).toHaveLength(15)
    await choose(user, 'Held item (left hand)', 'staff', extras)
    expect(seen.figure.forms['itemL.item']).toBe('staff')
    expect(art()).not.toBe(before)
    // the right hand has an item of its own
    expect(seen.figure.forms['itemR.item']).toBeUndefined()
    const down = art()
    await choose(user, /^Pose/i, 'Left hand up')
    expect(seen.figure.values.shoulder).toBe(95)
    expect(seen.figure.values.holdL).toBe(-135)
    expect(seen.figure.values.shoulderR).toBeUndefined()
    expect(art()).not.toBe(down)
  })

  it('draws the beard of the facial hair that is chosen, and nothing of it before', async () => {
    const { user } = setup()
    const art = () => card().querySelector('.charFigLayer--figure')!.innerHTML
    const before = art()
    await choose(user, /^Facial hair/i, 'facial_full')
    expect(art()).not.toBe(before)
  })

  it('rolls a new look that still draws', async () => {
    const { user, seen } = setup()
    await user.click(screen.getByRole('button', { name: 'Roll a new look' }))
    expect(Object.keys(seen.figure.colours).length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
  })
})
