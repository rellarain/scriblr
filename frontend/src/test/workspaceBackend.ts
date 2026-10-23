import type { OutlineNode, PlotNode, ProjectIndex } from '../api/types'
import { mockFetchBy } from './mockFetch'

// A stand-in backend for the tests of `useWriterWorkspace`: the routes the workspace uses, answered from a few small projects, with a
// record of what was asked and what was saved. Replaces the fetch mock each of those tests used to build for itself.

export function outlineNode(id: string, kind: OutlineNode['kind'], parentId: string | null, title = id, order = 0): OutlineNode {
  return {
    id, kind, parentId, order, title, synopsis: '', draftRef: null, flag: null, color: null, chapterCountTarget: null,
    plotlineIds: [], wordCountGoal: null, location: '', timeValue: {}, action: '', createdAt: '2026-01-01T00:00:00Z',
  } as OutlineNode
}

export function plotNode(id: string, kind: PlotNode['kind'], parentId: string | null, title = id, extra: Partial<PlotNode> = {}): PlotNode {
  return {
    id, kind, parentId, order: 0, title, body: '', assignedMomentId: null, assignedParagraphIndex: null, sourceFieldId: null,
    customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, fieldId: null, refId: null, awareness: null, ...extra,
  }
}

export function projectIndex(projectId: string, title: string): ProjectIndex {
  return { projectId, title, settings: { timeSystems: [] } } as unknown as ProjectIndex
}

export interface StandInProject {
  index: ProjectIndex
  outline: OutlineNode[]
  plot?: PlotNode[]
}

export interface StandInBackend {
  // Every request as `METHOD /path` (without the `/api` prefix).
  calls: string[]
  // The bodies of the saves, in order.
  saved: { outline: OutlineNode[][]; plot: PlotNode[][]; settings: Array<Record<string, unknown>> }
  count: (call: string) => number
}

// `answer` may reply to a request itself (its return value is the JSON body); `undefined` leaves it to the stand-in.
export function standInBackend(
  projects: Record<string, StandInProject>,
  answer?: (path: string, method: string, init?: RequestInit) => unknown,
): StandInBackend {
  const calls: string[] = []
  const saved: StandInBackend['saved'] = { outline: [], plot: [], settings: [] }
  mockFetchBy((url, init) => {
    const path = url.replace(/^\/api/, '')
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${path}`)
    const own = answer?.(path, method, init)
    if (own !== undefined) return own
    if (path === '/projects/overview') return Object.values(projects).map(p => ({ index: p.index, outline: p.outline, progress: {} }))
    const project = /^\/projects\/([^/]+)(\/outline|\/plot)?$/.exec(path)
    if (project) {
      const found = projects[project[1]]
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (method === 'GET' && !project[2]) {
        return {
          index: found.index, outline: { schemaVersion: 2, nodes: found.outline }, plot: { schemaVersion: 1, nodes: found.plot ?? [] }, warnings: [],
        }
      }
      if (method === 'PUT' && project[2] === '/outline') { saved.outline.push(body.nodes); return body }
      if (method === 'PUT' && project[2] === '/plot') { saved.plot.push(body.nodes); return body }
      if (method === 'PATCH' && !project[2]) {
        saved.settings.push(body)
        return { ...found.index, settings: { ...found.index.settings, ...body } }
      }
    }
    if (/\/(outline|plot)\/history$|\/settings-log$/.test(path)) return []
    if (path.endsWith('/book-progress')) return {}
    return {}
  })
  return { calls, saved, count: call => calls.filter(c => c === call).length }
}
