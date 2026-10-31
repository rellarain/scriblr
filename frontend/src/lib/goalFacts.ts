// How much of a goal is done: read off the project itself (words in the drafts, nodes in the trees) and, for revision and project goals, off the
// activity (flags resolved, items ticked).

import type { FacetActivityData, Goal } from './facets'

export interface TreeNodeFact { id: string; kind: string; parentId: string | null; title: string }
export interface ProjectFacts {
  projectId: string
  words: number
  nodeWords: Record<string, number>
  outline: TreeNodeFact[]
  plot: TreeNodeFact[]
}

// A node and everything under it.
export function withDescendants(nodes: TreeNodeFact[], id: string): TreeNodeFact[] {
  const children = new Map<string, TreeNodeFact[]>()
  for (const n of nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n])
  const out: TreeNodeFact[] = []
  const walk = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (node) out.push(node)
    for (const c of children.get(nodeId) ?? []) walk(c.id)
  }
  walk(id)
  return out
}

const sum = (values: Iterable<number>): number => { let n = 0; for (const v of values) n += v; return n }
const total = (data: FacetActivityData, pick: (d: FacetActivityData['daily'][string]) => number): number =>
  sum(Object.values(data.daily).map(pick)) + sum(Object.values(data.monthly).map(pick))

// The amount done towards a goal's total. A goal's `scope` narrows a draft or outline goal to a book or a chapter; a plot goal counts the whole
// plot (plot nodes are not under books); `kind` counts only nodes of that kind.
export function currentOf(goal: Goal, facts: ProjectFacts[], activity: FacetActivityData): number {
  switch (goal.facet) {
    case 'draft':
      if (goal.scope === 'project' || !goal.nodeId) return sum(facts.map(f => f.words))
      return sum(facts.map(f => f.nodeWords[goal.nodeId as string] ?? 0))
    case 'outline': {
      const nodes = facts.flatMap(f => (goal.scope !== 'project' && goal.nodeId ? withDescendants(f.outline, goal.nodeId) : f.outline))
      return nodes.filter(n => (goal.kind ? n.kind === goal.kind : true)).length
    }
    case 'plot':
      return facts.flatMap(f => f.plot).filter(n => (goal.kind ? n.kind === goal.kind : true)).length
    case 'revision':
      return total(activity, d => d.flagsResolved)
    default:
      return total(activity, d => d.project)
  }
}
