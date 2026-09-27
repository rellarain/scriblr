import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addResourceNode, deleteResourceNode, getResources, putResourceAssessment, putResourceFaq, putResourceGuide,
  putResourceTutorials, renameResourceNode,
} from '../../../../api/resourcesApi'
import type {
  ResourceAssessment, ResourceContent, ResourceFaqEntry, ResourceNode, ResourceNodeKind, ResourceQuestion,
  ResourceTutorial, ResourcesFile,
} from '../../../../api/types'

type AsyncStatus = 'idle' | 'loading' | 'error'

const EMPTY_CONTENT: ResourceContent = { guide: '', tutorials: [], faq: [] }
const EMPTY_ASSESSMENT: ResourceAssessment = { questions: [] }

// The next kind a node's own "+ Add" button creates -- null once you're at a
// feature, the tree's leaf.
export const CHILD_KIND: Record<ResourceNodeKind, ResourceNodeKind | null> = {
  interface: 'console',
  console: 'component',
  component: 'feature',
  feature: null,
}

// Console, Component and Feature nodes each hold an Exam, Test or Quiz
// respectively; an Interface (the taxonomy's top level) holds none.
export const ASSESSMENT_LABEL: Record<ResourceNodeKind, string | null> = {
  interface: null,
  console: 'Exam',
  component: 'Test',
  feature: 'Quiz',
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

// The Resources article/quiz builder's data: the Interface > Console >
// Component > Feature tree plus each node's Guide/Tutorials/FAQ and
// Exam/Test/Quiz.
//
// Content/assessment edits apply to local state immediately (optimistic),
// then persist in the background -- mirroring useAuiConfig.ts's commit()
// pattern. Waiting for the server's response before updating local state
// (as every mutator originally did) loses data: two edits fired close
// together -- typing a question's prompt, then one of its options, well
// within a network round-trip -- would each compute their next value from
// the same not-yet-updated `file`, so the second PUT's response overwrites
// the first edit when it lands. Updating a local, always-current `fileRef`
// synchronously on every call closes that race.
export function useResources() {
  const [file, setFileState] = useState<ResourcesFile | null>(null)
  const [status, setStatus] = useState<AsyncStatus>('idle')
  const [error, setError] = useState<string | undefined>(undefined)

  const fileRef = useRef<ResourcesFile | null>(file)
  function applyFile(next: ResourcesFile) {
    fileRef.current = next
    setFileState(next)
  }

  async function load() {
    setStatus('loading')
    setError(undefined)
    try {
      applyFile(await getResources())
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setError(errMessage(err, 'Failed to load Resources'))
    }
  }
  useEffect(() => { void load() }, [])

  const nodes = useMemo(() => file?.nodes ?? [], [file])
  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])
  const childrenByParent = useMemo(() => {
    const map = new Map<string, ResourceNode[]>()
    for (const n of nodes) {
      const key = n.parentId ?? ''
      const bucket = map.get(key)
      if (bucket) bucket.push(n)
      else map.set(key, [n])
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.order - b.order)
    return map
  }, [nodes])

  function findNode(nodeId: string): ResourceNode | undefined {
    return nodeById.get(nodeId)
  }
  function childrenOf(parentId: string | null): ResourceNode[] {
    return childrenByParent.get(parentId ?? '') ?? []
  }
  // Every ancestor from the tree's root down to (and including) this node.
  function pathTo(nodeId: string): ResourceNode[] {
    const path: ResourceNode[] = []
    let current = findNode(nodeId)
    while (current) {
      path.unshift(current)
      current = current.parentId ? findNode(current.parentId) : undefined
    }
    return path
  }

  function contentOf(nodeId: string): ResourceContent {
    return file?.content[nodeId] ?? EMPTY_CONTENT
  }
  function assessmentOf(nodeId: string): ResourceAssessment {
    return file?.assessments[nodeId] ?? EMPTY_ASSESSMENT
  }

  // Structural edits (add/rename/delete): rarer, and adding needs the
  // server's generated id anyway, so these still await it and adopt its
  // response directly.
  async function addNode(parentId: string | null, kind: ResourceNodeKind): Promise<string> {
    const before = new Set((fileRef.current?.nodes ?? []).map(n => n.id))
    const next = await addResourceNode(parentId, kind, '')
    applyFile(next)
    const added = next.nodes.find(n => !before.has(n.id))
    return added?.id ?? ''
  }
  async function renameNode(nodeId: string, name: string): Promise<void> {
    applyFile(await renameResourceNode(nodeId, name))
  }
  async function deleteNode(nodeId: string): Promise<void> {
    applyFile(await deleteResourceNode(nodeId))
  }

  // Content/assessment edits: apply locally first (see the note above),
  // persist in the background. A failure here is rare (this is a local
  // backend) and, for now, only surfaces in the console -- there is no
  // multi-user conflict to reconcile.
  function optimisticContent(nodeId: string, patch: Partial<ResourceContent>) {
    const current = fileRef.current
    if (!current) return
    const content = { ...current.content, [nodeId]: { ...(current.content[nodeId] ?? EMPTY_CONTENT), ...patch } }
    applyFile({ ...current, content })
  }
  function optimisticAssessment(nodeId: string, questions: ResourceQuestion[]) {
    const current = fileRef.current
    if (!current) return
    applyFile({ ...current, assessments: { ...current.assessments, [nodeId]: { questions } } })
  }

  async function setGuide(nodeId: string, guide: string): Promise<void> {
    optimisticContent(nodeId, { guide })
    try { await putResourceGuide(nodeId, guide) } catch (err) { console.error('Failed to save the guide', err) }
  }
  async function setTutorials(nodeId: string, tutorials: ResourceTutorial[]): Promise<void> {
    optimisticContent(nodeId, { tutorials })
    try { await putResourceTutorials(nodeId, tutorials) } catch (err) { console.error('Failed to save tutorials', err) }
  }
  async function setFaq(nodeId: string, faq: ResourceFaqEntry[]): Promise<void> {
    optimisticContent(nodeId, { faq })
    try { await putResourceFaq(nodeId, faq) } catch (err) { console.error('Failed to save the FAQ', err) }
  }
  async function setAssessment(nodeId: string, questions: ResourceQuestion[]): Promise<void> {
    optimisticAssessment(nodeId, questions)
    try { await putResourceAssessment(nodeId, questions) } catch (err) { console.error('Failed to save the assessment', err) }
  }

  return {
    status, error, reload: load,
    nodes, findNode, childrenOf, pathTo,
    contentOf, assessmentOf,
    addNode, renameNode, deleteNode, setGuide, setTutorials, setFaq, setAssessment,
  }
}

export type ResourcesWorkspace = ReturnType<typeof useResources>
