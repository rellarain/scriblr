import type { PresetContent, PresetField, PresetFieldset, PresetSubcategory } from '../../../../api/types'
import { FIELDSETS_MAX, FIELDS_MAX, normalizeContent, randomId, type MakeId } from './presetModel'

// The file Export writes and Import reads: JSON with a marker and a version, and the presets without ids (they get new ones on import).
export const FILE_MARKER = 'scriblrPlotPresets'
export const FILE_VERSION = 1

// Caps that keep a preset a size the server accepts.
const MAX_FIELDS = FIELDS_MAX
const MAX_KEYWORDS = 50
const MAX_CHILDREN = 100

// A problem with the file as a whole: nothing is imported.
export class PresetFileError extends Error {}

export interface ImportResult {
  presets: PresetContent[]
  // Why a preset in the file was left out, one sentence each ("The preset at position 4 has no name.").
  skipped: string[]
}

interface FileCard { name: string; description: string; keywords: string[]; fields: PresetField[]; fieldsets: PresetFieldset[] }
interface FilePreset extends FileCard {
  subcategories: Array<FileCard & { clusters: FileCard[] }>
}

const strip = (c: PresetContent): FilePreset => {
  const n = normalizeContent(c)
  const base = (x: { name: string; description: string; keywords: string[]; fields: PresetField[]; fieldsets?: PresetFieldset[] }): FileCard => (
    { name: x.name, description: x.description, keywords: x.keywords, fields: x.fields, fieldsets: x.fieldsets ?? [] }
  )
  return {
    ...base(n),
    subcategories: n.subcategories.map(s => ({ ...base(s), clusters: s.clusters.map(base) })),
  }
}

export function serializePresets(presets: PresetContent[], now: Date = new Date()): string {
  return `${JSON.stringify({ [FILE_MARKER]: FILE_VERSION, exportedAt: now.toISOString(), presets: presets.map(strip) }, null, 2)}\n`
}

export function exportFileName(presets: PresetContent[]): string {
  if (presets.length !== 1) return 'scriblr-plot-presets.json'
  const slug = presets[0].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `scriblr-plot-preset-${slug || 'preset'}.json`
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

// The fields of a file card: a name (a plain field), or a record with a name, a kind (multi, dropdown or text) and the labels of its options
// (a file from before field kinds has only names). Anything else is left out; a kind it does not know is read as a plain field.
function fieldsOf(v: unknown): PresetField[] {
  const out: PresetField[] = []
  for (const item of list(v)) {
    if (typeof item === 'string') out.push(item)
    else if (isRecord(item) && typeof item.name === 'string') {
      const kind = item.kind
      if (kind === 'multi' || kind === 'dropdown') out.push({ name: item.name, kind, options: strings(item.options) })
      else if (kind === 'text') out.push({ name: item.name, kind, options: [] })
      else out.push(item.name)
    }
  }
  return out
}
// The fieldsets of a file card (a file from before fieldsets has none): a name and fields each, anything else left out.
const sets = (v: unknown): PresetFieldset[] => list(v).filter(isRecord).map(s => ({ name: text(s.name), fields: fieldsOf(s.fields) }))
// How many fields a card lists in all: the loose ones and those in its sets.
const fieldCount = (v: Record<string, unknown>) => fieldsOf(v.fields).length + sets(v.fieldsets).reduce((n, s) => n + s.fields.length, 0)

function readBase(v: Record<string, unknown>) {
  return { name: text(v.name), description: text(v.description), keywords: strings(v.keywords), fields: fieldsOf(v.fields), fieldsets: sets(v.fieldsets) }
}

// What is wrong with one preset in the file, or null. A name is required on the preset itself; the cards under it may be unnamed (a draft).
function problem(v: unknown): string | null {
  if (!isRecord(v)) return 'is not a preset'
  if (!text(v.name).trim()) return 'has no name'
  const tooMany = (n: number, max: number, what: string) => (n > max ? `has more than ${max} ${what}` : null)
  const subs = list(v.subcategories)
  return tooMany(fieldCount(v), MAX_FIELDS, 'fields') ?? tooMany(sets(v.fieldsets).length, FIELDSETS_MAX, 'fieldsets')
    ?? tooMany(strings(v.keywords).length, MAX_KEYWORDS, 'keywords')
    ?? tooMany(subs.length, MAX_CHILDREN, 'subcategories')
    ?? subs.map(s => {
      if (!isRecord(s)) return null
      const clusters = list(s.clusters)
      return tooMany(fieldCount(s), MAX_FIELDS, 'fields on a subcategory') ?? tooMany(sets(s.fieldsets).length, FIELDSETS_MAX, 'fieldsets on a subcategory')
        ?? tooMany(clusters.length, MAX_CHILDREN, 'clusters in a subcategory')
        ?? clusters.map(c => (isRecord(c)
          ? tooMany(fieldCount(c), MAX_FIELDS, 'fields on a cluster') ?? tooMany(sets(c.fieldsets).length, FIELDSETS_MAX, 'fieldsets on a cluster')
          : null)).find(Boolean)
        ?? null
    }).find(Boolean) ?? null
}

// Reads a file Export wrote. Text over the limits is cut to them; a preset that cannot be used is skipped and said so. Throws PresetFileError when
// the file as a whole cannot be read.
export function parsePresetFile(source: string, makeId: MakeId = randomId): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(source)
  } catch {
    throw new PresetFileError('This is not a Scriblr plot preset file. It is not valid JSON.')
  }
  if (!isRecord(data) || !(FILE_MARKER in data)) throw new PresetFileError('This is not a Scriblr plot preset file.')
  const version = data[FILE_MARKER]
  if (typeof version !== 'number' || version < 1) throw new PresetFileError('This is not a Scriblr plot preset file.')
  if (version > FILE_VERSION) throw new PresetFileError('This file was made by a newer version of Scriblr. Update Scriblr to import it.')
  if (!Array.isArray(data.presets)) throw new PresetFileError('The file has no presets in it.')

  const presets: PresetContent[] = []
  const skipped: string[] = []
  data.presets.forEach((raw, index) => {
    const why = problem(raw)
    if (why) { skipped.push(`The preset at position ${index + 1} ${why}.`); return }
    const p = raw as Record<string, unknown>
    presets.push(normalizeContent({
      ...readBase(p),
      subcategories: list(p.subcategories).filter(isRecord).map((s): PresetSubcategory => ({
        id: makeId('sub'), ...readBase(s),
        clusters: list(s.clusters).filter(isRecord).map(c => ({ id: makeId('cluster'), ...readBase(c) })),
      })),
    }))
  })
  return { presets, skipped }
}

// The text of a file the user chose (FileReader, which every browser and the test environment have; File.text() is newer).
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'))
    reader.readAsText(file)
  })
}

// Offers `body` to the user as a file (the same Blob route as the PDF export).
export function downloadTextFile(filename: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
