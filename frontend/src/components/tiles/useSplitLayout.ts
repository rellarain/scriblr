import { useCallback, useRef } from 'react'
import { useStoredState } from '../../assets/Interfaces/writer/storage'
import { applyLayout, type PlacedTile, type TileMeta } from './tileLayout'
import { applyDrop, type DropPlan } from './tileDrop'
import { moveTab, orderTabs } from './tabOrder'
import { leafIds, reconcile, resizeBranch as resizeBranchAt, syncFixed, type Path, type SplitNode } from './splitTree'

interface SplitState {
  tree: SplitNode | null
  // 'mini' for a minimized tile (when the grid keeps that itself); anything else is open.
  shapes: Record<string, string>
  // The tile shown alone over the whole area, if any (older layouts stored a boolean here).
  maximized: string | boolean | null
  // The order of the tab-bar icons, when the user has moved one.
  order?: string[]
}

const EMPTY_STATE: SplitState = { tree: null, shapes: {}, maximized: null }

export interface SplitLayoutOptions {
  // Where the tiles sit before the user has moved any (new or missing tiles are still grafted on).
  defaultTree?: SplitNode
  // The tiles that are minimized, when the level decides that itself (the Writer's closed tabs). Without it the grid
  // keeps it: a tile is minimized when its `defaultShape` says so until the user moves it, and from then on as saved.
  minimized?: readonly string[]
  // Told when a tile is minimized or restored (so a level that decides it can keep its own list).
  onMinimizedChange?: (id: string, minimized: boolean) => void
  // The tile shown alone over the whole area, when the console decides that itself (null: none); `onMaximizedChange` hears the user's changes.
  maximized?: string | null
  onMaximizedChange?: (id: string | null) => void
}

// One grid's split-tree layout -- each tile's place, which tiles are minimized and which one is maximized --
// remembered per user with the other saved settings (settings/settingsStore.ts). A minimized tile keeps its slot
// in the tree (it only takes no room), so restoring it puts it back where it was.
export function useSplitLayout<T extends TileMeta>(gridId: string, defs: T[], options: SplitLayoutOptions = {}) {
  const [saved, setSaved] = useStoredState<SplitState>(`scriblr.tiles.${gridId}`, EMPTY_STATE)
  // The latest tiles and options, for `update` below (which lives across renders): a grid whose tiles come and go
  // must not reconcile a move against the tiles of an earlier render.
  const latest = useRef({ defs, options })
  latest.current = { defs, options }

  const resolve = (state: SplitState) => {
    const { defs, options } = latest.current
    const order = state.tree ? leafIds(state.tree) : undefined
    const resolved = applyLayout(defs, { order, shapes: state.shapes as Record<string, PlacedTile<T>['shape']> })
    const minimized = new Set(options.minimized ?? resolved.filter(p => p.shape === 'mini').map(p => p.def.id))
    const placed = resolved.map(p => ({ def: p.def, shape: minimized.has(p.def.id) ? 'mini' as const : 'mid' as const }))
    const tree = syncFixed(reconcile(state.tree ?? options.defaultTree ?? null, placed.map(p => ({ id: p.def.id, shape: p.shape }))), minimized)
    return { placed, tree, minimized }
  }

  const { placed, tree, minimized } = resolve(saved)
  const wantMax = options.maximized !== undefined ? options.maximized : saved.maximized
  const maximizedId = typeof wantMax === 'string' && placed.some(p => p.def.id === wantMax && !minimized.has(p.def.id)) ? wantMax : null

  const tabOrder = orderTabs(defs.map(d => d.id), saved.order)

  const update = useCallback((fn: (tree: SplitNode, prev: SplitState) => Partial<SplitState>) => {
    setSaved(prev => {
      const { tree: current } = resolve(prev)
      return { ...prev, tree: current, ...fn(current, prev) }
    })
    // resolve is re-made every render and reads `latest`, so keying off gridId is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridId, setSaved])

  // Minimizes a tile (it keeps its slot, and takes no room) or restores it.
  const setMinimized = useCallback((id: string, on: boolean) => {
    const { options } = latest.current
    if (options.minimized) options.onMinimizedChange?.(id, on)
    else update((_t, prev) => ({ shapes: { ...prev.shapes, [id]: on ? 'mini' : 'mid' } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update])

  return {
    placed,
    tree,
    minimized,
    maximizedId,
    tabOrder,
    reorderTabs: (id: string, beforeId: string | null) => update((_t, prev) => ({ order: moveTab(orderTabs(latest.current.defs.map(d => d.id), prev.order), id, beforeId) })),
    setMaximized: (id: string | null) => {
      if (options.maximized !== undefined) options.onMaximizedChange?.(id)
      else setSaved(prev => ({ ...prev, maximized: id }))
    },
    setMinimized,
    resize: (path: Path, ratio: number) => update(t => ({ tree: resizeBranchAt(t, path, ratio) })),
    // A dropped tile: laid out where the plan says (tileDrop.ts), and restored first when it was minimized.
    apply: (id: string, plan: DropPlan) => {
      if (minimized.has(id)) setMinimized(id, false)
      update(t => ({ tree: applyDrop(t, id, plan) }))
    },
  }
}
