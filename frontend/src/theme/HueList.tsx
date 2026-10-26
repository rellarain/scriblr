import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ColorRange } from '../components/ColorRange'
import { hslCss } from './palettes'
import { sameSource, startDrag, useDropTarget, useThemeDnd } from './themeDnd'
import { describeUses, hueUses } from './themeHues'
import { fillInk } from './zoneLooks'
import { MAX_HUE_SWATCHES, type HueSwatch, type ThemeSettings } from './types'

// The account's list of hues in the theme panel: up to ten flat rounded squares, each the hue at the saturation and lightness of the zone
// in use, with the number of colours that use it inside (nothing when none does).
//
//  - Drag a swatch onto a colour of a time of day to give it that hue. Editing a swatch changes every colour that uses it.
//  - Click one to pick it up and open its hue slider under the row (then click a colour to use it); Delete removes it.
//  - Drag one onto another to put it before that one (Alt+Left and Alt+Right move it too).
//  - Drag one outside the list to delete it (the panel does that). One that is in use cannot be deleted, and nor can the last one.
//  - The "+" at the end adds a hue (it goes at ten), opening its slider at red.

export interface HueListProps {
  theme: ThemeSettings
  // What the squares are drawn at (the zone in use), and the lightness the slider's track is drawn at.
  basis: { s: number; l: number; track: number }
  onAdd: () => string | null
  onSetHue: (id: string, h: number) => void
  onMove: (id: string, beforeId: string | null) => void
  onRemove: (id: string) => void
  // Why the last delete was refused (a hue in use), or something else to say.
  note: string | null
}

function Swatch({ theme, swatch, index, basis, onOpen, onMove, onRemove }: {
  theme: ThemeSettings
  swatch: HueSwatch
  index: number
  basis: HueListProps['basis']
  onOpen: (open: boolean) => void
  onMove: HueListProps['onMove']
  onRemove: HueListProps['onRemove']
}) {
  const dnd = useThemeDnd()
  const source = { kind: 'swatch' as const, id: swatch.id }
  const picked = sameSource(dnd.picked, source)
  const uses = hueUses(theme, swatch.id).length
  const fill = { h: swatch.h, s: basis.s, l: basis.l }
  const target = useDropTarget(dnd.dragging?.kind === 'swatch' && dnd.dragging.id !== swatch.id, () => {
    if (dnd.dragging?.kind === 'swatch') onMove(dnd.dragging.id, swatch.id)
  })
  const label = `Hue ${index + 1}: ${swatch.h}°, ${describeUses(theme, swatch.id)}`

  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onRemove(swatch.id)
    } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      const ids = theme.hues.map(h => h.id)
      if (e.key === 'ArrowLeft') onMove(swatch.id, ids[index - 1] ?? swatch.id)
      else onMove(swatch.id, ids[index + 2] ?? null)
    } else if (e.key === 'Escape') {
      onOpen(false)
      dnd.pick(null)
    }
  }

  return (
    <li className="hueItem">
      <button
        type="button" data-hue={swatch.id}
        className={`hueSwatch${picked ? ' hueSwatch--picked' : ''}${target.over ? ' hueSwatch--over' : ''}`}
        style={{ backgroundColor: hslCss(fill), color: hslCss(fillInk(fill, swatch.h).ink) }}
        aria-label={label} title={label} aria-pressed={picked}
        draggable
        onDragStart={e => { e.stopPropagation(); startDrag(e, label); dnd.begin(source, e) }}
        onDragEnd={dnd.end}
        onClick={() => {
          if (picked) { dnd.pick(null); onOpen(false) } else { dnd.pick(source); onOpen(true) }
        }}
        onKeyDown={keys}
        {...target.props}
      >
        {uses > 0 && <span className="hueCount">{uses}</span>}
      </button>
    </li>
  )
}

// The slider for a swatch, under the row of them: the whole wheel, the degrees, Done and Delete (which is no use for a hue that is in use).
function HueEditor({ hue, label, basis, uses, onChange, onDone, onRemove }: {
  hue: number
  label: string
  basis: HueListProps['basis']
  uses: number
  onChange: (h: number) => void
  onDone: () => void
  onRemove: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // A press outside closes it (a swatch, which toggles it itself or moves it to that swatch, is not outside).
    const away = (e: PointerEvent) => {
      const box = ref.current
      if (!box || !(e.target instanceof Element) || box.contains(e.target) || e.target.closest('.hueSwatch, .hueAdd')) return
      onDone()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [onDone])
  return (
    <div className="hueEditor" ref={ref} role="group" aria-label={label} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onDone() } }}>
      <ColorRange label={label} value={hue} sat={basis.s} light={basis.track} live onChange={onChange} />
      <div className="hueEditorRow">
        <output className="hueEditorDegrees">{hue}°</output>
        <button type="button" className="themeBtn" disabled={uses > 0} title={uses > 0 ? 'In use, so it cannot be deleted' : 'Delete this hue'} onClick={onRemove}>Delete</button>
        <button type="button" className="themeBtn themeBtn--primary" onClick={onDone}>Done</button>
      </div>
    </div>
  )
}

export function HueList({ theme, basis, onAdd, onSetHue, onMove, onRemove, note }: HueListProps) {
  const dnd = useThemeDnd()
  const [open, setOpen] = useState<string | null>(null)
  const end = useDropTarget(dnd.dragging?.kind === 'swatch', () => { if (dnd.dragging?.kind === 'swatch') onMove(dnd.dragging.id, null) })
  const full = theme.hues.length >= MAX_HUE_SWATCHES
  const dragging = dnd.dragging?.kind === 'swatch'
  const editing = theme.hues.findIndex(h => h.id === open)

  return (
    <div className="hueList">
      <ul className={`hueRow${end.over ? ' hueRow--over' : ''}`} aria-label="Hues" {...end.props}>
        {theme.hues.map((swatch, index) => (
          <Swatch
            key={swatch.id} theme={theme} swatch={swatch} index={index} basis={basis}
            onOpen={o => setOpen(o ? swatch.id : null)} onMove={onMove} onRemove={onRemove}
          />
        ))}
        {!full && (
          <li className="hueItem">
            <button
              type="button" className="hueAdd" aria-label="Add a hue" title="Add a hue"
              onClick={() => { const id = onAdd(); if (id) setOpen(id) }}
            >+</button>
          </li>
        )}
      </ul>
      {editing >= 0 && (
        <HueEditor
          key={theme.hues[editing].id} hue={theme.hues[editing].h} label={`Hue ${editing + 1} in degrees`} basis={basis}
          uses={hueUses(theme, theme.hues[editing].id).length}
          onChange={h => onSetHue(theme.hues[editing].id, h)} onDone={() => setOpen(null)}
          onRemove={() => { onRemove(theme.hues[editing].id); setOpen(null) }}
        />
      )}
      <p className="hueHint" role="status">
        {note ?? (dragging
          ? 'Drop it on a colour to use it, or outside the list to delete it.'
          : `${theme.hues.length} of ${MAX_HUE_SWATCHES} hues. The number inside is how many colours use it.`)}
      </p>
    </div>
  )
}

export default HueList
