// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PresetContent } from '../../../../api/types'
import { PresetFileError, downloadTextFile, exportFileName, parsePresetFile, serializePresets } from './presetFile'

const preset = (over: Partial<PresetContent> = {}): PresetContent => ({
  name: 'Characters', description: 'The cast', keywords: ['cast'], fields: ['Name', 'Role'],
  subcategories: [{ id: 'old-s', name: 'Heroes', description: '', keywords: ['lead'], fields: ['Want'], clusters: [{ id: 'old-c', name: 'Core', description: 'd', keywords: [], fields: ['Dynamic'] }] }],
  ...over,
})
const counter = () => { let n = 0; return (prefix: string) => `${prefix}-${(n += 1)}` }
const file = (presets: unknown[], version: number | string = 1) => JSON.stringify({ scriblrPlotPresets: version, presets })

describe('serializePresets', () => {
  it('writes a marked, versioned file without ids', () => {
    const out = JSON.parse(serializePresets([preset()], new Date('2026-10-25T12:00:00Z')))
    expect(out.scriblrPlotPresets).toBe(1)
    expect(out.exportedAt).toBe('2026-10-25T12:00:00.000Z')
    expect(out.presets).toHaveLength(1)
    expect(JSON.stringify(out)).not.toContain('old-s')
    expect(JSON.stringify(out)).not.toContain('"id"')
    expect(out.presets[0].subcategories[0].clusters[0].fields).toEqual(['Dynamic'])
  })

  it('round trips through parse with new ids', () => {
    const { presets, skipped } = parsePresetFile(serializePresets([preset(), preset({ name: 'Settings', subcategories: [] })]), counter())
    expect(skipped).toEqual([])
    expect(presets).toHaveLength(2)
    expect(presets[0]).toEqual(preset({ subcategories: [{ ...preset().subcategories[0], id: 'sub-1', clusters: [{ ...preset().subcategories[0].clusters[0], id: 'cluster-2' }] }] }))
    expect(presets[1].name).toBe('Settings')
  })
})

describe('exportFileName', () => {
  it('names one preset by its name and several by the catalog', () => {
    expect(exportFileName([preset({ name: 'World-building!' })])).toBe('scriblr-plot-preset-world-building.json')
    expect(exportFileName([preset({ name: '???' })])).toBe('scriblr-plot-preset-preset.json')
    expect(exportFileName([preset(), preset()])).toBe('scriblr-plot-presets.json')
    expect(exportFileName([])).toBe('scriblr-plot-presets.json')
  })
})

describe('parsePresetFile: the file as a whole', () => {
  const refuses = (source: string, message: RegExp) => {
    try { parsePresetFile(source); throw new Error('did not throw') } catch (e) { expect(e).toBeInstanceOf(PresetFileError); expect((e as Error).message).toMatch(message) }
  }
  it('refuses what is not a Scriblr preset file', () => {
    refuses('{nope', /not valid JSON/)
    refuses('[]', /not a Scriblr plot preset file/)
    refuses('{"presets": []}', /not a Scriblr plot preset file/)
    refuses(file([], 'one'), /not a Scriblr plot preset file/)
    refuses(JSON.stringify({ scriblrPlotPresets: 1 }), /no presets/)
  })
  it('refuses a file from a newer version', () => {
    refuses(file([], 2), /newer version of Scriblr/)
  })
})

describe('parsePresetFile: each preset', () => {
  it('cuts text to the limits and drops blank fields and repeated keywords', () => {
    const { presets } = parsePresetFile(file([{
      name: ` ${'N'.repeat(60)} `, description: 'D'.repeat(300), keywords: ['a', 'a', ' '], fields: ['F'.repeat(40), '', 'ok'], subcategories: [],
    }]))
    expect(presets[0].name).toHaveLength(50)
    expect(presets[0].description).toHaveLength(255)
    expect(presets[0].keywords).toEqual(['a'])
    expect(presets[0].fields).toEqual(['F'.repeat(30), 'ok'])
  })

  it('treats missing or wrongly typed parts as empty', () => {
    const { presets } = parsePresetFile(file([{ name: 'Bare', description: 5, keywords: 'x', fields: [1, 'ok'], subcategories: [7, { name: 'Sub', clusters: 'no' }] }]))
    expect(presets[0]).toMatchObject({ name: 'Bare', description: '', keywords: [], fields: ['ok'] })
    expect(presets[0].subcategories).toHaveLength(1)
    expect(presets[0].subcategories[0]).toMatchObject({ name: 'Sub', clusters: [] })
  })

  it('keeps a card under the preset that has no name, since a draft may', () => {
    const { presets } = parsePresetFile(file([{ name: 'Cast', subcategories: [{ fields: ['Want'] }] }]))
    expect(presets[0].subcategories[0].name).toBe('')
  })

  it('skips a preset that has no name, is not a preset, or is too large, and says which', () => {
    const many = Array.from({ length: 101 }, (_, i) => `f${i}`)
    const { presets, skipped } = parsePresetFile(file([
      { name: 'Good' }, { name: '  ' }, 'text', { name: 'Big', fields: many }, { name: 'Deep', subcategories: [{ name: 's', clusters: [{ name: 'c', fields: many }] }] }, { name: 'Also good' },
    ]))
    expect(presets.map(p => p.name)).toEqual(['Good', 'Also good'])
    expect(skipped).toEqual([
      'The preset at position 2 has no name.',
      'The preset at position 3 is not a preset.',
      'The preset at position 4 has more than 100 fields.',
      'The preset at position 5 has more than 100 fields on a cluster.',
    ])
  })
})

describe('downloadTextFile', () => {
  afterEach(() => { vi.restoreAllMocks() })
  it('offers the text as a named download and tidies up', () => {
    const created: Blob[] = []
    Object.assign(URL, { createObjectURL: (b: Blob) => { created.push(b); return 'blob:x' }, revokeObjectURL: vi.fn() })
    const clicked: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this.download) })
    downloadTextFile('presets.json', '{"a":1}')
    expect(clicked).toEqual(['presets.json'])
    expect(created[0].type).toBe('application/json')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
