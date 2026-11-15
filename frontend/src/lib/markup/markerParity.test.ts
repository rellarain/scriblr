import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MARKER_CHARS, MARKERS } from './lines'

// The backend converts old text into the markup (storage/markup_convert.py) with its own list of markers: it must be this one.
const python = readFileSync(path.resolve(__dirname, '../../../../backend/app/storage/markup_convert.py'), 'utf-8')

describe('the markers', () => {
  it('are the same list as the backend converter’s', () => {
    const line = /^MARKERS = \[(.*)\]$/m.exec(python)![1]
    const listed = [...line.matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] ?? m[2])
    expect(listed).toEqual([...MARKERS])
  })

  it('escape the same characters', () => {
    const line = /^ESCAPABLE = set\('(.*)'\)$/m.exec(python)![1].replace(/\\\\/g, '\\')
    expect([...line].sort()).toEqual([...MARKER_CHARS].sort())
  })
})
