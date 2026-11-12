import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterFigure, FigureModel, ModelContent } from '../../../../../api/types'
import type { Characters } from '../useCharacters'
import { FigureEditor } from './FigureEditor'
import { overviewOf } from './figureEditing'
import { blankFigure } from './figureState'
import { maybePicker, picker } from './testPickers'

const downloadCard = vi.hoisted(() => vi.fn())
vi.mock('./figureExport', async orig => ({ ...(await orig<typeof import('./figureExport')>()), downloadCard }))
vi.setConfig({ testTimeout: 30000 })

// The overview of the figure and the download of the card (phase 6c-5), on the basic model that comes with the app.
const content: ModelContent = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../../backend/app/seed/basic_model.json'), 'utf-8'))
const basic: FigureModel = { id: 'seed1', modelId: 'basic', version: 1, name: 'Adult (basic)', publishedAt: null, content }
const blank = blankFigure(basic.id, content)

const rowsOf = (id: string, figure: CharacterFigure = blank) => overviewOf(content, figure).find(s => s.id === id)?.rows ?? []
const labels = (id: string, figure?: CharacterFigure) => rowsOf(id, figure).map(r => r.label)

describe('overviewOf', () => {
  it('has the head, hair, face, body and fantasy of the basic model, in that order', () => {
    expect(overviewOf(content, blank).map(s => s.name)).toEqual(['Head', 'Hair', 'Face', 'Body', 'Fantasy'])
  })

  it('puts the shape of the head and the ears in the head, the eyes, brows, nose and mouth in the face', () => {
    expect(labels('head')).toEqual(expect.arrayContaining(['Head shape', 'Ear shape']))
    expect(labels('face')).toEqual(expect.arrayContaining(['Expression', 'Brow shape', 'Eye shape', 'Nose shape', 'Mouth shape']))
  })

  it('has the hair as its ready looks, not the cut of each of its sections', () => {
    expect(labels('hair')).toEqual(['Hair style', 'Facial hair'])
    expect(rowsOf('hair').every(r => r.objectId === null)).toBe(true)
  })

  it('has the age, the build and the garments in the body, and not as fantasy', () => {
    expect(labels('body')).toEqual(expect.arrayContaining(['Age', 'Build', 'Top', 'Outfit', 'Pose', 'Jacket', 'Coat', 'Skirt', 'Dress', 'Held item (left hand)']))
    expect(labels('fantasy')).toEqual(expect.arrayContaining(['Fantasy ears', 'Eye style', 'Number of eyes', 'Horns', 'Crown']))
    for (const garment of ['Jacket', 'Coat', 'Skirt', 'Dress', 'Held item (left hand)']) expect(labels('fantasy')).not.toContain(garment)
  })

  it('lists a part once, never its other side, and a ready look opens no part', () => {
    expect(labels('face').filter(l => l === 'Eye shape')).toHaveLength(1)
    const all = overviewOf(content, blank).flatMap(s => s.rows)
    expect(new Set(all.map(r => r.key)).size).toBe(all.length)
    expect(rowsOf('body').find(r => r.label === 'Age')!.objectId).toBeNull()
    expect(rowsOf('face').find(r => r.label === 'Eye shape')!.objectId).toBe('eyes')
  })

  it('says what is chosen, and follows a change', () => {
    expect(rowsOf('face').find(r => r.label === 'Eye shape')!.value).toBe('Almond')
    const hooded: CharacterFigure = { ...blank, forms: { ...blank.forms, 'eyes.shape': 'hooded' } }
    expect(rowsOf('face', hooded).find(r => r.label === 'Eye shape')!.value).toBe('Hooded')
  })
})

function setup(props: { name?: string; caption?: string } = {}) {
  const seen = { figure: blank }
  function Host() {
    const [figure, set] = useState(blank)
    seen.figure = figure
    const setFigure: Characters['setFigure'] = next => {
      if (next === null) return
      set(prev => { const made = typeof next === 'function' ? next(prev) : next; seen.figure = made; return made })
    }
    return <FigureEditor projectId="p1" figure={figure} model={basic} label="Ada, figure" setFigure={setFigure} {...props} />
  }
  const user = userEvent.setup()
  render(<Host />)
  return { seen, user }
}

const overviewButton = () => screen.getByRole('button', { name: 'Overview' })
const overview = () => screen.queryByRole('region', { name: 'Overview' })

describe('the overview in the editor', () => {
  it('opens from the toolbar with a section for each of the five, and a picture and a name on each part', async () => {
    const { user } = setup()
    expect(overview()).toBeNull()
    expect(overviewButton()).toHaveAttribute('aria-pressed', 'false')
    await user.click(overviewButton())
    expect(overviewButton()).toHaveAttribute('aria-pressed', 'true')
    const region = within(overview()!)
    for (const name of ['Head', 'Hair', 'Face', 'Body', 'Fantasy']) expect(region.getByRole('group', { name })).toBeInTheDocument()
    const eyes = region.getByRole('button', { name: 'Eye shape: Almond' })
    expect(eyes.querySelector('svg')).not.toBeNull()
    expect(eyes).toHaveTextContent('Almond')
    // the pictures are for the eye, not for the reader of the page
    expect(eyes.querySelector('[aria-hidden="true"]')).not.toBeNull()
    // the steps are put away while it is open
    expect(screen.queryByRole('navigation', { name: 'Where you are' })).toBeNull()
  })

  it('closes from the toolbar, and the steps are back', async () => {
    const { user } = setup()
    await user.click(overviewButton())
    await user.click(overviewButton())
    expect(overview()).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Where you are' })).toBeInTheDocument()
  })

  it('opens a part when it is pressed: the part is on its own sheet, with its choices', async () => {
    const { user } = setup()
    await user.click(overviewButton())
    await user.click(within(overview()!).getByRole('button', { name: 'Eye shape: Almond' }))
    expect(overview()).toBeNull()
    const crumbs = within(screen.getByRole('navigation', { name: 'Where you are' }))
    expect(crumbs.getByRole('button', { name: 'Face' })).toBeInTheDocument()
    expect(crumbs.getByRole('button', { name: /^Eyes/ })).toHaveAttribute('aria-current', 'step')
    expect(picker(/^Eye shape/i)).toHaveAttribute('data-value', 'almond')
  })

  it('takes a ready look back to the first step, where it is chosen', async () => {
    const { user } = setup()
    await user.click(overviewButton())
    await user.click(within(overview()!).getByRole('button', { name: 'Age: Adult' }))
    expect(overview()).toBeNull()
    expect(picker(/^Age/i)).toHaveAttribute('data-value', 'age_adult')
    expect(maybePicker(/^Eye shape/i)).toBeNull()
  })
})

describe('the download of the card', () => {
  beforeEach(() => downloadCard.mockReset())

  it('is put away until it is asked for, and has the two choices, a name only when the character has one', async () => {
    const { user } = setup({ name: 'Ada Marsh', caption: 'Navigator · age 29' })
    expect(screen.queryByRole('group', { name: 'Download the card' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Download the card as a PNG' }))
    const group = within(screen.getByRole('group', { name: 'Download the card' }))
    expect(group.getByRole('switch', { name: 'Transparent background' })).toBeInTheDocument()
    expect(group.getByRole('switch', { name: 'Name under the card' })).toBeInTheDocument()
    expect(group.getByRole('button', { name: 'Save the card as a PNG' })).toBeInTheDocument()
  })

  it('has no name choice for a character with no name', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Download the card as a PNG' }))
    expect(screen.queryByRole('switch', { name: 'Name under the card' })).toBeNull()
  })

  it('saves the card as it is framed now, with the choices made, under the name of the character', async () => {
    downloadCard.mockResolvedValue('saved')
    const { user, seen } = setup({ name: 'Ada Marsh', caption: 'Navigator · age 29' })
    await user.click(screen.getByRole('button', { name: 'Back view' }))
    await user.click(screen.getByRole('button', { name: 'Bust' }))
    await user.click(screen.getByRole('button', { name: 'Download the card as a PNG' }))
    const group = within(screen.getByRole('group', { name: 'Download the card' }))
    await user.click(group.getByRole('switch', { name: 'Transparent background' }))
    await user.click(group.getByRole('switch', { name: 'Name under the card' }))
    await user.click(group.getByRole('button', { name: 'Save the card as a PNG' }))
    expect(downloadCard).toHaveBeenCalledTimes(1)
    const [copy, figure, crop, view, options, fileName] = downloadCard.mock.calls[0]
    expect(copy).toBe(content)
    expect(figure).toBe(seen.figure)
    expect(crop).toEqual({ frame: content.frames!.find(f => f.name === 'Bust')!.id })
    expect(view).toBe('back')
    expect(options).toEqual({ transparent: true, name: 'Ada Marsh', caption: 'Navigator · age 29' })
    expect(fileName).toBe('Ada-Marsh-card.png')
    expect(await screen.findByText('The card was saved as a picture.')).toBeInTheDocument()
  })

  it('leaves the name off unless it is asked for, and the background on', async () => {
    downloadCard.mockResolvedValue('saved')
    const { user } = setup({ name: 'Ada', caption: 'x' })
    await user.click(screen.getByRole('button', { name: 'Download the card as a PNG' }))
    await user.click(screen.getByRole('button', { name: 'Save the card as a PNG' }))
    expect(downloadCard.mock.calls[0][4]).toEqual({ transparent: false, name: null, caption: 'x' })
    expect(downloadCard.mock.calls[0][2]).toBe('figure')
    expect(downloadCard.mock.calls[0][3]).toBe('front')
  })

  it('says so when this browser cannot draw the card', async () => {
    downloadCard.mockResolvedValue('unavailable')
    const { user } = setup({ name: 'Ada' })
    await user.click(screen.getByRole('button', { name: 'Download the card as a PNG' }))
    await user.click(screen.getByRole('button', { name: 'Save the card as a PNG' }))
    expect(await screen.findByText('This browser cannot draw the card as a picture.')).toBeInTheDocument()
  })
})
