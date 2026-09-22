import type { ComponentType, ReactNode } from 'react'
import {
  BarChartIcon, CalendarIcon, EnvelopeIcon, UserIcon,
  BookFaceIcon, GlobeIcon, PencilIcon, BriefcaseIcon, GraduationCapIcon,
  type IconProps,
} from '../icons'
import CustomizeControls from '../../CustomizeControls'
import ThemeSettingsPanel from '../../theme/ThemeSettingsPanel'
import TileGrid, { useTileHost } from '../../components/tiles/TileGrid'
import { TileBig, TileRows, TileSub } from '../../components/tiles/tileParts'
import type { TileDef } from '../../components/tiles/tileTypes'

// The User panel (in the header drawer), per scrilbrPlan.md's "User Page (UUI)"
// section, as tiles: Dashboard, Account and Training are section tiles; expanding
// one shows its pages as child tiles, which expand into their editors in turn.
// Settings and Help are the round buttons at a console's bottom right: the
// Dashboard's Settings is the theme customization tool and the Account's are
// handedness and autosave. Everything else is placeholder text until built.
//
// The root class is "uUIPanel"/"uUIContent", deliberately NOT "uUI" -- that class
// already exists in App.scss as one of the shared, absolutely-positioned
// Mainscreen-layer selectors (.uUI, .rUI, .tUI, .wUI, .aUI), and this UUI is a
// header-drawer resident, not a Mainscreen member.

interface UuiPage { key: string; label: string; Icon: ComponentType<IconProps>; body: string }

interface UuiSection {
  key: 'dashboard' | 'account' | 'training'
  label: string
  Icon: ComponentType<IconProps>
  pages: UuiPage[]
  help: string
  settings?: () => ReactNode
}

// Account > Settings points at the theme tool, which is Dashboard > Settings: open
// the Dashboard tile with its Settings panel showing.
function AccountSettings() {
  const host = useTileHost()
  return <CustomizeControls onOpenThemeSettings={() => host.open('dashboard', 'settings')} />
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
    settings: () => <AccountSettings />,
    pages: [
      { key: 'profile', label: 'Profile', Icon: UserIcon, body: 'Manage your profile details here.' },
      { key: 'subscription', label: 'Subscription', Icon: CalendarIcon, body: 'Manage your subscription here.' },
      { key: 'portfolio', label: 'Portfolio', Icon: BarChartIcon, body: 'View your portfolio here.' },
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

export function userTiles(): TileDef[] {
  return SECTIONS.map(section => {
    const settings = section.settings?.()
    const help = <p>{section.help}</p>
    return {
      id: section.key, title: section.label, Icon: section.Icon,
      shapes: ['small', 'landscape', 'portrait'], defaultShape: 'landscape',
      summary: `${section.pages.length} pages`,
      settings, help,
      render: ({ shape }) => (shape === 'small'
        ? <TileBig value={section.pages.length} label="pages" />
        : <TileRows rows={section.pages.map(p => ({ key: p.key, label: p.label }))} />),
      children: section.pages.map<TileDef>(page => ({
        id: page.key, title: page.label, Icon: page.Icon,
        shapes: ['landscape', 'small', 'link'], defaultShape: 'landscape',
        summary: page.body,
        settings, help,
        render: () => <TileSub>{page.body}</TileSub>,
        console: () => <div className="uUIPage"><h2>{page.label}</h2><p>{page.body}</p></div>,
      })),
    }
  })
}

function UUI() {
  return (
    <section className="uUIPanel" aria-label="User panel">
      <div className="uUIContent uUIContent--tiles">
        <div className="uUIConsoleTitleRow">
          <h1 className="uUIConsoleTitle">User</h1>
        </div>
        <TileGrid gridId="uui" label="User panel tiles" tiles={userTiles()} crumbs={[{ label: 'User' }]} />
      </div>
    </section>
  )
}

export default UUI
