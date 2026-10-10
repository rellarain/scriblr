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
  paragraphIndent: number
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

export type PlotNodeKind = 'category' | 'subcategory' | 'plotline' | 'plotpoint'
export const PLOT_KIND_ORDER: PlotNodeKind[] = ['category', 'subcategory', 'plotline', 'plotpoint']

// Any kind strictly deeper than parentKind -- mirrors childKindOptions above.
export function plotChildKindOptions(parentKind: PlotNodeKind): PlotNodeKind[] {
  return PLOT_KIND_ORDER.slice(PLOT_KIND_ORDER.indexOf(parentKind) + 1)
}

export interface PlotCustomFieldDef { id: string; name: string }
export interface PlotNode {
  id: string
  kind: PlotNodeKind
  parentId: string | null
  order: number
  title: string
  body: string
  assignedMomentId: string | null
  assignedParagraphIndex: number | null
  sourceFieldId: string | null
  customFieldDefs: PlotCustomFieldDef[]
  customFieldValues: Record<string, string>
  keywords: string[]
  flag: NodeFlag | null
  // Category and subcategory only: the colour hue, 0-360 (null = the theme's hue for a
  // category, its category's hue for a subcategory).
  hue?: number | null
  // Plotpoints are the values of fields. `fieldId` is the field (a PlotCustomFieldDef id, defined
  // on a category, subcategory or plotline) a value belongs to; `refId` marks a plotline's reference
  // to a value defined on its category or subcategory (title and body are read from that original);
  // `awareness` is set only while placed on a moment.
  fieldId?: string | null
  refId?: string | null
  awareness?: Awareness | null
}
export type Awareness = 'front' | 'back' | 'mid' | 'off'
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
