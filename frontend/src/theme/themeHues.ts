import { normalizePalette } from './paletteRules'
import { MAX_HUE_SWATCHES, PALETTE_KEYS, ZONE_KEYS, ZONE_LABEL, type HueSwatch, type PaletteKey, type RoleLinks, type ThemeSettings, type ZoneConfig, type ZoneKey, type ZonePalette } from './types'

// The account's hue list and the links from each zone's roles to it (the account theme panel). The list is up to ten swatches (a hue each);
// a role (theme, accent, alert, admin accent) of a zone can be linked to one: editing the swatch then changes every role that uses it.
// A role's hue in its zone's palette is always kept equal to its linked swatch's, so everything that reads a palette (the app's colours, the
// sky, the previews) needs to know nothing about links. A role with no link just keeps its hue.

export const ROLE_LABEL: Record<PaletteKey, string> = { theme: 'Theme', accent: 'Accent', alert: 'Alert', accent2: 'Admin accent' }

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/
const clampHue = (h: number) => Math.min(360, Math.max(0, Math.round(Number.isFinite(h) ? h : 0)))

// A swatch id not used yet: h1, h2, ... (short, readable and stable).
export function nextHueId(hues: readonly HueSwatch[]): string {
  const taken = new Set(hues.map(s => s.id))
  for (let n = 1; ; n += 1) if (!taken.has(`h${n}`)) return `h${n}`
}

// The list as stored, repaired: only well-formed swatches with distinct ids, hues whole numbers in 0..360, the first ten.
export function normalizeHues(input: unknown): HueSwatch[] {
  if (!Array.isArray(input)) return []
  const out: HueSwatch[] = []
  for (const item of input) {
    if (out.length >= MAX_HUE_SWATCHES) break
    const { id, h } = (item ?? {}) as Partial<HueSwatch>
    if (typeof id !== 'string' || !ID_PATTERN.test(id) || typeof h !== 'number' || out.some(s => s.id === id)) continue
    out.push({ id, h: clampHue(h) })
  }
  return out
}

// The hues in use by the zones that are turned on, each once, a zone at a time (theme, accent, alert, admin accent): where an account that
// has no list yet starts. At most ten.
export function seedHues(zones: Record<ZoneKey, ZoneConfig>): HueSwatch[] {
  const out: HueSwatch[] = []
  for (const zone of ZONE_KEYS) {
    if (!zones[zone].configured) continue
    for (const role of PALETTE_KEYS) {
      const h = zones[zone].palette[role].h
      if (out.length < MAX_HUE_SWATCHES && !out.some(s => s.h === h)) out.push({ id: nextHueId(out), h })
    }
  }
  return out
}

// Each role linked to the first swatch of its own hue (a role whose hue is not in the list stays unlinked).
export function autoLinks(palette: ZonePalette, hues: readonly HueSwatch[]): RoleLinks {
  const links: RoleLinks = {}
  for (const role of PALETTE_KEYS) {
    const swatch = hues.find(s => s.h === palette[role].h)
    if (swatch) links[role] = swatch.id
  }
  return links
}

// Links as stored, repaired: only the four roles, only to swatches that exist.
export function normalizeLinks(input: unknown, hues: readonly HueSwatch[]): RoleLinks {
  const links: RoleLinks = {}
  const given = (input ?? {}) as Record<string, unknown>
  for (const role of PALETTE_KEYS) {
    const id = given[role]
    if (typeof id === 'string' && hues.some(s => s.id === id)) links[role] = id
  }
  return links
}

// A palette with every linked role's hue set to its swatch's.
export function syncPalette(palette: ZonePalette, links: RoleLinks, hues: readonly HueSwatch[]): ZonePalette {
  const next = { ...palette }
  for (const role of PALETTE_KEYS) {
    const swatch = hues.find(s => s.id === links[role])
    if (swatch) next[role] = { h: swatch.h }
  }
  return normalizePalette(next)
}

// Where a swatch is used: one entry per role, over the zones that are turned on.
export function hueUses(theme: ThemeSettings, id: string): Array<{ zone: ZoneKey; role: PaletteKey }> {
  const uses: Array<{ zone: ZoneKey; role: PaletteKey }> = []
  for (const zone of ZONE_KEYS) {
    if (!theme.zones[zone].configured) continue
    for (const role of PALETTE_KEYS) if (theme.zones[zone].links[role] === id) uses.push({ zone, role })
  }
  return uses
}

// Where a swatch is used, in words: "not used", or "used by Day theme, Night alert".
export function describeUses(theme: ThemeSettings, id: string): string {
  const uses = hueUses(theme, id)
  if (uses.length === 0) return 'not used'
  return `used by ${uses.map(u => `${ZONE_LABEL[u.zone]} ${ROLE_LABEL[u.role].toLowerCase()}`).join(', ')}`
}

const withZone = (theme: ThemeSettings, zone: ZoneKey, change: Partial<ZoneConfig>): ThemeSettings => ({
  ...theme, zones: { ...theme.zones, [zone]: { ...theme.zones[zone], ...change } },
})

// A new swatch at the end (nothing when the list is full).
export function addHue(theme: ThemeSettings, h: number): ThemeSettings {
  if (theme.hues.length >= MAX_HUE_SWATCHES) return theme
  return { ...theme, hues: [...theme.hues, { id: nextHueId(theme.hues), h: clampHue(h) }] }
}

// A swatch's hue changed: every role linked to it follows.
export function setHue(theme: ThemeSettings, id: string, h: number): ThemeSettings {
  const hue = clampHue(h)
  if (!theme.hues.some(s => s.id === id && s.h !== hue)) return theme
  const hues = theme.hues.map(s => (s.id === id ? { ...s, h: hue } : s))
  const zones = { ...theme.zones }
  for (const zone of ZONE_KEYS) zones[zone] = { ...zones[zone], palette: syncPalette(zones[zone].palette, zones[zone].links, hues) }
  return { ...theme, hues, zones }
}

// A swatch removed. Null when it cannot be: it is the last one, or a role uses it.
export function removeHue(theme: ThemeSettings, id: string): ThemeSettings | null {
  if (!theme.hues.some(s => s.id === id) || theme.hues.length <= 1 || hueUses(theme, id).length > 0) return null
  return { ...theme, hues: theme.hues.filter(s => s.id !== id) }
}

// A swatch moved to stand before another (null = last).
export function moveHue(theme: ThemeSettings, id: string, beforeId: string | null): ThemeSettings {
  const moving = theme.hues.find(s => s.id === id)
  if (!moving || id === beforeId) return theme
  const rest = theme.hues.filter(s => s.id !== id)
  const at = beforeId === null ? rest.length : rest.findIndex(s => s.id === beforeId)
  if (at < 0) return theme
  const hues = [...rest.slice(0, at), moving, ...rest.slice(at)]
  return hues.every((s, i) => s.id === theme.hues[i].id) ? theme : { ...theme, hues }
}

// A role of a turned-on zone takes a swatch (replacing whatever it had).
export function assignHue(theme: ThemeSettings, zone: ZoneKey, role: PaletteKey, id: string): ThemeSettings {
  const swatch = theme.hues.find(s => s.id === id)
  const config = theme.zones[zone]
  if (!swatch || !config.configured || (config.links[role] === id && config.palette[role].h === swatch.h)) return theme
  return withZone(theme, zone, { links: { ...config.links, [role]: id }, palette: normalizePalette({ ...config.palette, [role]: { h: swatch.h } }) })
}

// Two roles of one zone trade hues (and links).
export function swapRoles(theme: ThemeSettings, zone: ZoneKey, a: PaletteKey, b: PaletteKey): ThemeSettings {
  const config = theme.zones[zone]
  if (a === b || !config.configured) return theme
  const links: RoleLinks = { ...config.links, [a]: config.links[b], [b]: config.links[a] }
  for (const role of [a, b]) if (links[role] === undefined) delete links[role]
  return withZone(theme, zone, { links, palette: normalizePalette({ ...config.palette, [a]: config.palette[b], [b]: config.palette[a] }) })
}

// A role takes another role's hue and link (the source keeps its own): used between zones.
export function copyRole(theme: ThemeSettings, from: { zone: ZoneKey; role: PaletteKey }, to: { zone: ZoneKey; role: PaletteKey }): ThemeSettings {
  const source = theme.zones[from.zone]
  const target = theme.zones[to.zone]
  if (!source.configured || !target.configured || (from.zone === to.zone && from.role === to.role)) return theme
  const links: RoleLinks = { ...target.links }
  const id = source.links[from.role]
  if (id) links[to.role] = id
  else delete links[to.role]
  return withZone(theme, to.zone, { links, palette: normalizePalette({ ...target.palette, [to.role]: { h: source.palette[from.role].h } }) })
}
