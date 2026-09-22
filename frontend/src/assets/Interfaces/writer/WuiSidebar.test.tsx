import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OutlineNode } from '../../../api/types'
import WuiSidebar from './WuiSidebar'
import type { WriterWorkspace } from './useWriterWorkspace'

const outline = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)

function closed(): WriterWorkspace {
  return {
    hasOpenProject: false, projects: [], projectsStatus: 'idle', projectOutlines: {}, loadProjects: vi.fn(),
  } as unknown as WriterWorkspace
}

function open(): WriterWorkspace {
  const nodes = [outline('b1', 'book', null, { title: 'Book One' }), outline('c1', 'chapter', 'b1', { title: 'Arrival' }), outline('c2', 'chapter', 'b1', { title: 'Storm', order: 1 })]
  const book = nodes[0]
  return {
    hasOpenProject: true, activeProject: { title: 'Saga' }, outlineNodes: nodes, books: [book], activeBook: book, activeBookId: 'b1',
    activeBookChapters: nodes.slice(1), activeChapter: undefined, activeChapterId: null, activeConsole: 'book', plotNodes: [],
    backToShelves: vi.fn(), showProject: vi.fn(), openBook: vi.fn(), openChapter: vi.fn(),
  } as unknown as WriterWorkspace
}

describe('WuiSidebar', () => {
  it('offers Minimize only when the main screen is narrow', () => {
    const { rerender } = render(<WuiSidebar workspace={closed()} />)
    expect(screen.queryByRole('button', { name: 'Minimize sidebar' })).toBeNull()
    rerender(<WuiSidebar workspace={closed()} canCollapse onToggleCollapsed={() => {}} />)
    expect(screen.getByRole('button', { name: 'Minimize sidebar' })).toBeTruthy()
  })

  it('minimizes to a slim rail with a button that brings the sidebar back', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<WuiSidebar workspace={open()} collapsed onToggleCollapsed={onToggle} />)
    expect(screen.queryByText('Project')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Show sidebar' }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('shows the project and book as tiles, with the chapters as navigation rows', async () => {
    const w = open()
    const user = userEvent.setup()
    const { container } = render(<WuiSidebar workspace={w} />)
    expect(container.querySelectorAll('.wrSideTile')).toHaveLength(2) // Project and Book
    await user.click(screen.getByRole('button', { name: /2 · Storm/ }))
    expect(w.openChapter).toHaveBeenCalledWith('c2')
  })
})
