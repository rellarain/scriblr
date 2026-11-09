import { useEffect, useMemo, useState } from 'react'
import { getBookExtras } from '../../../api/reader'
import type { BookExtras, MapDoc } from '../../../api/types'
import type { CatalogBook } from '../../../api/reader'
import { CharacterCard, MapView } from '../writer/readers/WorldViews'
import { Card } from './ReaderBits'
import type { ReaderCtx } from './readerContext'

// The Book page's Maps and Cast consoles: the maps and characters the author published with the book, as far as the reader has read (the author chooses the chapter
// each is revealed at). What is still to come is only counted, never named.

type Loaded = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; extras: BookExtras }

// Fetched when the console opens, and again when the reader's place in the book moves on.
function useExtras(ctx: ReaderCtx, book: CatalogBook): Loaded {
  const moved = ctx.data.reader?.progress[book.id]?.updatedAt ?? ''
  const [loaded, setLoaded] = useState<{ key: string; value: Loaded } | null>(null)
  const key = `${book.id}:${moved}`
  useEffect(() => {
    let live = true
    getBookExtras(book.id)
      .then(extras => { if (live) setLoaded({ key, value: { state: 'ready', extras } }) })
      .catch(() => { if (live) setLoaded({ key, value: { state: 'failed' } }) })
    return () => { live = false }
  }, [book.id, key])
  return loaded ? loaded.value : { state: 'loading' }
}

const more = (n: number, what: string) => (n > 0 ? <p className="rdMuted">{n === 1 ? `One more ${what} to discover as you read.` : `${n} more ${what}s to discover as you read.`}</p> : null)

// The versions of a map that are shown, in the order the author made them, and the one a reader sees first: the latest revealed.
const versionsShown = (maps: MapDoc[], baseId: string) => maps.filter(m => m.versionOf === baseId).sort((a, b) => a.order - b.order)
const latestOf = (family: MapDoc[]) => family.reduce((best, m) => ((m.reader?.revealAt ?? 0) >= (best.reader?.revealAt ?? 0) ? m : best), family[0])

// A map and the maps inside it, outermost first, each indented by how deep it is.
function mapOrder(maps: MapDoc[]): Array<{ map: MapDoc; depth: number }> {
  const ids = new Set(maps.map(m => m.id))
  // A version of a map that is shown is not a map of its own here: it is one of the versions of that map.
  maps = maps.filter(m => !(m.versionOf && ids.has(m.versionOf)))
  const out: Array<{ map: MapDoc; depth: number }> = []
  const walk = (parent: string | null, depth: number) => {
    maps.filter(m => (parent === null ? m.parentId === null || !ids.has(m.parentId) : m.parentId === parent)).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
      .forEach(m => { out.push({ map: m, depth }); walk(m.id, depth + 1) })
  }
  walk(null, 0)
  return out
}

export function MapsConsole({ ctx, book }: { ctx: ReaderCtx; book: CatalogBook }) {
  const loaded = useExtras(ctx, book)
  const [picked, setPicked] = useState<string | null>(null)
  // The version of the open map the reader has chosen (none = the latest).
  const [pickedVersion, setPickedVersion] = useState<string | null>(null)
  const maps = loaded.state === 'ready' ? loaded.extras.maps : []
  const ordered = useMemo(() => mapOrder(maps), [maps])
  if (loaded.state === 'loading') return <p className="rdMuted" role="status">Loading the maps…</p>
  if (loaded.state === 'failed') return <p className="rdMuted" role="alert">The maps could not be loaded.</p>
  const base = maps.find(m => m.id === picked) ?? ordered[0]?.map ?? null
  const family = base ? [base, ...versionsShown(maps, base.id)] : []
  const open = family.find(m => m.id === pickedVersion) ?? (family.length > 0 ? latestOf(family) : null)
  return (
    <>
      {!open && <p className="rdMuted">{loaded.extras.lockedMaps > 0 ? 'Nothing is drawn yet. Keep reading.' : 'The author has not published a map for this book.'}</p>}
      {open && (
        <>
          {ordered.length > 1 && (
            <div className="rdRow" role="group" aria-label="Maps">
              {ordered.map(({ map, depth }) => (
                <button key={map.id} type="button" className={map.id === base?.id ? 'rdChip rdChip--on rdChip--button' : 'rdChip rdChip--button'} aria-pressed={map.id === base?.id} style={{ marginLeft: depth * 8 }} onClick={() => { setPicked(map.id); setPickedVersion(null) }}>{map.title}</button>
              ))}
            </div>
          )}
          {family.length > 1 && (
            <div className="rdRow" role="group" aria-label="Versions of this map">
              {family.map(v => (
                <button key={v.id} type="button" className={v.id === open.id ? 'rdChip rdChip--on rdChip--button' : 'rdChip rdChip--button'} aria-pressed={v.id === open.id} onClick={() => setPickedVersion(v.id)}>{v.title}</button>
              ))}
            </div>
          )}
          <Card title={open.title}>
            <MapView doc={open} />
            {open.symbols.some(s => s.name) && (
              <ul className="rdList" aria-label="Places on this map">
                {open.symbols.filter(s => s.name).map(s => {
                  // A place that has a map of its own opens it when that map is one the reader can see.
                  const inside = s.mapIds.map(id => maps.find(m => m.id === id)).find((m): m is MapDoc => m !== undefined)
                  return (
                    <li key={s.id} className="rdItem">
                      <div className="rdItemMain">
                        <b>{s.name}</b>
                        {inside ? <button type="button" className="wvLink" aria-label={`Open ${inside.title}, the map of ${s.name}`} onClick={() => { setPicked(inside.id); setPickedVersion(null) }}>{inside.title}</button> : s.mapIds.length > 0 && <span className="rdMuted">has a map of its own</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      )}
      {more(loaded.extras.lockedMaps, 'map')}
    </>
  )
}

export function CastConsole({ ctx, book }: { ctx: ReaderCtx; book: CatalogBook }) {
  const loaded = useExtras(ctx, book)
  const [focused, setFocused] = useState<string | null>(null)
  if (loaded.state === 'loading') return <p className="rdMuted" role="status">Loading the cast…</p>
  if (loaded.state === 'failed') return <p className="rdMuted" role="alert">The cast could not be loaded.</p>
  const { characters, lockedCharacters, figureModels } = loaded.extras
  const shown = new Set(characters.map(c => c.id))
  // A link between characters jumps to the other card, which is marked for a moment.
  const goTo = (id: string) => {
    setFocused(id)
    document.getElementById(`wvCard-${id}`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }
  return (
    <>
      {characters.length === 0 && <p className="rdMuted">{lockedCharacters > 0 ? 'Nobody to meet yet. Keep reading.' : 'The author has not published any characters for this book.'}</p>}
      <div className="rdCast">{characters.map(c => <CharacterCard key={c.id} card={c} onOpen={goTo} shown={shown} focused={focused === c.id} copies={figureModels} />)}</div>
      {more(lockedCharacters, 'character')}
    </>
  )
}
