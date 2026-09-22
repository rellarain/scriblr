import type { ComponentType, ReactNode } from 'react'
import type { IconProps } from '../../assets/icons'
import type { TileMeta } from './tileLayout'
import type { TileShape } from './tileShapes'

export interface TileContext {
  shape: TileShape
  // The grid is one column wide: what a small or landscape tile shows is its row version.
  oneColumn: boolean
}

// A tile: a read-only card in a grid that expands into a console. Its content
// depends on its shape; `console` is what it becomes when expanded.
export interface TileDef extends TileMeta {
  title: string
  Icon: ComponentType<IconProps>
  // One line: shown on link tiles and in the one-column row version.
  summary: string
  // The read-only body of a small, landscape, portrait or large tile. Quick actions
  // (ticking a task, an inline add box) may live here.
  render?: (ctx: TileContext) => ReactNode
  // The editor this tile expands into.
  console?: () => ReactNode
  // Child tiles: expanding the tile shows them as a grid, and they can expand in turn.
  children?: TileDef[]
  // A link tile that goes somewhere else instead of expanding.
  onOpen?: () => void
  // The content behind the Settings and Help buttons at the console's bottom right.
  settings?: ReactNode
  help?: ReactNode
}

export const opensConsole = (tile: TileDef): boolean => Boolean(tile.console || tile.children)
