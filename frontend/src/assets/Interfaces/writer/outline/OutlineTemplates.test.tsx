import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode } from '../../../../api/types'
import { templateFrom, type OutlineTemplate } from '../../../../lib/outlineTemplates'
import { getKv, setKv, __resetSettingsForTests } from '../../../../settings/settingsStore'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { mockFetch } from '../../../../test/mockFetch'
import { outlineNode } from '../plotTestWorkspace'
import { FromTemplate, SaveTemplate, TemplatesTile } from './OutlineTemplates'
import { OUTLINE_TEMPLATES_KEY } from './useOutlineTemplates'

const OUTLINE: OutlineNode[] = [
  outlineNode('b', 'book', null, { title: 'The Lantern Road' }),
  outlineNode('a1', 'arc', 'b', { title: 'Crossing', synopsis: 'She crosses.' }),
  outlineNode('c1', 'chapter', 'a1', { title: 'The Courier' }),
  outlineNode('s1', 'scene', 'c1', { location: 'The quay' }), outlineNode('s2', 'scene', 'c1', { order: 1 }),
  outlineNode('c2', 'chapter', 'a1', { title: 'Tolls', order: 1 }),
]
const stored = () => getKv<OutlineTemplate[]>(OUTLINE_TEMPLATES_KEY) ?? []
const tpl = (id: string, kind: 'book' | 'chapter', name: string, root = kind === 'book' ? 'b' : 'c1') =>
  templateFrom(OUTLINE, root, kind, name, { titles: true, summaries: true }, id, '2026-11-27T00:00:00Z')

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
})

describe('SaveTemplate', () => {
  it("saves a book's shape under a name, with its titles and summaries", async () => {
    const onClose = vi.fn()
    render(<SaveTemplate w={makeWorkspace({ outlineNodes: OUTLINE })} rootId="b" kind="book" label="Book 1" onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: 'Save Book 1 as a template' })
    expect((within(dialog).getByLabelText('Template name') as HTMLInputElement).value).toBe('The Lantern Road')
    expect(within(dialog).getByText('Arc 1 · Crossing')).toBeTruthy()
    expect(within(dialog).getByText('Chapter 1 · The Courier · 2 scenes')).toBeTruthy()
    await userEvent.clear(within(dialog).getByLabelText('Template name'))
    await userEvent.type(within(dialog).getByLabelText('Template name'), 'Three-arc mystery')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save template' }))
    expect(onClose).toHaveBeenCalled()
    expect(stored()).toHaveLength(1)
    expect(stored()[0]).toMatchObject({ kind: 'book', name: 'Three-arc mystery' })
    expect(stored()[0].nodes[0]).toMatchObject({ kind: 'arc', title: 'Crossing', synopsis: 'She crosses.' })
  })

  it('keeps only the shape when the titles and summaries are left out, and never the draft', async () => {
    render(<SaveTemplate w={makeWorkspace({ outlineNodes: OUTLINE })} rootId="b" kind="book" label="Book 1" onClose={() => {}} />)
    expect(screen.getByText(/Never the draft/)).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: 'Arcs, chapters, acts, scenes and moments' }) as HTMLInputElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Their titles' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Their summaries' }))
    expect(screen.getByText('Arc 1')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Save template' }))
    expect(stored()[0].nodes.every(n => !n.title && !n.synopsis && !n.location)).toBe(true)
  })

  it('needs a name, and Escape or Cancel close it without saving', async () => {
    const onClose = vi.fn()
    render(<SaveTemplate w={makeWorkspace({ outlineNodes: OUTLINE })} rootId="c1" kind="chapter" label="Chapter 1" onClose={onClose} />)
    expect(screen.getByRole('checkbox', { name: 'Acts, scenes and moments' })).toBeTruthy()
    await userEvent.clear(screen.getByLabelText('Template name'))
    expect((screen.getByRole('button', { name: 'Save template' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(stored()).toEqual([])
  })
})

describe('FromTemplate', () => {
  it("lists the kind's templates by name with what each holds, then the empty one", async () => {
    setKv(OUTLINE_TEMPLATES_KEY, [tpl('t1', 'book', 'Novella'), tpl('t2', 'chapter', 'Cold open'), tpl('t3', 'book', 'Mystery')])
    const onPick = vi.fn()
    const onEmpty = vi.fn()
    render(<FromTemplate kind="book" onPick={onPick} onEmpty={onEmpty} />)
    await userEvent.click(screen.getByRole('button', { name: /From a template/ }))
    const items = within(screen.getByRole('menu', { name: 'New book from' })).getAllByRole('menuitem')
    expect(items.map(i => i.textContent)).toEqual(['Mystery1 arc · 2 chapters · 2 scenes', 'Novella1 arc · 2 chapters · 2 scenes', 'An empty book'])
    expect(document.activeElement).toBe(items[0])
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(items[1])
    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', name: 'Novella' }))
    expect(screen.queryByRole('menu')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /From a template/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'An empty book' }))
    expect(onEmpty).toHaveBeenCalled()
  })

  it('says how to make one when there is none, and Escape closes it', async () => {
    render(<FromTemplate kind="chapter" onPick={() => {}} onEmpty={() => {}} />)
    const button = screen.getByRole('button', { name: /From a template/ })
    await userEvent.click(button)
    expect(screen.getByText(/No chapter templates yet/)).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})

describe('TemplatesTile', () => {
  it('lists the book and chapter templates, to rename and to delete', async () => {
    setKv(OUTLINE_TEMPLATES_KEY, [tpl('t1', 'book', 'Mystery'), tpl('t2', 'chapter', 'Cold open')])
    render(<TemplatesTile />)
    const books = screen.getByRole('region', { name: 'Book templates' })
    expect(within(books).getByText('Book templates · 1')).toBeTruthy()
    expect(within(books).getByText('1 arc · 2 chapters · 2 scenes')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Chapter templates' })).getByText('2 scenes')).toBeTruthy()

    await userEvent.click(within(books).getByRole('button', { name: 'Rename Mystery' }))
    const field = within(books).getByRole('textbox', { name: 'Rename Mystery' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Three-arc mystery{Enter}')
    expect(stored().find(t => t.id === 't1')?.name).toBe('Three-arc mystery')

    await userEvent.click(within(books).getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(books).getByRole('button', { name: 'Confirm' }))
    expect(stored().map(t => t.id)).toEqual(['t2'])
    expect(within(books).getByText('None yet.')).toBeTruthy()
  })
})
