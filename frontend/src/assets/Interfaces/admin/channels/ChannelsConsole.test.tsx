import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as channelsApi from '../../../../api/channelsApi'
import * as resourcesApi from '../../../../api/resourcesApi'
import { ApiError } from '../../../../api/client'
import type { ResourceNode, ResourcesFile } from '../../../../api/types'
import ChannelsConsole from './ChannelsConsole'

const n = (id: string, kind: ResourceNode['kind'], order: number, name: string): ResourceNode => ({
  id, kind, order, name, parentId: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : null,
})

const NODES = [
  n('writer', 'interface', 0, 'Writer'),
  n('writer/dashboard', 'console', 0, 'Dashboard'),
  n('writer/draft', 'console', 1, 'Draft'),
  n('writer/draft/draft', 'component', 0, 'Draft'),
]

const file = (nodes: ResourceNode[]): ResourcesFile => ({ schemaVersion: 1, nodes, content: {}, assessments: {}, screensVersion: 1 })

async function open() {
  vi.spyOn(channelsApi, 'getChannels').mockResolvedValue({ nodes: NODES })
  render(<ChannelsConsole />)
  return screen.findByRole('tree', { name: 'Channels' })
}

const names = () => screen.getAllByRole('textbox').map(i => (i as HTMLInputElement).value)

describe('Configuration > Channels', () => {
  it('lists the channel list as a tree, each node with its kind', async () => {
    await open()
    expect(names()).toEqual(['Writer', 'Dashboard', 'Draft', 'Draft'])
    expect(screen.getAllByText('Component')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Hide what is in Writer' }))
    expect(names()).toEqual(['Writer'])
  })

  it('renames a node when its name field is left, and Escape puts the name back', async () => {
    await open()
    const rename = vi.spyOn(resourcesApi, 'renameResourceNode').mockResolvedValue(file(NODES.map(x => (x.id === 'writer/dashboard' ? { ...x, name: 'Desk' } : x))))
    const field = screen.getByDisplayValue('Dashboard')
    fireEvent.change(field, { target: { value: 'Desk' } })
    await act(async () => { fireEvent.blur(field) })
    expect(rename).toHaveBeenCalledWith('writer/dashboard', 'Desk')
    expect(screen.getByDisplayValue('Desk')).toBeTruthy()
    fireEvent.change(screen.getByDisplayValue('Desk'), { target: { value: 'Typo' } })
    fireEvent.keyDown(screen.getByDisplayValue('Typo'), { key: 'Escape' })
    expect(screen.getByDisplayValue('Desk')).toBeTruthy()
  })

  it('adds the next kind down under a node, and an interface at the top', async () => {
    await open()
    const add = vi.spyOn(resourcesApi, 'addResourceNode').mockResolvedValue(file([...NODES, n('writer/draft/draft/new', 'feature', 0, '')]))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add a feature to Draft' })) })
    expect(add).toHaveBeenCalledWith('writer/draft/draft', 'feature')
    expect(screen.getByPlaceholderText('Untitled feature')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add an interface' })) })
    expect(add).toHaveBeenLastCalledWith(null, 'interface')
  })

  it('asks before deleting, and shows why a node something points at cannot go', async () => {
    await open()
    const del = vi.spyOn(resourcesApi, 'deleteResourceNode').mockRejectedValue(new ApiError(409, 'still used by 2 feedback messages'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Dashboard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(del).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Dashboard' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete Dashboard and everything under it' })) })
    expect(del).toHaveBeenCalledWith('writer/dashboard')
    expect((await screen.findByRole('alert')).textContent).toBe('still used by 2 feedback messages')
  })

  it('moves a node among its siblings with Alt and an arrow on its grip', async () => {
    await open()
    const reorder = vi.spyOn(resourcesApi, 'reorderResourceNodes').mockResolvedValue(file(NODES.map(x => (
      x.id === 'writer/draft' ? { ...x, order: 0 } : x.id === 'writer/dashboard' ? { ...x, order: 1 } : x))))
    const tree = screen.getByRole('tree', { name: 'Channels' })
    await act(async () => { fireEvent.keyDown(within(tree).getAllByRole('button', { name: 'Move Draft' })[0], { key: 'ArrowUp', altKey: true }) })
    expect(reorder).toHaveBeenCalledWith('writer', ['writer/draft', 'writer/dashboard'])
    await waitFor(() => expect(names()).toEqual(['Writer', 'Draft', 'Draft', 'Dashboard']))
  })
})
