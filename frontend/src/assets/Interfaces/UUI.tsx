import { useState } from 'react'
import type { ComponentType } from 'react'
import {
  BarChartIcon, CalendarIcon, EnvelopeIcon, GearIcon, HelpIcon, UserIcon,
  BookFaceIcon, GlobeIcon, PencilIcon, BriefcaseIcon, GraduationCapIcon,
  type IconProps,
} from '../icons'
import CustomizeControls from '../../CustomizeControls'
import ThemeSettingsPanel from '../../theme/ThemeSettingsPanel'

// Three consoles per scrilbrPlan.md's "User Page (UUI)" section. Full
// structural skeleton, mirroring AUI.tsx's pattern exactly -- every named
// component present and selectable, placeholder body text throughout,
// except: Dashboard ->
// Settings (the full theme customization tool) and Account -> Settings
// (handedness, plus a pointer to the theme tool).
//
// Root class is "uUIPanel"/"uUIContent", deliberately NOT "uUI" -- that
// class already exists in App.scss as one of the 5 shared, absolutely-
// positioned Mainscreen-layer selectors (.uUI, .rUI, .tUI, .wUI, .aUI), and
// this UUI is a header-drawer resident, not a Mainscreen member.
type UuiSectionKey = 'dashboard' | 'account' | 'training'

type UuiSubSectionKey =
  | 'activityLog' | 'dashboardSchedule' | 'notifications' | 'dashboardSettings' | 'dashboardHelp'
  | 'profile' | 'subscription' | 'portfolio' | 'accountSettings' | 'accountHelp'
  | 'userTraining' | 'readerTraining' | 'translatorTraining' | 'writerTraining' | 'adminTraining'
  | 'trainingSettings' | 'trainingHelp'

interface UuiSubSection {
  key: UuiSubSectionKey
  label: string
  Icon: ComponentType<IconProps>
  body: string
}

interface UuiSectionDef {
  key: UuiSectionKey
  label: string
  Icon: ComponentType<IconProps>
  subSections: UuiSubSection[]
}

const SECTIONS: UuiSectionDef[] = [
  {
    key: 'dashboard', label: 'Dashboard', Icon: BarChartIcon,
    subSections: [
      { key: 'activityLog', label: 'Activity Log', Icon: BarChartIcon,
        body: 'View your activity log here.' },
      { key: 'dashboardSchedule', label: 'Schedule', Icon: CalendarIcon,
        body: 'View and manage your schedule here.' },
      { key: 'notifications', label: 'Notifications', Icon: EnvelopeIcon,
        body: 'View your notifications here.' },
      { key: 'dashboardSettings', label: 'Settings', Icon: GearIcon,
        body: 'Configure settings specific to the Dashboard console here.' },
      { key: 'dashboardHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Dashboard console here.' },
    ],
  },
  {
    key: 'account', label: 'Account', Icon: UserIcon,
    subSections: [
      { key: 'profile', label: 'Profile', Icon: UserIcon,
        body: 'Manage your profile details here.' },
      { key: 'subscription', label: 'Subscription', Icon: CalendarIcon,
        body: 'Manage your subscription here.' },
      { key: 'portfolio', label: 'Portfolio', Icon: BarChartIcon,
        body: 'View your portfolio here.' },
      // Not rendered directly -- UUI special-cases this exact
      // section+subSection combo to render CustomizeControls instead (see
      // showCustomize below). Kept non-empty for shape parity with every
      // other subSection.
      { key: 'accountSettings', label: 'Settings', Icon: GearIcon,
        body: 'Customize handedness and autosave here; colors and time-of-day themes are in Dashboard > Settings.' },
      { key: 'accountHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Account console here.' },
    ],
  },
  {
    key: 'training', label: 'Training', Icon: GraduationCapIcon,
    subSections: [
      { key: 'userTraining', label: 'User Training', Icon: UserIcon,
        body: 'Access user training resources here.' },
      { key: 'readerTraining', label: 'Reader Training', Icon: BookFaceIcon,
        body: 'Access reader training resources here.' },
      { key: 'translatorTraining', label: 'Translator Training', Icon: GlobeIcon,
        body: 'Access translator training resources here.' },
      { key: 'writerTraining', label: 'Writer Training', Icon: PencilIcon,
        body: 'Access writer training resources here.' },
      { key: 'adminTraining', label: 'Admin Training', Icon: BriefcaseIcon,
        body: 'Access admin training resources here.' },
      { key: 'trainingSettings', label: 'Settings', Icon: GearIcon,
        body: 'Configure settings specific to the Training console here.' },
      { key: 'trainingHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Training console here.' },
    ],
  },
]

function SubTabRow({ subSections, activeKey, onSelect }: {
  subSections: UuiSubSection[]
  activeKey: UuiSubSectionKey
  onSelect: (key: UuiSubSectionKey) => void
}) {
  return (
    <nav className="subTabRow" aria-label="Sub-section tabs">
      {subSections.map(({ key, label, Icon }) => (
        <button
          key={key} type="button"
          className={key === activeKey ? 'subTabBtn subTabBtn--active' : 'subTabBtn'}
          aria-pressed={key === activeKey}
          onClick={() => onSelect(key)}
        >
          <span className="subTabBtnMain"><Icon /> {label}</span>
        </button>
      ))}
    </nav>
  )
}

function UUI() {
  const [activeSection, setActiveSection] = useState<UuiSectionKey>('dashboard')
  const [activeSubSection, setActiveSubSection] = useState<UuiSubSectionKey>('activityLog')

  const section = SECTIONS.find(s => s.key === activeSection) ?? SECTIONS[0]
  const subSection = section.subSections.find(s => s.key === activeSubSection) ?? section.subSections[0]
  const helpSubSection = section.subSections.find(s => s.label === 'Help')
  const settingsSubSection = section.subSections.find(s => s.label === 'Settings')

  function selectSection(key: UuiSectionKey) {
    const next = SECTIONS.find(s => s.key === key) ?? SECTIONS[0]
    setActiveSection(key)
    setActiveSubSection(next.subSections[0].key)
  }

  const showCustomize = section.key === 'account' && subSection.key === 'accountSettings'
  const showThemeSettings = section.key === 'dashboard' && subSection.key === 'dashboardSettings'

  function openThemeSettings() {
    setActiveSection('dashboard')
    setActiveSubSection('dashboardSettings')
  }

  return (
    <section className="uUIPanel" aria-label="User panel">
      <nav className="subNav" aria-label="User panel sections">
        {SECTIONS.map(({ key, label, Icon }) => (
          <button
            key={key} type="button"
            className={key === activeSection ? 'subNavBtn subNavBtn--active' : 'subNavBtn'}
            aria-pressed={key === activeSection}
            aria-label={label} title={label}
            onClick={() => selectSection(key)}
          >
            <Icon />
          </button>
        ))}
      </nav>
      <div className="uUIContent">
        <button
          type="button"
          className={
            subSection.label === 'Help' ? 'uUICornerBtn uUICornerBtn--help uUICornerBtn--active' : 'uUICornerBtn uUICornerBtn--help'
          }
          aria-label="Help" title="Help"
          disabled={!helpSubSection}
          onClick={() => helpSubSection && setActiveSubSection(helpSubSection.key)}
        >
          <HelpIcon size={18} />
        </button>
        <button
          type="button"
          className={
            subSection.label === 'Settings' ? 'uUICornerBtn uUICornerBtn--settings uUICornerBtn--active' : 'uUICornerBtn uUICornerBtn--settings'
          }
          aria-label="Settings" title="Settings"
          disabled={!settingsSubSection}
          onClick={() => settingsSubSection && setActiveSubSection(settingsSubSection.key)}
        >
          <GearIcon size={18} />
        </button>

        <div className="uUIConsoleTitleRow">
          <h1 className="uUIConsoleTitle">{section.label}</h1>
        </div>

        <SubTabRow
          subSections={section.subSections.filter(s => s.label !== 'Settings' && s.label !== 'Help')}
          activeKey={subSection.key}
          onSelect={setActiveSubSection}
        />
        <div className="sectionBody">
          {showCustomize ? (
            <CustomizeControls onOpenThemeSettings={openThemeSettings} />
          ) : showThemeSettings ? (
            <ThemeSettingsPanel />
          ) : (
            <>
              <h2>{subSection.label}</h2>
              <p>{subSection.body}</p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

export default UUI
