import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ResourceNode } from '../../../../api/types'
import ResourceTree from './ResourceTree'

function node(id: string, kind: ResourceNode['kind'], parentId: string | null, order: number, name: string): ResourceNode {
  return { id, kind, parentId, order, name }
}

describe('ResourceTree', () => {
  it('renders a node with its caret after the label, not before it', () => {
    const writer = node('writer', 'interface', null, 0, 'Writer')
    const shelf = node('writer/shelf', 'console', 'writer', 0, 'Shelf')
    const childrenOf = (parentId: string | null) => (parentId === null ? [writer] : parentId === 'writer' ? [shelf] : [])
    render(
      <ResourceTree
        childrenOf={childrenOf} selectedId={null} onSelect={vi.fn()} onAddChild={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()}
      />,
    )
    const row = screen.getByDisplayValue('Writer').closest('.resTreeRow') as HTMLElement
    const children = Array.from(row.children)
    const labelIndex = children.findIndex(el => el.tagName === 'INPUT')
    const caretIndex = children.findIndex(el => el.className.includes('resTreeCaret'))
    expect(caretIndex).toBeGreaterThan(labelIndex)
  })

  it('selecting a row calls onSelect with its id', () => {
    const writer = node('writer', 'interface', null, 0, 'Writer')
    const childrenOf = (parentId: string | null) => (parentId === null ? [writer] : [])
    const onSelect = vi.fn()
    render(<ResourceTree childrenOf={childrenOf} selectedId={null} onSelect={onSelect} onAddChild={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByDisplayValue('Writer').closest('.resTreeRow')!)
    expect(onSelect).toHaveBeenCalledWith('writer')
  })

  it('typing in the label calls onRename, without triggering onSelect', () => {
    const writer = node('writer', 'interface', null, 0, 'Writer')
    const childrenOf = (parentId: string | null) => (parentId === null ? [writer] : [])
    const onRename = vi.fn()
    const onSelect = vi.fn()
    render(<ResourceTree childrenOf={childrenOf} selectedId={null} onSelect={onSelect} onAddChild={vi.fn()} onRename={onRename} onDelete={vi.fn()} />)
    fireEvent.change(screen.getByDisplayValue('Writer'), { target: { value: 'Writer!' } })
    expect(onRename).toHaveBeenCalledWith('writer', 'Writer!')
  })

  it('collapsing a node with children hides them, expanding shows them again', () => {
    const writer = node('writer', 'interface', null, 0, 'Writer')
    const shelf = node('writer/shelf', 'console', 'writer', 0, 'Shelf')
    const childrenOf = (parentId: string | null) => (parentId === null ? [writer] : parentId === 'writer' ? [shelf] : [])
    render(<ResourceTree childrenOf={childrenOf} selectedId={null} onSelect={vi.fn()} onAddChild={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByDisplayValue('Shelf')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
    expect(screen.queryByDisplayValue('Shelf')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByDisplayValue('Shelf')).toBeTruthy()
  })

  it('add-child calls onAddChild with the parent id and the next kind down', () => {
    const writer = node('writer', 'interface', null, 0, 'Writer')
    const childrenOf = (parentId: string | null) => (parentId === null ? [writer] : [])
    const onAddChild = vi.fn()
    render(<ResourceTree childrenOf={childrenOf} selectedId={null} onSelect={vi.fn()} onAddChild={onAddChild} onRename={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Console under Writer' }))
    expect(onAddChild).toHaveBeenCalledWith('writer', 'console')
  })

  it('deleting a node needs a confirm click', () => {
    const writer = node('writer', 'interface', null, 0, 'Writer')
    const childrenOf = (parentId: string | null) => (parentId === null ? [writer] : [])
    const onDelete = vi.fn()
    render(<ResourceTree childrenOf={childrenOf} selectedId={null} onSelect={vi.fn()} onAddChild={vi.fn()} onRename={vi.fn()} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Writer' }))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Confirm'))
    expect(onDelete).toHaveBeenCalledWith('writer')
  })

  it('the root "Add interface" button adds a top-level interface node', () => {
    const childrenOf = () => []
    const onAddChild = vi.fn()
    render(<ResourceTree childrenOf={childrenOf} selectedId={null} onSelect={vi.fn()} onAddChild={onAddChild} onRename={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Add interface/ }))
    expect(onAddChild).toHaveBeenCalledWith(null, 'interface')
  })
})
