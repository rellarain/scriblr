import { BarChartIcon, CalendarIcon, CheckboxIcon, GearIcon, HelpIcon, LayoutMiniIcon, PencilIcon } from '../../../icons'
import { SettingsSaveCluster } from '../../../../components/SettingsSaveCluster'
import { flushSettings } from '../../../../settings/settingsStore'
import ThemeSettingsPanel from '../../../../theme/ThemeSettingsPanel'
import { AnalyticsPanel, RoutinesPanel, Scratchpad, TasksPanel } from '../Dashboard'
import { Placeholder } from '../shared'
import type { WriterWorkspace } from '../useWriterWorkspace'
import HelpArticles from './HelpArticles'
import { useTabbedLevel, type LevelTab } from './LevelTabs'

export const DASH_HELP_NAMES = ['dashboard', 'dash', 'shelves']
const DASH_HELP_FALLBACK = 'The Dash is your desk across every project: schedule, checklist, analytics and a scratchpad. Pick a tab to open it; at full size each tab opens as a tile.'

export function dashTabs(w: WriterWorkspace): LevelTab[] {
  return [
    { id: 'schedule', label: 'Schedule', Icon: CalendarIcon, searchable: true, render: c => <RoutinesPanel query={c.query} /> },
    { id: 'checklist', label: 'Checklist', Icon: CheckboxIcon, searchable: true, render: c => <TasksPanel query={c.query} /> },
    { id: 'analytics', label: 'Analytics', Icon: BarChartIcon, render: () => <AnalyticsPanel projects={w.projects} outlines={w.projectOutlines} /> },
    { id: 'scratchpad', label: 'Scratchpad', Icon: PencilIcon, searchable: true, render: c => <Scratchpad bare query={c.query} /> },
    { id: 'template', label: 'Project template', Icon: LayoutMiniIcon, render: () => <Placeholder title="Project Template" body="Manage the master project template here." /> },
    { id: 'settings', label: 'Settings', Icon: GearIcon, end: true, surface: true, render: () => <ThemeSettingsPanel /> },
    { id: 'help', label: 'Help', Icon: HelpIcon, render: () => <HelpArticles names={DASH_HELP_NAMES} fallback={DASH_HELP_FALLBACK} /> },
  ]
}

// The Dash level's tabs, quick actions (the settings store's Save) and the tiles they open.
export function useDashTabs(w: WriterWorkspace, size: 'min' | 'mid' | 'max') {
  return useTabbedLevel({
    storageKey: 'scriblr.writer.dash', tabs: dashTabs(w), size, defaultOpen: ['schedule', 'scratchpad'], flush: () => { void flushSettings() },
    // The Dash's Undo and Redo are for the settings (its Settings tab); the other tabs keep their own things in the scratchpad and lists.
    save: focused => <SettingsSaveCluster buttonClassName="wrSmallBtn wrSaveBtn" showHistory={focused === 'settings'} />,
  })
}
