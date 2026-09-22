import { useCallback } from 'react'
import { useStoredState } from '../../assets/Interfaces/writer/storage'
import { EMPTY_LAYOUT, applyLayout, cycleShape, moveTile, shiftTile, type PlacedTile, type TileLayoutState } from './tileLayout'
import type { TileDef } from './tileTypes'

// One grid's layout (tile order and shapes) and its expanded tile, remembered per
// user with the other saved settings (settings/settingsStore.ts).
export function useTileLayout(gridId: string, defs: TileDef[]) {
  const [saved, setSaved] = useStoredState<TileLayoutState>(`scriblr.tiles.${gridId}`, EMPTY_LAYOUT)
  const placed: Array<PlacedTile<TileDef>> = applyLayout(defs, saved)
  const order = placed.map(p => p.def.id)

  // Every change saves the whole current order, so it stays put once anything moves.
  const update = useCallback((fn: (state: TileLayoutState, order: string[]) => Partial<TileLayoutState>) => {
    setSaved(prev => {
      const current = applyLayout(defs, prev)
      return { ...prev, order: current.map(p => p.def.id), ...fn(prev, current.map(p => p.def.id)) }
    })
  }, [defs, setSaved])

  return {
    placed,
    openId: saved.open && order.includes(saved.open) ? saved.open : null,
    setOpen: (id: string | null) => setSaved(prev => ({ ...prev, open: id })),
    cycle: (id: string) => {
      const item = placed.find(p => p.def.id === id)
      if (!item) return
      update(prev => ({ shapes: { ...prev.shapes, [id]: cycleShape(item.def, item.shape) } }))
    },
    move: (id: string, beforeId: string | null) => update((_, cur) => ({ order: moveTile(cur, id, beforeId) })),
    shift: (id: string, delta: number) => update((_, cur) => ({ order: shiftTile(cur, id, delta) })),
    reset: () => setSaved(prev => ({ ...EMPTY_LAYOUT, open: prev.open })),
  }
}
