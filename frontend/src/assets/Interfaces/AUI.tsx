import RoleAssignment from './admin/RoleAssignment'
import { Suspense, lazy, useState, type ComponentType } from 'react'
import {
  BarChartIcon, VotingIcon, LibraryIcon, PeopleIcon, BuildingIcon, BriefcaseIcon,
  EnvelopeIcon, CalendarIcon, HelpIcon, TeamIcon, SortingIcon, ConfigurationIcon, InfoIcon, PlotIcon, MannequinIcon, MapIcon, GraduationCapIcon,
  type IconProps,
} from '../icons'
import TileArea, { type AreaTile } from '../../components/tiles/TileArea'
import { consoleTile, useRailSlots } from '../../components/tiles/consoleTiles'

// The article and quiz builder (and the Markdown renderer behind it) is loaded when its console is opened.
const ResourcesConsole = lazy(() => import('./admin/resources/ResourcesConsole'))
// The Training builder, loaded when the Instructor console is opened.
const InstructorConsole = lazy(() => import('./admin/instructor/InstructorConsole'))
// The plot presets page, loaded when Configuration > Plot is opened.
const PlotPresetsConsole = lazy(() => import('./admin/plot/PlotPresetsConsole'))
const MapsConfigConsole = lazy(() => import('./admin/maps/MapsConfigConsole'))
// The Designer (the character models and the canvas they are drawn on), loaded when its console is opened.
const DesignerConsole = lazy(() => import('./admin/characters/DesignerConsole'))
// The limits for the models writers design for themselves, loaded when Configuration > Writers' designer is opened.
const WriterLimitsConsole = lazy(() => import('./admin/characters/WriterLimitsConsole'))
import { DESIGNER_TOOLS, WRITER_DESIGNER } from './admin/characters/designerFeatures'

// Eight consoles per scrilbrPlan.md's "Admin Page (AUI)" section (this array
// covers 7 of them; Resources -- not in that doc -- is built separately
// below, since it isn't this shape: one console, no per-page children, just
// the article/quiz builder). This is a full structural skeleton -- every
// named component present and selectable, placeholder body text
// throughout -- not a rebuild of the old ad hoc feedback/presets/users
// sections (which didn't match the doc; the parts of that pipeline the
// doc actually keeps, Tone/Sorting/Explicate, moved to HUI's Inbox
// Console instead, since the doc assigns them there).
type AuiSectionKey = 'dashboard' | 'processor' | 'organizer' | 'manager' | 'director' | 'office' | 'configuration' | 'designer' | 'resources'

type AuiSubSectionKey =
  | 'notifications' | 'dashboardSchedule' | 'dashboardHelp'
  | 'voting' | 'processorHelp'
  | 'channelManagement' | 'bookclubManagement' | 'organizerHelp'
  | 'allotment' | 'assignment' | 'teamSchedule' | 'managerHelp'
  | 'departmentDetails' | 'departmentRoster' | 'departmentAnalytics' | 'department' | 'directorHelp'
  | 'monitorTraining' | 'departmentSchedules' | 'hireTermAdmin' | 'officeHelp'
  | 'configOverview' | 'configPlot' | 'configMaps' | 'configWriterDesigner' | 'configHelp'
  | 'designerWork' | 'designerHelp'

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

// The Designer's help: the shape editor shows no explanations of its own, so they are here.
const DESIGNER_HELP = [
  'The Designer is a shape editor for now. A model holds groups, a group holds objects and an object holds shapes; the tree on the left opens them in turn, and the panel on the right edits what is open.',
  'Shapes: New shape (or the plus beside the shapes in the tree) adds one from a template: a square, a rectangle, a circle, an ellipse, an equilateral or a right triangle, a pentagon, a hexagon, or a polygon or a star with the number of sides or points set beside it. Click inside a shape to select it and drag it to move it. Its box resizes it from a corner or a side (Shift keeps its proportions) and its round handle turns it (Shift turns in steps of 15 degrees); the steppers set its place, size and angle exactly, and Keep proportions makes every resize keep them. Flip turns it over across or down, Align puts its middle on the middle of the model, and Forward and Back move it in front of or behind the shapes of its object.',
  'Look: a shape has an outline, drawn over its fill in one dark ink. Outline turns it off or on and Outline width makes it thinner or thicker (Shift: a whole unit at a time). Opacity fades the fill only, so a shape can be an outline alone.',
  'Points and segments: hover over a shape to see its outline and points. Click a point or a segment to select it; drag a point or a curve handle to move it. Right-click a point to change its type (corner, curve, curve in only, curve out only), right-click a segment to make it straight or curved, and double-click a segment to add a point there. The arrow keys move what is selected (Shift: ten times as far) and Delete removes the selected point.',
  'Connections: drag a point over a point or a segment of another shape; the point turns the alert colour, and letting go connects them. On a point they are welded (dragging either moves both); on a segment the point stays on it and slides along it. Two neighbouring points welded to two neighbouring points of another shape make a shared segment, one curve for both. Right-drag a connected point to pull it free. A connection and a shared segment can be named.',
  'Symmetry: turn it on for a shape, choose the angle of the first axis and how many axes (evenly spaced), then click the side to copy. The other sides follow it, and a point in any copy can be dragged. Turning it off keeps every point where it is.',
  'Viewing: right-drag the grid to pan, Ctrl and scroll on the canvas (or the zoom slider) to zoom, and Fit to see everything. Right-click the grid to unselect everything. Snap and Snap to grid can be turned off in the panel.',
].join('\n\n')

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
      { key: 'configPlot', label: 'Plot', Icon: PlotIcon,
        body: 'Set up the plot presets the Writer offers: ready-made categories with their description, keywords, fields, subcategories and clusters.' },
      { key: 'configMaps', label: 'Maps', Icon: MapIcon,
        body: 'Set the biomes every project draws its maps with: their colours, names, groups and the map levels they are offered on.' },
      // the writers' own designer is off the screen for now (designerFeatures.ts)
      ...(WRITER_DESIGNER ? [{ key: 'configWriterDesigner' as const, label: "Writers' designer", Icon: MannequinIcon,
        body: "Set how big the models a writer designs for themselves may be: points in a shape, shapes in an object, objects in a group, the totals in a model, the size of a character's copy and the models in a writer's library." }] : []),
      { key: 'configHelp', label: 'Help', Icon: HelpIcon,
        body: 'Resources and assistance using the Configuration console here.' },
    ],
  },
  {
    // A console of its own, beside Configuration: one page, the canvas with its four toolbars (admin/characters/DesignerConsole.tsx).
    key: 'designer', label: 'Designer', Icon: MannequinIcon,
    subSections: [
      { key: 'designerWork', label: 'Designer', Icon: MannequinIcon,
        body: 'Draw the models characters are made from: shapes in objects, objects in groups.' },
      { key: 'designerHelp', label: 'Help', Icon: HelpIcon,
        body: DESIGNER_HELP },
    ],
  },
]

// Not one of the Section/subSection tiles above: Resources is a single tile, the article/quiz builder
// (admin/resources/ResourcesConsole.tsx) -- real backend persistence, its own Interface > Console >
// Component > Feature tree, not a per-page settings editor.

// The Designer's tile: the console is the whole body (the canvas with the tree, the editor and the view controls over it), and its title bar holds the console tools
// (undo, redo, save, publish), which the console puts there.
function designerTile(slots: ReturnType<typeof useRailSlots>): AreaTile {
  return {
    id: 'designer', title: 'Designer', Icon: MannequinIcon, bodyClassName: 'gtBody--designer',
    titleExtras: <span ref={slots.ref('designer')} className="gtRailSlot gtRailSlot--tools" />,
    children: <Suspense fallback={null}><DesignerConsole toolbarHost={slots.host('designer')} tools={DESIGNER_TOOLS} /></Suspense>,
  }
}

function AUI() {
  const slots = useRailSlots()
  const [rail, setRail] = useState<HTMLElement | null>(null)
  // Each section is a console holding its pages as tiles (their rail is in its title bar). Help is a console of its own, last in the panel's rail,
  // with each section's help under its name (the sections' own Help sub-pages).
  const tiles: AreaTile[] = SECTIONS.map(section => section.key === 'designer' ? designerTile(slots) : consoleTile(slots, {
    panel: 'aui', id: section.key, title: section.label, Icon: section.Icon,
    pages: section.subSections.filter(s => s.label !== 'Help').map(page => ({
      id: page.key, label: page.label, Icon: page.Icon,
      children: page.key === 'assignment' ? <RoleAssignment />
        : page.key === 'configPlot' ? <Suspense fallback={null}><PlotPresetsConsole /></Suspense>
        : page.key === 'configMaps' ? <Suspense fallback={null}><MapsConfigConsole /></Suspense>
        : page.key === 'configWriterDesigner' ? <Suspense fallback={null}><WriterLimitsConsole /></Suspense>
        : <p>{page.body}</p>,
    })),
  }))
  tiles.push({
    id: 'resources', title: 'Resources', Icon: InfoIcon,
    children: <Suspense fallback={null}><ResourcesConsole /></Suspense>,
  })
  // The Instructor console is the Training builder (admin/instructor/InstructorConsole.tsx): the curricula, courses, modules, lessons and what Training
  // shows, saved through /api/training.
  tiles.push({
    id: 'instructor', title: 'Instructor', Icon: GraduationCapIcon,
    children: <Suspense fallback={null}><InstructorConsole /></Suspense>,
  })
  tiles.push({
    id: 'help', title: 'Help', Icon: HelpIcon,
    children: (
      <div className="aUISection">
        {SECTIONS.map(section => (
          <section key={section.key} className="aUIPage" aria-label={`${section.label} help`}>
            <h2>{section.label}</h2>
            {(section.subSections.find(s => s.label === 'Help')?.body ?? '').split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
          </section>
        ))}
      </div>
    ),
  })

  return (
    <section className="aUI" aria-label="Admin panel">
      <div className="aUIPanel">
        <div className="aUIContent aUIContent--tiles">
          <div className="aUIConsoleTitleRow">
            <h1 className="aUIConsoleTitle">Admin</h1>
            <span ref={setRail} className="gtRailSlot" />
          </div>
          <TileArea gridId="aui" label="Admin panel consoles" bar barHost={rail} tiles={tiles} />
        </div>
      </div>
    </section>
  )
}

export default AUI
