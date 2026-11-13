import { describe, expect, it, vi } from 'vitest'
import { getBookProgress } from './bookProgressApi'
import { ApiError } from './client'
import { getChapterDraft, getWordCounts, putMomentDraft } from './draftFetch'
import {
  getOutlineSnapshot, getPlotSnapshot, getProjectSettingsLog, getRevisionSnapshot, getUserSettingsLog, listOutlineHistory, listPlotHistory,
  listRevisionSummaries,
} from './historyFetch'
import { emptyStory } from '../assets/Interfaces/writer/characters/story'
import { defaultPortrait } from '../assets/Interfaces/writer/characters/portrait/defaults'
import { getExtrasPreview, getReaderExtras } from './bookPublishing'
import { getBookExtras } from './reader'
import { convertCharacter, createCharacter, deleteCharacter, getCharacter, getFrozenPortraits, listAllCharacters, listCharacters, putCharacter, revertCharacter } from './charactersApi'
import { addFigureModel, listFigureModels } from './figureModelsApi'
import { discardBiomeChanges, getBiomeCatalog, getProjectBiomes, getPublishedBiomes, publishBiomes, putBiomeDraft, putProjectBiomes, restoreBiomeVersion } from './mapBiomesApi'
import { createItem, deleteItem, getItem, listAllItems, listItems, putItem } from './itemsApi'
import { createMap, deleteMap, getMap, listMaps, listPlaces, putMap, createMapVersion } from './mapsApi'
import { getOutline, putOutline } from './outlineApi'
import { getPlot, putPlot } from './plotApi'
import { createProject, deleteProject, getProject, getProjectsOverview, updateProject } from './projectsApi'
import { discardPresetChanges, getPresets, getPublishedPresets, publishPreset, putPresets, restorePresetVersion, unpublishPreset } from './presetsApi'
import { addBasicModel, basicUpdateAvailable, discardModelChanges, getModels, getPublishedModels, getWriterLimits, myModelsApi, publishModel, putModels, putWriterLimits, restoreModelVersion, unpublishModel, updateBasicModel } from './characterModelsApi'
import { listPublications, publishChapter } from './publicationFetch'
import { clearCompleted, enrol, getTraining, leave, recordAttempt, saveTrainingContent, setCompleted } from './trainingApi'

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
const MAP = { schemaVersion: 2, id: ID, title: 'W', level: 'planetary' as const, mapFormat: 2, base: { biome: 'saltwater', height: -3000 }, units: 'metric' as const, parentId: null, order: 0, width: 2, height: 2, cellSize: 1, unit: 'cells', pace: null, layers: [], symbols: [], labels: [], shapes: [], scaleBar: true, compass: true, legend: false, updatedAt: '2026-01-01T00:00:00Z' }
const ITEM = { schemaVersion: 2, id: ID, name: 'Key', order: 0, kind: 'tool', description: '', notes: '', color: '', holdings: [], updatedAt: '2026-01-01T00:00:00Z' }
const FIGURE = { model: 'aabbccddeeff', values: {}, forms: {}, hidden: [], colours: {}, palette: null, tile: '#e6d6c3', fall: 'down' as const, locks: [], zoff: {}, mine: [], genre: null }
const CHARACTER = { schemaVersion: 2, id: ID, name: 'Ada', order: 0, portrait: defaultPortrait(), ...emptyStory(), updatedAt: '2026-01-01T00:00:00Z' }
const CASES: Array<[string, () => Promise<unknown>, string, string, unknown?]> = [
  ['getTraining', () => getTraining(), 'GET', '/api/training'],
  ['saveTrainingContent', () => saveTrainingContent({ curricula: [], courses: [] }), 'PUT', '/api/training/content', { curricula: [], courses: [] }],
  ['enrol', () => enrol(ID), 'PUT', `/api/training/enrolments/${ESC}`],
  ['leave', () => leave(ID), 'DELETE', `/api/training/enrolments/${ESC}`],
  ['setCompleted', () => setCompleted(ID), 'PUT', `/api/training/completions/${ESC}`],
  ['clearCompleted', () => clearCompleted(ID), 'DELETE', `/api/training/completions/${ESC}`],
  ['recordAttempt', () => recordAttempt(ID, 80), 'POST', `/api/training/attempts/${ESC}`, { score: 80 }],
  ['getProjectsOverview', () => getProjectsOverview(), 'GET', '/api/projects/overview'],
  ['createProject', () => createProject('Title'), 'POST', '/api/projects', { title: 'Title' }],
  ['getProject', () => getProject(ID), 'GET', `/api/projects/${ESC}`],
  ['updateProject', () => updateProject(ID, { themeHue: 5 }), 'PATCH', `/api/projects/${ESC}`, { themeHue: 5 }],
  ['deleteProject', () => deleteProject(ID), 'DELETE', `/api/projects/${ESC}`],
  ['getOutline', () => getOutline(ID), 'GET', `/api/projects/${ESC}/outline`],
  ['putOutline', () => putOutline(ID, TREE), 'PUT', `/api/projects/${ESC}/outline`, TREE],
  ['getPlot', () => getPlot(ID), 'GET', `/api/projects/${ESC}/plot`],
  ['putPlot', () => putPlot(ID, TREE), 'PUT', `/api/projects/${ESC}/plot`, TREE],
  ['listMaps', () => listMaps(ID), 'GET', `/api/projects/${ESC}/maps`],
  ['createMap', () => createMap(ID, { title: 'W' }), 'POST', `/api/projects/${ESC}/maps`, { title: 'W' }],
  ['getMap', () => getMap(ID, ID), 'GET', `/api/projects/${ESC}/maps/${ESC}`],
  ['putMap', () => putMap(ID, MAP), 'PUT', `/api/projects/${ESC}/maps/${ESC}`, MAP],
  ['listPlaces', () => listPlaces(ID), 'GET', `/api/projects/${ESC}/maps/places/all`],
  ['getProjectBiomes', () => getProjectBiomes(ID), 'GET', `/api/projects/${ESC}/map-biomes`],
  ['putProjectBiomes', () => putProjectBiomes(ID, []), 'PUT', `/api/projects/${ESC}/map-biomes`, { biomes: [] }],
  ['getBiomeCatalog', () => getBiomeCatalog(), 'GET', '/api/map-biomes'],
  ['putBiomeDraft', () => putBiomeDraft([]), 'PUT', '/api/map-biomes', { biomes: [] }],
  ['getPublishedBiomes', () => getPublishedBiomes(), 'GET', '/api/map-biomes/published'],
  ['publishBiomes', () => publishBiomes(), 'POST', '/api/map-biomes/publish'],
  ['discardBiomeChanges', () => discardBiomeChanges(), 'POST', '/api/map-biomes/discard'],
  ['restoreBiomeVersion', () => restoreBiomeVersion(3), 'POST', '/api/map-biomes/restore/3'],
  ['deleteMap', () => deleteMap(ID, ID), 'DELETE', `/api/projects/${ESC}/maps/${ESC}`],
  ['listCharacters', () => listCharacters(ID), 'GET', `/api/projects/${ESC}/characters`],
  ['listAllCharacters', () => listAllCharacters(ID), 'GET', `/api/projects/${ESC}/characters/all`],
  ['listFigureModels', () => listFigureModels(ID), 'GET', `/api/projects/${ESC}/figure-models`],
  ['addFigureModel', () => addFigureModel(ID, { modelId: 'adult' }), 'POST', `/api/projects/${ESC}/figure-models`, { modelId: 'adult' }],
  ['createCharacter', () => createCharacter(ID, { name: 'Ada' }), 'POST', `/api/projects/${ESC}/characters`, { name: 'Ada' }],
  ['getCharacter', () => getCharacter(ID, ID), 'GET', `/api/projects/${ESC}/characters/${ESC}`],
  ['putCharacter', () => putCharacter(ID, CHARACTER), 'PUT', `/api/projects/${ESC}/characters/${ESC}`, CHARACTER],
  ['deleteCharacter', () => deleteCharacter(ID, ID), 'DELETE', `/api/projects/${ESC}/characters/${ESC}`],
  ['getFrozenPortraits', () => getFrozenPortraits(ID, ID), 'GET', `/api/projects/${ESC}/characters/${ESC}/frozen`],
  ['convertCharacter', () => convertCharacter(ID, ID, { figure: FIGURE, states: {}, editions: [] }), 'POST', `/api/projects/${ESC}/characters/${ESC}/convert`, { figure: FIGURE, states: {}, editions: [] }],
  ['revertCharacter', () => revertCharacter(ID, ID), 'POST', `/api/projects/${ESC}/characters/${ESC}/revert`, {}],
  ['listItems', () => listItems(ID), 'GET', `/api/projects/${ESC}/items`],
  ['listAllItems', () => listAllItems(ID), 'GET', `/api/projects/${ESC}/items/all`],
  ['createItem', () => createItem(ID, { name: 'Key' }), 'POST', `/api/projects/${ESC}/items`, { name: 'Key' }],
  ['getItem', () => getItem(ID, ID), 'GET', `/api/projects/${ESC}/items/${ESC}`],
  ['putItem', () => putItem(ID, ITEM), 'PUT', `/api/projects/${ESC}/items/${ESC}`, ITEM],
  ['deleteItem', () => deleteItem(ID, ID), 'DELETE', `/api/projects/${ESC}/items/${ESC}`],
  ['createMapVersion', () => createMapVersion(ID, ID, { title: 'Later', appliesFrom: 'c2' }), 'POST', `/api/projects/${ESC}/maps/${ESC}/versions`, { title: 'Later', appliesFrom: 'c2' }],
  ['getReaderExtras', () => getReaderExtras(ID), 'GET', `/api/projects/${ESC}/reader-extras`],
  ['getExtrasPreview', () => getExtrasPreview(ID, ID, 3), 'GET', `/api/projects/${ESC}/books/${ESC}/extras-preview?chapter=3`],
  ['getBookExtras', () => getBookExtras(ID), 'GET', `/api/reader/books/${ESC}/extras`],
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
  ['getModels', () => getModels(), 'GET', '/api/character-models'],
  ['putModels', () => putModels({ models: [] }), 'PUT', '/api/character-models', { models: [] }],
  ['getPublishedModels', () => getPublishedModels(), 'GET', '/api/character-models/published'],
  ['addBasicModel', () => addBasicModel(), 'POST', '/api/character-models/basic'],
  ['basicUpdateAvailable', () => basicUpdateAvailable(), 'GET', '/api/character-models/basic/update'],
  ['updateBasicModel', () => updateBasicModel(), 'POST', '/api/character-models/basic/update'],
  ['publishModel', () => publishModel(ID), 'POST', `/api/character-models/${ESC}/publish`],
  ['unpublishModel', () => unpublishModel(ID), 'POST', `/api/character-models/${ESC}/unpublish`],
  ['discardModelChanges', () => discardModelChanges(ID), 'POST', `/api/character-models/${ESC}/discard`],
  ['restoreModelVersion', () => restoreModelVersion(ID, 3), 'POST', `/api/character-models/${ESC}/restore/3`],
  ['myModelsApi.get', () => myModelsApi.get(), 'GET', '/api/my-models'],
  ['myModelsApi.put', () => myModelsApi.put({ models: [] }), 'PUT', '/api/my-models', { models: [] }],
  ['myModelsApi.published', () => myModelsApi.published(), 'GET', '/api/my-models/published'],
  ['myModelsApi.publish', () => myModelsApi.publish(ID), 'POST', `/api/my-models/${ESC}/publish`],
  ['myModelsApi.unpublish', () => myModelsApi.unpublish(ID), 'POST', `/api/my-models/${ESC}/unpublish`],
  ['myModelsApi.discard', () => myModelsApi.discard(ID), 'POST', `/api/my-models/${ESC}/discard`],
  ['myModelsApi.restore', () => myModelsApi.restore(ID, 3), 'POST', `/api/my-models/${ESC}/restore/3`],
  ['getWriterLimits', () => getWriterLimits(), 'GET', '/api/my-models/limits'],
  ['putWriterLimits', () => putWriterLimits({ points: 24, shapesPerObject: 36, objectsPerGroup: 24, shapes: 300, objects: 100, groups: 60, sliders: 60, copyKb: 600, models: 20 }), 'PUT', '/api/my-models/limits', { points: 24, shapesPerObject: 36, objectsPerGroup: 24, shapes: 300, objects: 100, groups: 60, sliders: 60, copyKb: 600, models: 20 }],
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
