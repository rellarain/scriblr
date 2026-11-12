import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterFigure, FigureModel, ModelContent } from '../../../../../api/types'
import { copyOf } from '../../../../../designSystem/mockFigureModels'
import { previewModels } from '../../../../../designSystem/mockCharacterModels'
import type { Characters } from '../useCharacters'
import { choose, optionNames, picker, pickerLabels, pickerValue } from './testPickers'
import { FigureEditor } from './FigureEditor'
import { ageOf, blankFigure, cropBox, spanOf } from './figureState'

// The writer's editor of a figure: the card with its sheets and parts, and the steps under it. The sample model of the design system has three frames (Head to hands, Bust, Face), a
// family of eyes, an Age/Build/Outfit/Pose set of presets, a state on the upper arm, authored fields, a fill pattern and a colour lock on the shirt.
vi.setConfig({ testTimeout: 30000 })

// The published models the "use another model" control lists, and the copy it makes of the one chosen: both are the app's own calls, put in the tests' hands.
const calls = vi.hoisted(() => ({ getPublishedModels: vi.fn(), ensureFigureModel: vi.fn() }))
vi.mock('../../../../../api/characterModelsApi', async importOriginal => ({ ...(await importOriginal<typeof import('../../../../../api/characterModelsApi')>()), getPublishedModels: calls.getPublishedModels }))
vi.mock('./figureModelStore', async importOriginal => ({ ...(await importOriginal<typeof import('./figureModelStore')>()), ensureFigureModel: calls.ensureFigureModel }))
beforeEach(() => {
  calls.getPublishedModels.mockReset().mockResolvedValue({ models: [] })
  calls.ensureFigureModel.mockReset()
})

const model = previewModels()[0].draft
const sample = copyOf(model)
const fresh = (): CharacterFigure => blankFigure(sample.id, sample.content)

// A host that keeps the figure the way the Characters console does (a change is a function of the figure, with the group a run of changes shares), and remembers what happened.
function setup(start: CharacterFigure = fresh(), copy: FigureModel = sample) {
  const seen = { figure: start, groups: [] as Array<string | null>, forgotten: 0 }
  function Host() {
    const [figure, set] = useState(start)
    seen.figure = figure
    const setFigure: Characters['setFigure'] = (next, group = null) => {
      seen.groups.push(group)
      if (next === null) { seen.forgotten += 1; return }
      set(prev => { const made = typeof next === 'function' ? next(prev) : next; seen.figure = made; return made })
    }
    return <FigureEditor projectId="p1" figure={figure} model={copy} label="Ada, figure" setFigure={setFigure} />
  }
  const user = userEvent.setup()
  render(<Host />)
  return { seen, user }
}

const card = () => document.querySelector('.charFigCard') as HTMLElement
const crumbs = () => within(screen.getByRole('navigation', { name: 'Where you are' }))
// where you are, by name (the Back button has none: it is an icon)
const where = () => crumbs().getAllByRole('button').map(b => b.textContent).filter(Boolean)
const steps = () => within(screen.getByRole('region', { name: 'Edit the figure' }))
const sheet = (name: string) => screen.getByRole('button', { name: `${name} sheet` })
const hot = (name: RegExp | string) => screen.getByRole('button', { name })
const slider = (name: string) => screen.getByRole('slider', { name }) as HTMLInputElement
const pick = (user: ReturnType<typeof userEvent.setup>, name: string, value: string) => choose(user, name, value)

describe('the card and its toolbar', () => {
  it('draws the figure on its card, with the view, the frames, Randomise and the card tools over it', () => {
    setup()
    expect(screen.getByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
    const bar = within(screen.getByRole('toolbar', { name: 'View and frame' }))
    expect(bar.getByRole('button', { name: 'Front view' })).toHaveAttribute('aria-pressed', 'true')
    expect(bar.getByRole('button', { name: 'Back view' })).toHaveAttribute('aria-pressed', 'false')
    expect(bar.getAllByRole('button').map(b => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Front view', 'Back view', 'Whole figure', 'Head to hands', 'Bust', 'Face', 'Roll a new look', 'Overview', 'Download the card as a PNG'])
    expect(bar.getByRole('combobox', { name: 'Genre to roll within' })).toBeInTheDocument()
  })
  it('lays a sheet on the card for each frame, the biggest first, and names each', () => {
    setup()
    const sheets = [...card().querySelectorAll('.charFigSheet')].map(s => s.getAttribute('aria-label'))
    expect(sheets).toEqual(['Head to hands sheet', 'Bust sheet', 'Face sheet'])
  })
  it('turns the figure round, and the sheets come in front of it', async () => {
    const { user } = setup()
    expect(card()).toHaveClass('charFigCard--front')
    await user.click(screen.getByRole('button', { name: 'Back view' }))
    expect(card()).toHaveClass('charFigCard--back')
    expect(screen.getByRole('button', { name: 'Back view' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Front view' }))
    expect(card()).toHaveClass('charFigCard--front')
  })
  it('looks through a frame, and the card takes the shape of it', async () => {
    const { user } = setup()
    const whole = card().style.getPropertyValue('--ar')
    await user.click(screen.getByRole('button', { name: 'Face' }))
    expect(screen.getByRole('button', { name: 'Face' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Whole figure' })).toHaveAttribute('aria-pressed', 'false')
    expect(card().style.getPropertyValue('--ar')).not.toBe(whole)
    await user.click(screen.getByRole('button', { name: 'Whole figure' }))
    expect(card().style.getPropertyValue('--ar')).toBe(whole)
  })
})

describe('step 0: the figure', () => {
  it('has a dropdown for each kind of preset at the one that is on, and the sliders no part holds', async () => {
    setup()
    expect(pickerLabels(steps())).toEqual(['Pose', 'Expression', 'Build', 'Outfit', 'Weather', 'Age', 'Hand', 'Hand (other side)'])
    expect(pickerValue('Age')).toBe('p_form43')
    expect(pickerValue('Expression')).toBe('')
    expect(await optionNames(userEvent.setup(), 'Age')).toEqual(['Infant', 'Child', 'Teen', 'Adult', 'Elder'])
    const palette = screen.getByRole('group', { name: 'Palette' })
    expect(steps().getAllByRole('slider').filter(s => !palette.contains(s)).map(s => s.getAttribute('aria-label'))).toEqual(['Height'])
  })
  it('holds a slider to the span the writer may move it in', () => {
    setup()
    const [lo, hi] = spanOf(model.ranges.find(r => r.id === 'r_height')!)
    expect(slider('Height')).toHaveAttribute('min', String(lo))
    expect(slider('Height')).toHaveAttribute('max', String(hi))
    expect([lo, hi]).toEqual([80, 105])
  })
  it('choosing a preset changes the figure, and the dropdown follows', async () => {
    const { user, seen } = setup()
    await pick(user, 'Age', 'p_form41')
    expect(ageOf(sample.content, seen.figure)?.name).toBe('Child')
    expect(pickerValue('Age')).toBe('p_form41')
    await pick(user, 'Outfit', 'p_form36')
    expect(seen.figure.hidden).toContain('o_shirt')
  })
  it('a slider moved several times in a row is one run of changes, named for the slider', () => {
    const { seen } = setup()
    fireEvent.change(slider('Height'), { target: { value: '90' } })
    fireEvent.change(slider('Height'), { target: { value: '95' } })
    expect(seen.figure.values.r_height).toBe(95)
    expect(seen.groups).toEqual(['figure.value.r_height', 'figure.value.r_height'])
  })
  it('says where the figure comes from, and puts the mannequin away', async () => {
    const { user, seen } = setup()
    const panel = within(screen.getByRole('group', { name: 'Mannequin' }))
    expect(panel.getByText(/Drawn from Adult \(basic\), version 1/)).toBeInTheDocument()
    await user.click(panel.getByRole('button', { name: 'Go back to the portrait' }))
    expect(seen.forgotten).toBe(1)
  })
  it('rolls a new look inside the genre', async () => {
    const { user, seen } = setup({ ...fresh(), genre: 'g_fiction' })
    await user.click(screen.getByRole('button', { name: 'Roll a new look' }))
    expect(seen.figure).not.toEqual({ ...fresh(), genre: 'g_fiction' })
    expect(seen.figure.genre).toBe('g_fiction')
    expect(seen.figure.tile).toBe(fresh().tile)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Genre to roll within' }), 'g_fantasy')
    expect(seen.figure.genre).toBe('g_fantasy')
    expect(seen.groups.at(-1)).toBe('figure.genre')
  })
})

describe('step 1: a sheet', () => {
  it('opens when it is clicked, with where you are, and goes back', async () => {
    const { user } = setup()
    expect(where()).toEqual(['Figure'])
    await user.click(sheet('Face'))
    expect(crumbs().getByRole('button', { name: 'Face' })).toHaveAttribute('aria-current', 'step')
    expect(crumbs().getByRole('button', { name: 'Figure' })).not.toHaveAttribute('aria-current')
    const head = within(steps().getByRole('group', { name: 'Head' }))
    expect(head.getAllByRole('slider').map(s => s.getAttribute('aria-label'))).toEqual(['Head tilt', 'Head size'])
    expect(pickerValue('Style', head)).toBe('__none')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(picker('Age', steps())).toBeInTheDocument()
    await user.click(sheet('Face'))
    await user.click(crumbs().getByRole('button', { name: 'Figure' }))
    expect(picker('Age', steps())).toBeInTheDocument()
  })
  it('shows a box over each part of it that can be changed, and names what can change', async () => {
    const { user } = setup()
    expect(card().querySelectorAll('.charFigHot')).toHaveLength(0)
    await user.click(sheet('Face'))
    const names = [...card().querySelectorAll('.charFigHot')].map(h => h.getAttribute('aria-label'))
    expect(names.some(n => /^Head: .*Head shape/.test(n!))).toBe(true)
    expect(names.some(n => /^Almond: .*Eye colour/.test(n!))).toBe(true)
    expect(names.some(n => /^Round:/.test(n!))).toBe(false)
    expect(names.some(n => /^Shirt:/.test(n!))).toBe(false)
  })
  it('names a part and what it can change when the pointer is on it', async () => {
    const { user } = setup()
    await user.click(sheet('Face'))
    await user.hover(hot(/^Head:/))
    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('Head')).toBeInTheDocument()
    expect(tip).toHaveTextContent(/Head shape/)
    await user.unhover(hot(/^Head:/))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('a group\'s sliders, poses and states are there, and the state is chosen from a dropdown', async () => {
    const { user, seen } = setup()
    await user.click(sheet('Head to hands'))
    const arm = within(steps().getByRole('group', { name: 'Upper arm' }))
    expect(arm.getAllByRole('slider').map(s => s.getAttribute('aria-label'))).toEqual(['Arm raise', 'Upper arm length'])
    expect(arm.getByRole('combobox', { name: 'Arm' })).toHaveValue('op_arm2')
    await user.selectOptions(arm.getByRole('combobox', { name: 'Arm' }), 'op_arm3')
    expect(seen.figure.values.r_raise).toBeGreaterThan(0)
    expect(arm.getByRole('combobox', { name: 'Arm' })).toHaveValue('op_arm3')
    expect(steps().queryByRole('group', { name: /\(twin\)/ })).toBeNull()
  })
  it('lists the clothes worn there, so a garment that is off can be put on again', async () => {
    const { user, seen } = setup()
    await user.click(sheet('Head to hands'))
    const shirt = () => screen.getByRole('switch', { name: 'Shirt worn' })
    expect(shirt()).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Undershirt worn' })).toBeChecked()
    expect(card().querySelector('[aria-label^="Shirt:"]')).not.toBeNull()
    await user.click(shirt())
    expect(shirt()).not.toBeChecked()
    expect(seen.figure.hidden).toEqual(['o_shirt'])
    expect(card().querySelector('[aria-label^="Shirt:"]')).toBeNull()
    await user.click(shirt())
    expect(seen.figure.hidden).toEqual([])
    expect(card().querySelector('[aria-label^="Shirt:"]')).not.toBeNull()
  })
  it('a layer can be left out of what is pointed at, to reach what is under it', async () => {
    const { user } = setup()
    await user.click(sheet('Head to hands'))
    const layers = within(screen.getByRole('group', { name: 'Pick from' }))
    expect(layers.getAllByRole('button').map(b => b.textContent)).toEqual(['Body', 'Clothing'])
    await user.click(layers.getByRole('button', { name: 'Clothing' }))
    expect(layers.getByRole('button', { name: 'Clothing' })).toHaveAttribute('aria-pressed', 'false')
    expect(card().querySelector('[aria-label^="Shirt:"]')).toBeNull()
    expect(card().querySelector('[aria-label^="Upper arm:"]')).not.toBeNull()
  })
  it('says there is nothing here to change when that is so', async () => {
    // a sheet in the corner of the card that no part lies in
    const whole = cropBox(sample.content, 'figure')
    const corner = { ...sample.content.frames![0], id: 'f_corner', name: 'Corner', x: whole.x, y: whole.y, w: whole.w * 0.1, h: whole.h * 0.06, hide: [] }
    const content: ModelContent = { ...sample.content, frames: [...sample.content.frames!, corner] }
    const { user } = setup(blankFigure(copyOf(content).id, content), copyOf(content))
    await user.click(sheet('Corner'))
    expect(steps().getByText('Click a part of the figure to change it.')).toBeInTheDocument()
  })
  it('randomises just the group: its sliders and forms move, the rest of the figure does not', async () => {
    const { user, seen } = setup()
    await user.click(sheet('Face'))
    for (let i = 0; i < 8; i += 1) await user.click(screen.getByRole('button', { name: 'Randomise Head' }))
    expect(seen.figure.values.r_raise).toBeUndefined()
    expect(seen.figure.hidden).toEqual([])
    expect(seen.figure.forms['o_arm.a_form5']).toBeUndefined()
    expect(Object.keys(seen.figure.values).some(k => k === 'r_tilt' || k === 'r_head')).toBe(true)
  })
})

describe('step 2: a part', () => {
  it('opens when it is clicked on the card, and the sheet it is on stays open behind it', async () => {
    const { user } = setup()
    await user.click(sheet('Face'))
    await user.click(hot(/^Head:/))
    expect(where()).toEqual(['Figure', 'Face', 'Head'])
    expect(crumbs().getByRole('button', { name: 'Head' })).toHaveAttribute('aria-current', 'step')
    expect(hot(/^Head:/)).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(where()).toEqual(['Figure', 'Face'])
    expect(card().querySelectorAll('.charFigHot').length).toBeGreaterThan(0)
  })
  it('a form is chosen from a dropdown, and a field is a slider held to its span', async () => {
    const { user, seen } = setup()
    await user.click(sheet('Face'))
    await user.click(hot(/^Head:/))
    const part = within(steps().getByRole('group', { name: 'Head' }))
    expect(pickerValue('Head shape', part)).toBe('f_form2')
    await choose(user, 'Head shape', 'f_form3', part)
    expect(seen.figure.forms['o_head.a_form1']).toBe('f_form3')
    const fields = within(part.getByRole('group', { name: 'Head shape' }))
    expect(fields.getAllByRole('slider').map(s => s.getAttribute('aria-label'))).toEqual(['Head width', 'Head height'])
    fireEvent.change(fields.getByRole('slider', { name: 'Head width' }), { target: { value: '120' } })
    expect(seen.figure.values.r_f2).toBe(120)
  })
  it('a family is chosen by its members, and the part that opens is the member now shown', async () => {
    const { user, seen } = setup()
    await user.click(sheet('Face'))
    await user.click(hot(/^Almond:/))
    const family = steps().getByRole('combobox', { name: 'Eye' })
    expect(family).toHaveValue('o_form15')
    await user.selectOptions(family, 'o_form18')
    expect(seen.figure.forms['class:k_form12']).toBe('o_form18')
    expect(crumbs().getByRole('button', { name: 'Round' })).toHaveAttribute('aria-current', 'step')
    expect(steps().getByRole('combobox', { name: 'Eye' })).toHaveValue('o_form18')
  })
  it('a twin shows what its original shows and says so', async () => {
    const { user } = setup()
    await user.click(sheet('Head to hands'))
    await user.click(hot(/^Upper arm \(twin\):/))
    expect(steps().getByText(/Upper arm \(twin\) mirrors Upper arm/)).toBeInTheDocument()
    expect(picker('Sleeve', steps())).toBeInTheDocument()
  })
  it('a garment is worn or not, and a fill pattern is on or off', async () => {
    const { user, seen } = setup()
    await user.click(sheet('Head to hands'))
    await user.click(hot(/^Shirt:/))
    const part = within(steps().getByRole('group', { name: 'Shirt' }))
    expect(part.getByRole('switch', { name: 'Worn' })).toBeChecked()
    expect(part.getByRole('switch', { name: 'Stripes' })).toBeChecked()
    await user.click(part.getByRole('switch', { name: 'Stripes' }))
    expect(seen.figure.hidden).toEqual(['pt_stripes'])
    expect(part.getByRole('switch', { name: 'Stripes' })).not.toBeChecked()
    await user.click(part.getByRole('switch', { name: 'Worn' }))
    expect(seen.figure.hidden).toEqual(['pt_stripes', 'o_shirt'])
    expect(card().querySelector('[aria-label^="Shirt:"]')).toBeNull()
  })
  it('a colour is chosen from the defaults or the palette, and its brightness stays inside the slot\'s range', async () => {
    const { user, seen } = setup()
    await user.click(sheet('Face'))
    await user.click(hot(/^Almond:/))
    const eye = within(steps().getByRole('group', { name: 'Eye colour' }))
    const brightness = eye.getByRole('slider', { name: 'Eye brightness' }) as HTMLInputElement
    expect(brightness).toBeDisabled()
    expect(brightness).toHaveAttribute('title', 'Choose a colour first')
    const defaults = within(eye.getByRole('group', { name: 'Eye defaults' }))
    await user.click(defaults.getAllByRole('button')[1])
    expect(seen.figure.colours.k_eye).toMatchObject({ src: 'colour' })
    expect(defaults.getAllByRole('button')[1]).toHaveAttribute('aria-pressed', 'true')
    expect(brightness).toBeEnabled()
    expect(brightness).toHaveAttribute('min', '4')
    expect(brightness).toHaveAttribute('max', '96')
    fireEvent.change(brightness, { target: { value: '60' } })
    expect(seen.figure.colours.k_eye.l).toBe(60)
    expect(seen.groups.at(-1)).toBe('figure.colour.k_eye.l')
    const palette = within(eye.getByRole('group', { name: 'Eye from the palette' }))
    await user.click(palette.getAllByRole('button')[0])
    expect(seen.figure.colours.k_eye).toEqual({ src: 'swatch', id: 'k1', l: 60 })
  })
  it('a part of a colour the model locks is said so, and a style that fixes the lightness turns the slider off', async () => {
    const { user, seen } = setup()
    await user.click(sheet('Head to hands'))
    await user.click(hot(/^Shirt:/))
    const part = within(steps().getByRole('group', { name: 'Shirt' }))
    const colour = within(part.getByRole('group', { name: 'Clothing colour' }))
    expect(colour.getByText(/The model fixes this colour's saturation\./)).toBeInTheDocument()
    await user.click(within(colour.getByRole('group', { name: 'Clothing defaults' })).getAllByRole('button')[0])
    expect(colour.getByRole('slider', { name: 'Clothing brightness' })).toBeEnabled()
    expect(part.queryByRole('group', { name: 'Darker shirt' })).toBeNull()
    await choose(user, 'Style', 'p_dark', part)
    expect(seen.figure.on).toEqual(['p_dark'])
    expect(colour.getByText(/fixes this colour's saturation and lightness\./)).toBeInTheDocument()
    expect(colour.getByRole('slider', { name: 'Clothing brightness' })).toBeDisabled()
    expect(colour.getByRole('slider', { name: 'Clothing brightness' })).toHaveValue('18')
    expect(part.getByRole('group', { name: 'Darker shirt' })).toBeInTheDocument()
    await choose(user, 'Style', '__none', part)
    expect(seen.figure.on).toEqual([])
    expect(part.queryByRole('group', { name: 'Darker shirt' })).toBeNull()
    expect(colour.getByRole('slider', { name: 'Clothing brightness' })).toBeEnabled()
  })
  it('a colour whose every part is locked cannot be changed', async () => {
    const locked: ModelContent = { ...sample.content, objects: sample.content.objects.map(o => (o.id === 'o_shirt' ? { ...o, hsl: { k_cloth: { h: 10, s: 35, l: 40 } } } : o)) }
    const { user } = setup(blankFigure(copyOf(locked).id, locked), copyOf(locked))
    await user.click(sheet('Head to hands'))
    await user.click(hot(/^Shirt:/))
    const colour = within(steps().getByRole('group', { name: 'Clothing colour' }))
    expect(colour.getByText(/hue, saturation and lightness, so it cannot be changed/)).toBeInTheDocument()
    for (const b of colour.getAllByRole('button')) expect(b).toBeDisabled()
  })
  it('randomises just the part, inside the genre', async () => {
    const { user, seen } = setup({ ...fresh(), genre: 'g_fiction' })
    await user.click(sheet('Face'))
    await user.click(hot(/^Head:/))
    for (let i = 0; i < 8; i += 1) await user.click(screen.getByRole('button', { name: 'Randomise Head' }))
    expect(seen.figure.hidden).toEqual([])
    expect(seen.figure.values.r_raise).toBeUndefined()
    expect(seen.figure.genre).toBe('g_fiction')
    expect(seen.figure.forms['o_head.a_form1']).toBeDefined()
  })
  it('chooses the side hanging things fall to', async () => {
    const { user, seen } = setup()
    await user.click(sheet('Bust'))
    await user.click(hot(/^Ponytail:/))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Where it falls' }), 'left')
    expect(seen.figure.fall).toBe('left')
  })
})

describe('a model with no frames', () => {
  it('has one sheet for the whole figure and the editor still works', async () => {
    const bare: ModelContent = { ...sample.content, frames: [] }
    const { user } = setup(blankFigure(copyOf(bare).id, bare), copyOf(bare))
    expect([...card().querySelectorAll('.charFigSheet')].map(s => s.getAttribute('aria-label'))).toEqual(['Whole figure sheet'])
    expect(screen.queryByRole('group', { name: 'Frame' })).toBeNull()
    await user.click(sheet('Whole figure'))
    expect(card().querySelectorAll('.charFigHot').length).toBeGreaterThan(5)
    await user.click(hot(/^Head:/))
    expect(picker('Head shape', steps())).toBeInTheDocument()
  })
})

// ---- 6b-3: locks, the order of the clothes and the hair, the character's own styles, palette and card colour, and another model ----

// A vest over the shirt and a fringe beside the ponytail: parts the sample model puts in no order with the others, so a writer may move them.
const vested: ModelContent = (() => {
  const shirt = sample.content.shapes.find(s => s.id === 's_shirt')!
  const top = Math.max(...sample.content.objects.find(o => o.id === 'o_shirt')!.shapes.map(id => sample.content.shapes.find(s => s.id === id)!.z))
  return {
    ...sample.content,
    shapes: [...sample.content.shapes, { ...shirt, id: 's_vest', name: 'Vest', z: top }],
    objects: [...sample.content.objects, { id: 'o_vest', name: 'Vest', layer: 'clothing', shapes: ['s_vest'] }],
    groups: sample.content.groups.map(g => (g.id === 'g_shirt' ? { ...g, objects: [...g.objects, 'o_vest'] } : g)),
  }
})()
const fringed: ModelContent = (() => {
  const lock = sample.content.shapes.find(s => s.id === 's_lock')!
  return {
    ...sample.content,
    shapes: [...sample.content.shapes, { ...lock, id: 's_fringe', name: 'Fringe' }],
    objects: [...sample.content.objects, { id: 'o_fringe', name: 'Fringe', layer: 'hair', shapes: ['s_fringe'] }],
    groups: sample.content.groups.map(g => (g.id === 'g_head' ? { ...g, objects: [...g.objects, 'o_fringe'] } : g)),
  }
})()
const withModel = (content: ModelContent) => setup(blankFigure(copyOf(content).id, content), copyOf(content))
// The rows of a list of layers on a sheet, the one in front first (a garment by its Worn switch, a hair part by its name).
const rowsOf = (title: string) => [...screen.getByRole('group', { name: title }).querySelectorAll('.charLayerRow')].map(r => r.querySelector('label, .charLayerName')!.textContent)

describe('locks', () => {
  it('a part is locked from its step, shown on its box and counted in the toolbar, and every lock is let go at once', async () => {
    const { user, seen } = setup()
    await user.click(sheet('Face'))
    await user.click(hot(/^Head:/))
    const lock = screen.getByRole('button', { name: 'Lock Head' })
    expect(lock).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('group', { name: 'Locks' })).toBeNull()
    await user.click(lock)
    expect(lock).toHaveAttribute('aria-pressed', 'true')
    expect(seen.figure.locks).toEqual(['o_head'])
    const bar = within(screen.getByRole('group', { name: 'Locks' }))
    expect(bar.getByText('1 locked')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(hot(/^Head:.*, locked$/)).toBeInTheDocument()
    await user.click(bar.getByRole('button', { name: 'Unlock all' }))
    expect(seen.figure.locks).toEqual([])
    expect(screen.queryByRole('group', { name: 'Locks' })).toBeNull()
    expect(hot(/^Head:/).getAttribute('aria-label')).not.toMatch(/locked/)
  })
  it('Lock all here locks every part of a sheet, and is off as soon as one of them is let go', async () => {
    const { user, seen } = setup()
    await user.click(sheet('Face'))
    const all = () => screen.getByRole('switch', { name: 'Lock all here' })
    expect(all()).not.toBeChecked()
    await user.click(all())
    expect(all()).toBeChecked()
    expect(seen.figure.locks).toEqual(expect.arrayContaining(['o_head', 'o_eye', 'o_form15']))
    expect(seen.figure.locks).not.toContain('o_shirt')
    expect(within(screen.getByRole('group', { name: 'Locks' })).getByText(`${seen.figure.locks.length} locked`)).toBeInTheDocument()
    await user.click(hot(/^Head:/))
    await user.click(screen.getByRole('button', { name: 'Lock Head' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(all()).not.toBeChecked()
    await user.click(all())
    expect(all()).toBeChecked()
    await user.click(all())
    expect(seen.figure.locks).toEqual([])
  })
  it('Randomise leaves a locked part as it is', async () => {
    const start: CharacterFigure = { ...fresh(), locks: ['o_head'] }
    const { user, seen } = setup(start)
    for (let i = 0; i < 10; i += 1) await user.click(screen.getByRole('button', { name: 'Roll a new look' }))
    expect(seen.figure).not.toEqual(start)
    expect(seen.figure.forms['o_head.a_form1']).toBeUndefined()
    expect(seen.figure.locks).toEqual(['o_head'])
  })
})

describe('the order of the clothes and of the hair', () => {
  it('lists the clothes with the one in front first, and says why the model\'s own order cannot be changed', async () => {
    const { user } = setup()
    await user.click(sheet('Head to hands'))
    expect(rowsOf('Clothing')).toEqual(['Shirt worn', 'Undershirt worn'])
    const clothing = within(screen.getByRole('group', { name: 'Clothing' }))
    const kept = 'Undershirt is worn under Shirt: the model keeps it there.'
    expect(clothing.getByRole('button', { name: 'Move Shirt in front' })).toBeDisabled()
    expect(clothing.getByRole('button', { name: 'Move Shirt in front' })).toHaveAttribute('title', 'It is in front already.')
    expect(clothing.getByRole('button', { name: 'Move Shirt behind' })).toBeDisabled()
    expect(clothing.getByRole('button', { name: 'Move Shirt behind' })).toHaveAttribute('title', kept)
    expect(clothing.getByRole('button', { name: 'Move Undershirt in front' })).toBeDisabled()
    expect(clothing.getByRole('button', { name: 'Move Undershirt in front' })).toHaveAttribute('title', kept)
    expect(clothing.getByRole('button', { name: 'Move Undershirt behind' })).toHaveAttribute('title', 'It is at the back already.')
  })
  it('moves a garment behind the next one, in the list and in what is saved, and back again', async () => {
    const { user, seen } = withModel(vested)
    await user.click(sheet('Head to hands'))
    expect(rowsOf('Clothing')).toEqual(['Vest worn', 'Shirt worn', 'Undershirt worn'])
    const clothing = () => within(screen.getByRole('group', { name: 'Clothing' }))
    expect(clothing().getByRole('button', { name: 'Move Vest in front' })).toBeDisabled()
    await user.click(clothing().getByRole('button', { name: 'Move Vest behind' }))
    expect(seen.figure.zoff).toEqual({ o_vest: -1, o_shirt: 1 })
    expect(rowsOf('Clothing')).toEqual(['Shirt worn', 'Vest worn', 'Undershirt worn'])
    expect(clothing().getByRole('button', { name: 'Move Vest in front' })).toBeEnabled()
    await user.click(clothing().getByRole('button', { name: 'Move Vest in front' }))
    expect(seen.figure.zoff).toEqual({})
    expect(rowsOf('Clothing')).toEqual(['Vest worn', 'Shirt worn', 'Undershirt worn'])
  })
  it('opens a garment for its fit and colour from the list', async () => {
    const { user } = setup()
    await user.click(sheet('Head to hands'))
    await user.click(within(screen.getByRole('group', { name: 'Clothing' })).getByRole('button', { name: 'Fit and colour of Shirt' }))
    expect(crumbs().getByRole('button', { name: 'Shirt' })).toHaveAttribute('aria-current', 'step')
  })
  it('lists the hair of a sheet without a worn switch, and opens a part from the list', async () => {
    const { user } = setup()
    await user.click(sheet('Bust'))
    expect(rowsOf('Hair')).toEqual(['Ponytail'])
    expect(within(screen.getByRole('group', { name: 'Hair' })).queryAllByRole('switch')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Shape and colour of Ponytail' }))
    expect(crumbs().getByRole('button', { name: 'Ponytail' })).toHaveAttribute('aria-current', 'step')
  })
  it('moves hair parts among the hair of the sheet the same way', async () => {
    const { user, seen } = withModel(fringed)
    await user.click(sheet('Bust'))
    const before = rowsOf('Hair')
    expect([...before].sort()).toEqual(['Fringe', 'Ponytail'])
    await user.click(within(screen.getByRole('group', { name: 'Hair' })).getByRole('button', { name: `Move ${before[0]} behind` }))
    expect(rowsOf('Hair')).toEqual([before[1], before[0]])
    expect(Object.keys(seen.figure.zoff)).toHaveLength(2)
  })
})

describe('a style of the character\'s own', () => {
  const part = () => within(steps().getByRole('group', { name: 'Head' }))
  async function openHead(user: ReturnType<typeof userEvent.setup>) {
    await user.click(sheet('Face'))
    await user.click(hot(/^Head:/))
  }
  async function keepSquare(user: ReturnType<typeof userEvent.setup>, name: string) {
    await choose(user, 'Head shape', 'f_form3', part())
    if (name) await user.type(part().getByRole('textbox', { name: 'Name for my style' }), name)
    await user.click(part().getByRole('button', { name: 'Save as my style' }))
  }
  it('is kept from what is chosen for the part, and chosen from the same dropdown as the model\'s styles', async () => {
    const { user, seen } = setup()
    await openHead(user)
    await keepSquare(user, 'Square jaw')
    expect(seen.figure.mine).toHaveLength(1)
    expect(seen.figure.mine[0]).toMatchObject({ name: 'Square jaw', scope: 'o_head', forms: { 'o_head.a_form1': 'f_form3' } })
    expect(pickerValue('Style', part())).toBe(seen.figure.mine[0].id)
    expect(await optionNames(user, 'Style', part())).toContain('Square jaw (mine)')
    expect(part().getByRole('textbox', { name: 'Name of my style' })).toHaveValue('Square jaw')
    expect(part().getByRole('textbox', { name: 'Name for my style' })).toHaveValue('')
    // choosing another head shape means the style is no longer the one that is on, and choosing the style brings the shape back
    await choose(user, 'Head shape', 'f_form4', part())
    expect(pickerValue('Style', part())).not.toBe(seen.figure.mine[0].id)
    await choose(user, 'Style', seen.figure.mine[0].id, part())
    expect(seen.figure.forms['o_head.a_form1']).toBe('f_form3')
  })
  it('is called My style 1 when it is not given a name', async () => {
    const { user, seen } = setup()
    await openHead(user)
    await keepSquare(user, '')
    expect(seen.figure.mine[0].name).toBe('My style 1')
  })
  it('is renamed and deleted from the part it is on', async () => {
    const { user, seen } = setup()
    await openHead(user)
    await keepSquare(user, 'Square jaw')
    const name = part().getByRole('textbox', { name: 'Name of my style' })
    await user.clear(name)
    await user.type(name, 'Strong jaw')
    await user.tab()
    expect(seen.figure.mine[0].name).toBe('Strong jaw')
    expect(await optionNames(user, 'Style', part())).toContain('Strong jaw (mine)')
    await user.click(part().getByRole('button', { name: 'Delete my style' }))
    expect(seen.figure.mine).toEqual([])
    expect(part().queryByRole('button', { name: 'Delete my style' })).toBeNull()
  })
  it('says what to do first when nothing about the part is changed', async () => {
    const { user, seen } = setup()
    await openHead(user)
    await user.click(part().getByRole('button', { name: 'Save as my style' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Change something about this part first')
    expect(seen.figure.mine).toEqual([])
  })
})

describe('the palette and the colour of the card', () => {
  const palette = () => within(screen.getByRole('group', { name: 'Palette' }))
  const swatches = () => palette().getAllByRole('group').map(g => g.getAttribute('aria-label'))
  it('starts as the model\'s and is the character\'s own from the first change, which recolours what uses it', () => {
    const { seen } = setup()
    expect(seen.figure.palette).toBeNull()
    expect(swatches()).toEqual(['Warm', 'Rose', 'Ink blue', 'Moss', 'Gold'])
    fireEvent.change(palette().getByRole('slider', { name: 'Warm hue' }), { target: { value: '200' } })
    expect(seen.figure.palette).toHaveLength(5)
    expect(seen.figure.palette!.find(p => p.id === 'k1')!.h).toBe(200)
    expect(seen.groups.at(-1)).toBe('figure.palette.k1.h')
    fireEvent.change(palette().getByRole('slider', { name: 'Warm saturation' }), { target: { value: '80' } })
    expect(seen.figure.palette!.find(p => p.id === 'k1')!.s).toBe(80)
    expect(seen.groups.at(-1)).toBe('figure.palette.k1.s')
  })
  it('gets a swatch added up to ten, loses one that is deleted, and keeps the last', async () => {
    const { user, seen } = setup()
    for (let i = 0; i < 5; i += 1) await user.click(screen.getByRole('button', { name: 'Add a swatch' }))
    expect(seen.figure.palette).toHaveLength(10)
    expect(swatches()).toHaveLength(10)
    expect(screen.getByRole('button', { name: 'Add a swatch' })).toBeDisabled()
    await user.click(palette().getByRole('button', { name: 'Delete Warm' }))
    expect(seen.figure.palette).toHaveLength(9)
    expect(swatches()).not.toContain('Warm')
    const one: CharacterFigure = { ...fresh(), palette: [{ id: 'k1', name: 'Only', h: 10, s: 10 }] }
    const second = setup(one)
    expect(second.seen.figure.palette).toHaveLength(1)
    expect(within(screen.getAllByRole('group', { name: 'Palette' })[1]).getByRole('button', { name: 'Delete Only' })).toBeDisabled()
  })
  it('renames a swatch', async () => {
    const { user, seen } = setup()
    const name = palette().getByRole('textbox', { name: 'Name of Warm' })
    await user.clear(name)
    await user.type(name, 'Honey{Enter}')
    expect(seen.figure.palette!.find(p => p.id === 'k1')!.name).toBe('Honey')
    expect(swatches()[0]).toBe('Honey')
  })
  it('the card colour is chosen from the swatches, and is the one shown', async () => {
    const { user, seen } = setup()
    const colour = within(screen.getByRole('group', { name: 'Card colour' }))
    await user.click(colour.getByRole('button', { name: 'Card colour #cfe0dc' }))
    expect(seen.figure.tile).toBe('#cfe0dc')
    expect(seen.groups.at(-1)).toBe('figure.tile')
    expect(colour.getByRole('button', { name: 'Card colour #cfe0dc' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('using another model', () => {
  const fantasy: ModelContent = { ...sample.content, name: 'Fantasy base', ranges: sample.content.ranges.filter(r => r.id !== 'r_tilt') }
  const listed = (id: string, content: ModelContent, version = 1) => ({ id, version, publishedAt: '2026-01-10T09:00:00.000Z', content })
  const use = () => screen.getByRole('button', { name: /Use this model/ })

  it('lists every published model, marks the one in use and a newer version of it', async () => {
    calls.getPublishedModels.mockResolvedValue({ models: [listed('adult', sample.content, 2), listed('fantasy', fantasy)] })
    setup()
    const select = await screen.findByRole('combobox', { name: 'Model to use' })
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['Adult (basic) (newer version)', 'Fantasy base'])
    expect(select).toHaveValue('adult')
    expect(use()).toBeEnabled()
  })
  it('has nothing to use while the model is the one in use', async () => {
    calls.getPublishedModels.mockResolvedValue({ models: [listed('adult', sample.content, 1), listed('fantasy', fantasy)] })
    setup()
    const select = await screen.findByRole('combobox', { name: 'Model to use' })
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['Adult (basic) (in use)', 'Fantasy base'])
    expect(use()).toBeDisabled()
    await userEvent.selectOptions(select, 'fantasy')
    expect(use()).toBeEnabled()
  })
  it('copies the model chosen, and carries over what the figure has chosen that the new model has too', async () => {
    const made = copyOf(fantasy, 'fantasy', 1)
    calls.getPublishedModels.mockResolvedValue({ models: [listed('adult', sample.content), listed('fantasy', fantasy)] })
    calls.ensureFigureModel.mockResolvedValue(made)
    const start: CharacterFigure = { ...fresh(), values: { r_tilt: 10, r_height: 90 }, locks: ['o_head'], tile: '#445566' }
    const { user, seen } = setup(start)
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Model to use' }), 'fantasy')
    await user.click(use())
    await waitFor(() => expect(seen.figure.model).toBe(made.id))
    expect(calls.ensureFigureModel).toHaveBeenCalledWith('p1', { modelId: 'fantasy' })
    expect(seen.figure.values).toEqual({ r_height: 90 })
    expect(seen.figure.locks).toEqual(['o_head'])
    expect(seen.figure.tile).toBe('#445566')
  })
  it('says so when the model cannot be copied, and changes nothing', async () => {
    calls.getPublishedModels.mockResolvedValue({ models: [listed('adult', sample.content), listed('fantasy', fantasy)] })
    calls.ensureFigureModel.mockRejectedValue(new Error('A copy of a model may be at most 250 KB.'))
    const { user, seen } = setup()
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Model to use' }), 'fantasy')
    await user.click(use())
    expect(await screen.findByRole('alert')).toHaveTextContent('250 KB')
    expect(seen.figure).toEqual(fresh())
  })
  it('says so when the models cannot be loaded', async () => {
    calls.getPublishedModels.mockRejectedValue(new Error('offline'))
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('The models could not be loaded.')
  })
})
