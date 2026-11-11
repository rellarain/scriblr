import { readFileSync } from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelEntry } from '../../../../api/types'
import { getKv } from '../../../../settings/settingsStore'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { openDrawer } from '../../../../test/designerUi'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// The Designer's layout: the canvas fills the console, with four toolbars over its edges: the tree (left), the editor (right), the view controls (the footer) and the
// console tools (the header: undo, redo, save, publish).
vi.setConfig({ testTimeout: 30000 })

// A model with one shape, so there is something on the canvas.
function adult() {
  let c = addGroup(content('Adult'), newGroup('g', 'Torso'))
  c = addObject(c, 'g', { id: 'o', name: 'Torso part', layer: 'body', shapes: [] })
  return addShape(c, 'o', newShape('torso', 'Torso shape', 'rounded', { x: 70, y: 40, w: 60, h: 100 }))
}

async function open(host: HTMLElement | null = null) {
  const backend = modelsBackend([draftEntry('a', adult())] as ModelEntry[])
  const user = userEvent.setup()
  const view = render(<DesignerConsole toolbarHost={host} />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user, view }
}

const canvas = () => screen.getByRole('application')
const viewBar = () => within(screen.getByRole('toolbar', { name: 'View controls' }))
const layers = () => viewBar().getAllByRole('button').filter(b => b.hasAttribute('data-layer-id')).map(b => b.getAttribute('data-layer-id'))
const layerBtn = (name: string) => viewBar().getByRole('button', { name })
const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('the Designer\'s toolbars', () => {
  it('has the canvas under four toolbars: the tree, the editor, the view controls and the console tools', async () => {
    await open()
    expect(canvas()).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Tree tools' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Editor tools' })).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'View controls' })).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Console tools' })).toBeInTheDocument()
    expect(within(screen.getByRole('complementary', { name: 'Tree tools' })).getByRole('navigation', { name: 'Model tree' })).toBeInTheDocument()
    expect(within(screen.getByRole('complementary', { name: 'Editor tools' })).getByRole('tablist', { name: 'Inspector tabs' })).toBeInTheDocument()
  })

  it('puts the console tools in the console\'s header when it has one, and at the top when it has not', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    const { view } = await open(host)
    expect(within(host).getByRole('toolbar', { name: 'Console tools' })).toBeInTheDocument()
    view.unmount()
    host.remove()
    await open()
    expect(screen.getByRole('toolbar', { name: 'Console tools' })).toBeInTheDocument()
  })

  it('has undo, redo, save and publish in the console tools', async () => {
    const { user } = await open()
    const bar = within(screen.getByRole('toolbar', { name: 'Console tools' }))
    for (const name of ['Undo', 'Redo', 'Save', 'Publish']) expect(bar.getByRole('button', { name })).toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(bar.getByRole('button', { name: 'Redo' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Model name' }), { target: { value: 'Grown-up' } })
    await user.click(screen.getByRole('button', { name: 'Fit to screen' }))
    expect(bar.getByRole('button', { name: 'Publish' })).toBeEnabled()
  })
})

describe('the side toolbars', () => {
  it('fold away to a slim rail and open again, and stay as they were left', async () => {
    const { user, view } = await open()
    const tree = () => screen.getByRole('complementary', { name: 'Tree tools' })
    await user.click(within(tree()).getByRole('button', { name: 'Fold the Tree' }))
    expect(within(tree()).queryByRole('navigation', { name: 'Model tree' })).toBeNull()
    expect(within(tree()).getByRole('button', { name: 'Open the Tree' })).toHaveAttribute('aria-expanded', 'false')
    expect(getKv<{ left: { open: boolean } }>('scriblr.designer.panels')?.left.open).toBe(false)
    view.unmount()
    await open()
    expect(within(tree()).getByRole('button', { name: 'Open the Tree' })).toBeInTheDocument()
    await user.click(within(tree()).getByRole('button', { name: 'Open the Tree' }))
    expect(within(tree()).getByRole('navigation', { name: 'Model tree' })).toBeInTheDocument()
  })

  it('are resized by their edge with the arrow keys, within limits', async () => {
    await open()
    const edge = screen.getByRole('separator', { name: 'Editor width' })
    const w0 = Number(edge.getAttribute('aria-valuenow'))
    expect(w0).toBeGreaterThanOrEqual(280)
    fireEvent.keyDown(edge, { key: 'ArrowLeft' })   // the editor is on the right: its edge is on its left, and moving the edge left widens it
    expect(Number(screen.getByRole('separator', { name: 'Editor width' }).getAttribute('aria-valuenow'))).toBeGreaterThan(w0)
    for (let i = 0; i < 60; i++) fireEvent.keyDown(screen.getByRole('separator', { name: 'Editor width' }), { key: 'ArrowLeft', shiftKey: true })
    expect(Number(screen.getByRole('separator', { name: 'Editor width' }).getAttribute('aria-valuenow'))).toBeLessThanOrEqual(600)
  })
})

describe('a narrow console', () => {
  it('has room for one side toolbar at a time: the editor is a rail until the tree is folded, and opening it folds the tree', async () => {
    const callbacks: Array<() => void> = []
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { callbacks.push(cb) } observe() {} unobserve() {} disconnect() {} })
    const { user, view } = await open()
    const stage = view.container.querySelector('.dzStage') as HTMLElement
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 500, bottom: 520, width: 500, height: 520, toJSON: () => ({}) } as DOMRect)
    act(() => { callbacks.forEach(cb => cb()) })
    const tree = () => screen.getByRole('complementary', { name: 'Tree tools' }), editor = () => screen.getByRole('complementary', { name: 'Editor tools' })
    expect(within(tree()).getByRole('navigation', { name: 'Model tree' })).toBeInTheDocument()
    expect(within(editor()).getByRole('button', { name: 'Open the Editor' })).toBeInTheDocument()
    await user.click(within(editor()).getByRole('button', { name: 'Open the Editor' }))
    expect(within(editor()).getByRole('tablist', { name: 'Inspector tabs' })).toBeInTheDocument()
    expect(within(tree()).getByRole('button', { name: 'Open the Tree' })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})

describe('the view toolbar', () => {
  it('has a toggle for each layer of the canvas, the leftmost drawn on top', async () => {
    await open()
    expect(layers()).toEqual(['weights', 'points', 'outlines', 'pivots', 'guides', 'mirror', 'ghost', 'figure', 'gridlines'])
    for (const name of ['Gridlines', 'Alignment guides', 'Shape outlines', 'Shape points', 'Mirror line', 'Pivots, anchors and links', 'Pattern ghost and frames', 'Weights and curve handles', 'The figure']) {
      expect(layerBtn(name)).toHaveAttribute('aria-pressed', 'true')
    }
    // the gridlines are the lowest layer, under the painted figure
    const grid = canvas().querySelector('[data-layer="gridlines"]')!, shape = canvas().querySelector('path[data-shape]')!
    expect(follows(grid, shape)).toBe(true)
  })

  it('hides and shows a layer with a click, and remembers it', async () => {
    const { user, view } = await open()
    expect(canvas().querySelector('line.cmGridLine')).not.toBeNull()
    await user.click(layerBtn('Gridlines'))
    expect(layerBtn('Gridlines')).toHaveAttribute('aria-pressed', 'false')
    expect(canvas().querySelector('line.cmGridLine')).toBeNull()
    expect(canvas().querySelector('line.cmMirrorLine')).not.toBeNull()
    await user.click(layerBtn('Mirror line'))
    expect(canvas().querySelector('line.cmMirrorLine')).toBeNull()
    view.unmount()
    await open()
    expect(layerBtn('Gridlines')).toHaveAttribute('aria-pressed', 'false')
    expect(layerBtn('Mirror line')).toHaveAttribute('aria-pressed', 'false')
    expect(layerBtn('Shape points')).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not hide the figure', async () => {
    const { user } = await open()
    await user.click(layerBtn('The figure'))
    expect(layerBtn('The figure')).toHaveAttribute('aria-pressed', 'true')
    expect(canvas().querySelector('path[data-shape]')).not.toBeNull()
  })

  it('reorders the layers with Alt and the arrow keys, and draws the leftmost on top', async () => {
    const { view } = await open()
    const grid = () => canvas().querySelector('[data-layer="gridlines"]')!
    // move the gridlines left, past the figure: they are then drawn over it
    fireEvent.keyDown(layerBtn('Gridlines'), { key: 'ArrowLeft', altKey: true })
    expect(layers().slice(-2)).toEqual(['gridlines', 'figure'])
    expect(follows(canvas().querySelector('path[data-shape]')!, grid())).toBe(true)
    // and back
    fireEvent.keyDown(layerBtn('Gridlines'), { key: 'ArrowRight', altKey: true })
    expect(layers().slice(-2)).toEqual(['figure', 'gridlines'])
    fireEvent.keyDown(layerBtn('Gridlines'), { key: 'ArrowLeft', altKey: true })
    view.unmount()
    await open()
    expect(layers().slice(-2)).toEqual(['gridlines', 'figure'])
  })

  it('reorders the layers by dragging a toggle sideways', async () => {
    await open()
    const row = viewBar().getByRole('group', { name: /Canvas layers/ })
    const rects: Record<string, DOMRect> = {}
    for (const [i, b] of Array.from(row.querySelectorAll<HTMLElement>('[data-layer-id]')).entries()) {
      rects[b.dataset.layerId!] = { x: i * 30, y: 0, left: i * 30, top: 0, right: i * 30 + 28, bottom: 28, width: 28, height: 28, toJSON: () => ({}) } as DOMRect
      vi.spyOn(b, 'getBoundingClientRect').mockReturnValue(rects[b.dataset.layerId!])
    }
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 270, bottom: 28, width: 270, height: 28, toJSON: () => ({}) } as DOMRect)
    const gridlines = layerBtn('Gridlines')
    fireEvent(gridlines, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 8 * 30 + 10, clientY: 10 }))
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 8 * 30 - 20, clientY: 10 })) })
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 8, clientY: 10 })) })
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 8, clientY: 10 })) })
    expect(layers()[0]).toBe('gridlines')
    expect(layers()).toHaveLength(9)
  })
})

describe('the zoom', () => {
  const zoom = () => screen.getByRole('slider', { name: 'Zoom' })
  const width = () => Number(canvas().getAttribute('viewBox')!.split(' ')[2])
  const wheel = (el: Element, deltaY: number) => act(() => { el.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })) })

  it('is a range slider to the right of the fit toggle, and zooms with it', async () => {
    await open()
    expect(follows(screen.getByRole('button', { name: 'Fit to screen' }), zoom())).toBe(true)
    const w0 = width()
    fireEvent.change(zoom(), { target: { value: '0.9' } })
    expect(width()).toBeLessThan(w0)
    expect(zoom()).toHaveAttribute('aria-valuetext', expect.stringMatching(/%$/))
  })

  it('zooms in when the wheel scrolls down over it and out when it scrolls up', async () => {
    await open()
    const w0 = width()
    wheel(zoom(), 100)
    const closer = width()
    expect(closer).toBeLessThan(w0)
    wheel(zoom(), -100)
    wheel(zoom(), -100)
    expect(width()).toBeGreaterThan(closer)
  })

  it('stops at the ends of the slider', async () => {
    await open()
    for (let i = 0; i < 40; i++) wheel(zoom(), 100)
    expect(Number((zoom() as HTMLInputElement).value)).toBeLessThanOrEqual(1)
    for (let i = 0; i < 80; i++) wheel(zoom(), -100)
    expect(Number((zoom() as HTMLInputElement).value)).toBeGreaterThanOrEqual(0)
  })
})

describe('the previews and checks drawer', () => {
  it('opens from the footer and shows the previews and the checks, and closes again', async () => {
    const { user } = await open()
    const button = () => screen.getByRole('button', { name: /^Previews and checks/ })
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'Previews' })).toBeNull()
    await openDrawer(user)
    expect(button()).toHaveAttribute('aria-expanded', 'true')
    const drawer = within(screen.getByRole('region', { name: 'Previews and checks' }))
    expect(drawer.getByRole('region', { name: 'Previews' })).toBeInTheDocument()
    expect(drawer.getByRole('region', { name: 'Checks' })).toBeInTheDocument()
    await user.click(button())
    expect(screen.queryByRole('region', { name: 'Previews and checks' })).toBeNull()
  })
})

describe('the Designer fills its console', () => {
  // jsdom cannot lay anything out, so the rules are read from the stylesheet (the real layout is checked in the browser): the view toolbar lies along the bottom of the stage, so
  // the stage must reach the bottom of the console. A fixed height on it leaves a gap under the toolbar whenever the console is taller.
  const css = readFileSync(path.resolve(__dirname, 'characterModels.scss'), 'utf-8')
  const block = (selector: string) => new RegExp(`^${selector.replace(/[.\-]/g, '\\$&')} \\{[^}]*\\}`, 'm').exec(css)?.[0] ?? ''

  it('lets the stage grow into the console, with a height of its own only as a floor', () => {
    const stage = block('.dzStage')
    expect(stage).toMatch(/flex: 1 1 auto/)
    expect(stage).toMatch(/min-height: clamp\(/)
    expect(stage).not.toMatch(/(^|[\s;{])height:/)
  })

  it('makes the fieldset round the stage a column that fills the pane, so the stage can grow', () => {
    const fieldset = block('.dzFieldset')
    expect(fieldset).toMatch(/display: flex; flex-direction: column/)
    expect(fieldset).toMatch(/flex: 1 1 auto/)
  })

  it('pins the view toolbar to the bottom of the stage', () => {
    expect(block('.dzFoot')).toMatch(/position: absolute; bottom: 0/)
  })
})
