export interface ProjectManifest {
  outline: string
  brainstorm: string
  draftScenes: string[]
  revisionScenes: string[]
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

export type OutlineNodeKind = 'book' | 'chapter' | 'scene'

export interface OutlineNode {
  id: string
  kind: OutlineNodeKind
  parentId: string | null
  order: number
  title: string
  synopsis: string
  draftRef: string | null
}

export interface OutlineTree {
  schemaVersion: number
  nodes: OutlineNode[]
}

export interface BrainstormNote {
  id: string
  createdAt: string
  updatedAt: string
  body: string
  tags: string[]
  linkedOutlineNodeId: string | null
}

export interface BrainstormNotes {
  schemaVersion: number
  notes: BrainstormNote[]
}

export interface DraftScene {
  schemaVersion: number
  sceneId: string
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
  sceneId: string
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
  warnings: string[]
}

export type DiffOpKind = 'equal' | 'insert' | 'delete'

export interface DiffOp {
  op: DiffOpKind
  text: string
}
