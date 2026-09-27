import RoleAssignment from './admin/RoleAssignment'
import type { ComponentType } from 'react'
import {
  BarChartIcon, VotingIcon, LibraryIcon, PeopleIcon, BuildingIcon, BriefcaseIcon,
  EnvelopeIcon, CalendarIcon, HelpIcon, TeamIcon, SortingIcon, ConfigurationIcon, InfoIcon,
  type IconProps,
} from '../icons'
import ResourcesConsole from './admin/resources/ResourcesConsole'
import TileGrid from '../../components/tiles/TileGrid'
import { TileBig, TileRows, TileSub } from '../../components/tiles/tileParts'
import type { TileDef } from '../../components/tiles/tileTypes'

// Eight consoles per scrilbrPlan.md's "Admin Page (AUI)" section (this array
// covers 7 of them; Resources -- not in that doc -- is built separately
// below, since it isn't this shape: one console, no per-page children, just
// the article/quiz builder). This is a full structural skeleton -- every
// named component present and selectable, placeholder body text
// throughout -- not a rebuild of the old ad hoc feedback/presets/users
// sections (which didn't match the doc; the parts of that pipeline the
// doc actually keeps, Tone/Sorting/Explicate, moved to HUI's Inbox
// Console instead, since the doc assigns them there).
type AuiSectionKey = 'dashboard' | 'processor' | 'organizer' | 'manager' | 'director' | 'office' | 'configuration' | 'resources'

type AuiSubSectionKey =
  | 'notifications' | 'dashboardSchedule' | 'dashboardHelp'
  | 'voting' | 'processorHelp'
  | 'channelManagement' | 'bookclubManagement' | 'organizerHelp'
  | 'allotment' | 'assignment' | 'teamSchedule' | 'managerHelp'
  | 'departmentDetails' | 'departmentRoster' | 'departmentAnalytics' | 'department' | 'directorHelp'
  | 'monitorTraining' | 'departmentSchedules' | 'hireTermAdmin' | 'officeHelp'
  | 'configOverview' | 'configHelp'

interface AuiSubSection {
  key: AuiSubSectionKey
  label: string
  Icon: ComponentType<IconProps>
  body: string
}

interface AuiSectionDef {
  key: AuiSectionKey
  label: string
  Icon: ComponentType<IconProps>
  subSections: AuiSubSection[]
}

const SECTIONS: AuiSectionDef[] = [
  {
    key: 'dashboard', label: 'Dashboard', Icon: BarChartIcon,
    subSections: [
      { key: 'notifications', label: 'Notifications', Icon: EnvelopeIcon,
        body: 'View admin notifications here.' },
      { key: 'dashboardSchedule', label: 'Schedule', Icon: CalendarIcon,
        body: 'View and manage the admin work schedule here.' },
      { key: 'dashboardHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Dashboard console here.' },
    ],
  },
  {
    key: 'processor', label: 'Processor', Icon: VotingIcon,
    subSections: [
      { key: 'voting', label: 'Voting', Icon: VotingIcon,
        body: 'Approve and/or deny explicated, toned, and sorted feedback, and set the admin-defined processing order for tones and feature sorting, here.' },
      { key: 'processorHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Processor console here.' },
    ],
  },
  {
    key: 'organizer', label: 'Organizer', Icon: LibraryIcon,
    subSections: [
      { key: 'channelManagement', label: 'Channel Management', Icon: SortingIcon,
        body: 'Review processed feedback here, as a second processing pass after Voting.' },
      { key: 'bookclubManagement', label: 'Bookclub Management', Icon: LibraryIcon,
        body: 'Manage bookclubs here.' },
      { key: 'organizerHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Organizer console here.' },
    ],
  },
  {
    key: 'manager', label: 'Manager', Icon: PeopleIcon,
    subSections: [
      { key: 'allotment', label: 'Allotment', Icon: PeopleIcon,
        body: 'Manage team and user allotments here.' },
      { key: 'assignment', label: 'Assignment', Icon: TeamIcon,
        body: 'Manage team and user assignments here.' },
      { key: 'teamSchedule', label: 'Team Schedule', Icon: CalendarIcon,
        body: 'View and manage team schedules here.' },
      { key: 'managerHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Manager console here.' },
    ],
  },
  {
    key: 'director', label: 'Director', Icon: BuildingIcon,
    subSections: [
      { key: 'departmentDetails', label: 'Department Details', Icon: BuildingIcon,
        body: 'View department details here.' },
      { key: 'departmentRoster', label: 'Department Roster', Icon: PeopleIcon,
        body: 'Manage roles — promote, demote, or skill admin users based on training, and assign full and part time schedules here.' },
      { key: 'departmentAnalytics', label: 'Department Analytics', Icon: BarChartIcon,
        body: 'View department analytics here.' },
      { key: 'department', label: 'Department', Icon: BuildingIcon,
        body: 'Manage the department here.' },
      { key: 'directorHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Director console here.' },
    ],
  },
  {
    key: 'office', label: 'Office', Icon: BriefcaseIcon,
    // The doc gives this console bullets instead of named components.
    subSections: [
      { key: 'monitorTraining', label: 'Monitor Training', Icon: BriefcaseIcon,
        body: 'Monitor admin training progress here.' },
      { key: 'departmentSchedules', label: 'Department Schedules', Icon: CalendarIcon,
        body: 'View and manage department schedules here.' },
      { key: 'hireTermAdmin', label: 'Hire/Term Admin', Icon: PeopleIcon,
        body: 'Hire or terminate admin users here.' },
      { key: 'officeHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Office console here.' },
    ],
  },
  {
    key: 'configuration', label: 'Configuration', Icon: ConfigurationIcon,
    // Empty placeholder for now -- real site-settings content belongs here eventually.
    subSections: [
      { key: 'configOverview', label: 'Overview', Icon: ConfigurationIcon,
        body: 'Site-wide configuration settings will live here.' },
      { key: 'configHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Configuration console here.' },
    ],
  },
]

// Not one of the Section/subSection page-editor tiles above: Resources is a
// single console, the article/quiz builder (admin/resources/ResourcesConsole.tsx)
// -- real backend persistence, its own Interface > Console > Component >
// Feature tree, not a per-page settings editor.
const RESOURCES_HELP = <p>Author Guides, Tutorials, FAQs, feedback and an Exam/Test/Quiz bank for every interface, console, component and feature here.</p>

function AUI() {
  // Each section is a tile; its pages are child tiles that expand into their editors.
  // A section's Help sub-tab is the Help button at its console's corner.
  const tiles: TileDef[] = SECTIONS.map(section => {
    const pages = section.subSections.filter(s => s.label !== 'Help')
    const help = <p>{section.subSections.find(s => s.label === 'Help')?.body}</p>
    return {
      id: section.key, title: section.label, Icon: section.Icon,
      defaultShape: 'mid',
      summary: `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`,
      help,
      render: ({ height }) => (height < 140
        ? <TileBig value={pages.length} label={pages.length === 1 ? 'page' : 'pages'} />
        : <TileRows rows={pages.map(p => ({ key: p.key, label: p.label }))} />),
      children: pages.map<TileDef>(page => ({
        id: page.key, title: page.label, Icon: page.Icon,
        defaultShape: 'mid',
        summary: page.body,
        help,
        render: () => <TileSub>{page.body}</TileSub>,
        console: () => (
          <div className="aUIPage">
            <h2>{page.label}</h2>
            {page.key === 'assignment' ? <RoleAssignment /> : <p>{page.body}</p>}
          </div>
        ),
      })),
    }
  })
  tiles.push({
    id: 'resources', title: 'Resources', Icon: InfoIcon,
    defaultShape: 'mid',
    summary: 'Article & quiz builder',
    help: RESOURCES_HELP,
    render: () => <TileSub>Author Guides, Tutorials, FAQs and Exam/Test/Quiz content here.</TileSub>,
    console: () => <ResourcesConsole />,
  })

  return (
    <section className="aUI" aria-label="Admin panel">
      <div className="aUIPanel">
        <div className="aUIContent aUIContent--tiles">
          <div className="aUIConsoleTitleRow">
            <h1 className="aUIConsoleTitle">Admin</h1>
          </div>
          <TileGrid gridId="aui" label="Admin panel tiles" tiles={tiles} crumbs={[{ label: 'Admin' }]} />
        </div>
      </div>
    </section>
  )
}

export default AUI
