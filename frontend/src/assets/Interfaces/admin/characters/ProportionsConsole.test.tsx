import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import CharacterModelsConsole from './CharacterModelsConsole'
import { newShape } from './engine/edit'
import { makeTwin } from './engine/pairEdit'
import { setPivot } from './engine/rigEdit'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// A torso with an arm hung from it (Upper arm, then Forearm under it) and a bone along the upper arm: from its pivot (60, 60) to the elbow (60, 140).
function armed(): ModelContent {
  let c = blank('Adult')
  c = addGroup(c, newGroup('gT', 'Torso'))
  c = addGroup(c, newGroup('gU', 'Upper arm', 'gT'))
  c = addGroup(c, newGroup('gF', 'Forearm', 'gU'))
  c = addObject(c, 'gT', { id: 'oT', name: 'Torso part', layer: 'body', shapes: [] }); c = addShape(c, 'oT', newShape('torso', 'Torso shape', 'rounded', box(80, 40, 40, 80)))
  c = addObject(c, 'gU', { id: 'oU', name: 'Upper part', layer: 'body', shapes: [] }); c = addShape(c, 'oU', newShape('upper', 'Upper shape', 'rounded', box(55, 60, 10, 80)))
  c = addObject(c, 'gF', { id: 'oF', name: 'Fore part', layer: 'body', shapes: [] }); c = addShape(c, 'oF', newShape('fore', 'Fore shape', 'rounded', box(55, 140, 10, 80)))
  c = setPivot(setPivot(setPivot(c, 'gT', 100, 80), 'gU', 60, 60), 'gF', 60, 140)
  return { ...c, bones: [{ id: 'bUp', name: 'Upper arm', start: 'gU', end: { kind: 'group', id: 'gF', i: 0 } }] }
}

async function open(entries: ModelEntry[] = [draftEntry('a', armed())]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  render(<CharacterModelsConsole />)
  await screen.findByRole('heading', { name: 'Character models' })
  return { backend, user }
}

const tree = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
const canvas = () => screen.getByRole('application')
const tab = (name: string) => screen.getByRole('tab', { name })
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const bone = (name: string) => within(screen.getByRole('region', { name: `Bone ${name}` }))
const readout = (name: string) => screen.getByRole('status', { name: `Length of ${name}` }).textContent ?? ''
const drive = (b: { entries: ModelEntry[] }) => b.entries[0].draft.ranges[0]

async function proportions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(tab('Proportions'))
}
// make a Length slider for the bone and set its Try it slider
async function lengthen(user: ReturnType<typeof userEvent.setup>, value?: number) {
  await user.click(bone('Upper arm').getByRole('button', { name: /Add a Length slider/ }))
  if (value !== undefined) {
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: /All \(/ }))
    fireEvent.change(screen.getByRole('slider', { name: 'Try Upper arm length' }), { target: { value: String(value) } })
    await user.click(tab('Proportions'))
  }
}

describe('the Proportions tab', () => {
  it('measures each bone in units, heads and percent of rest', async () => {
    const { user } = await open()
    await proportions(user)
    expect(readout('Upper arm')).toContain('80 units')
    expect(readout('Upper arm')).toContain('100% of its length at rest')
    expect(screen.getByText('Mark a bone as the head to count heads.')).toBeInTheDocument()
    await user.click(bone('Upper arm').getByRole('button', { name: 'Use as the head' }))
    expect(bone('Upper arm').getByRole('button', { name: 'Use as the head' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/The figure stands .* heads tall\./)).toBeInTheDocument()
    expect(readout('Upper arm')).toContain('1 heads')
  })

  it('reads the length live as a Length slider moves, and the figure follows', async () => {
    const { user } = await open()
    await proportions(user)
    await lengthen(user, 150)   // 150 percent of the slider is 120 percent of the bone
    expect(readout('Upper arm')).toContain('96 units')
    expect(readout('Upper arm')).toContain('120% of its length')
    const d = canvas().querySelector('path[data-shape="fore"]')!.getAttribute('d')
    expect(d).toBeTruthy()
  })

  it('adds a Length slider that drives the bone and lists it under the bone', async () => {
    const { backend, user } = await open()
    await proportions(user)
    await lengthen(user)
    expect(bone('Upper arm').getByRole('button', { name: 'Upper arm length' })).toBeInTheDocument()
    await save(user)
    expect(drive(backend).drives).toEqual([expect.objectContaining({ kind: 'length', id: 'bUp', atMin: 80, atMax: 120 })])
    expect(drive(backend)).toMatchObject({ unit: '%', min: 50, rest: 100, max: 150, scope: 'gU' })
  })

  it('adds a bone from the selected group to the group that hangs from it', async () => {
    const { backend, user } = await open()
    await user.click(tree().getByRole('button', { name: 'Torso' }))
    await proportions(user)
    await user.click(screen.getByRole('button', { name: 'Add a bone' }))
    expect(screen.getByRole('region', { name: 'Bone Torso bone' })).toBeInTheDocument()
    await save(user)
    expect(backend.entries[0].draft.bones).toEqual([
      expect.objectContaining({ id: 'bUp' }),
      expect.objectContaining({ name: 'Torso bone', start: 'gT', end: { kind: 'group', id: 'gU', i: 0 } }),
    ])
  })

  it('renames a bone, moves its start and its end by list, and ends it at a point of a shape that is stepped', async () => {
    const { backend, user } = await open()
    await proportions(user)
    const input = screen.getByRole('textbox', { name: 'Name of bone Upper arm' })
    await user.clear(input); await user.type(input, 'Humerus')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Where Humerus starts' }), 'gT')
    await user.selectOptions(screen.getByRole('combobox', { name: 'The group Humerus ends at' }), 'gU')
    await user.click(bone('Humerus').getByRole('button', { name: 'A point of a shape' }))
    expect(screen.getByRole('combobox', { name: 'The shape Humerus ends at' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Raise Point of Humerus' }))
    expect(screen.getByText(/^2 of \d+$/)).toBeInTheDocument()
    await save(user)
    const saved = backend.entries[0].draft.bones![0]
    expect(saved).toMatchObject({ name: 'Humerus', start: 'gT', end: { kind: 'point', i: 1 } })
  })

  it('refuses a bone that would start and end at the same group, and says why', async () => {
    const { user } = await open()
    await proportions(user)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Where Upper arm starts' }), 'gF')
    expect(screen.getByText(/two places/)).toBeInTheDocument()
  })

  it('picks the end of a bone by clicking a pivot marker on the canvas', async () => {
    const { backend, user } = await open()
    await proportions(user)
    await user.click(bone('Upper arm').getByRole('button', { name: 'Pick its end on the canvas' }))
    const marker = screen.getByRole('button', { name: 'Pick the pivot of Torso' })
    fireEvent(marker, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    expect(screen.queryByRole('button', { name: 'Pick the pivot of Torso' })).toBeNull()
    await save(user)
    expect(backend.entries[0].draft.bones![0].end).toMatchObject({ kind: 'group', id: 'gT' })
  })

  it('picks the end of a bone by clicking a shape: its nearest point', async () => {
    const { backend, user } = await open()
    await proportions(user)
    await user.click(bone('Upper arm').getByRole('button', { name: 'Pick its end on the canvas' }))
    const path = canvas().querySelector('path[data-shape="fore"]')!
    fireEvent(path, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 352, clientY: 560 }))
    await save(user)
    expect(backend.entries[0].draft.bones![0].end).toMatchObject({ kind: 'point', id: 'fore' })
  })

  it('stops picking with Escape', async () => {
    const { user } = await open()
    await proportions(user)
    await user.click(bone('Upper arm').getByRole('button', { name: 'Pick its end on the canvas' }))
    expect(screen.getByRole('button', { name: 'Pick the pivot of Torso' })).toBeInTheDocument()
    fireEvent.keyDown(canvas(), { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Pick the pivot of Torso' })).toBeNull()
  })

  it('deletes a bone after asking, and its Length drive goes with it', async () => {
    const { backend, user } = await open()
    await proportions(user)
    await lengthen(user)
    await user.click(screen.getByRole('button', { name: 'Delete bone Upper arm' }))
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    expect(screen.getByText(/went with the bone/)).toBeInTheDocument()
    await save(user)
    expect(backend.entries[0].draft.bones).toEqual([])
    expect(drive(backend).drives).toEqual([])
  })

  it('sets the span a writer may choose, from the steppers, and keeps the resting value allowed', async () => {
    const { backend, user } = await open()
    await proportions(user)
    await lengthen(user)
    const limits = within(screen.getByRole('group', { name: /What a writer may choose for Upper arm length/ }))
    expect(limits.getByRole('button', { name: "Let writers choose anywhere on Upper arm length" })).toBeDisabled()
    await user.click(limits.getByRole('button', { name: "Lower Writer's largest of Upper arm length" }))
    await user.click(limits.getByRole('button', { name: "Raise Writer's smallest of Upper arm length" }))
    await save(user)
    expect(drive(backend).limit).toEqual([51, 149])
    // the resting value (100) stops the steppers
    for (let i = 0; i < 6; i++) await user.click(limits.getByRole('button', { name: "Raise Writer's smallest of Upper arm length", hidden: true }))
    for (let i = 0; i < 60; i++) { const b = limits.getByRole('button', { name: "Raise Writer's smallest of Upper arm length" }); if ((b as HTMLButtonElement).disabled) break; await user.click(b) }
    await save(user)
    expect(drive(backend).limit![0]).toBe(100)
    await user.click(limits.getByRole('button', { name: "Let writers choose anywhere on Upper arm length" }))
    await save(user)
    expect(drive(backend).limit).toBeNull()
  })

  it('has the same steppers in the Ranges tab, only for a slider offered to writers', async () => {
    const { user } = await open()
    await proportions(user)
    await lengthen(user)
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: /All \(/ }))
    expect(screen.getByRole('group', { name: /What a writer may choose for Upper arm length/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide Upper arm length from writers' }))
    expect(screen.queryByRole('group', { name: /What a writer may choose for Upper arm length/ })).toBeNull()
  })

  it('offers a Length drive on the Ranges tab, naming the bone it lengthens', async () => {
    const { backend, user } = await open()
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: 'New slider' }))
    await user.click(screen.getByRole('menuitem', { name: /Length of a bone/ }))
    expect(screen.getByText(/Lengthens Upper arm to 80% of its length at the minimum and 120% at the maximum/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Bone that drive 1 of Upper arm length lengthens/ })).toHaveValue('bUp')
    await save(user)
    expect(drive(backend).drives[0]).toMatchObject({ kind: 'length', id: 'bUp' })
  })

  it('cannot add a Length drive before there is a bone', async () => {
    const { user } = await open([draftEntry('a', { ...armed(), bones: [] })])
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: 'New slider' }))
    expect(screen.getByRole('menuitem', { name: /Length of a bone/ })).toBeDisabled()
  })
})

describe('how an object fits the body', () => {
  async function fitTab(user: ReturnType<typeof userEvent.setup>, object = 'Fore part') {
    await user.click(tree().getByRole('button', { name: object }))
    await user.click(tab('Rig'))
    return within(screen.getByRole('region', { name: 'How it fits the body' }))
  }

  it('keeps an object\'s size, and saves it', async () => {
    const { backend, user } = await open()
    const fit = await fitTab(user)
    expect(fit.getByRole('button', { name: 'Scales with its group' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(fit.getByRole('button', { name: 'Keeps its size' }))
    expect(fit.getByRole('button', { name: 'Keeps its size' })).toHaveAttribute('aria-pressed', 'true')
    await save(user)
    expect(backend.entries[0].draft.objects.find(o => o.id === 'oF')).toMatchObject({ fit: 'keep', fitTo: null })
  })

  it('draws a kept object at its own size when its group is scaled', async () => {
    const { user } = await open([draftEntry('a', armed())])
    // a slider that scales the forearm group
    await user.click(tree().getByRole('button', { name: 'Forearm' }))
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: 'New slider' }))
    await user.click(screen.getByRole('menuitem', { name: 'Scale' }))
    fireEvent.change(screen.getByRole('slider', { name: /Try Forearm size/ }), { target: { value: '150' } })
    const scaled = canvas().querySelector('path[data-shape="fore"]')!.getAttribute('d')
    await user.click(tree().getByRole('button', { name: 'Fore part' }))
    await user.click(tab('Rig'))
    await user.click(within(screen.getByRole('region', { name: 'How it fits the body' })).getByRole('button', { name: 'Keeps its size' }))
    const kept = canvas().querySelector('path[data-shape="fore"]')!.getAttribute('d')
    expect(kept).not.toBe(scaled)
  })

  it('stretches to a shape chosen from the list, or picked on the canvas', async () => {
    const { backend, user } = await open()
    const fit = await fitTab(user)
    await user.click(fit.getByRole('button', { name: 'Stretches to a shape' }))
    await user.selectOptions(fit.getByRole('combobox', { name: 'The shape Fore part stretches to' }), 'torso')
    await save(user)
    expect(backend.entries[0].draft.objects.find(o => o.id === 'oF')).toMatchObject({ fit: 'stretch', fitTo: 'torso' })
    await user.click(fit.getByRole('button', { name: 'Pick on the canvas' }))
    expect(fit.getByRole('button', { name: 'Click a shape…' })).toBeInTheDocument()
    fireEvent(canvas().querySelector('path[data-shape="upper"]')!, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    await save(user)
    expect(backend.entries[0].draft.objects.find(o => o.id === 'oF')).toMatchObject({ fit: 'stretch', fitTo: 'upper' })
  })

  it('goes back to scaling with its group, forgetting the shape', async () => {
    const { backend, user } = await open()
    const fit = await fitTab(user)
    await user.click(fit.getByRole('button', { name: 'Stretches to a shape' }))
    await user.selectOptions(fit.getByRole('combobox', { name: 'The shape Fore part stretches to' }), 'torso')
    await user.click(fit.getByRole('button', { name: 'Scales with its group' }))
    await save(user)
    expect(backend.entries[0].draft.objects.find(o => o.id === 'oF')).toMatchObject({ fit: 'scale', fitTo: null })
  })

  it('says a twin fits the body as its original does', async () => {
    const twin = makeTwin(armed(), 'object', 'oF')
    if (!twin.ok) throw new Error(twin.reason)
    const t = twin.content.objects.find(o => o.mirrorOf === 'oF')!
    const { user } = await open([draftEntry('a', twin.content)])
    await user.click(tree().getByRole('button', { name: t.name }))
    await user.click(tab('Rig'))
    expect(screen.getByText(/is a twin: it fits the body as its original does/)).toBeInTheDocument()
  })

  it('tells the Check panel about an object that does not scale with its group', async () => {
    const { user } = await open([draftEntry('a', { ...armed(), objects: armed().objects.map(o => (o.id === 'oF' ? { ...o, fit: 'keep' as const } : o)) })])
    expect(screen.getByText(/Fore part keeps its size/)).toBeInTheDocument()
    expect(user).toBeTruthy()
  })
})
