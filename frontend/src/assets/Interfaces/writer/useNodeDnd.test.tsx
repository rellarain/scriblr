import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode } from '../../../api/types'
import { makeWorkspace } from '../../../test/makeWorkspace'
import * as outlineTree from './outlineTree'
import { useNodeDnd } from './useNodeDnd'

function node(id: string, kind: OutlineNode['kind'], parentId: string | null, order = 0): OutlineNode {
  return { id, kind, parentId, order, title: id } as OutlineNode
}

const NODES = [
  node('b', 'book', null),
  node('c1', 'chapter', 'b', 0),
  node('c2', 'chapter', 'b', 1),
  node('c3', 'chapter', 'b', 2),
]

function Board({ nodes }: { nodes: OutlineNode[] }) {
  const w = makeWorkspace({ outlineNodes: nodes, moveOutlineNodeInto: () => {} })
  const dnd = useNodeDnd(w)
  const chapters = nodes.filter(n => n.kind === 'chapter')
  return (
    <div>
      {chapters.map(c => <span key={c.id} data-node={c.id} data-testid={`grip-${c.id}`} {...dnd.gripProps(c.id)} />)}
      {dnd.children('b', chapters, c => <i key={c.id} />)}
    </div>
  )
}

describe('useNodeDnd', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('works out each gap once for the node being dragged, however often it renders', () => {
    const moveNodeTo = vi.spyOn(outlineTree, 'moveNodeTo')
    const { getByTestId, container, rerender } = render(<Board nodes={NODES} />)
    expect(moveNodeTo).not.toHaveBeenCalled()

    fireEvent.dragStart(getByTestId('grip-c1'), { dataTransfer: { setData() {}, setDragImage() {}, effectAllowed: '' } })
    const gaps = container.querySelectorAll('.wrDropGap').length
    expect(gaps).toBe(4) // before each of the three chapters, and after the last
    expect(moveNodeTo).toHaveBeenCalledTimes(gaps)

    // Hovering over gaps and re-rendering asks nothing more.
    const first = container.querySelector('.wrDropGap--open') as HTMLElement
    act(() => { fireEvent.dragOver(first) })
    rerender(<Board nodes={NODES} />)
    expect(moveNodeTo).toHaveBeenCalledTimes(gaps)
  })

  it('asks again when the outline changes under the drag', () => {
    const moveNodeTo = vi.spyOn(outlineTree, 'moveNodeTo')
    const { getByTestId, container, rerender } = render(<Board nodes={NODES} />)
    fireEvent.dragStart(getByTestId('grip-c1'), { dataTransfer: { setData() {}, setDragImage() {}, effectAllowed: '' } })
    const before = moveNodeTo.mock.calls.length
    rerender(<Board nodes={[...NODES, node('c4', 'chapter', 'b', 3)]} />)
    expect(container.querySelectorAll('.wrDropGap').length).toBe(5)
    expect(moveNodeTo.mock.calls.length).toBeGreaterThan(before)
  })

  it('keeps the drop gaps closed when nothing is being dragged', () => {
    const { container } = render(<Board nodes={NODES} />)
    expect(container.querySelectorAll('.wrDropGap--open').length).toBe(0)
  })
})
