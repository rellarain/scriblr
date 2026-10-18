import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode } from '../../../../api/types'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { fillColorCss } from '../../../../theme/bookColors'
import type { WriterWorkspace } from '../useWriterWorkspace'
import WriterLevels from './WriterLevels'
import SidebarToggle from '../SidebarToggle'
import { mockFetch } from '../../../../test/mockFetch'
import { makeWorkspace, type WorkspaceOverrides } from '../../../../test/makeWorkspace'

// The consoles inside the levels (tile grids, editors) have their own tests; here
// they are stand-ins so this file exercises the frame itself.
vi.mock('../outline/OutlineMax', () => ({ default: () => <div>book console</div> }))
vi.mock('../draft/DraftLevel', () => ({ default: ({ w }: { w: { activeConsole: string } }) => <div>{w.activeConsole === 'pages' ? 'pages console' : 'page console'}</div> }))
vi.mock('./dashTabs', () => ({
  useDashTabs: (_w: unknown, size: string) => ({
    headerExtras: size === 'min' ? null : <div>dash tabs</div>,
    body: size === 'min' ? null : <div>dash body ({size})</div>,
  }),
}))
vi.mock('./projectTabs', () => ({
  useProjectTabs: (_w: unknown, size: string) => ({
    headerExtras: size === 'min' ? null : <div>project tabs</div>,
    body: size === 'min' ? null : <div>project console ({size})</div>,
  }),
}))
vi.mock('./outlineTabs', () => ({
  useOutlineTabs: (_w: unknown, size: string) => ({
    headerExtras: size === 'min' ? null : <div>outline tabs</div>,
    body: size === 'min' ? null : <div>outline mid</div>,
    isOpen: () => true,
  }),
  NoBook: () => <div>no book</div>,
}))
vi.mock('./levelBodies', () => ({
  ProjectMin: () => <div>project spines</div>,
  ProjectTiles: () => <div>project tiles</div>,
}))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
})

const outline = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)

function workspace(activeConsole: WriterWorkspace['activeConsole'], over: WorkspaceOverrides = {}): WriterWorkspace {
  const book = outline('b1', 'book', null, { title: 'Cold Harbor' })
  const chapter = outline('c1', 'chapter', 'b1', { title: 'The Harbor Master' })
  return makeWorkspace({
    activeConsole, hasOpenProject: activeConsole !== 'shelves' || over.hasOpenProject === true,
    activeProject: { title: 'The Ashfall Cycle' }, activeBook: book, activeBookChapters: [chapter], activeChapter: chapter,
    warnings: [], outlineStatus: 'idle', saveError: undefined,
    showDash: vi.fn(), showProject: vi.fn(), openBook: vi.fn(),
    projectHue: 150, levelHueOf: () => 280, levelTintOf: () => 'hsl(280, 30%, 50%)', levelFillOf: () => 'hsl(280, 60%, 40%)',
    ...over,
  })
}

const levelsOf = () => Array.from(document.querySelectorAll<HTMLElement>('[data-level]')).map(el => `${el.dataset.level}:${el.dataset.size}`)
const renderLevels = (w: WriterWorkspace) => render(<WriterLevels w={w} pagesComponent="reaction" onPagesComponent={() => {}} />)
const renderWithToggle = (w: WriterWorkspace) => render(<><SidebarToggle /><WriterLevels w={w} pagesComponent="reaction" onPagesComponent={() => {}} /></>)
const setWindowWidth = (width: number) => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: width }) }

describe('WriterLevels', () => {
  it('shows each focus as its own set of level sizes', () => {
    const { unmount } = renderLevels(workspace('shelves'))
    expect(levelsOf()).toEqual(['dash:max', 'project:min'])
    expect(screen.getByText('project tiles')).toBeTruthy()
    unmount()

    const second = renderLevels(workspace('shelf'))
    expect(levelsOf()).toEqual(['dash:mid', 'project:max'])
    expect(screen.getByText('project console (max)')).toBeTruthy()
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
    expect(screen.getByText('project console (mid)')).toBeTruthy()

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
    expect(fillOf('project')).toBe(fillColorCss(150))
    expect(fillOf('project')).toMatch(/^hsl\(150, calc\(var\(--color-accent-s\) \* 0\.62\), clamp\(0%, calc\(var\(--color-accent-l\) - 8%\), [\d.]+%\)\)$/)
    expect(fillOf('outline')).toContain('hsl(28, calc(var(--color-accent-s) * 0.62)')
    expect(fillOf('draft')).toBe('hsl(280, 60%, 40%)') // the chapter's own, from the workspace
  })

  it("sets the text colour of each level from its fill: white, and the zone's own on the Draft paper", () => {
    renderLevels(workspace('page', { projectHue: 150 } as Partial<WriterWorkspace>))
    const onAccent = (level: string) => document.querySelector<HTMLElement>(`[data-level="${level}"]`)!.style.getPropertyValue('--on-accent')
    expect(onAccent('project')).toBe('#ffffff')
    expect(onAccent('dash')).toBe('#ffffff')
    expect(onAccent('draft')).toBe('')
  })

  it('keeps the project shelves beside the Dash with no Min/Mid toggle', () => {
    renderLevels(workspace('shelves', { hasOpenProject: true }))
    const shelves = screen.getByRole('region', { name: 'Project Shelves (min)' })
    expect(within(shelves).queryByRole('button', { name: /Expand|Minimize/ })).toBeNull()
  })
})

describe('the side column', () => {
  beforeEach(() => { setWindowWidth(1280) })

  it('has a drag handle on its edge, and the default width until one is dragged', () => {
    const { container } = renderLevels(workspace('shelf'))
    expect(container.querySelector('.wrLevelsSide')).not.toBeNull()
    expect(screen.getByRole('separator', { name: 'Sidebar width' })).toBeInTheDocument()
    expect((container.querySelector('.wrLevels') as HTMLElement).style.getPropertyValue('--wr-side-w')).toBe('')
  })

  it('is hidden and shown again from the header, the focused level taking the whole width while it is hidden', async () => {
    const user = userEvent.setup()
    const { container } = renderWithToggle(workspace('shelf'))
    const toggle = screen.getByRole('button', { name: 'Sidebar' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(container.querySelector('.wrLevelsSide')).toBeNull()
    expect(levelsOf()).toEqual(['project:max'])
    expect(container.querySelector('.wrLevels')).toHaveClass('wrLevels--noside')
    await user.click(toggle)
    expect(container.querySelector('.wrLevelsSide')).not.toBeNull()
    expect(levelsOf()).toEqual(['dash:mid', 'project:max'])
  })

  it('remembers a width and a hidden state', () => {
    window.localStorage.setItem('scriblr.writer.sidebar', JSON.stringify({ width: 400, hidden: false }))
    __resetSettingsForTests()
    const { container } = renderLevels(workspace('shelf'))
    expect((container.querySelector('.wrLevels') as HTMLElement).style.getPropertyValue('--wr-side-w')).toBe('min(max(400px, 200px), 60%)')
  })

  it('is resized by dragging its handle, within 200px and 60% of the Writer, and the width is kept', () => {
    const rect = (width: number) => ({ width, height: 600, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 600, toJSON: () => ({}) }) as DOMRect
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return rect(this.classList.contains('wrLevelsSide') ? 280 : this.classList.contains('wrLevels') ? 1000 : 0)
    })
    const { container } = renderLevels(workspace('shelf'))
    const widthVar = () => (container.querySelector('.wrLevels') as HTMLElement).style.getPropertyValue('--wr-side-w')
    fireEvent.mouseDown(screen.getByRole('separator', { name: 'Sidebar width' }), { clientX: 286 })
    act(() => { fireEvent.mouseMove(window, { clientX: 386 }) })
    expect(widthVar()).toBe('min(max(380px, 200px), 60%)') // 280 + 100, live
    act(() => { fireEvent.mouseMove(window, { clientX: 1000 }) })
    expect(widthVar()).toBe('min(max(600px, 200px), 60%)') // held at 60% of 1000
    act(() => { fireEvent.mouseUp(window) })
    expect(JSON.parse(window.localStorage.getItem('scriblr.writer.sidebar') ?? '{}')).toMatchObject({ width: 600 })
    spy.mockRestore()
  })

  it('goes back to the default width on a double click on the handle', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('scriblr.writer.sidebar', JSON.stringify({ width: 400, hidden: false }))
    __resetSettingsForTests()
    const { container } = renderLevels(workspace('shelf'))
    await user.dblClick(screen.getByRole('separator', { name: 'Sidebar width' }))
    expect((container.querySelector('.wrLevels') as HTMLElement).style.getPropertyValue('--wr-side-w')).toBe('')
  })

  it('is hidden by itself in a narrow window, and the toggle shows it', async () => {
    setWindowWidth(800)
    const user = userEvent.setup()
    const { container } = renderWithToggle(workspace('shelf'))
    expect(container.querySelector('.wrLevelsSide')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Sidebar' }))
    expect(container.querySelector('.wrLevelsSide')).not.toBeNull()
  })

  it('has no toggle to press at the Dash, which has no side column', () => {
    renderWithToggle(workspace('shelves'))
    expect(screen.getByRole('button', { name: 'Sidebar' })).toBeDisabled()
  })
})
