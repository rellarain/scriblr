import { useEffect, useSyncExternalStore } from 'react'
import { addWorldLink, listWorldLinks, removeWorldLink } from '../../../../api/worldLinksApi'
import type { WorldLink } from '../../../../api/types'

// Links between a plot node, a character, a place, an item and a chapter or scene. A link is one record for both ends (backend: storage/world_links.py), so it reads the same from either; a ref
// names the end: "plot:<node id>", "char:<character id>", "place:<map id>/<symbol id>", "item:<item id>" or "scene:<outline node id>". The links of the open project are held in an external store, loaded when
// something that shows them appears and again a moment after anything is saved (a character or a place may have gone), like the places (maps/placesStore.ts).

export type LinkKind = 'plot' | 'char' | 'place' | 'item' | 'scene'
export const LINK_KINDS: LinkKind[] = ['plot', 'char', 'place', 'item', 'scene']
export const KIND_NAME: Record<LinkKind, string> = { plot: 'Plot', char: 'Character', place: 'Place', item: 'Item', scene: 'Scene' }
export const KIND_HEADING: Record<LinkKind, string> = { plot: 'Plot nodes', char: 'Characters', place: 'Places', item: 'Items', scene: 'Chapters and scenes' }

export const refOf = (kind: LinkKind, id: string) => `${kind}:${id}`
export function kindOf(ref: string): LinkKind {
  const kind = ref.slice(0, ref.indexOf(':'))
  return kind === 'plot' || kind === 'char' || kind === 'item' || kind === 'scene' ? kind : 'place'
}
export const idOf = (ref: string) => ref.slice(ref.indexOf(':') + 1)

// The refs a ref is linked to.
export function linkedTo(links: WorldLink[], ref: string): string[] {
  return links.flatMap(l => (l.a === ref ? [l.b] : l.b === ref ? [l.a] : []))
}

const RELOAD_DELAY_MS = 600
let projectId: string | null = null
let links: WorldLink[] = []
let status: 'idle' | 'loading' | 'ready' = 'idle'
let version = 0
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null
let users = 0

const emit = () => { version += 1; for (const l of listeners) l() }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export async function loadWorldLinks(id: string, force = false): Promise<void> {
  if (!force && projectId === id && status !== 'idle') return
  if (projectId !== id) { projectId = id; links = []; status = 'loading'; emit() }
  try {
    const rows = await listWorldLinks(id)
    if (projectId !== id) return
    links = Array.isArray(rows) ? rows : []
  } catch {
    // The links stay as they were.
  }
  if (projectId === id) { status = 'ready'; emit() }
}

function scheduleReload() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; if (projectId && users > 0) void loadWorldLinks(projectId, true) }, RELOAD_DELAY_MS)
}

// Make or take away a link: the links the server answers with replace the held ones. False when the server refused (or could not be reached).
async function change(id: string, call: () => Promise<WorldLink[]>): Promise<boolean> {
  try {
    const rows = await call()
    if (projectId === id) { links = Array.isArray(rows) ? rows : links; status = 'ready'; emit() }
    return true
  } catch {
    return false
  }
}

export interface WorldLinksView {
  links: WorldLink[]
  ready: boolean
  link: (a: string, b: string) => Promise<boolean>
  unlink: (a: string, b: string) => Promise<boolean>
}

const NONE: WorldLinksView = { links: [], ready: false, link: async () => false, unlink: async () => false }
let cached: { version: number; id: string | null; view: WorldLinksView } = { version: -1, id: null, view: NONE }

export function useWorldLinks(id: string | null): WorldLinksView {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    if (!id) return
    users += 1
    void loadWorldLinks(id)
    const onChanged = () => scheduleReload()
    window.addEventListener('scriblr:changed', onChanged)
    return () => { users -= 1; window.removeEventListener('scriblr:changed', onChanged) }
  }, [id])
  if (!id || projectId !== id) return NONE
  if (cached.version !== version || cached.id !== id) {
    cached = { version, id, view: { links, ready: status === 'ready', link: (a, b) => change(id, () => addWorldLink(id, a, b)), unlink: (a, b) => change(id, () => removeWorldLink(id, a, b)) } }
  }
  return cached.view
}

export function __resetWorldLinksForTests() {
  projectId = null; links = []; status = 'idle'; version = 0; users = 0
  if (timer) { clearTimeout(timer); timer = null }
  cached = { version: -1, id: null, view: NONE }
  listeners.clear()
}
