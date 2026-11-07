import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultPortrait, normalizePortrait, PORTRAIT_RANGES, PORTRAIT_VERSION } from './defaults'

const schema = readFileSync(path.resolve(__dirname, '../../../../../../../backend/app/storage/schema.py'), 'utf-8').replace(/\r\n/g, '\n')

// The fields of `class CharacterPortrait` in the server's schema, with their defaults as written there.
function serverPortrait(): Record<string, unknown> {
  const body = /class CharacterPortrait\(BaseModel\):\n([\s\S]*?)\n\n    @field_validator/.exec(schema)?.[1] ?? ''
  const out: Record<string, unknown> = {}
  for (const m of body.matchAll(/^    (\w+): [\w\[\], ]+ = (.+)$/gm)) {
    const raw = m[2].trim()
    out[m[1]] = raw === 'None' ? null : raw === 'PORTRAIT_VERSION' ? PORTRAIT_VERSION : /^"/.test(raw) ? raw.slice(1, -1) : Number(raw)
  }
  return out
}

describe('the portrait the server and the app both know', () => {
  // The server drops a field it does not declare, so a field only the app has would be lost on every save: the two lists must be the same one.
  it('has the same fields and the same defaults as the server', () => {
    const server = serverPortrait()
    expect(Object.keys(server).length).toBeGreaterThan(30)
    expect(Object.keys(defaultPortrait()).sort()).toEqual(Object.keys(server).sort())
    expect(defaultPortrait()).toEqual(server)
  })

  it('has the same slider ranges as the server', () => {
    const table = /PORTRAIT_RANGES[^=]*=\s*\{([^}]*)\}/.exec(schema)?.[1] ?? ''
    const server = Object.fromEntries([...table.matchAll(/"(\w+)":\s*\((-?[\d.]+),\s*(-?[\d.]+)\)/g)].map(m => [m[1], [Number(m[2]), Number(m[3])]]))
    expect(server).toEqual(PORTRAIT_RANGES)
    expect(/PORTRAIT_VERSION\s*=\s*(\d+)/.exec(schema)?.[1]).toBe(String(PORTRAIT_VERSION))
  })
})

describe('normalizePortrait', () => {
  it('is the default portrait for anything that is not a portrait', () => {
    for (const bad of [null, undefined, 3, 'x', [], true]) expect(normalizePortrait(bad)).toEqual(defaultPortrait())
  })

  it('keeps a whole portrait as it is', () => {
    const p = { ...defaultPortrait(), age: 'older', hairLength: 'knee', hairTexture: '4C', hairColor: '#112233', highlightColor: '#445566', browColor: null, eyeSize: 1.2, eyeTilt: -4 }
    expect(normalizePortrait(p)).toEqual(p)
  })

  it('puts a bad value right, the way the server does: a bad id, colour or number becomes the default', () => {
    const out = normalizePortrait({ age: 3, build: '   ', eyes: 'x'.repeat(60), skin: 'red', hairColor: '#12345', topColor: '#ABCDEF', eyeSize: 'big', noseSize: Number.NaN, version: 0 })
    expect(out.age).toBe('adult')
    expect(out.build).toBe('average')
    expect(out.eyes).toBe('x'.repeat(40))
    expect(out.skin).toBe(defaultPortrait().skin)
    expect(out.hairColor).toBe(defaultPortrait().hairColor)
    expect(out.topColor).toBe('#ABCDEF')
    expect(out.eyeSize).toBe(1)
    expect(out.noseSize).toBe(1)
    expect(out.version).toBe(PORTRAIT_VERSION)
  })

  it('holds a slider to its range', () => {
    const out = normalizePortrait({ headWidth: 9, eyeSize: -2, eyeTilt: 99, mouthSize: 1.1 })
    expect(out.headWidth).toBe(PORTRAIT_RANGES.headWidth[1])
    expect(out.eyeSize).toBe(PORTRAIT_RANGES.eyeSize[0])
    expect(out.eyeTilt).toBe(10)
    expect(out.mouthSize).toBe(1.1)
  })

  it('keeps an id this build does not know, and turns a missing optional colour into none', () => {
    const out = normalizePortrait({ hairStyle: 'from-a-newer-build', browColor: 'nope', lipColor: '#aabbcc' })
    expect(out.hairStyle).toBe('from-a-newer-build')
    expect(out.browColor).toBeNull()
    expect(out.lipColor).toBe('#aabbcc')
  })

  it('drops a field it does not know', () => {
    expect(normalizePortrait({ ...defaultPortrait(), horns: 'big' })).not.toHaveProperty('horns')
  })
})
