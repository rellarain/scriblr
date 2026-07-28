export interface ProjectManifest {
  outline: string
  plot: string
  draftMoments: string[]
  revisionMoments: string[]
}

export interface ProjectPriority {
  id: string
  label: string
  order: number
}

export interface ProjectRoutine {
  id: string
  label: string
  // 0=Monday .. 6=Sunday
  daysOfWeek: number[]
  targetWordCount: number | null
}

export interface ProjectSettings {
  wordCountTarget: number | null
  bookCountTarget: number | null
  chapterCountTarget: number | null
  bookWordCountTarget: number | null
  chapterWordCountTarget: number | null
  priorities: ProjectPriority[]
  routines: ProjectRoutine[]
  outlineLevels: OutlineNodeKind[]
  plotLevels: PlotNodeKind[]
  // Which levels render as visible headings in Read mode. Independent of
  // outlineLevels (which governs what kinds exist at all) -- "chapter" is
  // always included since Read mode navigates at the chapter level.
  readLevels: OutlineNodeKind[]
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

// Structural depth, shallowest first. Nesting is flexible: a node's parent
// may be any node of a strictly shallower kind, not necessarily the
// adjacent one (e.g. a scene may nest directly under a book).
export type OutlineNodeKind = 'book' | 'arc' | 'chapter' | 'scene' | 'moment'
export const OUTLINE_KIND_ORDER: OutlineNodeKind[] = ['book', 'arc', 'chapter', 'scene', 'moment']

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
  // Set only on "moment" nodes: the moment IS the writing unit.
  draftRef: string | null
  // Flags this item for revision (review/edit/add/delete), with an optional note.
  flag: NodeFlag | null
}

export interface OutlineTree {
  schemaVersion: number
  nodes: OutlineNode[]
}

// Plot tree: category -> plotline -> plotpoint, mirroring the outline
// tree's flat-list-with-parentId shape.
export type PlotNodeKind = 'category' | 'plotline' | 'plotpoint'
export const PLOT_KIND_ORDER: PlotNodeKind[] = ['category', 'plotline', 'plotpoint']

export interface PlotCustomFieldDef {
  id: string
  name: string
}

export interface PlotNode {
  id: string
  kind: PlotNodeKind
  parentId: string | null
  order: number
  title: string
  // Plotpoint body text; unused for category/plotline nodes.
  body: string
  // Set only on "plotpoint" nodes: the moment (outline node id) assigned.
  assignedMomentId: string | null
  // Set only on "category" nodes: custom field definitions plotlines within
  // this category can fill in.
  customFieldDefs: PlotCustomFieldDef[]
  // Set only on "plotline" nodes: values for the parent category's custom
  // fields, keyed by PlotCustomFieldDef.id.
  customFieldValues: Record<string, string>
  // Set only on "plotline" nodes: keywords/phrases connected to this plotline.
  keywords: string[]
  // Flags this item for revision (review/edit/add/delete), with an optional note.
  flag: NodeFlag | null
}

export interface PlotTree {
  schemaVersion: number
  nodes: PlotNode[]
}

export interface DraftMoment {
  schemaVersion: number
  momentId: string
  outlineNodeId: string
  updatedAt: string
  wordCount: number
  format: 'markdown'
  body: string
}

export type CommentFlag = 'primary' | 'secondary' | null

export interface CommentAnchor {
  type: 'text-offset'
  start: number
  end: number
}

export interface RevisionComment {
  id: string
  anchor: CommentAnchor
  body: string
  flag: CommentFlag
  createdAt: string
}

export type RevisionTrigger = 'manual' | 'session-close'

export interface RevisionSnapshot {
  schemaVersion: number
  snapshotId: string
  momentId: string
  createdAt: string
  label: string
  trigger: RevisionTrigger
  body: string
  wordCount: number
  notes: RevisionComment[]
}

export interface RevisionSummary {
  snapshotId: string
  createdAt: string
  label: string
  trigger: RevisionTrigger
  wordCount: number
}

export interface ProjectSummary {
  index: ProjectIndex
  outline: OutlineTree | null
  plot: PlotTree | null
  warnings: string[]
}

export type DiffOpKind = 'equal' | 'insert' | 'delete'

export interface DiffOp {
  op: DiffOpKind
  text: string
}

// ---------------------------------------------------------------------------
// Outline/Plot tree history: automatic snapshot/diff/revert, parallel to (but
// separate from) the manual RevisionSnapshot system above for draft moments.
// ---------------------------------------------------------------------------

export type TreeType = 'outline' | 'plot'
export type TreeSnapshotTrigger = 'auto' | 'revert-safety'

export interface TreeSnapshotSummary {
  snapshotId: string
  treeType: TreeType
  createdAt: string
  trigger: TreeSnapshotTrigger
  nodeCount: number
  summary: string
}

export type TreeDiffEntryKind = 'added' | 'removed' | 'modified' | 'unchanged'

export interface TreeDiffEntry {
  nodeId: string
  kind: TreeDiffEntryKind
  title: string
  changedFields: string[]
}

export interface TreeDiffResponse {
  fromSnapshotId: string
  toSnapshotId: string
  entries: TreeDiffEntry[]
}

export interface OutlineSnapshotDetail {
  snapshotId: string
  createdAt: string
  trigger: string
  nodes: OutlineNode[]
}

export interface OutlineRevertResponse {
  safetySnapshotId: string | null
  outline: OutlineTree
}

export interface PlotSnapshotDetail {
  snapshotId: string
  createdAt: string
  trigger: string
  nodes: PlotNode[]
}

export interface PlotRevertResponse {
  safetySnapshotId: string | null
  plot: PlotTree
}

// ---------------------------------------------------------------------------
// Activity: daily aggregate (feeds the calendar heatmap) + a unified,
// reverse-chronological feed (feeds the activity log).
// ---------------------------------------------------------------------------

export interface DailyActivityEntry {
  date: string // YYYY-MM-DD
  wordCountDelta: number
  outlineSaves: number
  plotSaves: number
  draftRevisions: number
}

export interface DailyActivityLog {
  schemaVersion: number
  days: Record<string, DailyActivityEntry>
}

export type ActivityEntryType = 'outline' | 'plot' | 'draft'

export interface ActivityLogEntry {
  id: string
  type: ActivityEntryType
  createdAt: string
  label: string
  trigger: string
  momentId: string | null
  wordCount: number | null
}

export interface ActivityResponse {
  daily: DailyActivityLog
  log: ActivityLogEntry[]
}

// ---------------------------------------------------------------------------
// Analytics: aggregated counts/word-counts, goal deltas, and outstanding
// flags -- feeds both the Plan and Analytics dashboard panels.
// ---------------------------------------------------------------------------

export interface ProjectAnalyticsTotals {
  bookCount: number
  chapterCount: number
  sceneCount: number
  momentCount: number
  totalWordCount: number
}

export interface ProjectAnalyticsGoals {
  wordCountTarget: number | null
  bookCountTarget: number | null
  chapterCountTarget: number | null
  bookWordCountTarget: number | null
  chapterWordCountTarget: number | null
}

export interface BookWordCount {
  nodeId: string
  title: string
  wordCount: number
  chapterCount: number
}

export interface ChapterWordCount {
  nodeId: string
  title: string
  bookId: string | null
  wordCount: number
}

export interface FlaggedNode {
  nodeId: string
  treeType: TreeType
  kind: string
  title: string
  flag: NodeFlag
}

export interface ProjectAnalytics {
  totals: ProjectAnalyticsTotals
  goals: ProjectAnalyticsGoals
  perBook: BookWordCount[]
  perChapter: ChapterWordCount[]
  flaggedNodes: FlaggedNode[]
}

// ---------------------------------------------------------------------------
// Scrap: a registry of draft content orphaned when its outline node was
// deleted. The draft shard and revision history are left untouched on disk --
// this only tracks which moment ids are orphaned, plus last-known ancestry
// (captured at deletion time) to group them under a chapter/book in the UI.
// ---------------------------------------------------------------------------

export interface ScrapEntry {
  momentId: string
  title: string
  wordCount: number
  orphanedAt: string
  lastChapterId: string | null
  lastChapterTitle: string | null
  lastBookId: string | null
  lastBookTitle: string | null
}

export interface ScrapRegistry {
  schemaVersion: number
  entries: ScrapEntry[]
}
