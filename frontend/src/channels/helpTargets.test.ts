import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HELP_TARGETS } from './helpTargets'

// The app's screens as the backend names them (storage/channels.py `_SCREENS`), read from the Python source: the block is
// a literal of tuples and lists of strings, so turning tuples into lists makes it JSON.
function screenIds(): Set<string> {
  // (a Windows checkout has CRLF line ends)
  const src = readFileSync(resolve(__dirname, '../../../backend/app/storage/channels.py'), 'utf8').replace(/\r\n/g, '\n')
  const start = src.indexOf('_SCREENS: list')
  const open = src.indexOf('= [', start) + 2
  const close = src.indexOf('\n]\n', open) + 2
  const literal = src.slice(open, close)
    .replace(/\(/g, '[').replace(/\)/g, ']')
    .replace(/,(\s*[\]}])/g, '$1')
  const tree = JSON.parse(literal) as [string, [string, string[]][]][]
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'node'
  const ids = new Set<string>()
  for (const [iname, consoles] of tree) {
    const iid = slug(iname)
    ids.add(iid)
    for (const [cname, components] of consoles) {
      const cid = `${iid}/${slug(cname)}`
      ids.add(cid)
      for (const kname of components) ids.add(`${cid}/${slug(kname)}`)
    }
  }
  return ids
}

describe('the Help targets', () => {
  it('each name a screen of the backend channel list', () => {
    const ids = screenIds()
    expect(ids.has('admin/office/admin-helper')).toBe(true)
    for (const [name, target] of Object.entries(HELP_TARGETS)) {
      expect(ids.has(target.id), `${name}: ${target.id}`).toBe(true)
    }
  })
})
