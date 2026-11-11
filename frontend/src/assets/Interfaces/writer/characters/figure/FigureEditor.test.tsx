import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CharacterFigure, FigureModel, ModelContent } from '../../../../../api/types'
import { copyOf } from '../../../../../designSystem/mockFigureModels'
import { previewModels } from '../../../../../designSystem/mockCharacterModels'
import type { Characters } from '../useCharacters'
import { FigureEditor } from './FigureEditor'
import { ageOf, blankFigure, spanOf } from './figureState'

// The writer's editor of a figure: the card with its sheets and parts, and the steps under it. The sample model of the design system has three frames (Head to hands, Bust, Face), a
// family of eyes, an Age/Build/Outfit/Pose set of presets, a state on the upper arm, authored fields, a fill pattern and a colour lock on the shirt.
vi.setConfig({ testTimeout: 30000 })

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
    return <FigureEditor figure={figure} model={copy} label="Ada, figure" setFigure={setFigure} />
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
const pick = (user: ReturnType<typeof userEvent.setup>, name: string, value: string) => user.selectOptions(screen.getByRole('combobox', { name }), value)

describe('the card and its toolbar', () => {
  it('draws the figure on its card, with the view, the frames and Randomise over it', () => {
    setup()
    expect(screen.getByRole('img', { name: 'Ada, figure' })).toBeInTheDocument()
    const bar = within(screen.getByRole('toolbar', { name: 'View and frame' }))
    expect(bar.getByRole('button', { name: 'Front view' })).toHaveAttribute('aria-pressed', 'true')
    expect(bar.getByRole('button', { name: 'Back view' })).toHaveAttribute('aria-pressed', 'false')
    expect(bar.getAllByRole('button').map(b => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Front view', 'Back view', 'Whole figure', 'Head to hands', 'Bust', 'Face', 'Roll a new look'])
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
  it('has a dropdown for each kind of preset at the one that is on, and the sliders no part holds', () => {
    setup()
    expect(steps().getAllByRole('combobox').map(s => s.getAttribute('aria-label'))).toEqual(['Pose', 'Expression', 'Build', 'Outfit', 'Weather', 'Age', 'Hand', 'Hand (other side)'])
    expect(screen.getByRole('combobox', { name: 'Age' })).toHaveValue('p_form43')
    expect(screen.getByRole('combobox', { name: 'Expression' })).toHaveValue('')
    expect(within(screen.getByRole('combobox', { name: 'Age' })).getAllByRole('option').map(o => o.textContent)).toEqual(['Infant', 'Child', 'Teen', 'Adult', 'Elder'])
    expect(steps().getAllByRole('slider').map(s => s.getAttribute('aria-label'))).toEqual(['Height'])
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
    expect(screen.getByRole('combobox', { name: 'Age' })).toHaveValue('p_form41')
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
    expect(head.getByRole('combobox', { name: 'Style' })).toHaveValue('__none')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(steps().getByRole('combobox', { name: 'Age' })).toBeInTheDocument()
    await user.click(sheet('Face'))
    await user.click(crumbs().getByRole('button', { name: 'Figure' }))
    expect(steps().getByRole('combobox', { name: 'Age' })).toBeInTheDocument()
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
    const { user } = setup()
    await user.click(sheet('Bust'))
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
    expect(part.getByRole('combobox', { name: 'Head shape' })).toHaveValue('f_form2')
    await user.selectOptions(part.getByRole('combobox', { name: 'Head shape' }), 'f_form3')
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
    expect(steps().getByRole('combobox', { name: 'Sleeve' })).toBeInTheDocument()
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
    await user.selectOptions(part.getByRole('combobox', { name: 'Style' }), 'p_dark')
    expect(seen.figure.on).toEqual(['p_dark'])
    expect(colour.getByText(/fixes this colour's saturation and lightness\./)).toBeInTheDocument()
    expect(colour.getByRole('slider', { name: 'Clothing brightness' })).toBeDisabled()
    expect(colour.getByRole('slider', { name: 'Clothing brightness' })).toHaveValue('18')
    expect(part.getByRole('group', { name: 'Darker shirt' })).toBeInTheDocument()
    await user.selectOptions(part.getByRole('combobox', { name: 'Style' }), '__none')
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
    await pick(user, 'Where it falls', 'left')
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
    expect(steps().getByRole('combobox', { name: 'Head shape' })).toBeInTheDocument()
  })
})
