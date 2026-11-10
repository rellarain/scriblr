import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelEntry } from '../../../../api/types'
import { getKv } from '../../../../settings/settingsStore'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { holdTile } from '../../../../test/tileDrag'
import CharacterModelsConsole from './CharacterModelsConsole'

// The designer is a grid of tiles: the tree, the canvas with its toolbar, the inspector, the previews and the checks.
vi.setConfig({ testTimeout: 30000 })

const GRID = 'scriblr.tiles.characters.designer'
const TILES = ['Tree', 'Canvas', 'Inspector', 'Previews', 'Checks']

async function open() {
  const backend = modelsBackend([draftEntry('a', content('Adult'))] as ModelEntry[])
  const user = userEvent.setup()
  const view = render(<CharacterModelsConsole />)
  await screen.findByRole('heading', { name: 'Character models' })
  return { backend, user, view }
}

const tile = (name: string) => screen.getByRole('region', { name })
const rail = () => screen.getByRole('toolbar', { name: 'Designer tiles tabs' })
const tab = (name: string) => within(rail()).getByRole('button', { name })
const rectOf = (name: string) => { const el = tile(name); return { x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height) } }
const middle = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

describe('the designer as tiles', () => {
  it('is a grid of five tiles, with an icon for each in the tab bar above them', async () => {
    await open()
    for (const name of TILES) {
      expect(tile(name)).toBeInTheDocument()
      expect(tab(name)).toHaveAttribute('aria-pressed', 'true')
    }
    expect(within(tile('Tree')).getByRole('navigation', { name: 'Model tree' })).toBeInTheDocument()
    expect(within(tile('Canvas')).getByRole('toolbar', { name: 'Designer tools' })).toBeInTheDocument()
    expect(within(tile('Canvas')).getByRole('application')).toBeInTheDocument()
    expect(within(tile('Inspector')).getByRole('tablist', { name: 'Inspector tabs' })).toBeInTheDocument()
  })

  it('begins with the tree, the canvas and the inspector side by side over the previews and the checks', async () => {
    await open()
    const [tree, canvas, inspector, previews, checks] = TILES.map(rectOf)
    expect(tree.x).toBeLessThan(canvas.x)
    expect(canvas.x).toBeLessThan(inspector.x)
    expect(tree.y).toBe(canvas.y)
    expect(canvas.y).toBe(inspector.y)
    expect(previews.y).toBeGreaterThan(tree.y + tree.h - 1)
    expect(previews.y).toBe(checks.y)
    expect(previews.x).toBeLessThan(checks.x)
    expect(canvas.w).toBeGreaterThan(tree.w)
    expect(canvas.w).toBeGreaterThan(inspector.w)
  })

  it('puts a tile away from its icon in the tab bar and brings it back', async () => {
    const { user } = await open()
    await user.click(tab('Inspector'))
    expect(screen.queryByRole('region', { name: 'Inspector' })).toBeNull()
    expect(tab('Inspector')).toHaveAttribute('aria-pressed', 'false')
    // the others take the room
    expect(rectOf('Canvas').w).toBeGreaterThan(rectOf('Tree').w * 2)
    await user.click(tab('Inspector'))
    expect(tile('Inspector')).toBeInTheDocument()
    expect(tab('Inspector')).toHaveAttribute('aria-pressed', 'true')
  })

  it('remembers the tiles that were put away when the designer is opened again', async () => {
    const { user, view } = await open()
    await user.click(tab('Previews'))
    view.unmount()
    render(<CharacterModelsConsole />)
    await screen.findByRole('heading', { name: 'Character models' })
    expect(screen.queryByRole('region', { name: 'Previews' })).toBeNull()
    expect(tab('Previews')).toHaveAttribute('aria-pressed', 'false')
    expect(tile('Checks')).toBeInTheDocument()
  })

  it('moves a tile by its title bar: dropped on the middle of another it swaps places, and it stays there', async () => {
    const { view } = await open()
    const [previews, checks] = [rectOf('Previews'), rectOf('Checks')]
    const held = holdTile(screen.getByRole('heading', { name: 'Previews' }), { x: previews.x + 20, y: previews.y + 10 })
    held.moveTo(middle(checks).x, middle(checks).y)
    held.drop()
    expect(rectOf('Previews').x).toBeCloseTo(checks.x, 0)
    expect(rectOf('Checks').x).toBeCloseTo(previews.x, 0)
    expect(getKv<{ tree: unknown }>(GRID)?.tree).toBeTruthy()
    view.unmount()
    render(<CharacterModelsConsole />)
    await screen.findByRole('heading', { name: 'Character models' })
    expect(rectOf('Previews').x).toBeCloseTo(checks.x, 0)
  })

  it('is resized by a divider with the arrow keys', async () => {
    await open()
    const before = rectOf('Tree').w
    const dividers = screen.getAllByRole('separator')
    expect(dividers.length).toBeGreaterThanOrEqual(4)
    const divider = dividers.find(d => d.getAttribute('aria-valuenow') === '20')!
    divider.focus()
    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    expect(rectOf('Tree').w).not.toBe(before)
  })

  it('Reset layout puts the tiles back where they began and opens the ones that were put away', async () => {
    const { user } = await open()
    const first = TILES.map(rectOf)
    await user.click(tab('Checks'))
    const [previews, checks] = [rectOf('Previews'), rectOf('Tree')]
    const held = holdTile(screen.getByRole('heading', { name: 'Previews' }), { x: previews.x + 20, y: previews.y + 10 })
    held.moveTo(middle(checks).x, middle(checks).y)
    held.drop()
    expect(rectOf('Previews').y).not.toBe(first[3].y)
    await user.click(screen.getByRole('button', { name: 'Reset layout' }))
    expect(tile('Checks')).toBeInTheDocument()
    expect(TILES.map(rectOf)).toEqual(first)
    expect(tab('Checks')).toHaveAttribute('aria-pressed', 'true')
  })

  it('lets the canvas fill the whole area, and puts it back', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Maximize Canvas' }))
    expect(screen.queryByRole('region', { name: 'Inspector' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Tree' })).toBeNull()
    expect(within(tile('Canvas')).getByRole('application')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore Canvas' }))
    for (const name of TILES) expect(tile(name)).toBeInTheDocument()
  })
})
