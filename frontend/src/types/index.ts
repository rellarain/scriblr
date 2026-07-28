export interface ProjectManifest {
  outline: string
  plot: string
  draftMoments: string[]
  revisionMoments: string[]
}

export interface ProjectSettings {
  wordCountTarget: number | null
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

export interface OutlineNode {
  id: string
  kind: OutlineNodeKind
  parentId: string | null
  order: number
  title: string
  synopsis: string
  // Set only on "moment" nodes: the moment IS the writing unit.
  draftRef: string | null
}

export interface OutlineTree {
  schemaVersion: number
  nodes: OutlineNode[]
}

// Plot tree: category -> plotline -> plotpoint, mirroring the outline
// tree's flat-list-with-parentId shape.
export type PlotNodeKind = 'category' | 'plotline' | 'plotpoint'
export const PLOT_KIND_ORDER: PlotNodeKind[] = ['category', 'plotline', 'plotpoint']

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
