// TypeScript types mirroring the backend's camelCase JSON exactly
// (backend/app/storage/schema.py, backend/app/models/__init__.py).

export type OutlineNodeKind = 'series' | 'book' | 'arc' | 'chapter' | 'act' | 'scene' | 'moment'
export const OUTLINE_KIND_ORDER: OutlineNodeKind[] = ['series', 'book', 'arc', 'chapter', 'act', 'scene', 'moment']

// Any kind strictly deeper than parentKind -- a node's parent must be
// strictly shallower (not necessarily adjacent), so this is exactly the set
// of valid kinds for a new child of a node of this kind.
export function childKindOptions(parentKind: OutlineNodeKind): OutlineNodeKind[] {
  return OUTLINE_KIND_ORDER.slice(OUTLINE_KIND_ORDER.indexOf(parentKind) + 1)
}

export type FlagType = 'review' | 'edit' | 'add' | 'delete'
export interface NodeFlag {
  type: FlagType
  note: string
}

// How a book's chapters are laid out in the preview (backend PreviewFormat).
export interface PreviewFormat {
  fontFamily: 'serif' | 'sans' | 'mono'
  fontSize: number
  fontStyle: 'normal' | 'italic'
  fontWeight: 'normal' | 'bold'
  textAlign: 'left' | 'justify'
  lineSpacing: number
  // The width of this many spaces in the book's font (it was `paragraphIndent`, in em, before project format 5).
  paragraphIndentSpaces: number
  paragraphSpacing: number
}

export interface OutlineNode {
  id: string
  kind: OutlineNodeKind
  parentId: string | null
  order: number
  title: string
  synopsis: string
  draftRef: string | null
  flag: NodeFlag | null
  color: string | null
  // A level's own hue, 0-360 (or a neutral swatch): a book's colour, and the series, arc and chapter hues.
  themeHue?: number | null
  // How far (degrees either side of its parent's hue) the colour may sit: 30, 60, 90, 120, 180 or 360; none = the kind's default.
  hueRange?: number | null
  chapterCountTarget: number | null
  plotlineIds: string[]
  wordCountGoal: number | null
  // Book-only: which of the project's time systems its scenes use.
  timeSystemId?: string | null
  // Book-only: the preview's layout (none = the defaults).
  previewFormat?: PreviewFormat | null
  // Scene-only (see backend OutlineNode): where/when/what instead of a
  // title and synopsis. Absent on trees saved before these fields existed.
  // `timeValue` is one number per unit of the book's time system.
  location?: string
  timeValue?: Record<string, number>
  action?: string
  // When the node was created (absent on nodes made before this existed).
  createdAt?: string | null
  // The moment placed directly under a chapter for free drafting (no acts or scenes).
  freeDraft?: boolean
}

export interface OutlineTree {
  schemaVersion: number
  nodes: OutlineNode[]
}

export type PlotNodeKind = 'category' | 'subcategory' | 'cluster' | 'plotline' | 'plotpoint'
export const PLOT_KIND_ORDER: PlotNodeKind[] = ['category', 'subcategory', 'cluster', 'plotline', 'plotpoint']

// Any kind strictly deeper than parentKind -- mirrors childKindOptions above.
export function plotChildKindOptions(parentKind: PlotNodeKind): PlotNodeKind[] {
  return PLOT_KIND_ORDER.slice(PLOT_KIND_ORDER.indexOf(parentKind) + 1)
}

// What a field holds: 'points' (absent or null: the usual field, a list of plotpoints), 'multi' (any of its options), 'dropdown' (one of them) or
// 'text' (a short text). Each plotline (and the node that defines the field) answers a choice field with plotpoints of its own: one for each
// option ticked (title = the option's label, `optionId` set), the one picked, or one whose title is the text.
export type PlotFieldKind = 'points' | 'multi' | 'dropdown' | 'text'
// One choice of a multi-select or dropdown field.
export interface PlotFieldOption { id: string; label: string }
// A field a node defines. `setId` is the fieldset (a PlotFieldSet of the same node) it is listed under; absent or null = a loose field.
export interface PlotCustomFieldDef { id: string; name: string; setId?: string | null; kind?: PlotFieldKind | null; options?: PlotFieldOption[] }
// A named group of the fields a node defines (on a category, subcategory, cluster or plotline); it shows on every plotline under the node as its fields do.
export interface PlotFieldSet { id: string; name: string }
export interface PlotNode {
  id: string
  kind: PlotNodeKind
  parentId: string | null
  order: number
  title: string
  body: string
  // How a plotpoint was placed before it could be placed many times: one outline node and a paragraph of it. They are read into
  // `placements` when a plot opens (and by the backend), and then left empty.
  assignedMomentId?: string | null
  assignedParagraphIndex?: number | null
  sourceFieldId: string | null
  customFieldDefs: PlotCustomFieldDef[]
  // The fieldsets this node defines, in order (absent in a plot saved before there were fieldsets).
  customFieldSets?: PlotFieldSet[]
  customFieldValues: Record<string, string>
  keywords: string[]
  // Category, subcategory, cluster and plotline: the ids of the other such nodes it is linked to (kept on both ends: plotLinks.ts).
  links?: string[]
  flag: NodeFlag | null
  // Category and subcategory only: the colour hue, 0-360 (null = the theme's hue for a
  // category, its category's hue for a subcategory).
  hue?: number | null
  // How far (degrees either side of its parent's hue) the colour may sit (30, 60, 90, 120, 180 or 360); none = the kind's default.
  hueRange?: number | null
  // Plotpoints are the values of fields. `fieldId` is the field (a PlotCustomFieldDef id, defined
  // on a category, subcategory or plotline) a value belongs to; `refId` marks a plotline's reference
  // to a value defined on its category or subcategory (title and body are read from that original);
  // `placements` are the places it is put in the outline (it is placed once it has one).
  fieldId?: string | null
  refId?: string | null
  // An answer to a multi-select or dropdown field: the option (a PlotFieldOption id of that field) it answers with.
  optionId?: string | null
  placements?: PlotPlacement[]
  // Before placements each had their own: set only while placed on a moment (see assignedMomentId).
  awareness?: Awareness | null
}
export type Awareness = 'front' | 'back' | 'mid' | 'off'
// One place a plotpoint is put in the outline: a chapter, act, scene or moment. A plotpoint can have many (at most one to a target), each
// standing alone. `awareness` is set only on a moment.
export interface PlotPlacement {
  id: string
  targetId: string
  paragraphIndex: number | null
  awareness: Awareness | null
}
export interface PlotTree {
  schemaVersion: number
  nodes: PlotNode[]
}

// One publication of a chapter: a frozen copy of its draft, in outline order.
export interface PublicationSection { momentId: string; body: string }
export interface Publication {
  id: string
  chapterId: string
  publishedAt: string
  wordCount: number
  title: string
  sections: PublicationSection[]
}

export interface ProjectPriority { id: string; label: string; order: number }
export interface ProjectRoutine {
  id: string
  label: string
  daysOfWeek: number[]
  targetWordCount: number | null
}

export interface ProjectManifest {
  outline: string
  plot: string
  draftMoments: string[]
  revisionChapters: string[]
}

export type TimeUnitKind = 'number' | 'named' | 'clock'

export interface TimeUnit {
  id: string
  label: string
  kind: TimeUnitKind
  names: string[]
}

// How a project's scenes structure their Time (see backend TimeSystem).
export interface TimeSystem {
  id: string
  name: string
  units: TimeUnit[]
}

export interface ProjectSettings {
  wordCountTarget: number | null
  bookCountTarget: number | null
  bookWordCountTarget: number | null
  chapterWordCountTarget: number | null
  priorities: ProjectPriority[]
  routines: ProjectRoutine[]
  outlineLevels: OutlineNodeKind[]
  plotLevels: PlotNodeKind[]
  readLevels: OutlineNodeKind[]
  timeSystems: TimeSystem[]
  // The project's own colour (a hue, 0-360), the root of the Writer's level colours; null = the app theme's default.
  themeHue?: number | null
  // The project's colour follows the app theme's hue (its own themeHue is kept, not shown), and how far from that hue (degrees either side) it may sit.
  hueInherit?: boolean
  hueRange?: number | null
}

export interface ProjectIndex {
  schemaVersion: number
  projectId: string
  title: string
  createdAt: string
  updatedAt: string
  settings: ProjectSettings
  manifest: ProjectManifest
}

export interface ProjectSummaryResponse {
  index: ProjectIndex
  outline: OutlineTree | null
  plot: PlotTree | null
  warnings: string[]
}

// One project as the shelves show it: its index, its outline nodes and the progress bars of its books (GET /projects/overview).
export interface ProjectOverview {
  index: ProjectIndex
  outline: OutlineNode[]
  progress: Record<string, BookProgress>
}

export interface CreateProjectRequest {
  title: string
}

export type AuiConfigNodeKind = 'console' | 'component' | 'feature'

export interface AuiConfigNode {
  id: string
  tab: string
  kind: AuiConfigNodeKind
  parentId: string | null
  order: number
  name: string
  idea: string
}

// A frozen copy of one Configuration tab, made by Publish.
export interface PublishedTab {
  version: number
  publishedAt: string
  nodes: AuiConfigNode[]
}

// The Resources article/quiz builder (AUI): a structural Interface > Console >
// Component > Feature tree, seeded once from the Feedback taxonomy, plus
// per-node Guide/Tutorials/FAQ content and (console/component/feature only)
// an Exam/Test/Quiz question bank.
export type ResourceNodeKind = 'interface' | 'console' | 'component' | 'feature'

export interface ResourceNode {
  id: string
  kind: ResourceNodeKind
  parentId: string | null
  order: number
  name: string
}

export interface ResourceTutorial {
  id: string
  title: string
  body: string
}

export interface ResourceFaqEntry {
  id: string
  question: string
  answer: string
  source: 'authored' | 'feedback'
  sourceMessageId: string | null
}

export interface ResourceContent {
  guide: string
  tutorials: ResourceTutorial[]
  faq: ResourceFaqEntry[]
}

export interface ResourceQuestionOption {
  id: string
  text: string
  isCorrect: boolean
}

export interface ResourceQuestion {
  id: string
  prompt: string
  options: ResourceQuestionOption[]
}

export interface ResourceAssessment {
  questions: ResourceQuestion[]
}

export interface ResourcesFile {
  schemaVersion: number
  nodes: ResourceNode[]
  content: Record<string, ResourceContent>
  assessments: Record<string, ResourceAssessment>
}

export interface PromotableFeedbackMessage {
  id: string
  text: string
}

export interface AuiConfig {
  schemaVersion: number
  // The working draft (every tab, flat).
  nodes: AuiConfigNode[]
  // Per-tab published snapshots, keyed by tab; a tab never published is absent.
  published: Record<string, PublishedTab>
}

// What a save sends: only the draft. The server keeps the published copies.
export interface AuiConfigDraft {
  schemaVersion: number
  nodes: AuiConfigNode[]
}

// Plot presets: global (not per project) ready-made plot categories, configured in Admin > Configuration > Plot and offered by the Plot
// sidebar's "+ Preset". A preset is a category with its description, keywords, fields, and subcategories and clusters that have the same.
// A named group of field names on a preset's node: it becomes a fieldset on the node made from it, holding those fields.
export interface PresetFieldset { name: string; fields: PresetField[] }
// A field of a preset that is not a plain list of plotpoints: a multi-select, dropdown or short-text field, with the labels of its options
// (none for a short text). A plain field is just its name.
export interface PresetChoiceField { name: string; kind: 'multi' | 'dropdown' | 'text'; options: string[] }
export type PresetField = string | PresetChoiceField
export interface PresetNodeBase {
  name: string
  description: string
  keywords: string[]
  // The loose fields, in order; each becomes a field on the node made from this one.
  fields: PresetField[]
  // Fieldsets (a name and the field names in it), listed after the loose fields (absent in a preset saved before there were fieldsets).
  fieldsets?: PresetFieldset[]
}
export interface PresetCluster extends PresetNodeBase { id: string }
export interface PresetSubcategory extends PresetNodeBase { id: string; clusters: PresetCluster[] }
// A preset's category and what is under it (its id is its PresetEntry's).
export interface PresetContent extends PresetNodeBase { subcategories: PresetSubcategory[] }
export type PresetCard = PresetContent | PresetSubcategory | PresetCluster

// One numbered, frozen copy of a preset.
export interface PublishedPreset { version: number; publishedAt: string; content: PresetContent }

export interface PresetEntry {
  id: string
  // What the admin edits (autosaved).
  draft: PresetContent
  // What the Writer offers; null until published, and again after Unpublish.
  published: PublishedPreset | null
  // Earlier published versions, newest first (the current one is `published`).
  history: PublishedPreset[]
  // The version the next publish gets.
  nextVersion: number
}

export interface PresetCatalog { schemaVersion: number; presets: PresetEntry[] }

// What a save sends: the drafts in order. Published copies are kept by the server; a preset left out is deleted.
export interface PresetDraftList { presets: Array<{ id: string; draft: PresetContent }> }

// What the Writer's selector reads.
export interface PublishedPresetOut { id: string; version: number; publishedAt: string; content: PresetContent }
export interface PublishedPresetList { presets: PublishedPresetOut[] }

// One progress bar of a book's spine on the shelf: `done` of `total` (a total of 0 = nothing to measure against yet).
export interface Measure { done: number; total: number }

export interface BookProgress {
  plotting: Measure // the book's plotlines that have plotpoints
  outlining: Measure // chapters with acts, scenes or moments below them
  planning: Measure // synopsis, word-count goal, chapter target and time system set
  assignment: Measure // plotpoints placed on a moment
  revision: Measure // chapters with a manual revision
  published: Measure // chapters published at least once
  words: Measure // draft words against the word-count goal (total 0 = no goal)
}

// ---- Training: the courses (authored; training.json) and one learner's progress (training-progress.json); mirrors backend/app/storage/training_schema.py
// A curriculum is a collection of courses. A quiz (in a lesson), a test (in a module) and an exam (in a course) are an assessment with a pass mark.
export interface TrainingAssessment { id: string; title: string; description: string; passMark: number }
export interface TrainingExercise { id: string; title: string; description: string }
export interface TrainingLesson { id: string; title: string; description: string; body: string; exercises: TrainingExercise[]; quizzes: TrainingAssessment[] }
export interface TrainingModule { id: string; title: string; description: string; lessons: TrainingLesson[]; tests: TrainingAssessment[] }
export interface TrainingProject { id: string; title: string; description: string; exerciseIds: string[] }
export interface TrainingCourse {
  id: string; title: string; description: string
  // Its own colour (a hue); null = its first curriculum's.
  hue: number | null
  modules: TrainingModule[]; projects: TrainingProject[]; exams: TrainingAssessment[]
}
export interface TrainingCurriculum { id: string; title: string; description: string; hue: number | null; courseIds: string[] }
export interface TrainingContent { schemaVersion: number; curricula: TrainingCurriculum[]; courses: TrainingCourse[] }
// What a save of the courses sends.
export type TrainingContentDraft = Pick<TrainingContent, 'curricula' | 'courses'>
export interface TrainingAttempt { score: number; passed: boolean; at: string }
export interface TrainingProgress {
  schemaVersion: number
  // Course id -> when enrolled.
  enrolled: Record<string, string>
  // Course, module, lesson, exercise or project id -> when marked complete.
  completed: Record<string, string>
  // Assessment id -> its latest results, oldest first.
  attempts: Record<string, TrainingAttempt[]>
}
export interface TrainingState { content: TrainingContent; progress: TrainingProgress }

// ---- Maps (the setting) ----
export type MapKind = 'world' | 'town' | 'interior'
export type MapLayerKind = 'terrain' | 'shapes' | 'symbols' | 'labels' | 'notes'
export interface MapTerrain { id: string; name: string; color: string; builtIn: boolean }
export interface MapLayer { id: string; name: string; kind: MapLayerKind; visible: boolean; locked: boolean }
// A map: a grid of terrain cells (painted), its palette and layers, and its place among the maps (a map can be inside another one).
// `cells` is the terrain of every cell, row by row, as run pairs [index into `terrains`, how many cells, ...].
export type MapThemeName = 'parchment' | 'modern' | 'night' | 'blueprint'
// A stamp (`kind` is a symbol of the library, mapSymbols.ts): its centre in cells, how many cells wide, its own colour (null = the theme's).
// A symbol with a name is a place (a scene can happen there); `mapIds` are the maps that open from it.
export interface MapSymbol { id: string; layerId: string; kind: string; x: number; y: number; size: number; color: string | null; name: string; mapIds: string[] }
// A place as the project lists it: `key` is what a scene stores (`mapId/placeId`), `path` the maps it is inside and its name.
export interface MapPlace { key: string; mapId: string; placeId: string; name: string; path: string; kind: string; mapTitle: string; mapIds: string[] }
// A line of text centred on a point; `size` is its height in cells.
export interface MapLabel { id: string; layerId: string; text: string; x: number; y: number; size: number }
// A point of a line or of a region's outline, in cells. A smooth point is a curve through it; (hx, hy) is its handle, where the curve leaves it relative to
// the point (it arrives on the other side), or null for the handle the neighbouring points make.
export interface MapShapePoint { x: number; y: number; smooth: boolean; hx: number | null; hy: number | null }
export type MapShapeType = 'line' | 'region'
export type MapLineStyle = 'solid' | 'dashed' | 'dotted' | 'road' | 'wall' | 'fence'
export type MapPattern = 'solid' | 'hatch' | 'cross' | 'dots'
// A line (a river, a road, a border, a wall, a fence) or a region (a closed outline, filled). `color` is the line's (null = the look's ink), `width` is in
// cells; a region's `fill` is null for the line colour, with how solid it is and a pattern over it.
export interface MapShape {
  id: string; layerId: string; type: MapShapeType; points: MapShapePoint[]
  style: MapLineStyle; color: string | null; width: number
  fill: string | null; opacity: number; pattern: MapPattern
}
export interface MapDoc {
  schemaVersion: number
  id: string
  title: string
  kind: MapKind
  parentId: string | null
  order: number
  width: number
  height: number
  // What one cell is, in `unit` (miles, paces, feet ...).
  cellSize: number
  unit: string
  // How far a traveller goes in a day, in `unit` (null = not set).
  pace: number | null
  terrains: MapTerrain[]
  layers: MapLayer[]
  cells: number[]
  symbols: MapSymbol[]
  labels: MapLabel[]
  shapes: MapShape[]
  theme: MapThemeName
  scaleBar: boolean
  compass: boolean
  legend: boolean
  updatedAt: string
}
export interface MapSummary { id: string; title: string; kind: MapKind; parentId: string | null; order: number; width: number; height: number; updatedAt: string }
export interface MapCreate { title?: string; kind?: MapKind; width?: number; height?: number; cellSize?: number; unit?: string; parentId?: string | null; theme?: MapThemeName }
export const MAP_MAX_SIDE = 512

// ---- characters (the cast) ----
// A character is its look: the parameters the figure is drawn from (ids of the part library, colours, sliders, marks, an outfit and a pose). No images are stored.
export const CHARACTER_MAX_MARKS = 40
export const CHARACTER_MAX_STROKES = 12
export const CHARACTER_MAX_ACCESSORIES = 8
export type CharacterMarkKind = 'freckles' | 'mole' | 'scar' | 'birthmark' | 'tattoo' | 'blush' | 'makeup' | 'paint'
// A mark on an area of the body: (x, y) place it on the area (0 to 1 across and down); `strokes` are the lines of a tattoo the author drew (points 0 to 1 on the area).
export interface CharacterMark {
  id: string; kind: CharacterMarkKind; design: string; area: string
  x: number; y: number; size: number; color: string | null; strokes: Array<Array<[number, number]>>
}
export interface CharacterOutfit {
  top: string | null; bottom: string | null; shoes: string | null; outer: string | null
  accessories: string[]
  // A colour for each slot (top, bottom, shoes, outer, accessory).
  colors: Record<string, string>
}
export interface CharacterLook {
  skin: string; build: string; height: number; width: number; shoulders: number
  headShape: string; headWidth: number; ears: string; earSize: number
  eyes: string; eyeColor: string; eyeSize: number; eyeSpacing: number; eyeTilt: number
  brows: string; browColor: string; browThickness: number; browTilt: number
  nose: string; noseSize: number; noseWidth: number
  mouth: string; mouthSize: number; lipColor: string
  facialHair: string; facialHairColor: string
  hair: string; hairColor: string; hairLength: number; streakColor: string | null; streakAmount: number
  expression: string; pose: string; heldLeft: string | null; heldRight: string | null
  outfit: CharacterOutfit; marks: CharacterMark[]
}
export const CHARACTER_MAX_FIELDS = 30
export const CHARACTER_MAX_RELATIONSHIPS = 80
export const CHARACTER_MAX_STATES = 300
export const CHARACTER_MAX_STAGES = 20
export const CHARACTER_MAX_EVENTS = 100
export const CHARACTER_MAX_POSSESSIONS = 80
export const CHARACTER_MAX_CHANGES = 20
export interface CharacterField { id: string; label: string; value: string }
// Who the character is: identity, personality and psychology, background, and fields of the author's own.
export interface CharacterProfile {
  role: string; age: string; occupation: string; aliases: string; summary: string; personality: string
  goal: string; motivation: string; fear: string; flaw: string; strength: string; background: string; fields: CharacterField[]
}
export interface CharacterPossession { id: string; name: string; description: string }
export type RelationshipKind = 'family' | 'friend' | 'ally' | 'rival' | 'enemy' | 'romance' | 'mentor' | 'other'
// For a family link: who the other character is to this one.
export type FamilyRole = 'parent' | 'child' | 'spouse' | 'sibling'
// How a relationship changes at a point of the story (`at` is an outline chapter or scene).
export interface RelationshipChange { id: string; at: string; label: string; note: string }
export interface CharacterRelationship { id: string; targetId: string; kind: RelationshipKind; family: FamilyRole | null; label: string; description: string; changes: RelationshipChange[] }
// What is true of the character from a point of the story until the next state.
export interface CharacterState {
  id: string; at: string; storyTime: string; mood: string; goal: string; where: string; note: string; inventory: string[]; snapshot: CharacterLook | null
}
export interface ArcStage { id: string; name: string; note: string; at: string | null }
export interface LifeEvent { id: string; when: string; title: string; note: string }
export interface CharacterDoc {
  schemaVersion: number; id: string; name: string; order: number; look: CharacterLook; updatedAt: string
  profile: CharacterProfile; possessions: CharacterPossession[]; relationships: CharacterRelationship[]; states: CharacterState[]; arc: ArcStage[]; events: LifeEvent[]
  // The chapters and scenes of the outline the character is tagged on.
  appearances: string[]
}
export interface CharacterSummary { id: string; name: string; order: number; updatedAt: string }
export interface CharacterCreate { name?: string; look?: CharacterLook }
