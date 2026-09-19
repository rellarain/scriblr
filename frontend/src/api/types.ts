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
  // Book-only: the cover / theme hue and the accent hue (null = the app's accent), 0-360.
  themeHue?: number | null
  accentHue?: number | null
  chapterCountTarget: number | null
  plotlineIds: string[]
  wordCountGoal: number | null
  // Book-only: which of the project's time systems its scenes use.
  timeSystemId?: string | null
  // Scene-only (see backend OutlineNode): where/when/what instead of a
  // title and synopsis. Absent on trees saved before these fields existed.
  // `timeValue` is one number per unit of the book's time system.
  location?: string
  timeValue?: Record<string, number>
  action?: string
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
}
export interface PlotTree {
  schemaVersion: number
  nodes: PlotNode[]
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
