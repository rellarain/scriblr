import type { ReactNode } from 'react'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { useStoredState } from '../storage'
import { nodeLabel } from '../plotTree'
import { bookThemeHue } from '../../../../theme/bookColors'
import BookScope from '../BookScope'
import OutlineMax from '../outline/OutlineMax'
import DraftLevel from '../draft/DraftLevel'
import LevelPanel from './LevelPanel'
import { ProjectMin, ProjectTiles } from './levelBodies'
import { useDashTabs } from './dashTabs'
import { NoBook, useOutlineTabs } from './outlineTabs'
import { useProjectTabs } from './projectTabs'
import { LEVELS, focusOf, levelSizes, type Level, type LevelSize, type SizeOverrides } from './levelSizes'

// The Writer: four stacked levels (Dash, Project, Outline, Draft), one of them
// focused (Max) and the rest Mid or Min -- see levelSizes.ts. Opening something
// (a project, a book, a chapter) moves the focus down a level; clicking a level's
// title brings the focus back to it, and its header strip opens a Min level to Mid.
function WriterLevels({ w, pagesComponent, onPagesComponent }: {
  w: WriterWorkspace
  pagesComponent: string
  onPagesComponent: (key: string) => void
}) {
  const [overrides, setOverrides] = useStoredState<SizeOverrides>('scriblr.writer.levelSizes', {})
  const focus = focusOf(w.activeConsole)
  const sizes = levelSizes(focus, overrides)
  // Each level's tabs, in its header (the Outline's, at Max, are in the book editor strip instead).
  const dashTabs = useDashTabs(w, sizes.dash === 'hidden' ? 'min' : sizes.dash)
  const projectTabs = useProjectTabs(w, sizes.project === 'hidden' ? 'min' : sizes.project)
  const outlineTabs = useOutlineTabs(w, sizes.outline === 'max' || sizes.outline === 'hidden' ? 'min' : sizes.outline)

  const setSize = (level: Level) => (size: 'min' | 'mid') => setOverrides(prev => ({ ...prev, [level]: size }))
  const book = w.activeBook
  const chapterNumber = w.activeChapter ? w.activeBookChapters.findIndex(c => c.id === w.activeChapter!.id) + 1 : 0

  function panel(level: Level, size: Exclude<LevelSize, 'hidden'>): ReactNode {
    switch (level) {
      case 'dash':
        return (
          <LevelPanel key={level} level={level} size={size} title="Writer Dashboard" headerExtras={dashTabs.headerExtras} onPromote={w.showDash} onSetSize={setSize(level)}>
            {dashTabs.body}
          </LevelPanel>
        )
      case 'project': {
        // Beside the Dash, the Project level is a tile for every project.
        if (focus === 'dash') {
          return (
            <LevelPanel
              key={level} level={level} size="min" title="Project Shelves" hue={w.projectHue} locked headerless className="wrProjectsColumn"
              onPromote={w.showProject} onSetSize={setSize(level)} minBody={<ProjectTiles w={w} />}
            />
          )
        }
        return (
          <LevelPanel
            key={level} level={level} size={size} title={w.activeProject?.title ?? 'Project'} hue={w.projectHue}
            headerExtras={projectTabs.headerExtras}
            onPromote={w.showProject} onSetSize={setSize(level)} minBody={<ProjectMin w={w} />}
          >
            {w.outlineStatus === 'loading' && <p className="wrMuted">Loading project…</p>}
            {w.outlineStatus === 'error' && <p className="wrError">{w.outlineError ?? 'Failed to load the project.'}</p>}
            {w.saveError && <p className="wrError">{w.saveError}</p>}
            {w.warnings.length > 0 && <p className="wrMuted">{w.warnings.join(' ')}</p>}
            {w.outlineStatus !== 'loading' && w.outlineStatus !== 'error' && projectTabs.body}
          </LevelPanel>
        )
      }
      case 'outline':
        return (
          <LevelPanel
            key={level} level={level} size={size} headerless={size === 'max'} title={book ? nodeLabel(book) : 'Book'} hue={book ? bookThemeHue(book) : undefined}
            headerExtras={outlineTabs.headerExtras} onPromote={() => { if (book) w.openBook(book.id) }} onSetSize={setSize(level)}
          >
            {size === 'max' ? <OutlineMax w={w} /> : book ? outlineTabs.body : <NoBook />}
          </LevelPanel>
        )
      case 'draft':
        return (
          <LevelPanel
            key={level} level={level} size="max" headerless title={w.activeChapter ? `Chapter ${chapterNumber} · ${nodeLabel(w.activeChapter)}` : 'Chapter'}
            hue={w.activeChapter ? w.levelHueOf(w.activeChapter) : undefined}
            tint={w.activeChapter ? w.levelTintOf(w.activeChapter) : undefined}
            fill={w.activeChapter ? w.levelFillOf(w.activeChapter) : undefined}
            onPromote={() => {}} onSetSize={setSize(level)}
          >
            <DraftLevel w={w} pagesComponent={pagesComponent} onPagesComponent={onPagesComponent} />
          </LevelPanel>
        )
    }
  }

  // Outline and Draft are a book's own levels: they take the book's colors.
  const scoped = (level: Level, node: ReactNode) => (level === 'outline' || level === 'draft'
    ? <BookScope key={level} book={book} flow>{node}</BookScope>
    : node)

  const shown = LEVELS.filter(l => sizes[l] !== 'hidden')
  let body: ReactNode
  if (focus === 'dash') {
    body = <>{shown.map(l => scoped(l, panel(l, sizes[l] as Exclude<LevelSize, 'hidden'>)))}</>
  } else {
    const above = shown.filter(l => l !== focus)
    body = (
      <>
        <div className="wrLevelsSide">{above.map(l => scoped(l, panel(l, sizes[l] as Exclude<LevelSize, 'hidden'>)))}</div>
        {scoped(focus, panel(focus, 'max'))}
      </>
    )
  }

  return <div className={`wrLevels wrLevels--focus-${focus}`} data-focus={focus}>{body}</div>
}

export default WriterLevels
