import type { ComponentType, ReactNode } from 'react'
import type { IconProps } from '../../assets/icons'
import type { TileMeta } from './tileLayout'

export interface TileContext {
  // The grid is one column wide: a tile never reads as "wide" here, however wide its box is.
  oneColumn: boolean
  // The tile's own measured box, in a mid tile -- so its content can scale with the
  // actual space a divider drag (or the container's own size) gives it.
  width: number
  height: number
}

// A tile: a read-only card in a grid with three states -- mini (a short, fixed
// strip: name and a one-line summary), mid (this def's own `render`, scaling with
// its measured size) and max (the console it expands into). The title toggles
// mini/mid; a corner button opens max (only shown when there's something to open --
// a console, child tiles, or `onOpen`).
export interface TileDef extends TileMeta {
  title: string
  Icon: ComponentType<IconProps>
  // One line: shown on a mini tile.
  summary: string
  // The read-only body of a mid tile. Quick actions (ticking a task, an inline add box) may live here.
  render?: (ctx: TileContext) => ReactNode
  // The editor this tile expands into (max).
  console?: () => ReactNode
  // Child tiles: expanding the tile shows them as a grid, and they can expand in turn.
  children?: TileDef[]
  // Goes somewhere else instead of expanding into a console.
  onOpen?: () => void
  // The content behind the Settings and Help buttons at the console's bottom right.
  settings?: ReactNode
  help?: ReactNode
}

export const opensConsole = (tile: TileDef): boolean => Boolean(tile.console || tile.children)
