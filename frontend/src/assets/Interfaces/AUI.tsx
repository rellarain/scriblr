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
  'The Designer is a shape editor for now. A model holds zones, a zone holds groups, a group holds objects and an object holds shapes; the tree on the left lists them, and the panel on the right edits what is selected.',
  'Mirrors: the Mirror button in the panel of a shape or an object makes a copy reflected across a line of symmetry: that of a symmetric shape it is connected to (the breasts across the chest), else the centre line of the model. The mirror follows every change of its original and moves with whatever its line belongs to. Edit the mirror as you would any shape: the original changes with it. Its panel chooses its line and detaches it, after which it keeps its outline and goes its own way. In the tree a mirror is listed inside its original.',
  'Clones: the Clone button beside Mirror makes a copy a little right of and below its original, with a place of its own. Moving, turning or flipping a clone moves only that clone; any other change to it (a point, a handle, its size) changes the original, and so every clone. Detach makes it a shape of its own with the outline it has. A clone of an object clones each of its shapes, and its panel places it with Across, Down, Turn and Flip. In the tree a clone is listed inside its original, and deleting the original deletes its clones.',
  'Zones and the tree: a model starts with the zones Head, Hair, Torso, Arms and Legs (a model made before zones has all its groups in Torso). Every card stays listed beside the others; the arrow at the right of a card shows or hides what is in it, and selecting something, in the tree or on the canvas, opens the way down to it. An open shape lists its points: click one to select it. The plus beside a card adds a group to a zone, an object to a group or a shape to an object; the eye hides it while you work. Drag a card by its grip among the cards of its kind anywhere in the tree, or onto a card of the level above to put it inside (Alt and the up or down arrow move it one place). The tree is the drawing order: the higher a card, the nearer the front. A new shape goes into what is selected, or into the zone at the top.',
  'Shapes: drag on the empty grid to draw a rectangle there (hold Shift for a square), or right-click the grid (or use New shape, or the plus beside the shapes in the tree) to open the new-shape form. Choose the type, then a shape (a square, a rectangle, a circle, an ellipse, an equilateral or a right triangle, a pentagon, a hexagon or a star) or a polygon with the number of points set beside it, and Create puts it where the form was opened. Click inside a shape to select it and drag it to move it: a drag that starts anywhere in its fill moves it, together with every shape connected to it (pull a shape free first to move it alone). Its box resizes it from a corner or a side (Shift keeps its proportions; Ctrl resizes about the middle, both sides moving) and its round handle turns it (Shift turns in steps of 15 degrees); the steppers set its place, size and angle exactly, and Keep proportions makes every resize keep them. Flip turns it over across or down, Align puts its middle on the middle of the model, and Forward and Back move it in front of or behind the shapes of its object.',
  'Types: a base shape is the plain drawing. A shape becomes a stretch shape once every one of its points is connected to another shape (one made as a stretch shape says how many points still need connecting). A shadow is black and a light is white, both see-through (Opacity sets how much), with no outline; they are drawn above every other shape and only show where they lie over them, and a light and a shadow may not overlap: a change that would make them overlap is refused. The Type chips in the panel change the type of a shape.',
  'Look: a shape has an outline, drawn over its fill in one dark ink. Outline turns it off or on and Outline width makes it thinner or thicker (Shift: a whole unit at a time). Opacity fades the fill only, so a shape can be an outline alone.',
  'Points and segments: hover over a shape to see its outline and points. Click a point or a segment to select it; drag a point or a curve handle to move it. Right-click a point to open the point form and choose its type (sharp, curve, curve then sharp, sharp then curve), right-click a segment to make it straight or curved, and drag from a segment to add a point there (a click on a segment selects it; Delete then removes it, joining its two points into one). Dragging a segment that two shapes share moves it, reshaping both (on a symmetric shape it moves only along its line of symmetry); double-click a shared segment to add a point to every shape on it. While you drag a point over another shape, that shape shows its outline and points, and the point lands on any of its points it comes close to. Ctrl and click a point to remove it, or a segment to join its two points into one. The arrow keys move what is selected (Shift: ten times as far) and Delete removes the selected point, or the selected shape when no point is selected.',
  'Pivot points: connect a point of a shape to a point or a segment of a shape in another object, then right-click the point and press Pivot: the link becomes a pivot point, where the two objects bend. Select the point to turn the object beyond it and to set how far it may turn each way (Turns at least and Turns at most). A link between shapes of one object cannot be a pivot point; a link that is not one joins nothing when you pose, the linked point simply follows. Pivot points are drawn in the accent colour inside a ring of the alert colour, on the Pivots and anchors layer. A model made with the old pivot circles has them turned into pivot points when it is opened.',
  'Anchors: right-click a point and press Anchor to pin it, or right-click inside a shape (away from its points) to pin that spot. An anchored point cannot be dragged or removed. A shape with one anchor turns, flips and resizes about it but cannot be moved; a shape with two or more is held still. The Anchors section names each anchor and deletes it.',
  'Posing: objects are the posable segments of a figure, joined at pivot points. With a group selected, drag any of its objects to pose it; with an object selected, drag that object (all its shapes move together); a click without moving selects the shape instead. The pivots between the object and the anchor reach, each within its limits, to bring the spot you hold to the pointer, and the object keeps its own angle when it can; what lies further out keeps its pose (drag the palm and the forearm and upper arm reach from the shoulder, while the fingers stay as they were). Dragging the anchored object turns the whole figure about its anchor (two anchors hold it still). With no anchor, the object you hold follows the pointer and the rest of the figure hangs from it, each pivot within its limits. Reset pose puts every turn and place back.',
  'Sliders and posable points: a point dropped on a segment of another shape can be made a Slider in its point form. It then moves only between two stops on that outline: select its shape to drag the stops along it (they may be on different segments), and drag the point between them. Posable (in the point form, on a point or inside a shape) makes a point you drag in Pose mode: the pivots between it and the anchor turn, each within its limits, to bring it to the pointer, and its object keeps its angle. In Pose mode a slider can be dragged along between its stops too; Reset pose puts it back.',
  'Copy and paste: Ctrl+C copies the selected shape, Ctrl+X cuts it and Ctrl+V pastes it under the pointer, as many times as you like, into this model or another one. A pasted shape is not connected to anything.',
  'Connections: drag a point over a point or a segment of another shape; the point turns the alert colour, and letting go connects them. On a point they are welded (dragging either moves both); on a segment the point stays on it and slides along it. A segment whose two ends are welded or locked onto one segment of another shape is a shared segment: it is drawn with the curve of that segment, so both shapes meet along one curve. Linked points and shared segments are drawn in the alert colour; on a symmetric shape every copy of a linked point is linked too, and its panel shows the link. Right-drag a connected point to pull it free. A connection and a shared segment can be named in the panel, where Disconnect cuts one.',
  'Symmetry: turn it on for a shape, choose the angle of the first axis (or a preset: vertical, horizontal or a diagonal) and how many axes (evenly spaced), then click the side to copy; Escape stops. The other sides follow it, and a point in any copy can be dragged. Turning it off keeps every point where it is. A point of a symmetric shape can be connected to another shape (a symmetric one too): its copies follow it, and only one copy of each point can be connected.',
  'Viewing: right-drag the grid, or scroll (Shift and scroll for sideways), to move across it; Ctrl and scroll on the canvas (or scroll on the zoom slider) to zoom: up zooms in, down zooms out; and Fit to see everything. Click the grid to unselect everything. Snap and Snap to grid can be turned off in the panel.',
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
