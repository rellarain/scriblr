import { CalendarIcon, FolderIcon, GearIcon, HelpIcon, PencilIcon, PeopleIcon } from '../../../icons'
import { SettingsSaveCluster } from '../../../../components/SettingsSaveCluster'
import { flushSettings } from '../../../../settings/settingsStore'
import ThemeSettingsPanel from '../../../../theme/ThemeSettingsPanel'
import { Scratchpad } from '../Dashboard'
import ReadersPanel from '../ReadersPanel'
import ProjectConsole from '../plan/ProjectConsole'
import { ProjectSummary } from '../plan/ProjectSummary'
import ScheduleConsole from '../schedule/ScheduleConsole'
import { ScheduleSummary } from '../schedule/ScheduleSummary'
import type { WriterWorkspace } from '../useWriterWorkspace'
import HelpArticles from './HelpArticles'
import { useTabbedLevel, type LevelTab } from './LevelTabs'

export const DASH_HELP_NAMES = ['dashboard', 'dash', 'shelves']
const DASH_HELP_FALLBACK = 'The Dash is your desk across every project: the schedule (goals, the agenda, the backlog and analytics), the project (its phases, goals and work, and the template) and a scratchpad. Pick a tab to open it; at full size each tab opens as a tile.'

export function dashTabs(w: WriterWorkspace): LevelTab[] {
  return [
    {
      id: 'schedule', label: 'Schedule', Icon: CalendarIcon, fill: true, surface: false, titleSlot: true, iconSize: 20,
      render: c => {
        const ids = w.projects.map(p => p.projectId)
        return c.size === 'max'
          ? <ScheduleConsole scope="dash" titleSlot={c.titleSlot} projectIds={ids} titles={Object.fromEntries(w.projects.map(p => [p.projectId, p.title]))} hues={Object.fromEntries(w.projects.map(p => [p.projectId, w.projectHueOf(p)]))} />
          : <ScheduleSummary projectIds={ids} />
      },
    },
    { id: 'readers', label: 'Readers', Icon: PeopleIcon, render: () => <ReadersPanel /> },
    { id: 'scratchpad', label: 'Scratchpad', Icon: PencilIcon, searchable: true, render: c => <Scratchpad bare query={c.query} /> },
    {
      id: 'project', label: 'Project', Icon: FolderIcon, fill: true, surface: false, titleSlot: true, iconSize: 20,
      render: c => {
        const ids = w.projects.map(p => p.projectId)
        const titles = Object.fromEntries(w.projects.map(p => [p.projectId, p.title]))
        return c.size === 'max' ? <ProjectConsole scope="dash" titleSlot={c.titleSlot} projectIds={ids} titles={titles} /> : <ProjectSummary projectIds={ids} titles={titles} />
      },
    },
    { id: 'settings', label: 'Settings', Icon: GearIcon, end: true, surface: true, render: () => <ThemeSettingsPanel /> },
    { id: 'help', label: 'Help', Icon: HelpIcon, render: () => <HelpArticles names={DASH_HELP_NAMES} fallback={DASH_HELP_FALLBACK} /> },
  ]
}

// The Dash level's tabs, quick actions (the settings store's Save) and the tiles they open.
export function useDashTabs(w: WriterWorkspace, size: 'min' | 'mid' | 'max') {
  return useTabbedLevel({
    storageKey: 'scriblr.writer.dash', tabs: dashTabs(w), size, defaultOpen: ['schedule'], flush: () => { void flushSettings() },
    // The Dash's Undo and Redo are for the settings (its Settings tab); the other tabs keep their own things in the scratchpad and lists.
    save: focused => <SettingsSaveCluster buttonClassName="wrSmallBtn wrSaveBtn" showHistory={focused === 'settings'} />,
  })
}
