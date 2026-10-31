import { useEffect, useState } from 'react'
import { api } from '../../../../api/client'
import type { ProjectFacts, TreeNodeFact } from '../../../../lib/goalFacts'

// What a goal's progress is read from: each project's word counts and the nodes of its outline and plot.

interface RawTree { nodes: Array<{ id: string; kind: string; parentId: string | null; title: string }> }
interface RawAnalytics { totals: { totalWordCount: number }; nodeWordCounts: Record<string, number> }
const facts = (n: RawTree['nodes']): TreeNodeFact[] => n.map(x => ({ id: x.id, kind: x.kind, parentId: x.parentId, title: x.title }))

export function useProjectFacts(projectIds: string[]): ProjectFacts[] {
  const key = projectIds.join(',')
  const [list, setList] = useState<ProjectFacts[]>([])
  useEffect(() => {
    let live = true
    Promise.all(projectIds.map(async id => {
      const e = encodeURIComponent(id)
      const [a, o, p] = await Promise.all([api.get<RawAnalytics>(`/projects/${e}/analytics`), api.get<RawTree>(`/projects/${e}/outline`), api.get<RawTree>(`/projects/${e}/plot`)])
      return { projectId: id, words: a.totals.totalWordCount, nodeWords: a.nodeWordCounts, outline: facts(o.nodes), plot: facts(p.nodes) }
    })).then(rows => { if (live) setList(rows) }, () => { if (live) setList([]) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return list
}
