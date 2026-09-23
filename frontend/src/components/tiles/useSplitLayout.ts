import { useCallback } from 'react'
import { getKv } from '../../settings/settingsStore'
import { useStoredState } from '../../assets/Interfaces/writer/storage'
import { applyLayout, type PlacedTile } from './tileLayout'
import {
  insertAtDivider, insertBesideLeaf, leafIds, reconcile, resizeBranch as resizeBranchAt, setFixed, swapLeaves as swapLeavesAt,
  type Path, type SplitNode,
} from './splitTree'
import type { TileDef } from './tileTypes'

interface SplitState {
  tree: SplitNode | null
  shapes: Record<string, string>
  open: string | null
  maximized: boolean
}

const EMPTY_STATE: SplitState = { tree: null, shapes: {}, open: null, maximized: false }

// Whether a grid's console was left maximized, read directly from storage -- for a
// caller (the Writer) that needs this before the grid itself has mounted, to decide
// whether its sidebar should start hidden.
export function readMaximized(gridId: string): boolean {
  return getKv<SplitState>(`scriblr.tiles.${gridId}`)?.maximized ?? false
}

// One grid's split-tree layout (each tile's place, and mini/mid state) and its
// expanded (max) tile, remembered per user with the other saved settings
// (settings/settingsStore.ts).
export function useSplitLayout(gridId: string, defs: TileDef[]) {
  const [saved, setSaved] = useStoredState<SplitState>(`scriblr.tiles.${gridId}`, EMPTY_STATE)

  const resolve = (state: SplitState) => {
    const order = state.tree ? leafIds(state.tree) : undefined
    const resolved = applyLayout(defs, { order, shapes: state.shapes as Record<string, PlacedTile<TileDef>['shape']> })
    const shaped = resolved.map(p => ({ id: p.def.id, shape: p.shape }))
    return { placed: resolved, tree: reconcile(state.tree, shaped) }
  }

  const { placed, tree } = resolve(saved)

  const update = useCallback((fn: (tree: SplitNode, prev: SplitState) => Partial<SplitState>) => {
    setSaved(prev => {
      const { tree: current } = resolve(prev)
      return { ...prev, tree: current, ...fn(current, prev) }
    })
    // resolve/defs change every render (new array identity) -- keying off gridId is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridId, setSaved])

  return {
    placed,
    tree,
    openId: saved.open && leafIds(tree).includes(saved.open) ? saved.open : null,
    maximized: saved.maximized,
    setOpen: (id: string | null) => setSaved(prev => ({ ...prev, open: id })),
    setMaximized: (on: boolean) => setSaved(prev => ({ ...prev, maximized: on })),
    resize: (path: Path, ratio: number) => update(t => ({ tree: resizeBranchAt(t, path, ratio) })),
    swap: (idA: string, idB: string) => update(t => ({ tree: swapLeavesAt(t, idA, idB) })),
    // Drops a dragged tile onto a divider instead of another tile: a new column or
    // row for it, wedged in right at that divider, rather than swapping places.
    insertAt: (id: string, path: Path) => update(t => ({ tree: insertAtDivider(t, id, path) })),
    // Drops a dragged tile onto another tile's left/right edge margin: a new column
    // beside it, rather than swapping places with it.
    insertBeside: (draggedId: string, targetId: string, side: 'left' | 'right') =>
      update(t => ({ tree: insertBesideLeaf(t, draggedId, targetId, side) })),
    // Toggles a tile between mini (a fixed, short strip) and mid (its own full,
    // resizable render). Clicking a tile's title does this.
    toggleTier: (id: string) => {
      const item = placed.find(p => p.def.id === id)
      if (!item) return
      const next = item.shape === 'mini' ? 'mid' : 'mini'
      update((t, prev) => ({ shapes: { ...prev.shapes, [id]: next }, tree: setFixed(t, id, next === 'mini') }))
    },
  }
}
