import type { ComponentType } from 'react'
import {
  LibraryIcon, BookFaceIcon, PageIcon, GearIcon, HelpIcon, PlotIcon, ExportIcon, CalendarIcon,
  BarChartIcon, CheckboxIcon, PencilIcon, ClockIcon, ListIcon, ArcIcon, ReactionIcon, FlagIcon,
  SentenceIcon, type IconProps,
} from '../../icons'
import type { WuiConsole } from './useWriterWorkspace'

export interface ComponentDef {
  key: string
  label: string
  Icon: ComponentType<IconProps>
  // Shown for components that are not built yet.
  body?: string
}

// The components of each console, shown as the icon column at the left of
// the main screen. Settings and Help are the same for every console and sit
// at the bottom of the column (see SETTINGS_COMPONENT / HELP_COMPONENT).
export const SHELVES_COMPONENTS: ComponentDef[] = [
  { key: 'dashboard', label: 'Dashboard', Icon: LibraryIcon },
  { key: 'template', label: 'Project Template', Icon: CheckboxIcon, body: 'Manage the master project template here.' },
  { key: 'schedule', label: 'Schedule', Icon: CalendarIcon },
  { key: 'analytics', label: 'Analytics', Icon: BarChartIcon },
  { key: 'scratchpad', label: 'Scratchpad', Icon: PencilIcon },
]

export const SHELF_COMPONENTS: ComponentDef[] = [
  { key: 'projectHistory', label: 'Project History', Icon: ClockIcon, body: 'Preserves and condenses this project’s version and activity information here.' },
  { key: 'projectAnalytics', label: 'Project Analytics', Icon: BarChartIcon, body: 'View analytics for this project here.' },
  { key: 'projectSchedule', label: 'Project Schedule', Icon: CalendarIcon, body: 'Goals, routines, checklists and revisions for this project.' },
  { key: 'projectOutline', label: 'Project Outline', Icon: ListIcon },
  { key: 'projectPlot', label: 'Project Plot', Icon: PlotIcon },
  { key: 'projectEditor', label: 'Project Editor', Icon: PencilIcon, body: 'Edit this project’s time systems here (its summary and description are coming).' },
  { key: 'outlineTemplate', label: 'Outline Template', Icon: CheckboxIcon, body: 'Manage book templates here.' },
  { key: 'seriesOutline', label: 'Series Outline', Icon: LibraryIcon, body: 'A parent container for this project’s included books.' },
]

export const BOOK_COMPONENTS: ComponentDef[] = [
  { key: 'outlineTemplate', label: 'Outline Template', Icon: CheckboxIcon, body: 'Manage chapter templates here.' },
  { key: 'bookEditor', label: 'Book Editor', Icon: BookFaceIcon },
  { key: 'arcOutline', label: 'Arc Outline', Icon: ArcIcon, body: 'Manage this book’s arcs here.' },
]

export const PAGE_COMPONENTS: ComponentDef[] = [
  { key: 'chapter', label: 'Chapter', Icon: PageIcon },
  { key: 'sentence', label: 'Sentence', Icon: SentenceIcon, body: 'Edit this chapter’s draft at the sentence level here.' },
]

export const PAGES_COMPONENTS: ComponentDef[] = [
  { key: 'reaction', label: 'Reaction', Icon: ReactionIcon },
  { key: 'flag', label: 'Flag', Icon: FlagIcon },
  { key: 'export', label: 'Export', Icon: ExportIcon },
]

export const SETTINGS_COMPONENT: ComponentDef = { key: 'settings', label: 'Settings', Icon: GearIcon, body: 'Preferences, customization and configuration for this console.' }
export const HELP_COMPONENT: ComponentDef = { key: 'help', label: 'Help', Icon: HelpIcon, body: 'Resources and assistance using this console.' }

export const COMPONENTS_BY_CONSOLE: Record<WuiConsole, ComponentDef[]> = {
  shelves: SHELVES_COMPONENTS,
  shelf: SHELF_COMPONENTS,
  book: BOOK_COMPONENTS,
  page: PAGE_COMPONENTS,
  pages: PAGES_COMPONENTS,
}

export const DEFAULT_COMPONENT: Record<WuiConsole, string> = {
  shelves: 'dashboard',
  shelf: 'projectPlot',
  book: 'bookEditor',
  page: 'chapter',
  pages: 'reaction',
}

export const CONSOLE_TITLE: Record<WuiConsole, string> = {
  shelves: 'Shelves', shelf: 'Shelf', book: 'Book', page: 'Page', pages: 'Pages',
}
