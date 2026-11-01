import type { ComponentType, ReactNode } from 'react'
import {
  BarChartIcon, CalendarIcon, EnvelopeIcon, UserIcon,
  BookFaceIcon, FlagIcon, GlobeIcon, PencilIcon, BriefcaseIcon, GraduationCapIcon,
  type IconProps,
} from '../icons'
import CustomizeControls from '../../CustomizeControls'
import FlagSettings from './FlagSettings'
import ThemeSettingsPanel from '../../theme/ThemeSettingsPanel'
import TileArea, { type AreaTile } from '../../components/tiles/TileArea'

// The User panel (in the header drawer), per scrilbrPlan.md's "User Page (UUI)"
// section, as tiles: Dashboard, Account and Training, each showing its pages, its settings and its help
// directly (the global tile, components/tiles/TileArea.tsx). Dashboard's settings are the theme
// customization tool on its own; Account's carry handedness and autosave plus that same theme tool,
// embedded inline. Everything else is placeholder text until built.
//
// The root class is "uUIPanel"/"uUIContent", deliberately NOT "uUI" -- that class
// already exists in App.scss as one of the shared, absolutely-positioned
// Mainscreen-layer selectors (.uUI, .rUI, .tUI, .wUI, .aUI), and this UUI is a
// header-drawer resident, not a Mainscreen member.

// A page with a `Console` shows that editor in place of its placeholder text.
interface UuiPage { key: string; label: string; Icon: ComponentType<IconProps>; body: string; Console?: ComponentType }

interface UuiSection {
  key: 'dashboard' | 'account' | 'training'
  label: string
  Icon: ComponentType<IconProps>
  pages: UuiPage[]
  help: string
  settings?: () => ReactNode
}

const SECTIONS: UuiSection[] = [
  {
    key: 'dashboard', label: 'Dashboard', Icon: BarChartIcon,
    help: 'Resources and assistance using the Dashboard console here.',
    settings: () => <ThemeSettingsPanel />,
    pages: [
      { key: 'activityLog', label: 'Activity Log', Icon: BarChartIcon, body: 'View your activity log here.' },
      { key: 'dashboardSchedule', label: 'Schedule', Icon: CalendarIcon, body: 'View and manage your schedule here.' },
      { key: 'notifications', label: 'Notifications', Icon: EnvelopeIcon, body: 'View your notifications here.' },
    ],
  },
  {
    key: 'account', label: 'Account', Icon: UserIcon,
    help: 'Resources and assistance using the Account console here.',
    settings: () => <CustomizeControls />,
    pages: [
      { key: 'profile', label: 'Profile', Icon: UserIcon, body: 'Manage your profile details here.' },
      { key: 'subscription', label: 'Subscription', Icon: CalendarIcon, body: 'Manage your subscription here.' },
      { key: 'portfolio', label: 'Portfolio', Icon: BarChartIcon, body: 'View your portfolio here.' },
      { key: 'flags', label: 'Flags', Icon: FlagIcon, body: 'Choose how each content flag is shown to you: hidden, marked, highlight or spoiler.', Console: FlagSettings },
    ],
  },
  {
    key: 'training', label: 'Training', Icon: GraduationCapIcon,
    help: 'Resources and assistance using the Training console here.',
    pages: [
      { key: 'userTraining', label: 'User Training', Icon: UserIcon, body: 'Access user training resources here.' },
      { key: 'readerTraining', label: 'Reader Training', Icon: BookFaceIcon, body: 'Access reader training resources here.' },
      { key: 'translatorTraining', label: 'Translator Training', Icon: GlobeIcon, body: 'Access translator training resources here.' },
      { key: 'writerTraining', label: 'Writer Training', Icon: PencilIcon, body: 'Access writer training resources here.' },
      { key: 'adminTraining', label: 'Admin Training', Icon: BriefcaseIcon, body: 'Access admin training resources here.' },
    ],
  },
]

export function userTiles(): AreaTile[] {
  return SECTIONS.map(section => ({
    id: section.key, title: section.label, Icon: section.Icon,
    children: (
      <div className="uUISection">
        {section.pages.map(page => (
          <section key={page.key} className="uUIPage" aria-label={page.label}>
            <h2>{page.label}</h2>
            {page.Console ? <page.Console /> : <p>{page.body}</p>}
          </section>
        ))}
        {section.settings && <section className="uUIPage" aria-label="Settings"><h2>Settings</h2>{section.settings()}</section>}
        <section className="uUIPage" aria-label="Help"><h2>Help</h2><p>{section.help}</p></section>
      </div>
    ),
  }))
}

function UUI() {
  return (
    <section className="uUIPanel" aria-label="User panel">
      <div className="uUIContent uUIContent--tiles">
        <div className="uUIConsoleTitleRow">
          <h1 className="uUIConsoleTitle">User</h1>
        </div>
        <TileArea gridId="uui" label="User panel tiles" bar tiles={userTiles()} />
      </div>
    </section>
  )
}

export default UUI
