import { BarChartIcon, CalendarIcon, CheckboxIcon, GearIcon, HelpIcon, LayoutMiniIcon, PencilIcon } from '../../../icons'
import { SaveControl } from '../../../../components/SaveControl'
import ThemeSettingsPanel from '../../../../theme/ThemeSettingsPanel'
import { restoreSettings, saveSettingsNow, useSettingsSaveStatus } from '../../../../settings/settingsStore'
import { AnalyticsPanel, RoutinesPanel, Scratchpad, TasksPanel } from '../Dashboard'
import { Placeholder } from '../shared'
import type { WriterWorkspace } from '../useWriterWorkspace'
import HelpArticles from './HelpArticles'
import { useTabbedLevel, type LevelTab } from './LevelTabs'

export const DASH_HELP_NAMES = ['dashboard', 'dash', 'shelves']
const DASH_HELP_FALLBACK = 'The Dash is your desk across every project: schedule, checklist, analytics and a scratchpad. Pick a tab to open it; at full size each tab opens as a tile.'

// Where the header's New button starts a project when the tab has nothing of its own to add.
function focusNewProject() {
  document.querySelector<HTMLInputElement>('.wrNewProject input')?.focus()
}

export function dashTabs(w: WriterWorkspace): LevelTab[] {
  return [
    { id: 'schedule', label: 'Schedule', Icon: CalendarIcon, searchable: true, newLabel: 'New routine', render: c => <RoutinesPanel query={c.query} newTick={c.newTick} /> },
    { id: 'checklist', label: 'Checklist', Icon: CheckboxIcon, searchable: true, newLabel: 'New task', render: c => <TasksPanel query={c.query} newTick={c.newTick} /> },
    { id: 'analytics', label: 'Analytics', Icon: BarChartIcon, newLabel: 'New project', onNew: focusNewProject, render: () => <AnalyticsPanel projects={w.projects} outlines={w.projectOutlines} /> },
    { id: 'scratchpad', label: 'Scratchpad', Icon: PencilIcon, searchable: true, newLabel: 'New note', render: c => <Scratchpad bare query={c.query} newTick={c.newTick} /> },
    { id: 'template', label: 'Project template', Icon: LayoutMiniIcon, render: () => <Placeholder title="Project Template" body="Manage the master project template here." /> },
    { id: 'settings', label: 'Settings', Icon: GearIcon, end: true, surface: true, render: () => <ThemeSettingsPanel /> },
    { id: 'help', label: 'Help', Icon: HelpIcon, render: () => <HelpArticles names={DASH_HELP_NAMES} fallback={DASH_HELP_FALLBACK} /> },
  ]
}

// The Dash level's tabs, quick actions (the settings store's Save) and the tiles they open.
export function useDashTabs(w: WriterWorkspace, size: 'min' | 'mid' | 'max') {
  const status = useSettingsSaveStatus()
  return useTabbedLevel({
    storageKey: 'scriblr.writer.dash', tabs: dashTabs(w), size, defaultOpen: ['schedule', 'scratchpad'],
    save: <SaveControl status={status} onSave={() => { void saveSettingsNow() }} onRestore={restoreSettings} buttonClassName="wrSmallBtn wrSaveBtn" />,
  })
}
