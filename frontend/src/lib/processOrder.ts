import type { Milestone, Process, StepGroup } from './facets'

// How processes follow one another, and how the steps inside one do.
//
// A link "before" (or the same read from the other side, "after") is an ordered one: this comes first. "With" is unordered: the two are related, or can be done
// at the same time before whatever comes next. Processes that go with each other are one stage; the ordered links put the stages in a sequence. A set of
// links that goes round in a circle cannot be put in order: those processes are named in `cyclic` and are shown together at the end.

export interface ProcessStages { stages: string[][]; cyclic: string[] }

export function processStages(processes: Process[]): ProcessStages {
  const ids = processes.map(p => p.id)
  const known = new Set(ids)
  // Processes that go with each other share a stage (union-find over the "with" links).
  const parent = new Map(ids.map(id => [id, id]))
  const find = (id: string): string => { let r = id; while (parent.get(r) !== r) r = parent.get(r) as string; return r }
  for (const p of processes) for (const l of p.links) if (l.relation === 'with' && known.has(l.otherId)) parent.set(find(p.id), find(l.otherId))
  // An edge from a stage to the one that must come after it.
  const after = new Map<string, Set<string>>()
  const edge = (from: string, to: string) => { const a = find(from); const b = find(to); if (a !== b) (after.get(a) ?? after.set(a, new Set()).get(a) as Set<string>).add(b) }
  for (const p of processes) for (const l of p.links) {
    if (!known.has(l.otherId)) continue
    if (l.relation === 'before') edge(p.id, l.otherId)
    else if (l.relation === 'after') edge(l.otherId, p.id)
  }
  const roots = [...new Set(ids.map(find))]
  const indegree = new Map(roots.map(r => [r, 0]))
  for (const set of after.values()) for (const to of set) indegree.set(to, (indegree.get(to) ?? 0) + 1)
  // Kahn's algorithm, one layer at a time: the layer a stage lands in is the stage's place in the sequence.
  const layers: string[][] = []
  let frontier = roots.filter(r => indegree.get(r) === 0)
  const placed = new Set<string>()
  while (frontier.length) {
    layers.push(frontier)
    frontier.forEach(r => placed.add(r))
    const next: string[] = []
    for (const r of frontier) for (const to of after.get(r) ?? []) { indegree.set(to, (indegree.get(to) ?? 0) - 1); if (indegree.get(to) === 0) next.push(to) }
    frontier = next
  }
  const members = (root: string) => ids.filter(id => find(id) === root)
  return { stages: layers.map(layer => layer.flatMap(members)), cyclic: roots.filter(r => !placed.has(r)).flatMap(members) }
}

// The steps of a group that can be done now, given the steps already done: in an ordered group only the first one not done; in any order, every one not done.
export function openSteps(group: StepGroup, doneStepIds: ReadonlySet<string>): string[] {
  const left = group.steps.filter(s => !doneStepIds.has(s.id))
  return group.ordered ? left.slice(0, 1).map(s => s.id) : left.map(s => s.id)
}

// The milestones a process needs that are not done yet (an unknown one counts as not done, so a process cannot be freed by deleting what it needs by mistake).
export function unmetMilestones(process: Process, milestones: Milestone[]): string[] {
  return process.requiredMilestoneIds.filter(id => !milestones.find(m => m.id === id)?.done)
}
export const isBlocked = (process: Process, milestones: Milestone[]): boolean => unmetMilestones(process, milestones).length > 0
