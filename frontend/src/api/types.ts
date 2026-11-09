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

// ---- what readers see of maps and characters ----
// `revealAt` is a chapter number of the published edition (null = from the start). `reveals` holds the same for a part: a map's symbols, labels and shapes (by id), a
// character's fields (by key). `fields` are the fields of a character that are shown: CHARACTER_SHARE_FIELDS, and "field:<id>" for a field of the author's own.
export interface ReaderShare { published: boolean; revealAt: number | null; reveals: Record<string, number>; fields: string[] }
export const NO_SHARE: ReaderShare = { published: false, revealAt: null, reveals: {}, fields: [] }
export const shareOf = (doc: { reader?: ReaderShare }): ReaderShare => doc.reader ?? NO_SHARE
export const CHARACTER_SHARE_FIELDS = [
  ['role', 'Role'], ['age', 'Age'], ['occupation', 'Occupation'], ['aliases', 'Other names'], ['summary', 'In a sentence'],
  ['appearance', 'Appearance'], ['height', 'Height'], ['build', 'Build'], ['skin', 'Skin'], ['hair', 'Hair'], ['eyes', 'Eyes'], ['face', 'Face'], ['voice', 'Voice'], ['bearing', 'Bearing'],
  ['style', 'How they dress'], ['marks', 'Distinguishing marks'], ['personality', 'Personality'], ['goal', 'What they want'],
  ['motivation', 'Why they want it'], ['fear', 'What they fear'], ['flaw', 'Their flaw'], ['strength', 'Their strength'], ['background', 'History'], ['possessions', 'Possessions'], ['relationships', 'Relationships'],
] as const
// A link between a plot node ("plot:<id>"), a character ("char:<id>") and a place ("place:<mapId>/<symbolId>"): one record for both ends.
export interface WorldLink { a: string; b: string }
export interface ExtrasChapter { n: number; chapterId: string; title: string }
export interface ExtrasWarning { kind: 'map' | 'place' | 'character'; targetId: string; name: string; revealAt: number; sceneId: string; sceneTitle: string; chapter: number }
export interface BookExtrasInfo { bookId: string; title: string; chapters: ExtrasChapter[]; warnings: ExtrasWarning[] }
export interface ReaderCharacterField { key: string; label: string; value: string }
export interface ReaderCharacterLink { targetId: string; targetName: string; label: string; description: string }
export interface ReaderCharacter { id: string; name: string; portrait: CharacterPortrait; fields: ReaderCharacterField[]; relationships: ReaderCharacterLink[] }
export interface BookExtras { bookId: string; reach: number; maps: MapDoc[]; characters: ReaderCharacter[]; lockedMaps: number; lockedCharacters: number }

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
  // What readers may see of the map (absent = nothing).
  reader?: ReaderShare
  // A version of another map as it is later in the story: the map it is a version of, and the outline chapter or scene from which it is the true one (absent = not a version).
  versionOf?: string | null
  appliesFrom?: string | null
  // The paths of characters over the map.
  journeys?: MapJourney[]
  updatedAt: string
}
// Where a character is from a point of the story (an outline chapter or scene, `at`; '' = not placed yet), in cells.
export interface MapJourneyStop { id: string; x: number; y: number; at: string; note: string }
export interface MapJourney { id: string; characterId: string; color: string | null; stops: MapJourneyStop[] }
export const MAP_MAX_JOURNEYS = 40
export const MAP_MAX_STOPS = 200
export interface MapSummary { id: string; title: string; kind: MapKind; parentId: string | null; order: number; width: number; height: number; updatedAt: string; versionOf?: string | null; appliesFrom?: string | null }
export interface MapCreate { title?: string; kind?: MapKind; width?: number; height?: number; cellSize?: number; unit?: string; parentId?: string | null; theme?: MapThemeName }
export const MAP_MAX_SIDE = 512

// ---- characters (the cast) ----
// A character looks the way its portrait says: the choices a head-and-shoulders card is drawn from (ids of the portrait library, colours and a few sliders). No images are stored.
// The look of the old figure is kept in the file as it was, but nothing draws it any more: it is passed back to the server untouched.
export type LegacyLook = Record<string, unknown>
// The portrait: how a character looks, drawn as a head-and-shoulders card from these choices (front view, flat colour; no images are stored). An id names an entry of the
// portrait library (an id this build does not know is kept, and the library draws a default for it); a colour is #rrggbb, and a null one follows the hair (the brows, the
// facial hair) or the skin (the lips); a slider is a number within its range (`PORTRAIT_RANGES`, the same as the server's).
export interface CharacterPortrait {
  version: number
  age: string; build: string; chest: string
  headShape: string; headWidth: number; ears: string; skin: string; expression: string
  eyes: string; eyeColor: string; eyeSize: number; eyeSpacing: number; eyeTilt: number
  brows: string; browColor: string | null
  nose: string; noseSize: number; noseWidth: number
  mouth: string; mouthSize: number; lipColor: string | null
  // How wide the shoulders and the neck are (1 is the build's own).
  shoulderWidth: number; neckWidth: number
  hairLength: string; hairTexture: string; hairStyle: string; hairFront: string; hairline: string; hairlineHeight: string; hairEdges: string; hairEnds: string; hairPlacement: string
  hairColor: string; highlightColor: string | null; greying: string
  facialHair: string; facialHairColor: string | null
  top: string; topColor: string; tileColor: string
  // Jewellery worn at the neck.
  necklace: string; necklaceColor: string
  // The fantasy elements: ears, horns, the style of the eyes (and the colour of the second) and how many there are, a crown, a hood, and a thing held in a hand raised at the
  // shoulder (on the picture's left or right).
  fantasyEars: string; horns: string; hornColor: string
  eyeStyle: string; eyeColor2: string; eyeCount: string
  crown: string; crownColor: string; hood: string; hoodColor: string
  heldItem: string; heldSide: string; itemColor: string
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
  goal: string; motivation: string; fear: string; flaw: string; strength: string; background: string
  // How the character looks, in words: a paragraph, and the things a stranger would notice.
  appearance: string; height: string; build: string; skin: string; hair: string; eyes: string; face: string; voice: string; bearing: string; style: string; marks: string
  fields: CharacterField[]
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
  id: string; at: string; storyTime: string; mood: string; goal: string; where: string; note: string; inventory: string[]
  // The old look captured with the state (no longer shown), and how the character looks in this state: a copy of the portrait (none = not captured).
  snapshot?: LegacyLook | null
  portrait?: CharacterPortrait | null
}
export interface ArcStage { id: string; name: string; note: string; at: string | null }
export interface LifeEvent { id: string; when: string; title: string; note: string }
export interface CharacterDoc {
  schemaVersion: number; id: string; name: string; order: number; portrait: CharacterPortrait; look?: LegacyLook; updatedAt: string
  profile: CharacterProfile; possessions: CharacterPossession[]; relationships: CharacterRelationship[]; states: CharacterState[]; arc: ArcStage[]; events: LifeEvent[]
  // The chapters and scenes of the outline the character is tagged on.
  appearances: string[]
  // What readers may see of the character (absent = nothing).
  reader?: ReaderShare
}
export interface CharacterSummary { id: string; name: string; order: number; updatedAt: string; portrait: CharacterPortrait }

// ---- items (the library of things that change hands) ----
export const ITEM_KINDS = ['weapon', 'tool', 'clothing', 'jewel', 'document', 'vehicle', 'treasure', 'other'] as const
export const ITEM_MAX_HOLDINGS = 200
// Who has an item from a point of the story: a character ("char:<id>"), a place ("place:<mapId>/<symbolId>") or nobody known (empty); `at` is an outline chapter or scene (empty: from the start).
export interface ItemHolding { id: string; holder: string; at: string; note: string }
export interface ItemDoc {
  schemaVersion: number; id: string; name: string; order: number; kind: string; description: string; notes: string
  // A colour for the item's tag, "#rrggbb" or empty.
  color: string
  holdings: ItemHolding[]
  updatedAt: string
}
export interface ItemSummary { id: string; name: string; kind: string; order: number; updatedAt: string }
export interface ItemCreate { name?: string; kind?: string }
export interface CharacterCreate { name?: string; portrait?: CharacterPortrait; look?: LegacyLook }

// ---- character models (the admin-designed assets of the art mannequin; backend schema.py "Character models") ----
export type ModelPointMode = 'c' | 's' | 'cs' | 'sc'
export type ModelLayer = 'body' | 'clothing' | 'hair'
export type ModelView = 'both' | 'front' | 'back'
// A point link, kept on the point that follows: kind 'point' = on point i of shape s plus the offset d (a weld has none); kind 'edge' = t (0..1) along the edge from point e of shape s, o units outward (a clothes point locked to the edge of a body part). Solved when the model is drawn.
export type ModelBindKind = 'point' | 'edge'
export interface ModelBind { kind: ModelBindKind; s: string; i: number; d: [number, number]; e: number; t: number; o: number }
// A point of a shape: c = curve, s = sharp, cs = curve then sharp, sc = sharp then curve. hi and ho are the in and out handles as offsets (absent: automatic). bind links it to another shape.
export interface ModelPoint { x: number; y: number; m: ModelPointMode; hi?: [number, number] | null; ho?: [number, number] | null; w?: number | null; bind?: ModelBind | null }
// Paint effects. A tone of a colour: a shadow (darker, a little warmer and fuller), a mid tone (half a shadow) or a highlight (toward white), by an amount t (0.02..0.8).
export type ModelTintKind = 'shadow' | 'mid' | 'highlight'
export interface ModelTint { kind: ModelTintKind; t: number }
// A gradient fill from the shape's colour to the colour of slot `to` (null: a darker tone of its own colour), in a direction.
export type ModelGradDir = 'down' | 'up' | 'left' | 'right' | 'radial'
export interface ModelGradient { dir: ModelGradDir; to: string | null }
export type ModelBlend = 'multiply' | 'screen' | 'overlay'
// A filled outline in the model's space (0..200 across, 0..400 down). `half` > 0 marks a symmetric outline: its first `half` points run down one half and the rest mirror them.
// mirrorOf: the shape this one is the mirror image of about the model's axis (a derived twin has no points of its own until the pair is broken). back: an outline of its own for the back view (absent: the front outline seen from behind); zBack: its depth in the back view; loose: the slider that loosens the links of its points.
export interface ModelShape { id: string; name: string; closed: boolean; z: number; op: number; view: ModelView; pts: ModelPoint[]; half: number; template?: string | null; mirrorOf?: string | null; back?: ModelPoint[] | null; zBack?: number | null; loose?: string | null; copyOf?: string | null; hide?: boolean; slot?: string | null; gray?: number | null; tone?: number; derive?: ModelTint | null; shade?: ModelTint | null; grad?: ModelGradient | null; blend?: ModelBlend | null; clip?: string | null; cut?: string[]; helper?: boolean }
// What one form does to one shape of its object: the outline the shape has in that form (an empty list hides the shape in the form).
export interface ModelOverride { shape: string; pts: ModelPoint[] }
// One form of an axis (round eyes, almond eyes): the shapes it changes with their outlines. A form with no overrides is the base outline.
// What one form does to the paint of one shape: the colour slot it is painted from, or a fixed gray (no slot), and a tone (-2..2). null leaves the shape's own value.
export interface ModelLook { shape: string; slot: string | null; gray: number | null; tone: number | null }
export interface ModelForm { id: string; name: string; ovr: ModelOverride[]; looks?: ModelLook[] }
// A way an object can vary (eye shape, expression, style): its forms, and the one it shows unless another is chosen (initial). An object shows one form of every axis.
export interface ModelAxis { id: string; name: string; options: ModelForm[]; initial: string }
// slot: the colour slot a shape is painted from (a twin follows its original's, a shape that follows the template its template shape's, when none); gray: a fixed gray 0..100 used when there is no slot (an eye white, teeth); neither: the neutral gray every uncoloured model is drawn in.
// tone: steps lighter (+) or darker (-) than the colour; derive: this shape is a tone of its colour; shade: this is a shading shape, a tone of its slot's colour kept inside the base shapes of its object; grad, blend: gradient and blend mode; clip: the shape it is kept inside; cut: shapes that cut a hole in it; helper: never drawn, only used to clip or cut. A twin and a shape that follows a template take all of these from the shape they copy.
// copyOf (on a shape of a class member): the shape of the class's template it follows, with no points of its own until it has an outline of its own; hide leaves the inherited shape out of the member. classOf (on an object): the class it is a member of.
export interface ModelObject { id: string; name: string; layer: ModelLayer; shapes: string[]; mirrorOf?: string | null; axes?: ModelAxis[]; classOf?: string | null }
// Where a group is fixed to a shape of its parent (or an ancestor): on one point (i), at a spot t (0..1) along edge i, anywhere along edge i that the slider moves, or at a relative place (rx, ry) inside the shape's box.
export type ModelAnchorKind = 'point' | 'edge' | 'range' | 'inside'
export interface ModelAttach { shape: string; kind: ModelAnchorKind; i: number; t: number; slider: string | null; rx: number; ry: number }
// A group of objects that move together. parent is the group it hangs from (the rig), pivot the point it turns about (in the model's space at rest), attach where on a shape of its parent it is fixed.
export interface ModelGroup { id: string; name: string; parent: string | null; objects: string[]; pivot: [number, number] | null; attach: ModelAttach | null; mirrorOf?: string | null }
export type ModelRangeUnit = '' | '°' | '%'
export type ModelDriveKind = 'turn' | 'scale' | 'points' | 'bend'
export type ModelScaleTarget = 'group' | 'shape' | 'model'
export type ModelScaleAxis = 'xy' | 'x' | 'y'
// One point of a points drive: how far it moves with the slider at its maximum (dx, dy) and at its minimum (dxMin, dyMin).
export interface ModelMove { i: number; dx: number; dy: number; dxMin: number; dyMin: number }
// What a slider does: turn a group about its pivot, scale a group, a shape or the whole model, move points, or bend a shape along a length. atMin and atMax are the amount at the slider's minimum and maximum (degrees for turn and bend, percent for scale); it is 0 (100 %) at the rest value.
export interface ModelDrive {
  kind: ModelDriveKind
  group: string | null
  target: ModelScaleTarget | null
  id: string | null
  axis: ModelScaleAxis
  shape: string | null
  moves: ModelMove[]
  sym: boolean
  pivot: [number, number] | null
  y0: number
  y1: number
  atMin: number
  atMax: number
  mirror: boolean
}
// A slider of the model: from min to max, resting at rest (what is drawn), with what it drives. rand is the span random previews stay in; show says whether the writer's editor offers it.
export interface ModelRange { id: string; name: string; scope: string | null; min: number; rest: number; max: number; unit: ModelRangeUnit; show: boolean; rand: [number, number] | null; drives: ModelDrive[] }
// A named set of slider values and of hidden objects (a pose, an expression, an age, a build, an outfit). kind is the slot it fills: applying one puts back whatever any other preset of its kind controls. values lists only the sliders it moves; hidden the objects and groups it hides.
// A style is a preset with a scope (an object or a group): it also keeps the forms chosen for what is in the scope ("objectId.axisId" to a form id, "class:classId" to the member shown) and only controls what the scope holds.
export interface ModelPreset { id: string; name: string; kind: string; values: Record<string, number>; hidden: string[]; scope?: string | null; forms?: Record<string, string> }
// A template object and the members built from it. The template is a pattern, not drawn once it has members; a family (exclusive) shows one member at a time, otherwise every member is drawn.
export interface ModelClass { id: string; name: string; template: string; exclusive: boolean }
// Colour. A genre tag (Fiction, Fantasy, Non-fiction...): a default colour says which genres it fits, so a character made for a project of that genre draws its random colours from those only.
export interface ModelGenre { id: string; name: string }
// A swatch of the starter palette a new character gets: a hue (0..359) and a saturation (0..100); brightness and opacity belong to the object that uses it.
export interface ModelSwatch { id: string; name: string; h: number; s: number }
// A default colour of a slot (an eye colour, a skin tone), exactly as #rrggbb, and the genres it fits (none: every genre).
export interface ModelColour { id: string; name: string; hex: string; genres: string[] }
// A colour slot (Skin, Hair, Eye...): the default colours offered, and how bright (l) and how opaque (a), 0..100, a colour in it may be: smallest, resting and largest.
export interface ModelSlot { id: string; name: string; lMin: number; lRest: number; lMax: number; aMin: number; aRest: number; aMax: number; colours: ModelColour[] }
export interface ModelContent { name: string; description: string; shapes: ModelShape[]; objects: ModelObject[]; groups: ModelGroup[]; axis: number; ranges: ModelRange[]; presets?: ModelPreset[]; classes?: ModelClass[]; genres?: ModelGenre[]; palette?: ModelSwatch[]; slots?: ModelSlot[] }
export interface PublishedModel { version: number; publishedAt: string; content: ModelContent }
export interface ModelEntry { id: string; draft: ModelContent; published: PublishedModel | null; history: PublishedModel[]; nextVersion: number }
export interface ModelCatalog { schemaVersion: number; models: ModelEntry[] }
export interface ModelDraftList { models: Array<{ id: string; draft: ModelContent }> }
export interface PublishedModelOut { id: string; version: number; publishedAt: string; content: ModelContent }
export interface PublishedModelList { models: PublishedModelOut[] }
