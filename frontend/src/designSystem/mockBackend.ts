import { DEFAULT_UI_SETTINGS, defaultThemeSettings } from '../theme/defaults'
import type { OutlineNode, OutlineTree, PlotNode, PlotTree, ProjectIndex, ProjectSummaryResponse, Publication } from '../api/types'
import type { DraftChapter, ProjectAnalytics } from '../types'

// A pretend backend for the design system's previews: the real Writer (useWriterWorkspace and everything under it) talks to
// `/api/...` with fetch, so the previews run the real app against this in-memory project. The labels are the app's own (a book,
// an arc, a chapter ...); the text in them is lorem ipsum.

const LOREM = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa.',
  'Curabitur pretium tincidunt lacus, nulla gravida orci a odio.',
]
const lorem = (i: number, count = 1) => Array.from({ length: count }, (_, k) => LOREM[(i + k) % LOREM.length]).join(' ')
const words = (text: string) => text.split(/\s+/).filter(Boolean).length

export const FIXTURE_PROJECT_ID = 'prj-lorem'
export const FIXTURE_IDS = { series: 's1', book: 'b1', otherBook: 'b2', chapter: 'c1', secondChapter: 'c2' } as const

const NOW = '2026-01-15T09:00:00.000Z'

function node(id: string, kind: OutlineNode['kind'], parentId: string | null, order: number, over: Partial<OutlineNode> = {}): OutlineNode {
  return {
    id, kind, parentId, order, title: '', synopsis: '', draftRef: null, flag: null, color: null, chapterCountTarget: null, plotlineIds: [],
    wordCountGoal: null, ...over,
  }
}

function outlineNodes(): OutlineNode[] {
  const out: OutlineNode[] = [
    node('s1', 'series', null, 0, { title: 'Lorem ipsum series' }),
    node('b1', 'book', 's1', 0, { title: 'Lorem ipsum dolor', synopsis: lorem(0), themeHue: 28, chapterCountTarget: 12, wordCountGoal: 60000 }),
    node('b2', 'book', 's1', 1, { title: 'Sit amet consectetur', themeHue: 200, wordCountGoal: 80000 }),
    node('a1', 'arc', 'b1', 0, { title: 'Lorem ipsum arc', themeHue: 10 }),
    node('a2', 'arc', 'b1', 1, { title: 'Dolor sit arc', themeHue: 60 }),
    node('c1', 'chapter', 'a1', 0, { title: 'Lorem ipsum dolor', synopsis: lorem(1), themeHue: 350 }),
    node('c2', 'chapter', 'a1', 1, { title: 'Sit amet consectetur', synopsis: lorem(2), themeHue: 25 }),
    node('c3', 'chapter', 'a2', 0, { title: 'Adipiscing elit sed', synopsis: lorem(3), themeHue: 40 }),
    node('c4', 'chapter', 'a2', 1, { title: 'Eiusmod tempor', themeHue: 80 }),
    node('c5', 'chapter', 'b1', 2, { title: 'Incididunt ut labore' }),
  ]
  // The first two chapters have an outline: acts, scenes and moments.
  for (const [ci, chapter] of [['c1', 0], ['c2', 1]] as const) {
    for (let a = 0; a < 2; a += 1) {
      const act = `${ci}-act${a}`
      out.push(node(act, 'act', ci, a, { title: `Lorem ${chapter + a + 1} ipsum act` }))
      for (let s = 0; s < 2; s += 1) {
        const scene = `${act}-sc${s}`
        out.push(node(scene, 'scene', act, s, { location: 'Lorem ipsum', action: lorem(a + s) }))
        for (let m = 0; m < 2; m += 1) {
          out.push(node(`${scene}-m${m}`, 'moment', scene, m, { synopsis: lorem(a + s + m + chapter) }))
        }
      }
    }
  }
  return out
}

function plotNodes(moments: string[]): PlotNode[] {
  const base = { body: '', assignedMomentId: null, assignedParagraphIndex: null, sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, fieldId: null, refId: null, awareness: null }
  const p = (id: string, kind: PlotNode['kind'], parentId: string | null, order: number, over: Partial<PlotNode> = {}): PlotNode =>
    ({ ...base, id, kind, parentId, order, title: '', ...over } as PlotNode)
  return [
    p('cat1', 'category', null, 0, { title: 'Category lorem', hue: 200 }),
    p('cat2', 'category', null, 1, { title: 'Category ipsum', hue: 300 }),
    p('sub1', 'subcategory', 'cat1', 0, { title: 'Subcategory dolor', hue: 230 }),
    p('line1', 'plotline', 'sub1', 0, { title: 'Plotline sit amet' }),
    p('line2', 'plotline', 'cat2', 0, { title: 'Plotline consectetur' }),
    p('pp1', 'plotpoint', 'line1', 0, { title: 'Plotpoint lorem ipsum', body: lorem(0) }),
    p('pp2', 'plotpoint', 'line1', 1, { title: 'Plotpoint dolor sit', body: lorem(1), assignedMomentId: moments[0], awareness: 'front' }),
    p('pp3', 'plotpoint', 'line1', 2, { title: 'Plotpoint amet elit', body: lorem(2), assignedMomentId: moments[3], awareness: 'back' }),
    p('pp4', 'plotpoint', 'line2', 0, { title: 'Plotpoint sed eiusmod', body: lorem(3) }),
  ]
}

export interface FixtureProject {
  index: ProjectIndex
  outline: OutlineTree
  plot: PlotTree
  drafts: Record<string, DraftChapter>
  publications: Record<string, Publication[]>
}

function buildProject(id: string): FixtureProject {
  const nodes = outlineNodes()
  const moments = nodes.filter(n => n.kind === 'moment').map(n => n.id)
  const drafts: Record<string, DraftChapter> = {}
  for (const chapterId of ['c1', 'c2']) {
    const chapterMoments = moments.filter(m => m.startsWith(`${chapterId}-`))
    drafts[chapterId] = {
      schemaVersion: 2, chapterId, updatedAt: NOW,
      moments: Object.fromEntries(chapterMoments.map((m, i) => {
        const body = lorem(i, 3)
        return [m, { body, wordCount: words(body), updatedAt: NOW }]
      })),
    }
  }
  return {
    index: {
      schemaVersion: 2, projectId: id, title: 'Lorem ipsum project', createdAt: NOW, updatedAt: NOW,
      settings: {
        wordCountTarget: 120000, bookCountTarget: 3, bookWordCountTarget: 60000, chapterWordCountTarget: 3000,
        priorities: [], routines: [], outlineLevels: ['series', 'book', 'arc', 'chapter', 'act', 'scene', 'moment'],
        plotLevels: ['category', 'subcategory', 'plotline', 'plotpoint'], readLevels: ['chapter'], timeSystems: [], themeHue: null,
      },
      manifest: { outline: 'outline', plot: 'plot', draftMoments: [], revisionChapters: [] },
    },
    outline: { schemaVersion: 2, nodes },
    plot: { schemaVersion: 1, nodes: plotNodes(moments) },
    drafts,
    publications: {},
  }
}

function analytics(p: FixtureProject): ProjectAnalytics {
  const counts: Record<string, number> = {}
  const parentOf = new Map(p.outline.nodes.map(n => [n.id, n.parentId]))
  for (const chapter of Object.values(p.drafts)) {
    for (const [momentId, m] of Object.entries(chapter.moments)) {
      for (let id: string | null = momentId; id; id = parentOf.get(id) ?? null) counts[id] = (counts[id] ?? 0) + m.wordCount
    }
  }
  const nodes = p.outline.nodes
  return {
    totals: { bookCount: nodes.filter(n => n.kind === 'book').length, chapterCount: nodes.filter(n => n.kind === 'chapter').length, sceneCount: nodes.filter(n => n.kind === 'scene').length, momentCount: nodes.filter(n => n.kind === 'moment').length, totalWordCount: counts.s1 ?? 0 },
    goals: { wordCountTarget: p.index.settings.wordCountTarget, bookCountTarget: p.index.settings.bookCountTarget, bookWordCountTarget: p.index.settings.bookWordCountTarget, chapterWordCountTarget: p.index.settings.chapterWordCountTarget },
    perBook: nodes.filter(n => n.kind === 'book').map(b => ({ nodeId: b.id, title: b.title, wordCount: counts[b.id] ?? 0, chapterCount: nodes.filter(n => n.kind === 'chapter').length, chapterCountTarget: b.chapterCountTarget })),
    perChapter: nodes.filter(n => n.kind === 'chapter').map(c => ({ nodeId: c.id, title: c.title, bookId: 'b1', wordCount: counts[c.id] ?? 0 })),
    nodeWordCounts: counts,
    flaggedNodes: [],
  }
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const notFound = (): Response => json({ detail: 'Not found' }, 404)

// The in-memory project and the routes the Writer uses. Saves change the copy in memory only.
export function createMockBackend() {
  const projects = new Map<string, FixtureProject>([[FIXTURE_PROJECT_ID, buildProject(FIXTURE_PROJECT_ID)]])

  async function handle(method: string, path: string, body: unknown): Promise<Response> {
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
    if (parts[0] === 'user-settings') return json({ theme: defaultThemeSettings(), ui: DEFAULT_UI_SETTINGS, kv: {}, migratedFromLocal: true })
    if (parts[0] === 'resources') return json({ schemaVersion: 1, nodes: [], content: {} })
    if (parts[0] !== 'projects') return notFound()
    if (parts.length === 1) return method === 'GET' ? json([...projects.values()].map(p => p.index)) : notFound()
    const project = projects.get(parts[1])
    if (!project) return notFound()
    const rest = parts.slice(2)
    if (rest.length === 0) {
      if (method === 'GET') {
        const summary: ProjectSummaryResponse = { index: project.index, outline: project.outline, plot: project.plot, warnings: [] }
        return json(summary)
      }
      if (method === 'PATCH') {
        project.index = { ...project.index, settings: { ...project.index.settings, ...(body as object) } }
        return json(project.index)
      }
      return notFound()
    }
    if (rest[0] === 'outline') {
      if (method === 'PUT') project.outline = body as OutlineTree
      return json(project.outline)
    }
    if (rest[0] === 'plot') {
      if (method === 'PUT') project.plot = body as PlotTree
      return json(project.plot)
    }
    if (rest[0] === 'analytics') return json(analytics(project))
    if (rest[0] === 'draft' && rest[1] === 'chapter') {
      const chapterId = rest[2]
      if (rest[3] === 'moment' && method === 'PUT') {
        const text = (body as { body: string }).body
        const chapter = project.drafts[chapterId] ?? { schemaVersion: 2, chapterId, updatedAt: NOW, moments: {} }
        chapter.moments[rest[4]] = { body: text, wordCount: words(text), updatedAt: new Date().toISOString() }
        project.drafts[chapterId] = chapter
        return json({ schemaVersion: 2, momentId: rest[4], outlineNodeId: rest[4], updatedAt: NOW, wordCount: words(text), format: 'markdown', body: text })
      }
      const chapter = project.drafts[chapterId]
      return chapter ? json(chapter) : notFound()
    }
    if (rest[0] === 'publications') {
      const chapterId = rest[1]
      const list = project.publications[chapterId] ?? []
      if (method === 'POST') {
        const draft = project.drafts[chapterId]
        const sections = Object.entries(draft?.moments ?? {}).map(([momentId, m]) => ({ momentId, body: m.body }))
        const pub: Publication = { id: `pub-${list.length + 1}`, chapterId, publishedAt: new Date().toISOString(), wordCount: sections.reduce((n, s) => n + words(s.body), 0), title: 'Lorem ipsum', sections }
        project.publications[chapterId] = [pub, ...list]
        return json(pub)
      }
      return json(list)
    }
    return notFound()
  }

  const fetchStub: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url
    const path = url.replace(/^https?:\/\/[^/]+/, '')
    if (!path.startsWith('/api/')) return notFound()
    const method = (init?.method ?? 'GET').toUpperCase()
    let body: unknown
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body) } catch { body = undefined } }
    return handle(method, path.slice('/api'.length), body)
  }

  return { projects, fetch: fetchStub }
}

// Makes the Writer's requests land on the pretend backend (once).
let installed: ReturnType<typeof createMockBackend> | null = null
export function installMockBackend(): ReturnType<typeof createMockBackend> {
  if (!installed) {
    installed = createMockBackend()
    window.fetch = installed.fetch
  }
  return installed
}
