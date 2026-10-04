import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode } from '../../../../api/types'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import type { WriterWorkspace } from '../useWriterWorkspace'
import WriterLevels from './WriterLevels'

// The consoles inside the levels (tile grids, editors) have their own tests; here
// they are stand-ins so this file exercises the frame itself.
vi.mock('../ShelvesConsole', () => ({ default: () => <div>shelves console</div> }))
vi.mock('../ProjectConsole', () => ({ default: () => <div>project console</div> }))
vi.mock('../outline/OutlineMax', () => ({ default: () => <div>book console</div> }))
vi.mock('../draft/DraftLevel', () => ({ default: ({ w }: { w: { activeConsole: string } }) => <div>{w.activeConsole === 'pages' ? 'pages console' : 'page console'}</div> }))
vi.mock('./levelBodies', () => ({
  DashMid: () => <div>dash mid</div>,
  ProjectMid: () => <div>project mid</div>,
  ProjectMin: () => <div>project spines</div>,
  ProjectShelves: () => <div>project shelves</div>,
  OutlineMid: () => <div>outline mid</div>,
}))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

const outline = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)

function workspace(activeConsole: WriterWorkspace['activeConsole'], over: Partial<WriterWorkspace> = {}): WriterWorkspace {
  const book = outline('b1', 'book', null, { title: 'Cold Harbor' })
  const chapter = outline('c1', 'chapter', 'b1', { title: 'The Harbor Master' })
  return {
    activeConsole, hasOpenProject: activeConsole !== 'shelves' || over.hasOpenProject === true,
    activeProject: { title: 'The Ashfall Cycle' }, activeBook: book, activeBookChapters: [chapter], activeChapter: chapter,
    showDash: vi.fn(), showProject: vi.fn(), openBook: vi.fn(),
    projectHue: 150, levelHueOf: () => 280, levelTintOf: () => 'hsl(280, 30%, 50%)', levelFillOf: () => 'hsl(280, 60%, 40%)',
    ...over,
  } as unknown as WriterWorkspace
}

const levelsOf = () => Array.from(document.querySelectorAll<HTMLElement>('[data-level]')).map(el => `${el.dataset.level}:${el.dataset.size}`)
const renderLevels = (w: WriterWorkspace) => render(<WriterLevels w={w} pagesComponent="reaction" onPagesComponent={() => {}} />)

describe('WriterLevels', () => {
  it('shows each focus as its own set of level sizes', () => {
    const { unmount } = renderLevels(workspace('shelves'))
    expect(levelsOf()).toEqual(['dash:max', 'project:min'])
    expect(screen.getByText('project shelves')).toBeTruthy()
    unmount()

    const second = renderLevels(workspace('shelf'))
    expect(levelsOf()).toEqual(['dash:mid', 'project:max'])
    expect(screen.getByText('project console')).toBeTruthy()
    second.unmount()

    const third = renderLevels(workspace('book'))
    expect(levelsOf()).toEqual(['dash:min', 'project:mid', 'outline:max'])
    expect(screen.getByText('book console')).toBeTruthy()
    third.unmount()

    renderLevels(workspace('page'))
    expect(levelsOf()).toEqual(['dash:min', 'project:min', 'outline:mid', 'draft:max'])
    expect(screen.getByText('page console')).toBeTruthy()
    expect(screen.getByText('outline mid')).toBeTruthy()
    expect(screen.getByText('project spines')).toBeTruthy()
  })

  it('shows Preview in the Draft level when the Pages console is open', () => {
    renderLevels(workspace('pages'))
    expect(screen.getByText('pages console')).toBeTruthy()
    expect(screen.queryByText('page console')).toBeNull()
  })

  it("titles the levels with the open project, book and chapter", () => {
    renderLevels(workspace('page'))
    expect(screen.getByRole('region', { name: 'The Ashfall Cycle (min)' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Cold Harbor (mid)' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Chapter 1 · The Harbor Master (max)' })).toBeTruthy()
  })

  it("promotes a level when its title is clicked", async () => {
    const user = userEvent.setup()
    const w = workspace('page')
    renderLevels(w)
    await user.click(screen.getByRole('button', { name: 'Writer Dashboard' }))
    expect(w.showDash).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'The Ashfall Cycle' }))
    expect(w.showProject).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Cold Harbor' }))
    expect(w.openBook).toHaveBeenCalledWith('b1')
  })

  it("opens a Min level to Mid from its header strip, and minimizes it again with the chevron", async () => {
    const user = userEvent.setup()
    renderLevels(workspace('page'))
    const project = screen.getByRole('region', { name: 'The Ashfall Cycle (min)' })
    await user.click(within(project).getByRole('button', { name: 'Expand The Ashfall Cycle' }))
    expect(levelsOf()).toEqual(['dash:min', 'project:mid', 'outline:mid', 'draft:max'])
    expect(screen.getByText('project mid')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Minimize The Ashfall Cycle' }))
    expect(levelsOf()).toEqual(['dash:min', 'project:min', 'outline:mid', 'draft:max'])
  })

  it("remembers a level's own Min/Mid choice across reloads", async () => {
    const user = userEvent.setup()
    const first = renderLevels(workspace('page'))
    await user.click(screen.getByRole('button', { name: 'Expand Writer Dashboard' }))
    first.unmount()
    renderLevels(workspace('page'))
    expect(levelsOf()[0]).toBe('dash:mid')
  })

  it("tints each level from its own hue: project, book and chapter (the Dash keeps the theme's)", () => {
    renderLevels(workspace('page', { projectHue: 150, levelHueOf: () => 280 } as Partial<WriterWorkspace>))
    const hueOf = (level: string) => document.querySelector<HTMLElement>(`[data-level="${level}"]`)!.style.getPropertyValue('--wr-level-h')
    expect(hueOf('dash')).toBe('')
    expect(hueOf('project')).toBe('150')
    expect(hueOf('outline')).toBe('28') // the book's own (here the book default)
    expect(hueOf('draft')).toBe('280')
  })

  it("gives each tinted level a flat fill, a little less loud than the accent, the Draft's from its chapter", () => {
    renderLevels(workspace('page', { projectHue: 150 } as Partial<WriterWorkspace>))
    const fillOf = (level: string) => document.querySelector<HTMLElement>(`[data-level="${level}"]`)!.style.getPropertyValue('--wr-level-fill')
    expect(fillOf('dash')).toBe('') // the Dash falls back to the theme hue at the same saturation (in the stylesheet)
    expect(fillOf('project')).toBe('hsl(150, calc(var(--color-accent-s) * 0.62), clamp(0%, calc(var(--color-accent-l) - 8%), 100%))')
    expect(fillOf('outline')).toContain('hsl(28, calc(var(--color-accent-s) * 0.62)')
    expect(fillOf('draft')).toBe('hsl(280, 60%, 40%)') // the chapter's own, from the workspace
  })

  it('keeps the project shelves beside the Dash with no Min/Mid toggle', () => {
    renderLevels(workspace('shelves', { hasOpenProject: true }))
    const shelves = screen.getByRole('region', { name: 'Project Shelves (min)' })
    expect(within(shelves).queryByRole('button', { name: /Expand|Minimize/ })).toBeNull()
  })
})
