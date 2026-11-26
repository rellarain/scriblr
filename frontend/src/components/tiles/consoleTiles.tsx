import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { IconProps } from '../../assets/icons'
import { useStoredState } from '../../assets/Interfaces/writer/storage'
import TileArea, { type AreaTile } from './TileArea'

// The two tiers of tabs. A panel or level has a rail of *console* tabs (one per console, with Settings and Help always among them,
// last). A console that has tiles of its own has a rail of *tile* tabs in its tile's title bar. Both rails are a TileTabBar on a TileArea
// (a tile has no minimize button: it is turned off and on in its rail).

// The slots in the title bars of the console tiles, where their rails go: a callback ref for each (kept, so React does not call it again on every
// render) and the element once it is drawn (null before).
export function useRailSlots() {
  const [slots, setSlots] = useState<Record<string, HTMLElement | null>>({})
  const refs = useRef<Record<string, (el: HTMLElement | null) => void>>({})
  return {
    ref: (id: string) => (refs.current[id] ??= el => setSlots(prev => (prev[id] === el ? prev : { ...prev, [id]: el }))),
    host: (id: string): HTMLElement | null => slots[id] ?? null,
  }
}
export type RailSlots = ReturnType<typeof useRailSlots>

// Which of an area's tiles are open (not turned off in its rail), as its layout is saved (useSplitLayout's `scriblr.tiles.<gridId>`), and
// the one to show when the area shows one tile at a time: the one opened last, else the one the pointer or focus last went into, else the
// first open one. `focus` is the area's onFocusTile.
export function useOneTile(gridId: string, ids: string[]): { open: string[]; shown: string | null; focus: (id: string) => void } {
  const [saved] = useStoredState<{ shapes?: Record<string, string> }>(`scriblr.tiles.${gridId}`, {})
  const open = ids.filter(id => saved.shapes?.[id] !== 'mini')
  const [focused, focus] = useState<string | null>(null)
  const before = useRef(open)
  const key = open.join('|')
  useEffect(() => {
    const opened = open.find(id => !before.current.includes(id))
    before.current = open
    if (opened) focus(opened)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const shown = focused && open.includes(focused) ? focused : open[0] ?? null
  return { open, shown, focus }
}

// A console's own area of tiles: all of them as laid out, or, held to one (`single`: AUI when small, or when several consoles share it),
// the one useOneTile picks.
function ConsoleArea({ gridId, single, tiles, ...rest }: { gridId: string; single: boolean; tiles: AreaTile[]; label: string; barHost: HTMLElement | null; gutter?: number }) {
  const { shown, focus } = useOneTile(gridId, tiles.map(t => t.id))
  return <TileArea gridId={gridId} bar tiles={tiles} maximized={single ? shown : undefined} onFocusTile={focus} {...rest} />
}

// A tile of a console: its icon in the console's rail, its title, and what it shows (and what else sits in its title bar: the Office tiles'
// tabs, 2026-11-16).
export interface ConsolePage { id: string; label: string; Icon: ComponentType<IconProps>; children: ReactNode; bodyClassName?: string; titleExtras?: ReactNode }

// A console tile whose body is an area of its own tiles, with their rail in the console tile's title bar. With a `gutter` (the Admin consoles, the user,
// 2026-11-15) the tiles sit that far apart and that far from the console's edge, the console's body takes the colour of its title bar (one frame round
// them), and each tile is one colour, its title bar and its body alike. `single` shows one of its tiles at a time.
export function consoleTile(slots: RailSlots, { panel, id, title, Icon, pages, label, gutter, single = false }: {
  panel: string
  id: string
  title: string
  Icon: ComponentType<IconProps>
  pages: ConsolePage[]
  label?: string
  gutter?: number
  single?: boolean
}): AreaTile {
  return {
    id, title, Icon, bodyClassName: gutter === undefined ? 'gtBody--area' : 'gtBody--area gtBody--framed',
    titleExtras: <span ref={slots.ref(id)} className="gtRailSlot" />,
    children: (
      <ConsoleArea
        gridId={`${panel}.${id}`} label={label ?? `${title} tiles`} barHost={slots.host(id)} gutter={gutter} single={single}
        tiles={pages.map(p => ({ id: p.id, title: p.label, Icon: p.Icon, children: p.children, bodyClassName: p.bodyClassName, titleExtras: p.titleExtras, className: gutter === undefined ? undefined : 'gtTile--even' }))}
      />
    ),
  }
}
