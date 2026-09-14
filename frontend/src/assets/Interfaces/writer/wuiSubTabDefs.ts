import type { ComponentType } from 'react'
import type { ShelfSubTab } from './ShelfConsoleView'
import type { BookSubTab } from './BookConsoleView'
import type { PageSubTab } from './PageConsoleView'
import type { PagesSubTab } from './PagesConsoleView'
import {
  LibraryIcon, BookFaceIcon, PageIcon, PagesIcon, GearIcon, HelpIcon,
  PlotIcon, BookmarkIcon, ExportIcon, CalendarIcon, BarChartIcon, CheckboxIcon, PencilIcon,
  type IconProps,
} from '../../icons'

// Five consoles per scrilbrPlan.md's "Writer Page (WUI)" section. Sub-tabs
// are real (backend-connected) where noted, placeholder (structural
// skeleton, same convention as AUI/UUI) everywhere else.
export type ShelvesSubTab =
  | 'projects' | 'projectTemplate' | 'shelvesSchedule' | 'shelvesAnalytics'
  | 'scratchpad' | 'shelvesSettings' | 'shelvesHelp'

export interface SubTabDef<K extends string> {
  key: K
  label: string
  Icon: ComponentType<IconProps>
  body: string
}

export const SHELVES_SUBTABS: SubTabDef<ShelvesSubTab>[] = [
  { key: 'projects', label: 'Projects', Icon: LibraryIcon, body: '' }, // real
  { key: 'projectTemplate', label: 'Project Template', Icon: CheckboxIcon,
    body: 'Manage the master project template here.' },
  { key: 'shelvesSchedule', label: 'Schedule', Icon: CalendarIcon,
    body: 'View and manage your writer dashboard schedule -- task and routine checklists -- here.' },
  { key: 'shelvesAnalytics', label: 'Analytics', Icon: BarChartIcon,
    body: 'View writer-wide analytics across all your projects here.' },
  { key: 'scratchpad', label: 'Scratchpad', Icon: PencilIcon,
    body: 'Jot quick notes here, and convert them into outline, plot, draft, or revision items later.' },
  { key: 'shelvesSettings', label: 'Settings', Icon: GearIcon,
    body: 'Configure settings specific to the Shelves console here.' },
  { key: 'shelvesHelp', label: 'Help', Icon: HelpIcon,
    body: 'Resources and assistance using the Shelves console here.' },
]

export const SHELF_SUBTABS: SubTabDef<ShelfSubTab>[] = [
  { key: 'projectEditor', label: 'Project Editor', Icon: PencilIcon,
    body: 'Summary: / Description: -- edit this project’s summary and description here.' },
  { key: 'projectAnalytics', label: 'Project Analytics', Icon: BarChartIcon,
    body: 'View analytics for this project here.' },
  { key: 'projectSchedule', label: 'Project Schedule', Icon: CalendarIcon,
    body: 'Goals: / Routines: / Checklists: organized tasks / Revisions: -- manage this project’s schedule here.' },
  { key: 'projectHistory', label: 'Project History', Icon: BarChartIcon,
    body: 'Preserves and condenses this project’s version and activity information here.' },
  { key: 'projectPlot', label: 'Project Plot', Icon: PlotIcon, body: '' }, // real
  { key: 'projectOutline', label: 'Project Outline', Icon: BookFaceIcon, body: '' }, // real
  { key: 'outlineTemplate', label: 'Outline Template', Icon: CheckboxIcon,
    body: 'Manage book templates here.' },
  { key: 'seriesOutline', label: 'Series Outline', Icon: LibraryIcon,
    body: 'A parent container for this project’s included books.' },
  { key: 'bookOutline', label: 'Book Outline', Icon: BookFaceIcon,
    body: 'Summarized, at-a-glance cards containing book details and progress.' },
  { key: 'shelfSettings', label: 'Settings', Icon: GearIcon,
    body: 'Configure settings specific to the Shelf console here.' },
  { key: 'shelfHelp', label: 'Help', Icon: HelpIcon,
    body: 'Resources and assistance using the Shelf console here.' },
]

export const BOOK_SUBTABS: SubTabDef<BookSubTab>[] = [
  { key: 'outlineTemplate', label: 'Outline Template', Icon: CheckboxIcon,
    body: 'Manage chapter templates here.' },
  { key: 'bookEditor', label: 'Book Editor', Icon: BookFaceIcon, body: '' }, // real
  { key: 'arcOutline', label: 'Arc Outline', Icon: BookFaceIcon, body: '' }, // real
  { key: 'chapterOutline', label: 'Chapter Outline', Icon: BookFaceIcon, body: '' }, // real
  { key: 'actOutline', label: 'Act Outline', Icon: BookFaceIcon, body: '' }, // real
  { key: 'sceneOutline', label: 'Scene Outline', Icon: BookFaceIcon, body: '' }, // real
  { key: 'momentOutline', label: 'Moment Outline', Icon: BookFaceIcon, body: '' }, // real
  { key: 'bookSettings', label: 'Settings', Icon: GearIcon,
    body: 'Configure settings specific to the Book console here.' },
  { key: 'bookHelp', label: 'Help', Icon: HelpIcon,
    body: 'Resources and assistance using the Book console here.' },
]

export const PAGE_SUBTABS: SubTabDef<PageSubTab>[] = [
  { key: 'bookmark', label: 'Bookmark', Icon: BookmarkIcon,
    body: 'A read-only, collapsible sidebar of this project/book/chapter’s outline -- only one section open at a time.' },
  { key: 'paragraph', label: 'Paragraph', Icon: PageIcon,
    body: 'Edit this chapter’s draft, paragraph by paragraph, here.' },
  { key: 'sentence', label: 'Sentence', Icon: PageIcon,
    body: 'Edit this chapter’s draft at the sentence level here.' },
  { key: 'pageChapterOutline', label: 'Chapter Outline', Icon: BookFaceIcon,
    body: 'A read-only view of this chapter’s acts, scenes, and moments.' },
  { key: 'pageSettings', label: 'Settings', Icon: GearIcon,
    body: 'Configure settings specific to the Page console here.' },
  { key: 'pageHelp', label: 'Help', Icon: HelpIcon,
    body: 'Resources and assistance using the Page console here.' },
]

export const PAGES_SUBTABS: SubTabDef<PagesSubTab>[] = [
  { key: 'pagesBookmark', label: 'Bookmark', Icon: BookmarkIcon,
    body: 'A read-only, collapsible sidebar of this project/book/chapter’s outline.' },
  { key: 'reaction', label: 'Reaction', Icon: PagesIcon,
    body: 'React to the preview copy by clicking a sentence and choosing like and/or dislike, at up to 3 levels of intensity.' },
  { key: 'flag', label: 'Flag', Icon: PagesIcon,
    body: 'Flag passages here: Add, Remove, Merge, Change, Simplify, or Expand.' },
  { key: 'export', label: 'Export', Icon: ExportIcon,
    body: 'Export this project, book, or chapter as JSON, EPUB, PDF, or DOC.' },
  { key: 'pagesSettings', label: 'Settings', Icon: GearIcon,
    body: 'Preferences, customization, and configuration for this console.' },
  { key: 'pagesHelp', label: 'Help', Icon: HelpIcon,
    body: 'Resources and assistance using features in this console.' },
]

export const BOOK_SUBTAB_BY_KIND: Record<'book' | 'arc' | 'chapter' | 'act' | 'scene' | 'moment', BookSubTab> = {
  book: 'bookEditor', arc: 'arcOutline', chapter: 'chapterOutline',
  act: 'actOutline', scene: 'sceneOutline', moment: 'momentOutline',
}
