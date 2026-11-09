import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelEntry, ModelPoint } from '../../../../api/types'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import CharacterModelsConsole from './CharacterModelsConsole'
import { newShape } from './engine/edit'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
const widen = (pts: ModelPoint[]): ModelPoint[] => pts.map(p => ({ ...p, x: 100 + (p.x - 100) * 1.4 }))
const OWN = ['iris', 'pupil', 'skull', 'shirt']

// A head with an eye (iris and pupil, one axis of two forms: Standard and Wide), a skull and a shirt in another group.
function eyed(): ModelContent {
  let c = content('Adult')
  c = addGroup(c, newGroup('gH', 'Head')); c = addGroup(c, newGroup('gB', 'Body'))
  c = addObject(c, 'gH', { id: 'oE', name: 'Eye', layer: 'body', shapes: [] })
  c = addShape(c, 'oE', newShape('iris', 'Iris', 'oval', box(84, 50, 32, 16)))
  c = addShape(c, 'oE', newShape('pupil', 'Pupil', 'oval', box(94, 53, 12, 10)))
  c = addObject(c, 'gH', { id: 'oS', name: 'Skull', layer: 'body', shapes: [] })
  c = addShape(c, 'oS', newShape('skull', 'Skull shape', 'oval', box(76, 20, 48, 56)))
  c = addObject(c, 'gB', { id: 'oT', name: 'Shirt', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oT', newShape('shirt', 'Shirt part', 'rounded', box(66, 86, 68, 70)))
  const iris = c.shapes.find(s => s.id === 'iris')!
  return {
    ...c,
    objects: c.objects.map(o => (o.id === 'oE' ? {
      ...o,
      axes: [{
        id: 'aShape', name: 'Eye shape', initial: 'std',
        options: [{ id: 'std', name: 'Standard', ovr: [] }, { id: 'wide', name: 'Wide', ovr: [{ shape: 'iris', pts: widen(iris.pts) }] }],
      }],
    } : o)),
  }
}

async function open(entries: ModelEntry[] = [draftEntry('a', eyed())]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  render(<CharacterModelsConsole />)
  await screen.findByRole('heading', { name: 'Character models' })
  return { backend, user }
}

const tree = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
const canvas = () => screen.getByRole('application')
const drawn = () => Array.from(canvas().querySelectorAll('path[data-shape]')).map(p => p.getAttribute('data-shape') as string)
const dOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)?.getAttribute('d') ?? null
const klass = () => within(screen.getByRole('region', { name: 'Class' }))
const tab = (name: string) => screen.getByRole('tab', { name })
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const draft = (b: { entries: ModelEntry[] }) => b.entries[0].draft
const memberShapes = () => drawn().filter(id => !OWN.includes(id))

async function makeEyeClass(user: ReturnType<typeof userEvent.setup>, exclusive = true) {
  await user.click(tree().getByRole('button', { name: 'Eye' }))
  if (!exclusive) await user.click(klass().getByRole('button', { name: 'Copies' }))
  await user.click(klass().getByRole('button', { name: 'Make a class' }))
}
const addMember = (user: ReturnType<typeof userEvent.setup>) => user.click(klass().getByRole('button', { name: 'Add a member' }))

describe('making a class', () => {
  it('turns an object into the pattern of a class, drawn like any object until it has a member', async () => {
    const { user, backend } = await open()
    await makeEyeClass(user)
    expect(screen.getByRole('heading', { name: 'Pattern of class Eye' })).toBeInTheDocument()
    expect(drawn()).toEqual(expect.arrayContaining(['iris', 'pupil']))
    await save(user)
    expect(draft(backend).classes).toEqual([expect.objectContaining({ name: 'Eye', template: 'oE', exclusive: true })])
  })

  it('offers no class to a twin, and no second class to a member', async () => {
    const { user } = await open()
    await makeEyeClass(user)
    await addMember(user)
    expect(screen.getByRole('heading', { name: 'Member of class Eye' })).toBeInTheDocument()
    expect(klass().queryByRole('button', { name: 'Make a class' })).toBeNull()
  })
})

describe('members', () => {
  it('adds a member in the pattern\'s group that has a shape for each shape of the pattern', async () => {
    const { user, backend } = await open()
    await makeEyeClass(user)
    await addMember(user)
    await save(user)
    const d = draft(backend)
    const member = d.objects.find(o => o.classOf)!
    expect(member.name).toBe('Eye 1')
    expect(d.groups.find(g => g.id === 'gH')!.objects).toEqual(['oE', member.id, 'oS'])
    expect(member.shapes.map(id => d.shapes.find(s => s.id === id)!.copyOf)).toEqual(['iris', 'pupil'])
    expect(member.shapes.every(id => d.shapes.find(s => s.id === id)!.pts.length === 0)).toBe(true)
  })

  it('does not draw the pattern once it has a member; the member is drawn', async () => {
    const { user } = await open()
    await makeEyeClass(user)
    await addMember(user)
    await user.click(tree().getByRole('button', { name: 'Skull' }))
    expect(drawn()).not.toContain('iris')
    expect(drawn()).not.toContain('pupil')
    expect(memberShapes()).toHaveLength(2)
    expect(dOf(memberShapes()[0])).toMatch(/^M/)
  })

  it('draws the pattern again while it is selected', async () => {
    const { user } = await open()
    await makeEyeClass(user)
    await addMember(user)
    await user.click(tree().getByRole('button', { name: 'Eye' }))
    expect(drawn()).toEqual(expect.arrayContaining(['iris', 'pupil']))
    expect(memberShapes()).toHaveLength(0)    // a family draws one member at a time: the pattern, when it is the one looked at
  })

  it('shows one member of a family at a time, and every copy of copies', async () => {
    const family = await open()
    await makeEyeClass(family.user)
    await addMember(family.user)
    await family.user.click(tree().getByRole('button', { name: 'Eye' }))
    await addMember(family.user)
    await family.user.click(tree().getByRole('button', { name: 'Skull' }))
    expect(memberShapes()).toHaveLength(2)
    const first = memberShapes()
    await family.user.click(tree().getByRole('button', { name: 'Eye 2' }))
    await family.user.click(klass().getByRole('button', { name: 'Show this member' }))
    await family.user.click(tree().getByRole('button', { name: 'Skull' }))
    expect(memberShapes()).toHaveLength(2)
    expect(memberShapes()).not.toEqual(first)
  })

  it('draws every member of copies', async () => {
    const { user } = await open()
    await makeEyeClass(user, false)
    await addMember(user)
    await user.click(tree().getByRole('button', { name: 'Eye' }))
    await addMember(user)
    await user.click(tree().getByRole('button', { name: 'Skull' }))
    expect(memberShapes()).toHaveLength(4)
  })

  it('moves a member to another group', async () => {
    const { user, backend } = await open()
    await makeEyeClass(user)
    await addMember(user)
    await user.selectOptions(klass().getByRole('combobox', { name: 'Group of the member' }), 'gB')
    await save(user)
    const d = draft(backend)
    expect(d.groups.find(g => g.id === 'gB')!.objects).toContain(d.objects.find(o => o.classOf)!.id)
    expect(d.groups.find(g => g.id === 'gH')!.objects).toEqual(['oE', 'oS'])
  })

  it('keeps the members in step when a shape is added to the pattern', async () => {
    const { user, backend } = await open()
    await makeEyeClass(user)
    await addMember(user)
    await user.click(tree().getByRole('button', { name: 'Eye' }))
    await user.click(tree().getByRole('button', { name: 'Add a shape to Eye' }))
    await user.click(screen.getByRole('menuitem', { name: /Circle/i }))
    await save(user)
    const d = draft(backend)
    const member = d.objects.find(o => o.classOf)!
    expect(member.shapes).toHaveLength(3)
  })
})

describe('a member\'s shapes', () => {
  async function onMember() {
    const r = await open()
    await makeEyeClass(r.user)
    await addMember(r.user)
    return r
  }

  it('cannot be deleted or copied, but can be left out', async () => {
    const { user, backend } = await onMember()
    const row = tree().getAllByRole('button', { name: 'Iris' })
    expect(row.length).toBeGreaterThan(0)
    expect(tree().queryAllByRole('button', { name: 'Delete Iris' })).toHaveLength(1)   // the pattern's own, not the member's
    // select the member's first shape by its row (the second 'Iris' in the tree) and leave it out
    await user.click(row[row.length - 1])
    await user.click(screen.getByRole('button', { name: 'Hide in this member' }))
    expect(screen.getByRole('button', { name: 'Hide in this member' })).toHaveAttribute('aria-pressed', 'true')
    await save(user)
    expect(draft(backend).shapes.filter(s => s.copyOf && s.hide)).toHaveLength(1)
  })

  it('gets an outline of its own when a point is moved, and follows the pattern again on request', async () => {
    const { user, backend } = await onMember()
    const row = tree().getAllByRole('button', { name: 'Iris' })
    await user.click(row[row.length - 1])
    expect(screen.getByText(/follows the pattern: move a point/)).toBeInTheDocument()
    fireEvent.keyDown(canvas(), { key: 'ArrowDown' })    // the arrow keys nudge the selected point (point 1 is on the mirror line: down, not sideways)
    await save(user)
    const own = draft(backend).shapes.find(s => s.copyOf === 'iris')!
    expect(own.pts.length).toBeGreaterThanOrEqual(3)
    await user.click(screen.getByRole('button', { name: 'Follow the pattern again' }))
    await save(user)
    expect(draft(backend).shapes.find(s => s.copyOf === 'iris')!.pts).toEqual([])
  })

  it('draws the ghost of the pattern only while the toggle is on', async () => {
    const { user } = await onMember()
    const row = tree().getAllByRole('button', { name: 'Iris' })
    await user.click(row[row.length - 1])
    fireEvent.keyDown(canvas(), { key: 'ArrowDown' })
    expect(canvas().querySelector('[data-ghost]')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Ghost of the pattern' }))
    expect(screen.getByRole('button', { name: 'Ghost of the pattern' })).toHaveAttribute('aria-pressed', 'true')
    expect(canvas().querySelector('[data-ghost]')).not.toBeNull()
  })

  it('chooses its own form on each of the pattern\'s axes, which it cannot edit', async () => {
    const { user } = await onMember()
    await user.click(tree().getByRole('button', { name: 'Eye 1' }))
    await user.click(tab('Forms'))
    const axis = () => within(screen.getByRole('region', { name: 'Axis Eye shape' }))
    expect(screen.queryByRole('textbox', { name: 'Name of axis Eye shape' })).toBeNull()
    expect(axis().queryByRole('button', { name: /Add a form from the current one/ })).toBeNull()
    await user.click(tree().getByRole('button', { name: 'Skull' }))
    const before = dOf(memberShapes()[0])
    await user.click(tree().getByRole('button', { name: 'Eye 1' }))
    await user.click(axis().getByRole('button', { name: /^Wide/ }))
    expect(axis().getByRole('button', { name: /^Wide/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(tree().getByRole('button', { name: 'Skull' }))
    expect(dOf(memberShapes()[0])).not.toBe(before)
  })
})

describe('leaving a class', () => {
  it('detaches a member after a confirmation: it keeps the look and stops following', async () => {
    const { user, backend } = await open()
    await makeEyeClass(user)
    await addMember(user)
    await user.click(klass().getByRole('button', { name: 'Detach from the class' }))
    await user.click(klass().getByRole('button', { name: 'Detach it' }))
    await save(user)
    const d = draft(backend)
    const member = d.objects.find(o => o.name === 'Eye 1')!
    expect(member.classOf ?? null).toBeNull()
    expect(member.shapes.map(id => d.shapes.find(s => s.id === id)!)).toEqual([expect.objectContaining({ copyOf: null }), expect.objectContaining({ copyOf: null })])
    expect(member.shapes.every(id => d.shapes.find(s => s.id === id)!.pts.length >= 3)).toBe(true)
  })

  it('deletes a class: its members become ordinary objects', async () => {
    const { user, backend } = await open()
    await makeEyeClass(user)
    await addMember(user)
    await user.click(tree().getByRole('button', { name: 'Eye' }))
    await user.click(klass().getByRole('button', { name: 'Delete the class' }))
    await user.click(klass().getByRole('button', { name: 'Delete the class' }))
    await save(user)
    const d = draft(backend)
    expect(d.classes).toEqual([])
    expect(d.objects.every(o => !o.classOf)).toBe(true)
    expect(d.shapes.every(s => !s.copyOf)).toBe(true)
  })

  it('detaches the members first when the pattern is deleted', async () => {
    const { user, backend } = await open()
    await makeEyeClass(user)
    await addMember(user)
    await user.click(screen.getByRole('button', { name: 'Delete object Eye' }))
    expect(screen.getByText(/detached first: they keep their look/)).toBeInTheDocument()
    await save(user)
    const d = draft(backend)
    expect(d.classes).toEqual([])
    const member = d.objects.find(o => o.name === 'Eye 1')!
    expect(member.shapes.every(id => d.shapes.find(s => s.id === id)!.pts.length >= 3)).toBe(true)
  })
})

describe('styles', () => {
  async function onEye() {
    const r = await open()
    await r.user.click(tree().getByRole('button', { name: 'Eye' }))
    await r.user.click(tab('Forms'))
    return r
  }
  const styles = () => within(screen.getByRole('region', { name: 'Styles of Eye' }))

  it('keeps the current look of an object as a style that belongs to it', async () => {
    const { user, backend } = await onEye()
    await user.click(within(screen.getByRole('region', { name: 'Axis Eye shape' })).getByRole('button', { name: /^Wide/ }))
    await user.type(styles().getByRole('textbox', { name: 'Style name for Eye' }), 'Tired')
    await user.click(styles().getByRole('button', { name: /Save the current look as a style/ }))
    expect(styles().getByRole('listitem', { name: 'Style Tired' })).toBeInTheDocument()
    expect(styles().getByRole('img', { name: 'Tired is on' })).toBeInTheDocument()
    await save(user)
    expect(draft(backend).presets).toEqual([expect.objectContaining({ name: 'Tired', scope: 'oE', forms: { 'oE.aShape': 'wide' } })])
  })

  it('applies a style: the forms it names are chosen again', async () => {
    const { user } = await onEye()
    const axis = within(screen.getByRole('region', { name: 'Axis Eye shape' }))
    await user.click(axis.getByRole('button', { name: /^Wide/ }))
    await user.type(styles().getByRole('textbox', { name: 'Style name for Eye' }), 'Tired')
    await user.click(styles().getByRole('button', { name: /Save the current look as a style/ }))
    await user.click(axis.getByRole('button', { name: /^Standard/ }))
    expect(styles().queryByRole('img', { name: 'Tired is on' })).toBeNull()
    await user.click(styles().getByRole('button', { name: 'Apply style Tired' }))
    expect(axis.getByRole('button', { name: /^Wide/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('is listed in the Presets tab with what it belongs to', async () => {
    const { user } = await onEye()
    await user.type(styles().getByRole('textbox', { name: 'Style name for Eye' }), 'Plain')
    await user.click(styles().getByRole('button', { name: /Save the current look as a style/ }))
    await user.click(tab('Presets'))
    const row = screen.getByRole('listitem', { name: 'Preset Plain' })
    expect(within(row).getByText(/Style of Eye/)).toBeInTheDocument()
  })

  it('chooses the member of a family that is shown', async () => {
    const { user, backend } = await open()
    await makeEyeClass(user)
    await addMember(user)
    await user.click(tree().getByRole('button', { name: 'Eye' }))
    await addMember(user)
    await user.click(tree().getByRole('button', { name: 'Eye' }))
    await user.click(within(klass().getByRole('group', { name: 'Member shown' })).getByRole('button', { name: 'Eye 2' }))
    await user.click(tab('Forms'))
    await user.type(screen.getByRole('textbox', { name: 'Style name for Eye' }), 'Second')
    await user.click(screen.getByRole('button', { name: /Save the current look as a style/ }))
    await save(user)
    const d = draft(backend)
    const second = d.objects.find(o => o.name === 'Eye 2')!
    expect(d.presets!.find(p => p.name === 'Second')!.forms).toEqual(expect.objectContaining({ [`class:${d.classes![0].id}`]: second.id }))
  })
})
