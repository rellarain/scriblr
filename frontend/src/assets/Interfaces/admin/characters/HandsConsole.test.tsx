import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry, ModelShape } from '../../../../api/types'
import { draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { blankContent, newGroup } from './modelContent'
import { makeTwin } from './engine/pairEdit'
import { addRange, addTurn, attachGroup, newRange, reparent, type Edit } from './engine/rigEdit'
import { openDrawer } from '../../../../test/designerUi'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const sharp = (id: string, name: string, pts: Array<[number, number]>): ModelShape => ({ id, name, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })

// A hand is fifteen groups (thirty with its twin) and every click solves the whole figure again, so these take longer than the other consoles' tests.
vi.setConfig({ testTimeout: 30000 })

// A torso, an arm and a forearm (with a twin arm when asked) and a slider that raises the arm.
function armed(twin: boolean): ModelContent {
  let c: ModelContent = {
    ...blankContent('Armed'),
    shapes: [sharp('chest', 'Chest shape', [[70, 86], [130, 86], [130, 160], [70, 160]]), sharp('arm', 'Arm shape', [[124, 90], [138, 90], [138, 140], [124, 140]]), sharp('fore', 'Forearm shape', [[125, 140], [137, 140], [137, 186], [125, 186]])],
    objects: [
      { id: 'oChest', name: 'Chest part', layer: 'body', shapes: ['chest'] }, { id: 'oArm', name: 'Arm part', layer: 'body', shapes: ['arm'] }, { id: 'oFore', name: 'Forearm part', layer: 'body', shapes: ['fore'] },
    ],
    groups: [newGroup('torso', 'Torso', null, ['oChest']), newGroup('gArm', 'Arm', 'torso', ['oArm']), newGroup('gFore', 'Forearm', 'gArm', ['oFore'])],
  }
  c = must(reparent(c, 'gFore', 'gArm'))
  c = must(attachGroup(c, 'gArm', { shape: 'chest', kind: 'inside', i: 0, t: 0, slider: null, rx: 1, ry: 0.1 }))
  c = must(attachGroup(c, 'gFore', { shape: 'arm', kind: 'inside', i: 0, t: 0, slider: null, rx: 0.5, ry: 1 }))
  c = must(addRange(c, { ...newRange('raise', 'Arm raise', 'turn', 'gArm'), min: 0, max: 90, rest: 0 }))
  c = must(addTurn(c, 'raise', 'gArm'))
  c = { ...c, ranges: c.ranges.map(r => (r.id === 'raise' ? { ...r, drives: r.drives.map(d => ({ ...d, atMin: 0, atMax: -80 })) } : r)) }
  if (twin) { let n = 0; c = must(makeTwin(c, 'group', 'gArm', p => `${p}_t${++n}`)) }
  return c
}

async function open(c: ModelContent) {
  const backend = modelsBackend([draftEntry('a', c)])
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}

type User = ReturnType<typeof userEvent.setup>
const tree = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
const tab = (name: string) => screen.getByRole('tab', { name })
const save = (user: User) => user.click(screen.getByRole('button', { name: 'Save' }))
const draft = (b: { entries: ModelEntry[] }) => b.entries[0].draft
const button = (name: string | RegExp) => screen.getByRole('button', { name })

async function toHands(user: User) {
  await user.click(tree().getByRole('button', { name: 'Forearm shape' }))
  await user.click(tab('Rig'))
}

describe('the Hands section', () => {
  it('builds a whole hand: fifteen groups and eight sliders, saved with the model', async () => {
    const { backend, user } = await open(armed(false))
    await toHands(user)
    const section = screen.getByRole('region', { name: 'Hands and fingers' })
    await user.click(within(section).getByRole('button', { name: /Add a whole hand/ }))
    await save(user)
    const d = draft(backend)
    expect(d.groups.length).toBe(3 + 15)
    expect(d.ranges.filter(r => r.role).map(r => r.role).sort()).toEqual(['curl-index', 'curl-little', 'curl-middle', 'curl-ring', 'curl-thumb', 'oppose-thumb', 'spread', 'swing-thumb'])
    expect(d.groups.find(g => g.name === 'Hand')).toMatchObject({ parent: 'gFore' })
  })

  it('adds a finger of three joints or two, with its Curl slider', async () => {
    const { backend, user } = await open(armed(false))
    await toHands(user)
    await user.click(button(/^Add a finger$/))
    await user.click(button(/^Add a short finger$/))
    await save(user)
    const d = draft(backend)
    expect(d.groups.length).toBe(3 + 3 + 2)
    expect(d.ranges.filter(r => r.name === 'Finger curl').map(r => r.drives.length).sort()).toEqual([2, 3])
  })

  it('adds a thumb with Swing, Curl and Across', async () => {
    const { backend, user } = await open(armed(false))
    await toHands(user)
    await user.click(button(/^Add a thumb$/))
    await save(user)
    expect(draft(backend).ranges.filter(r => r.role).map(r => r.name).sort()).toEqual(['Thumb across', 'Thumb curl', 'Thumb swing'])
  })

  it('builds the hand on the twin arm too and poses it apart, then poses the starter hand poses', async () => {
    const { backend, user } = await open(armed(true))
    await toHands(user)
    await user.click(button(/Add a whole hand/))
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: /^All \(/ }))
    expect(screen.getByRole('region', { name: 'Slider Index finger curl' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Slider Index finger curl (other side)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pose both sides of Index finger curl together' })).toBeInTheDocument()
    await user.click(tab('Rig'))
    await user.click(button(/Add the standard hand poses/))
    // the starter poses are listed in the Presets tab, a kind for each hand
    expect(tab('Presets')).toHaveAttribute('aria-selected', 'true')
    const kinds = within(screen.getByRole('group', { name: 'Which presets to list' }))
    for (const kind of ['Hand', 'Hand (other side)']) expect(kinds.getByRole('button', { name: kind })).toBeInTheDocument()
    await save(user)
    const d = draft(backend)
    expect(d.presets!.filter(p => p.kind === 'Hand').map(p => p.name)).toEqual(['Open', 'Fist', 'Point', 'Pinch', 'Grip'])
    expect(d.presets!.filter(p => p.kind === 'Hand (other side)')).toHaveLength(5)
    expect(d.ranges.filter(r => r.name.endsWith('(other side)'))).toHaveLength(8)
  })

  it('closes one hand with a pose and leaves the other open', async () => {
    const { user } = await open(armed(true))
    await toHands(user)
    await user.click(button(/Add a whole hand/))
    await user.click(button(/Add the standard hand poses/))
    await user.click(screen.getAllByRole('button', { name: 'Apply Fist' })[0])     // the first is the Hand kind
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: /^All \(/ }))
    expect(screen.getByLabelText('Try Index finger curl')).toHaveValue('100')
    expect(screen.getByLabelText('Try Index finger curl (other side)')).toHaveValue('0')
  })
})

describe('the previews of a hand', () => {
  it('draw the selected hand with its fingers, not the palm alone', async () => {
    const { user } = await open(armed(false))
    await toHands(user)
    await user.click(button(/Add a whole hand/))
    await user.click(tree().getAllByRole('button', { name: 'Hand' })[0])      // the group of the hand
    await openDrawer(user)
    expect(screen.getByRole('img', { name: 'Preview 1' }).querySelectorAll('path[data-shape], path').length).toBeGreaterThanOrEqual(15)
  })
})

describe('apart sliders', () => {
  it('poses the other side of a slider apart and together again', async () => {
    const { backend, user } = await open(armed(true))
    await user.click(tree().getByRole('button', { name: 'Arm shape' }))
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: /^All \(/ }))
    await user.click(button('Pose the other side of Arm raise apart'))
    expect(screen.getByRole('region', { name: 'Slider Arm raise (other side)' })).toBeInTheDocument()
    expect(screen.getAllByText(/Posed apart from/)).toHaveLength(2)
    await save(user)
    expect(draft(backend).ranges.map(r => r.name)).toEqual(['Arm raise', 'Arm raise (other side)'])
    await user.click(button('Pose both sides of Arm raise together'))
    expect(screen.queryByRole('region', { name: 'Slider Arm raise (other side)' })).toBeNull()
    await save(user)
    expect(draft(backend).ranges.map(r => r.name)).toEqual(['Arm raise'])
  })

  it('offers nothing for a slider with no twin groups to pose', async () => {
    const { user } = await open(armed(false))
    await user.click(tree().getByRole('button', { name: 'Arm shape' }))
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: /^All \(/ }))
    expect(screen.queryByRole('button', { name: 'Pose the other side of Arm raise apart' })).toBeNull()
  })

  it('moves the arm of the other side with its own slider only', async () => {
    const { user } = await open(armed(true))
    await user.click(tree().getByRole('button', { name: 'Arm shape' }))
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: /^All \(/ }))
    await user.click(button('Pose the other side of Arm raise apart'))
    const twinPath = () => (document.querySelector('path[data-shape="s_t2"]') ?? document.querySelector('path[data-shape^="s_t"]')) as SVGPathElement
    const before = twinPath()?.getAttribute('d')
    fireEvent.change(screen.getByLabelText('Try Arm raise'), { target: { value: '60' } })
    expect(twinPath()?.getAttribute('d')).toBe(before)
    fireEvent.change(screen.getByLabelText('Try Arm raise (other side)'), { target: { value: '60' } })
    expect(twinPath()?.getAttribute('d')).not.toBe(before)
  })
})

describe('grip points', () => {
  async function withHand() {
    const ctx = await open(armed(true))
    await toHands(ctx.user)
    await ctx.user.click(button(/Add a whole hand/))
    await ctx.user.click(tree().getAllByRole('button', { name: 'Hand' })[0])      // the group of the hand
    return ctx
  }

  it('adds a grip to the selected hand, steps it, names it and draws it on the canvas', async () => {
    const { backend, user } = await withHand()
    const section = screen.getByRole('region', { name: 'Grip points' })
    expect(within(section).getByText(/No grip point on this group yet/)).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: /Add a grip point/ }))
    expect(document.querySelector('[data-grip]')).not.toBeNull()
    expect(within(section).getByText('1 of 16')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Raise Points (degrees) for Grip' }))
    expect(within(section).getByText('5°')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Raise Down for Grip' }))
    const name = screen.getByLabelText('Name of grip point Grip')
    await user.clear(name)
    await user.type(name, 'Staff')
    await save(user)
    const g = draft(backend).grips![0]
    expect(g).toMatchObject({ name: 'Staff', angle: 5 })
    expect(g.group).toBeTruthy()
  })

  it('shows the held grip as on, makes the same grip on the other hand, and deletes one', async () => {
    const { backend, user } = await withHand()
    await user.click(button(/Add a grip point/))
    const held = screen.getByRole('button', { name: 'Held' })
    expect(held).toHaveAttribute('aria-pressed', 'true')       // a new grip is the one held
    expect(document.querySelector('[data-grip].cmGrip--on')).not.toBeNull()
    await user.click(held)
    expect(held).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('[data-grip].cmGrip--on')).toBeNull()
    await user.click(button(/Make it on the other hand/))
    await save(user)
    expect(draft(backend).grips).toHaveLength(2)
    expect(draft(backend).grips![1].name).toMatch(/other side/)
    await user.click(screen.getByRole('button', { name: 'Delete grip point Grip' }))
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    await save(user)
    expect(draft(backend).grips).toHaveLength(1)
  })

  it('lets a pose hold with a grip, and holds the grip when the pose is applied', async () => {
    const { backend, user } = await withHand()
    await user.click(button(/Add a grip point/))
    await user.click(button(/Add the standard hand poses/))
    const holds = screen.getAllByLabelText('Grip point that Grip holds with')[0]       // the first is the Hand kind
    await user.selectOptions(holds, within(holds).getByRole('option', { name: 'Grip' }))
    // a pose of the kind lets go of the grip, the one that names it takes it again
    await user.click(screen.getAllByRole('button', { name: 'Apply Open' })[0])
    expect(document.querySelector('[data-grip].cmGrip--on')).toBeNull()
    await user.click(screen.getAllByRole('button', { name: 'Apply Grip' })[0])
    expect(document.querySelector('[data-grip].cmGrip--on')).not.toBeNull()
    await save(user)
    const d = draft(backend)
    expect(d.presets!.find(p => p.kind === 'Hand' && p.name === 'Grip')!.grip).toBe(d.grips![0].id)
  })

  it('makes the grip a handle in Pose mode', async () => {
    const { user } = await withHand()
    await user.click(button(/Add a grip point/))
    expect(screen.queryByRole('button', { name: /Reach with Grip/ })).toBeNull()
    await user.click(button('Pose mode'))
    expect(screen.getByRole('button', { name: 'Reach with Grip' })).toBeInTheDocument()
  })

  it('draws no grip when there is none', async () => {
    const { user } = await open(armed(false))
    await user.click(tree().getByRole('button', { name: 'Forearm shape' }))
    await user.click(tab('Rig'))
    expect(document.querySelector('[data-grip]')).toBeNull()
  })
})
