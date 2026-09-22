import type { ComponentType } from 'react'
import {
  CheckboxIcon, PencilIcon, ClockIcon, ListIcon, ArcIcon, ReactionIcon, FlagIcon, ExportIcon, CalendarIcon, BarChartIcon, PlotIcon,
  type IconProps,
} from '../../icons'

export interface ComponentDef {
  key: string
  label: string
  Icon: ComponentType<IconProps>
  // Shown for components that are not built yet.
  body?: string
}

// The pages of each console. On the Shelf and Book screens they are the tiles that
// expand into the page (tiles/shelfTiles.tsx, tiles/bookTiles.tsx use the labels and
// placeholder text from here); the Pages screen shows its three as buttons.
export const SHELF_COMPONENTS: ComponentDef[] = [
  { key: 'projectHistory', label: 'Project History', Icon: ClockIcon, body: 'Preserves and condenses this project’s version and activity information here.' },
  { key: 'projectAnalytics', label: 'Project Analytics', Icon: BarChartIcon, body: 'View analytics for this project here.' },
  { key: 'projectSchedule', label: 'Project Schedule', Icon: CalendarIcon, body: 'Goals, routines, checklists and revisions for this project.' },
  { key: 'projectOutline', label: 'Project Outline', Icon: ListIcon },
  { key: 'projectPlot', label: 'Project Plot', Icon: PlotIcon },
  { key: 'projectEditor', label: 'Project Editor', Icon: PencilIcon, body: 'Edit this project’s time systems here (its summary and description are coming).' },
  { key: 'outlineTemplate', label: 'Outline Template', Icon: CheckboxIcon, body: 'Manage book templates here.' },
]

export const BOOK_COMPONENTS: ComponentDef[] = [
  { key: 'outlineTemplate', label: 'Outline Template', Icon: CheckboxIcon, body: 'Manage chapter templates here.' },
  { key: 'arcOutline', label: 'Arc Outline', Icon: ArcIcon, body: 'Manage this book’s arcs here.' },
]

export const PAGES_COMPONENTS: ComponentDef[] = [
  { key: 'reaction', label: 'Reaction', Icon: ReactionIcon },
  { key: 'flag', label: 'Flag', Icon: FlagIcon },
  { key: 'export', label: 'Export', Icon: ExportIcon },
]
