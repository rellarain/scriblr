import { useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { IconProps } from '../../assets/icons'
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

// A tile of a console: its icon in the console's rail, its title, and what it shows.
export interface ConsolePage { id: string; label: string; Icon: ComponentType<IconProps>; children: ReactNode; bodyClassName?: string }

// A console tile whose body is an area of its own tiles, with their rail in the console tile's title bar.
export function consoleTile(slots: RailSlots, { panel, id, title, Icon, pages, label }: {
  panel: string
  id: string
  title: string
  Icon: ComponentType<IconProps>
  pages: ConsolePage[]
  label?: string
}): AreaTile {
  return {
    id, title, Icon, bodyClassName: 'gtBody--area',
    titleExtras: <span ref={slots.ref(id)} className="gtRailSlot" />,
    children: (
      <TileArea
        gridId={`${panel}.${id}`} label={label ?? `${title} tiles`} bar barHost={slots.host(id)}
        tiles={pages.map(p => ({ id: p.id, title: p.label, Icon: p.Icon, children: p.children, bodyClassName: p.bodyClassName }))}
      />
    ),
  }
}
