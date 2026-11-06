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

// A map and the maps inside it, outermost first, each indented by how deep it is.
function mapOrder(maps: MapDoc[]): Array<{ map: MapDoc; depth: number }> {
  const ids = new Set(maps.map(m => m.id))
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
  const maps = loaded.state === 'ready' ? loaded.extras.maps : []
  const ordered = useMemo(() => mapOrder(maps), [maps])
  if (loaded.state === 'loading') return <p className="rdMuted" role="status">Loading the maps…</p>
  if (loaded.state === 'failed') return <p className="rdMuted" role="alert">The maps could not be loaded.</p>
  const open = maps.find(m => m.id === picked) ?? ordered[0]?.map ?? null
  return (
    <>
      {!open && <p className="rdMuted">{loaded.extras.lockedMaps > 0 ? 'Nothing is drawn yet. Keep reading.' : 'The author has not published a map for this book.'}</p>}
      {open && (
        <>
          {ordered.length > 1 && (
            <div className="rdRow" role="group" aria-label="Maps">
              {ordered.map(({ map, depth }) => (
                <button key={map.id} type="button" className={map.id === open.id ? 'rdChip rdChip--on rdChip--button' : 'rdChip rdChip--button'} aria-pressed={map.id === open.id} style={{ marginLeft: depth * 8 }} onClick={() => setPicked(map.id)}>{map.title}</button>
              ))}
            </div>
          )}
          <Card title={open.title}>
            <MapView doc={open} />
            {open.symbols.some(s => s.name) && (
              <ul className="rdList" aria-label="Places on this map">
                {open.symbols.filter(s => s.name).map(s => <li key={s.id} className="rdItem"><div className="rdItemMain"><b>{s.name}</b>{s.mapIds.length > 0 && <span className="rdMuted">has a map of its own</span>}</div></li>)}
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
  if (loaded.state === 'loading') return <p className="rdMuted" role="status">Loading the cast…</p>
  if (loaded.state === 'failed') return <p className="rdMuted" role="alert">The cast could not be loaded.</p>
  const { characters, lockedCharacters } = loaded.extras
  return (
    <>
      {characters.length === 0 && <p className="rdMuted">{lockedCharacters > 0 ? 'Nobody to meet yet. Keep reading.' : 'The author has not published any characters for this book.'}</p>}
      <div className="rdCast">{characters.map(c => <CharacterCard key={c.id} card={c} />)}</div>
      {more(lockedCharacters, 'character')}
    </>
  )
}
