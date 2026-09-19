import { useState } from 'react'
import type { ComponentType } from 'react'
import {
  BarChartIcon, VotingIcon, LibraryIcon, PeopleIcon, BuildingIcon, BriefcaseIcon,
  EnvelopeIcon, CalendarIcon, HelpIcon, TeamIcon, CheckboxIcon, GlobeIcon, SwapIcon, BookFaceIcon,
  PencilIcon, ChatBubblesIcon, UserIcon, SortingIcon, ConfigurationIcon, InfoIcon,
  LayoutMaxIcon, LayoutMidiIcon, LayoutMiniIcon, LockIcon, UnlockIcon,
  type IconProps,
} from '../icons'
import type { AuiSize } from '../../interfaceShellTypes'
import { useAuiConfig, type AuiConfigTabKey } from './admin/useAuiConfig'
import AuiConfigEditor, { AuiConfigReadOnly } from './admin/AuiConfigEditor'
import { SaveControl } from '../../components/SaveControl'

interface AUIProps {
  size: AuiSize
  onSetSize: (size: AuiSize) => void
}

const SIZE_OPTIONS: Array<{ key: AuiSize; label: string; Icon: ComponentType<IconProps> }> = [
  { key: 'full', label: 'Fully expanded', Icon: LayoutMaxIcon },
  { key: 'half', label: 'Half screen', Icon: LayoutMidiIcon },
  { key: 'column', label: 'Single column', Icon: LayoutMiniIcon },
]

// Eight consoles per scrilbrPlan.md's "Admin Page (AUI)" section, plus
// Resources (not in that doc -- added when the Console/Component/Feature
// outline-editor originally built under Configuration turned out to be
// informational reference content, not actual site settings, so it moved
// to its own section; Configuration itself stays as an empty placeholder
// for real settings later). This is a full structural skeleton -- every
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
  | 'projectPlan' | 'visitorConfig' | 'userPageConfig' | 'readerPageConfig' | 'translatorPageConfig'
  | 'writerPageConfig' | 'helperPageConfig' | 'adminPageConfig' | 'resourcesHelp'

interface AuiSubSection {
  key: AuiSubSectionKey
  label: string
  Icon: ComponentType<IconProps>
  body: string
  // Set only on Resources' 8 page-config tabs -- mounts the shared,
  // persisted AuiConfigEditor (admin-config.json, editable Console ->
  // Component -> Feature tree) instead of just this plain-text body.
  configTabKey?: AuiConfigTabKey
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
    // Empty placeholder for now -- the Console/Component/Feature outline
    // editor that used to live here moved to Resources (see the
    // AuiSectionKey comment above); real site-settings content belongs
    // here eventually.
    subSections: [
      { key: 'configOverview', label: 'Overview', Icon: ConfigurationIcon,
        body: 'Site-wide configuration settings will live here.' },
      { key: 'configHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Configuration console here.' },
    ],
  },
  {
    key: 'resources', label: 'Resources', Icon: InfoIcon,
    subSections: [
      { key: 'projectPlan', label: 'Project Plan', Icon: CheckboxIcon,
        body: "The app's own admin-facing build roadmap here, mirroring scrilbrPlan.md's page/console/component hierarchy.",
        configTabKey: 'projectPlan' },
      { key: 'visitorConfig', label: 'Visitor', Icon: GlobeIcon,
        body: 'Configure the Welcome, Registration, and Login pages here.',
        configTabKey: 'visitorConfig' },
      { key: 'userPageConfig', label: 'User', Icon: UserIcon,
        body: 'Configure the Dashboard, Account, and Training pages here.',
        configTabKey: 'userPageConfig' },
      { key: 'readerPageConfig', label: 'Reader', Icon: BookFaceIcon,
        body: 'Configure the Nook, Library, Book, and Pages here.',
        configTabKey: 'readerPageConfig' },
      { key: 'translatorPageConfig', label: 'Translator', Icon: SwapIcon,
        body: 'Configure the Translator interface here.',
        configTabKey: 'translatorPageConfig' },
      { key: 'writerPageConfig', label: 'Writer', Icon: PencilIcon,
        body: 'Configure the Shelves, Shelf, Book, Page, and Pages here.',
        configTabKey: 'writerPageConfig' },
      { key: 'helperPageConfig', label: 'Helper', Icon: ChatBubblesIcon,
        body: 'Configure the Schedule, Chat, Inbox, Queue, and Dispatch here.',
        configTabKey: 'helperPageConfig' },
      { key: 'adminPageConfig', label: 'Admin', Icon: BriefcaseIcon,
        body: 'Configure the Dashboard, Processor, Organizer, Manager, Director, and Office here.',
        configTabKey: 'adminPageConfig' },
      { key: 'resourcesHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Resources console here.' },
    ],
  },
]

function SubTabRow({ subSections, activeKey, onSelect }: {
  subSections: AuiSubSection[]
  activeKey: AuiSubSectionKey
  onSelect: (key: AuiSubSectionKey) => void
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

function AUI({ size, onSetSize }: AUIProps) {
  const [activeSection, setActiveSection] = useState<AuiSectionKey>('dashboard')
  const [activeSubSection, setActiveSubSection] = useState<AuiSubSectionKey>('notifications')
  const [configReadOnly, setConfigReadOnly] = useState(true)
  const auiConfig = useAuiConfig()

  const section = SECTIONS.find(s => s.key === activeSection) ?? SECTIONS[0]
  const subSection = section.subSections.find(s => s.key === activeSubSection) ?? section.subSections[0]
  // Every console defines its own Help sub-tab (added beyond
  // scrilbrPlan.md's literal component list, which only gave some consoles
  // one), so the rail's Help button is always active, never disabled.
  // No console has a Settings sub-tab at all -- the few scrilbrPlan.md
  // originally gave one were dropped along with the rest.
  const helpSubSection = section.subSections.find(s => s.label === 'Help')
  const publishInfo = subSection.configTabKey ? auiConfig.publishInfo(subSection.configTabKey) : null

  // Leaving what is being edited saves it (autosave's "navigation" trigger).
  function selectSubSection(key: AuiSubSectionKey) {
    void auiConfig.saveNow()
    setActiveSubSection(key)
  }

  function selectSection(key: AuiSectionKey) {
    void auiConfig.saveNow()
    const next = SECTIONS.find(s => s.key === key) ?? SECTIONS[0]
    setActiveSection(key)
    setActiveSubSection(next.subSections[0].key)
  }

  return (
    <section className="aUI" aria-label="Admin panel">
      <div className="aUIPanel">
        <div className="aUIContent">
          <div className="aUIConsoleTitleRow">
            <h1 className="aUIConsoleTitle">{section.label}</h1>
            {subSection.configTabKey && (
              <div className="auiConfigActions">
                {publishInfo && (
                  <span
                    className={`auiPublishBadge${publishInfo.unpublished ? ' auiPublishBadge--pending' : ''}`}
                    title={publishInfo.publishedAt ? `Last published ${new Date(publishInfo.publishedAt).toLocaleString()}` : 'Never published'}
                  >
                    {publishInfo.unpublished
                      ? (publishInfo.version === null ? 'Never published' : `Unpublished changes (v${publishInfo.version})`)
                      : `Published v${publishInfo.version}`}
                  </span>
                )}
                {!configReadOnly && (
                  <SaveControl
                    status={auiConfig.saveStatus} label="Save draft" buttonClassName="auiSaveDraftBtn"
                    onSave={() => { void auiConfig.saveNow() }} onRestore={auiConfig.restoreDraft}
                    extra={
                      <button
                        type="button" className="auiPublishBtn"
                        disabled={auiConfig.publishing || !publishInfo?.unpublished}
                        title="Publish this tab's draft as the version everyone sees"
                        onClick={() => subSection.configTabKey && void auiConfig.publishTab(subSection.configTabKey)}
                      >
                        {auiConfig.publishing ? 'Publishing…' : 'Publish'}
                      </button>
                    }
                  />
                )}
              <button
                type="button"
                className={configReadOnly ? 'auiConfigModeToggle auiConfigModeToggle--locked' : 'auiConfigModeToggle auiConfigModeToggle--unlocked'}
                aria-pressed={configReadOnly}
                aria-label={configReadOnly ? 'Read-only -- click to enable editing' : 'Editable -- click to make read-only'}
                title={configReadOnly ? 'Read-only' : 'Editable'}
                onClick={() => { void auiConfig.saveNow(); setConfigReadOnly(r => !r) }}
              >
                {configReadOnly ? <LockIcon size={16} /> : <UnlockIcon size={16} />}
              </button>
              </div>
            )}
          </div>

          {/* Help is dropped from the tab row -- the rail's Help button is
              the only way in, since a per-tab entry would be redundant. */}
          <SubTabRow
            subSections={section.subSections.filter(s => s.label !== 'Help')}
            activeKey={subSection.key}
            onSelect={selectSubSection}
          />
          {auiConfig.publishError && <p className="feedbackCardMeta">{auiConfig.publishError}</p>}
          <div className="sectionBody">
            <h2>{subSection.label}</h2>
            <p>{subSection.body}</p>
            {subSection.configTabKey && (
              configReadOnly
                ? <AuiConfigReadOnly tab={subSection.configTabKey} config={auiConfig} />
                : <AuiConfigEditor tab={subSection.configTabKey} config={auiConfig} />
            )}
          </div>
        </div>

        {/* The section picker (formerly .subNav, floating on the inner
            side) now lives on AUI's own outer edge, stacked directly
            under Help -- one rail, mirroring .sidebar's own
            outermost/divider/innermost convention at AUI's own scale. */}
        <nav className="aUIRail" aria-label="Admin panel sections">
          <button
            type="button"
            className={subSection.label === 'Help' ? 'subNavBtn subNavBtn--active' : 'subNavBtn'}
            aria-label="Help" title="Help"
            disabled={!helpSubSection}
            onClick={() => helpSubSection && setActiveSubSection(helpSubSection.key)}
          >
            <HelpIcon size={18} />
          </button>
          <div className="aUIRailDivider" aria-hidden="true" />
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

          {/* AUI's own panel-size controls -- fully expanded, half screen,
              or a single HUI-panel-width column -- pinned to the bottom of
              the screen (margin-top: auto) rather than sitting wherever
              the section list happens to end. */}
          <div className="aUIRailSizeGroup">
            <div className="aUIRailDivider" aria-hidden="true" />
            {SIZE_OPTIONS.map(({ key, label, Icon }) => (
              <button
                key={key} type="button"
                className={key === size ? 'subNavBtn subNavBtn--active' : 'subNavBtn'}
                aria-pressed={key === size}
                aria-label={label} title={label}
                onClick={() => onSetSize(key)}
              >
                <Icon />
              </button>
            ))}
          </div>
        </nav>
      </div>
    </section>
  )
}

export default AUI
