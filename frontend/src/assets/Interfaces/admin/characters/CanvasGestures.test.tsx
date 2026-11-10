import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// The canvas's gestures: a left click on the empty grid unselects everything; hovering an outline widens it, shows its points and puts a large handle on it, and a click on that
// handle adds a point; a click on a point steps its handles; hovering the crossing of two outlines offers a lock, which a click steps (onto the edge, welded, free); a dragged
// shape shows where it lines up with the others.
vi.setConfig({ testTimeout: 30000 })

const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
// Two squares that overlap at a corner: A is 60..100 across and 100..140 down, B is 80..120 across and 120..160 down. Their outlines cross at (100, 120) and (80, 140).
function squares(): ModelContent {
  let c = addGroup(blank('Squares'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'oA', name: 'A part', layer: 'body', shapes: [] })
  c = addShape(c, 'oA', sharp('a', [[60, 100], [100, 100], [100, 140], [60, 140]]))
  c = addObject(c, 'g', { id: 'oB', name: 'B part', layer: 'body', shapes: [] })
  return addShape(c, 'oB', sharp('b', [[80, 120], [120, 120], [120, 160], [80, 160]]))
}

async function open() {
  const backend = modelsBackend([draftEntry('a', squares())])
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { user, backend }
}

const canvas = () => screen.getByRole('application')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)!
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number; button?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: at.button ?? 0, clientX: at.x ?? 0, clientY: at.y ?? 0 }))
}
const select = (id: string, wx: number, wy: number) => { pointer(pathOf(id), 'pointerdown', pixelOf(wx, wy)); pointer(canvas(), 'pointerup') }
const hoverAt = (wx: number, wy: number) => pointer(canvas(), 'pointermove', pixelOf(wx, wy))
const pointsText = () => screen.getAllByText(/ of 60$/).map(e => e.textContent)
const modeChip = (name: string) => within(screen.getByRole('group', { name: 'Mode of point 1' })).getByRole('button', { name })

describe('a left click on the grid', () => {
  it('unselects everything, and a left click on a shape selects it', async () => {
    await open()
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    select('a', 70, 110)
    expect(screen.getByRole('heading', { name: 'Shape' })).toBeInTheDocument()
    expect(canvas().querySelector('[data-ring="a"]')).not.toBeNull()
    pointer(canvas(), 'pointerdown', { x: 3, y: 3 })
    pointer(canvas(), 'pointerup')
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(canvas().querySelector('[data-ring]')).toBeNull()
  })
})

describe('hovering an outline', () => {
  it('widens it, shows its points small and puts a larger handle on the edge', async () => {
    await open()
    select('a', 70, 110)
    // (the point that is selected is drawn larger; look at the second one)
    const pointR = () => Number(canvas().querySelectorAll('.cmPoint')[1].getAttribute('r'))
    const quiet = pointR()
    hoverAt(80, 100)   // the middle of the top edge, away from every point
    expect(canvas().querySelector('.cmHoverOutline')).not.toBeNull()
    const handle = canvas().querySelector('[data-edge-handle="a"]')!
    expect(handle).not.toBeNull()
    expect(Number(handle.getAttribute('r'))).toBeGreaterThan(pointR())
    expect(pointR()).toBeLessThan(quiet)
    hoverAt(20, 20)
    expect(canvas().querySelector('.cmHoverOutline')).toBeNull()
    expect(canvas().querySelector('[data-edge-handle]')).toBeNull()
    expect(pointR()).toBeCloseTo(quiet, 5)
  })

  it('does the same for a shape that is not selected, with its points revealed', async () => {
    await open()
    hoverAt(100, 160)   // the middle of B's bottom edge... B is 80..120, so this is its bottom edge's middle
    const outline = canvas().querySelector('.cmHoverOutline')!
    expect(outline.getAttribute('data-hover')).toBe('b')
    expect(canvas().querySelectorAll('.cmHoverPoint')).toHaveLength(4)
    expect(canvas().querySelector('[data-edge-handle="b"]')).toHaveClass('cmEdgeHandle--soft')
  })

  it('adds a point where the larger handle is when it is clicked', async () => {
    await open()
    select('a', 70, 110)
    expect(pointsText()).toEqual(['4 of 60'])
    hoverAt(80, 100)
    pointer(canvas(), 'pointerdown', pixelOf(80, 100))
    pointer(canvas(), 'pointerup')
    expect(pointsText()).toEqual(['5 of 60'])
  })

  it('selects an unselected shape instead when its outline is clicked', async () => {
    await open()
    hoverAt(100, 160)
    pointer(canvas(), 'pointerdown', pixelOf(100, 160))
    pointer(canvas(), 'pointerup')
    expect(canvas().querySelector('[data-ring="b"]')).not.toBeNull()
  })
})

describe('a click on a point', () => {
  it('steps its handles: none, both, the incoming one, the outgoing one, and round again', async () => {
    await open()
    select('a', 70, 110)
    const dot = () => canvas().querySelector('.cmPoint')!
    expect(dot()).toHaveClass('cmPoint--sharp')
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      pointer(dot(), 'pointerdown', pixelOf(60, 100))
      pointer(canvas(), 'pointerup')
      for (const name of ['Sharp', 'Curve', 'Curve, then sharp', 'Sharp, then curve']) if (modeChip(name).getAttribute('aria-pressed') === 'true') seen.push(name)
    }
    expect(seen).toEqual(['Curve', 'Curve, then sharp', 'Sharp, then curve', 'Sharp'])
  })

  it('is one undo step, and a drag of the point moves it instead and leaves its handles alone', async () => {
    const { user } = await open()
    select('a', 70, 110)
    const dot = () => canvas().querySelector('.cmPoint')!
    const start = pixelOf(60, 100)
    pointer(dot(), 'pointerdown', start)
    pointer(canvas(), 'pointerup')
    expect(modeChip('Curve')).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(modeChip('Sharp')).toHaveAttribute('aria-pressed', 'true')
    const d0 = pathOf('a').getAttribute('d')
    pointer(dot(), 'pointerdown', start)
    pointer(canvas(), 'pointermove', { x: start.x - 40, y: start.y - 30 })
    pointer(canvas(), 'pointerup')
    expect(pathOf('a').getAttribute('d')).not.toBe(d0)
    expect(modeChip('Sharp')).toHaveAttribute('aria-pressed', 'true')
  })

  it('grows while the pointer is over it', async () => {
    await open()
    select('a', 70, 110)
    const dot = () => canvas().querySelectorAll('.cmPoint')[1]
    const quiet = Number(dot().getAttribute('r'))
    hoverAt(100, 100)
    expect(dot()).toHaveClass('cmPoint--hover')
    expect(Number(dot().getAttribute('r'))).toBeGreaterThan(quiet)
    hoverAt(20, 20)
    expect(dot()).not.toHaveClass('cmPoint--hover')
  })
})

describe('the crossing of two outlines', () => {
  const draft = (backend: { entries: Array<{ draft: ModelContent }> }) => backend.entries[0].draft
  const click = async (user: ReturnType<typeof userEvent.setup>, wx: number, wy: number) => {
    hoverAt(wx, wy)
    pointer(canvas(), 'pointerdown', pixelOf(wx, wy))
    pointer(canvas(), 'pointerup')
    await user.click(screen.getByRole('button', { name: 'Save' }))
  }

  it('offers a lock when the pointer is over it, and not elsewhere', async () => {
    await open()
    select('a', 70, 110)
    hoverAt(100, 120)
    expect(canvas().querySelector('[data-cross="0"]')).not.toBeNull()
    hoverAt(20, 20)
    expect(canvas().querySelector('[data-cross]')).toBeNull()
  })

  it('locks onto the edge on a first click, welds on a second and lets go on a third', async () => {
    const { user, backend } = await open()
    select('a', 70, 110)
    await click(user, 100, 120)
    await waitFor(() => expect(draft(backend).shapes.find(s => s.id === 'a')!.pts).toHaveLength(5))
    const a1 = draft(backend).shapes.find(s => s.id === 'a')!
    expect(a1.pts.find(p => p.bind)!.bind).toMatchObject({ kind: 'edge', s: 'b' })
    hoverAt(100, 120)
    expect(canvas().querySelector('[data-cross="1"]')).not.toBeNull()

    await click(user, 100, 120)
    await waitFor(() => expect(draft(backend).shapes.find(s => s.id === 'b')!.pts).toHaveLength(5))
    expect(draft(backend).shapes.find(s => s.id === 'a')!.pts.find(p => p.bind)!.bind).toMatchObject({ kind: 'point', s: 'b', d: [0, 0] })
    hoverAt(100, 120)
    expect(canvas().querySelector('[data-cross="2"]')).not.toBeNull()

    await click(user, 100, 120)
    await waitFor(() => expect(draft(backend).shapes.find(s => s.id === 'a')!.pts.some(p => p.bind)).toBe(false))
    expect(draft(backend).shapes.find(s => s.id === 'a')!.pts).toHaveLength(5)
    expect(draft(backend).shapes.find(s => s.id === 'b')!.pts).toHaveLength(5)
  })

  it('is not offered in the back view, where a lock would not be made in the space of the model itself', async () => {
    const { user } = await open()
    select('a', 70, 110)
    await user.click(screen.getByRole('button', { name: 'Back view' }))
    hoverAt(100, 120)   // the crossing lies on the mirror line, so it is at the same place from behind
    expect(canvas().querySelector('[data-cross]')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Front view' }))
    hoverAt(100, 120)
    expect(canvas().querySelector('[data-cross="0"]')).not.toBeNull()
  })
})

describe('the alignment guides', () => {
  it('show where a dragged shape lines up with another, and snap to it', async () => {
    const { user } = await open()
    select('a', 70, 110)
    await user.click(screen.getByRole('button', { name: 'Move shape' }))
    const from = pixelOf(70, 110)
    pointer(pathOf('a'), 'pointerdown', from)
    const to = pixelOf(89.8, 110)   // A's left side (60) is then 79.8: next to B's left side at 80
    pointer(canvas(), 'pointermove', to)
    const guide = canvas().querySelector('line.cmGuide[data-guide="x"]')
    expect(guide).not.toBeNull()
    expect(Number(guide!.getAttribute('x1'))).toBeCloseTo(80, 5)
    expect(pathOf('a').getAttribute('d')).toMatch(/^M80 100/)
    pointer(canvas(), 'pointerup')
    expect(canvas().querySelector('line.cmGuide')).toBeNull()
  })

  it('are not drawn, and do not snap, when the layer is switched off', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Alignment guides' }))
    select('a', 70, 110)
    await user.click(screen.getByRole('button', { name: 'Move shape' }))
    const from = pixelOf(70, 110)
    pointer(pathOf('a'), 'pointerdown', from)
    pointer(canvas(), 'pointermove', pixelOf(89.8, 110))
    expect(canvas().querySelector('line.cmGuide')).toBeNull()
    expect(pathOf('a').getAttribute('d')).not.toMatch(/^M80 100/)
    pointer(canvas(), 'pointerup')
  })
})
