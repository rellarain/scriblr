import { useCallback } from 'react'
import { getKv } from '../../settings/settingsStore'
import { useStoredState } from '../../assets/Interfaces/writer/storage'
import { applyLayout, cycleShape, type PlacedTile } from './tileLayout'
import {
  buildTree, leafIds, presetRatio, reconcile, resetBranch as resetBranchAt, resizeBranch as resizeBranchAt,
  swapLeaves as swapLeavesAt, type Path, type SplitNode,
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

// One grid's split-tree layout (each tile's place and size) and its expanded tile,
// remembered per user with the other saved settings (settings/settingsStore.ts).
export function useSplitLayout(gridId: string, defs: TileDef[]) {
  const [saved, setSaved] = useStoredState<SplitState>(`scriblr.tiles.${gridId}`, EMPTY_STATE)

  const resolve = (state: SplitState) => {
    const order = state.tree ? leafIds(state.tree) : undefined
    const resolved = applyLayout(defs, { order, shapes: state.shapes as Record<string, PlacedTile<TileDef>['shape']> })
    const shaped = resolved.map(p => ({ id: p.def.id, shape: p.shape }))
    return { placed: resolved, tree: reconcile(state.tree, shaped) }
  }

  const { placed, tree } = resolve(saved)
  const seed = buildTree(placed.map(p => ({ id: p.def.id, shape: p.def.defaultShape })))

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
    seed,
    openId: saved.open && leafIds(tree).includes(saved.open) ? saved.open : null,
    maximized: saved.maximized,
    setOpen: (id: string | null) => setSaved(prev => ({ ...prev, open: id })),
    setMaximized: (on: boolean) => setSaved(prev => ({ ...prev, maximized: on })),
    resize: (path: Path, ratio: number) => update(t => ({ tree: resizeBranchAt(t, path, ratio) })),
    resetBranch: (path: Path) => update(t => ({ tree: resetBranchAt(t, path, seed ?? t) })),
    resetAll: () => setSaved(prev => ({ ...EMPTY_STATE, open: prev.open })),
    swap: (idA: string, idB: string) => update(t => ({ tree: swapLeavesAt(t, idA, idB) })),
    cycle: (id: string) => {
      const item = placed.find(p => p.def.id === id)
      if (!item) return
      const next = cycleShape(item.def, item.shape)
      update((t, prev) => ({ shapes: { ...prev.shapes, [id]: next }, tree: presetRatio(t, id, next) }))
    },
  }
}
