import { useState, type ComponentType, type ReactNode } from 'react'
import {
  BarChartIcon, CalendarIcon, EnvelopeIcon, UserIcon,
  FlagIcon, GearIcon, HelpIcon,
  type IconProps,
} from '../icons'
import CustomizeControls from '../../CustomizeControls'
import FlagSettings from './FlagSettings'
import ThemeSettingsPanel from '../../theme/ThemeSettingsPanel'
import TileArea, { type AreaTile } from '../../components/tiles/TileArea'
import { consoleTile, useRailSlots } from '../../components/tiles/consoleTiles'

// The User panel (in the header drawer), per scrilbrPlan.md's "User Page (UUI)"
// section, as tiles (the global tile, components/tiles/TileArea.tsx): the consoles are Dashboard and Account, each holding
// its pages as tiles (their rail is in its title bar), then Settings and Help, which are consoles of their own (last in the panel's
// rail) and never tiles of a section. Dashboard's settings are the theme customization tool on its own; Account's carry
// handedness and autosave plus that same theme tool, embedded inline. Everything else is placeholder text until built.
//
// The root class is "uUIPanel"/"uUIContent", deliberately NOT "uUI" -- that class
// already exists in App.scss as one of the shared, absolutely-positioned
// Mainscreen-layer selectors (.uUI, .rUI, .tUI, .wUI, .aUI), and this UUI is a
// header-drawer resident, not a Mainscreen member.

// A page with a `Console` shows that editor in place of its placeholder text.
interface UuiPage { key: string; label: string; Icon: ComponentType<IconProps>; body: string; Console?: ComponentType }

interface UuiSection {
  key: 'dashboard' | 'account'
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
]

function UUI() {
  const slots = useRailSlots()
  const [rail, setRail] = useState<HTMLElement | null>(null)
  // The consoles: each section holds its pages as tiles (their rail in its title bar); Settings and Help are consoles too, last in the panel's rail.
  const tiles: AreaTile[] = [
    ...SECTIONS.map(section => consoleTile(slots, {
      panel: 'uui', id: section.key, title: section.label, Icon: section.Icon,
      pages: section.pages.map(page => ({ id: page.key, label: page.label, Icon: page.Icon, children: page.Console ? <page.Console /> : <p>{page.body}</p> })),
    })),
    {
      id: 'settings', title: 'Settings', Icon: GearIcon,
      children: (
        <div className="uUISection">
          {SECTIONS.filter(s => s.settings).map(s => <section key={s.key} className="uUIPage" aria-label={`${s.label} settings`}><h2>{s.label}</h2>{s.settings!()}</section>)}
        </div>
      ),
    },
    {
      id: 'help', title: 'Help', Icon: HelpIcon,
      children: (
        <div className="uUISection">
          {SECTIONS.map(s => <section key={s.key} className="uUIPage" aria-label={`${s.label} help`}><h2>{s.label}</h2><p>{s.help}</p></section>)}
        </div>
      ),
    },
  ]
  return (
    <section className="uUIPanel" aria-label="User panel">
      <div className="uUIContent uUIContent--tiles">
        <div className="uUIConsoleTitleRow">
          <h1 className="uUIConsoleTitle">User</h1>
          <span ref={setRail} className="gtRailSlot" />
        </div>
        <TileArea gridId="uui" label="User panel consoles" bar barHost={rail} tiles={tiles} />
      </div>
    </section>
  )
}

export default UUI
