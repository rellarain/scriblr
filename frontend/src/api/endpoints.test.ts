import { describe, expect, it, vi } from 'vitest'
import { getBookProgress } from './bookProgressApi'
import { ApiError } from './client'
import { getChapterDraft, getWordCounts, putMomentDraft } from './draftFetch'
import {
  getOutlineSnapshot, getPlotSnapshot, getProjectSettingsLog, getRevisionSnapshot, getUserSettingsLog, listOutlineHistory, listPlotHistory,
  listRevisionSummaries,
} from './historyFetch'
import { getOutline, putOutline } from './outlineApi'
import { getPlot, putPlot } from './plotApi'
import { createProject, deleteProject, getProject, getProjectsOverview, updateProject } from './projectsApi'
import { discardPresetChanges, getPresets, getPublishedPresets, publishPreset, putPresets, restorePresetVersion, unpublishPreset } from './presetsApi'
import { listPublications, publishChapter } from './publicationFetch'

// Each call to the backend asks for the route, with the verb and body, the backend expects: a table of them, with an id that needs escaping
// so that a path never changes shape (an id such as "a/b c" must stay one path segment).

const ID = 'a/b c'
const ESC = 'a%2Fb%20c'

function answerWith(body: unknown = {}, init: { ok?: boolean; status?: number } = {}) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: init.ok ?? true, status: init.status ?? 200, statusText: 'x', json: async () => body }))
  vi.stubGlobal('fetch', fn)
  return fn
}

const TREE = { schemaVersion: 2, nodes: [] }
const CASES: Array<[string, () => Promise<unknown>, string, string, unknown?]> = [
  ['getProjectsOverview', () => getProjectsOverview(), 'GET', '/api/projects/overview'],
  ['createProject', () => createProject('Title'), 'POST', '/api/projects', { title: 'Title' }],
  ['getProject', () => getProject(ID), 'GET', `/api/projects/${ESC}`],
  ['updateProject', () => updateProject(ID, { themeHue: 5 }), 'PATCH', `/api/projects/${ESC}`, { themeHue: 5 }],
  ['deleteProject', () => deleteProject(ID), 'DELETE', `/api/projects/${ESC}`],
  ['getOutline', () => getOutline(ID), 'GET', `/api/projects/${ESC}/outline`],
  ['putOutline', () => putOutline(ID, TREE), 'PUT', `/api/projects/${ESC}/outline`, TREE],
  ['getPlot', () => getPlot(ID), 'GET', `/api/projects/${ESC}/plot`],
  ['putPlot', () => putPlot(ID, TREE), 'PUT', `/api/projects/${ESC}/plot`, TREE],
  ['getBookProgress', () => getBookProgress(ID), 'GET', `/api/projects/${ESC}/book-progress`],
  ['listOutlineHistory', () => listOutlineHistory(ID), 'GET', `/api/projects/${ESC}/outline/history`],
  ['getOutlineSnapshot', () => getOutlineSnapshot(ID, ID), 'GET', `/api/projects/${ESC}/outline/history/${ESC}`],
  ['listPlotHistory', () => listPlotHistory(ID), 'GET', `/api/projects/${ESC}/plot/history`],
  ['getPlotSnapshot', () => getPlotSnapshot(ID, ID), 'GET', `/api/projects/${ESC}/plot/history/${ESC}`],
  ['listRevisionSummaries', () => listRevisionSummaries(ID, ID), 'GET', `/api/projects/${ESC}/revisions/${ESC}`],
  ['getRevisionSnapshot', () => getRevisionSnapshot(ID, ID, ID), 'GET', `/api/projects/${ESC}/revisions/${ESC}/${ESC}`],
  ['getProjectSettingsLog', () => getProjectSettingsLog(ID), 'GET', `/api/projects/${ESC}/settings-log`],
  ['getUserSettingsLog', () => getUserSettingsLog(), 'GET', '/api/user-settings/activity'],
  ['listPublications', () => listPublications(ID, ID), 'GET', `/api/projects/${ESC}/publications/${ESC}`],
  ['publishChapter', () => publishChapter(ID, ID), 'POST', `/api/projects/${ESC}/publications/${ESC}`, {}],
  ['getPresets', () => getPresets(), 'GET', '/api/presets'],
  ['putPresets', () => putPresets({ presets: [] }), 'PUT', '/api/presets', { presets: [] }],
  ['getPublishedPresets', () => getPublishedPresets(), 'GET', '/api/presets/published'],
  ['publishPreset', () => publishPreset(ID), 'POST', `/api/presets/${ESC}/publish`],
  ['unpublishPreset', () => unpublishPreset(ID), 'POST', `/api/presets/${ESC}/unpublish`],
  ['discardPresetChanges', () => discardPresetChanges(ID), 'POST', `/api/presets/${ESC}/discard`],
  ['restorePresetVersion', () => restorePresetVersion(ID, 3), 'POST', `/api/presets/${ESC}/restore/3`],
  ['putMomentDraft', () => putMomentDraft(ID, ID, ID, 'Text'), 'PUT', `/api/projects/${ESC}/draft/chapter/${ESC}/moment/${ESC}`, { outlineNodeId: ID, body: 'Text' }],
]

describe('api: the routes', () => {
  it.each(CASES)('%s', async (_name, call, method, url, body) => {
    const fetchMock = answerWith({ perChapter: [], perBook: [] })
    await call()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [sentUrl, init] = fetchMock.mock.calls[0]
    expect(sentUrl).toBe(url)
    expect(init?.method ?? 'GET').toBe(method)
    expect(init?.body === undefined ? undefined : JSON.parse(String(init.body))).toEqual(body)
  })
})

describe('api: a chapter\'s draft', () => {
  it('is read from the chapter\'s draft route', async () => {
    const fetchMock = answerWith({ schemaVersion: 2, chapterId: 'c1', updatedAt: 't', moments: { m1: { body: 'Hi' } } })
    const draft = await getChapterDraft('p1', 'c1')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/p1/draft/chapter/c1')
    expect(draft.moments).toEqual({ m1: { body: 'Hi' } })
  })

  it('is empty, not an error, when the chapter has never been written in', async () => {
    answerWith({ detail: 'No draft' }, { ok: false, status: 404 })
    const draft = await getChapterDraft('p1', 'c1')
    expect(draft).toMatchObject({ schemaVersion: 2, chapterId: 'c1', moments: {} })
    expect(typeof draft.updatedAt).toBe('string')
  })

  it('passes on any other failure', async () => {
    answerWith({ detail: 'Damaged' }, { ok: false, status: 409 })
    const error = await getChapterDraft('p1', 'c1').catch(e => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(409)
  })
})

describe('api: word counts', () => {
  it('are keyed by chapter, by book and by every node, from the analytics', async () => {
    const fetchMock = answerWith({
      perChapter: [{ nodeId: 'c1', wordCount: 120 }, { nodeId: 'c2', wordCount: 80 }],
      perBook: [{ nodeId: 'b1', wordCount: 200 }],
      nodeWordCounts: { m1: 70, m2: 50 },
    })
    const counts = await getWordCounts('p1')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/p1/analytics')
    expect(counts).toEqual({ chapters: { c1: 120, c2: 80 }, books: { b1: 200 }, nodes: { m1: 70, m2: 50 } })
  })

  it('have no node counts when the backend gives none', async () => {
    answerWith({ perChapter: [], perBook: [] })
    expect((await getWordCounts('p1')).nodes).toEqual({})
  })
})
