// One pointer-driven drag for every list a thing is reordered in (the option chips, the fields and fieldsets, the outline cards, the preset
// lists, the Admin cards). The browser's own drag and drop draws the dragged thing see-through; this draws it as it is, following the pointer,
// and lets the list it is over take the drop: the list is a ZONE (`zoneRef`), and the zone under the pointer is told where it is.
//
//   const drag = beginPointerDrag({ kind, source, event, onStart, onEnd })      (from a grip's pointerdown)
//   <div ref={zoneRef(kind, { over, leave, drop })}>                               (a list that takes the drop)
//
// A drag starts once the pointer has moved a few pixels (a press that stays put is still a click, and the click that ends a drag is ignored,
// `dragJustEnded`), follows until the pointer is let go, and ends at Escape or when the pointer is cancelled. Of the zones of its kind that the
// pointer is inside, the innermost takes it (a list in a card is under the card's own list). The zone is told `over` on every move (it works out the
// slot from the pointer), `leave` when the pointer goes to another zone or out, and `drop` when it is let go there.
import { dragJustEnded, markDragEnded } from '../components/tiles/tileDragBus'

export interface DropZone {
  over: (x: number, y: number) => void
  leave: () => void
  drop: (x: number, y: number) => void
}

interface Registered { kind: string; el: HTMLElement; zone: DropZone }

const zones = new Set<Registered>()

// A callback ref that makes the element a zone of that kind. A new one is made on each render (the zone's handlers see the latest state): React
// detaches the old before it attaches the new, so the zone is always the latest.
export function zoneRef(kind: string, zone: DropZone): (el: HTMLElement | null) => void {
  let mine: Registered | null = null
  return el => {
    if (mine) zones.delete(mine)
    mine = el ? { kind, el, zone } : null
    if (mine) zones.add(mine)
  }
}

// One ref for an element that is a zone of several kinds at once (a fieldset takes a dragged field and a dragged fieldset).
export function zoneRefs(...refs: Array<(el: HTMLElement | null) => void>): (el: HTMLElement | null) => void {
  return el => { for (const ref of refs) ref(el) }
}

export { dragJustEnded }

const THRESHOLD = 4
const PICTURE_CLASS = 'dragPicture'

// The innermost zone of a kind the point is inside: the smallest by area.
function zoneAt(kind: string, x: number, y: number): Registered | null {
  let best: Registered | null = null
  let bestArea = Infinity
  for (const z of zones) {
    if (z.kind !== kind || !z.el.isConnected) continue
    const r = z.el.getBoundingClientRect()
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue
    const area = Math.max(1, r.width * r.height)
    if (area < bestArea) { best = z; bestArea = area }
  }
  return best
}

export interface PointerDrag {
  kind: string
  // The element the dragged thing is; its picture follows the pointer.
  source: HTMLElement
  event: { clientX: number; clientY: number; button?: number }
  // The drag is under way (the pointer has moved): the thing may now leave its place.
  onStart?: () => void
  // The drag is over, dropped or not (after the zone has taken the drop).
  onEnd?: () => void
}

// Starts a drag from a press. Returns a way to cancel it.
export function beginPointerDrag({ kind, source, event, onStart, onEnd }: PointerDrag): () => void {
  if (event.button !== undefined && event.button !== 0) return () => {}
  const start = { x: event.clientX, y: event.clientY }
  const box = source.getBoundingClientRect()
  const grab = { x: start.x - box.left, y: start.y - box.top }
  let picture: HTMLElement | null = null
  let started = false
  let active: Registered | null = null
  const userSelect = document.body.style.userSelect

  function makePicture() {
    const copy = source.cloneNode(true) as HTMLElement
    copy.classList.add(PICTURE_CLASS)
    copy.setAttribute('aria-hidden', 'true')
    // A picture, not a second thing: nothing that names the thing (an id, a name that groups radios, the data-* attributes that lists find their items by).
    copy.setAttribute('inert', '')
    for (const el of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('*'))]) {
      for (const attr of el.getAttributeNames()) if (attr === 'id' || attr === 'name' || attr === 'for' || attr.startsWith('data-')) el.removeAttribute(attr)
    }
    Object.assign(copy.style, {
      position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
      margin: '0', transform: 'none', transition: 'none', pointerEvents: 'none', zIndex: '2000', boxSizing: 'border-box',
    })
    // Beside the source, so the page's own rules (which are scoped to where it sits) draw it the same.
    source.insertAdjacentElement('afterend', copy)
    return copy
  }

  function move(ev: PointerEvent) {
    if (!started) {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < THRESHOLD) return
      started = true
      document.body.style.userSelect = 'none'
      picture = makePicture()
      onStart?.()
    }
    if (picture) { picture.style.left = `${ev.clientX - grab.x}px`; picture.style.top = `${ev.clientY - grab.y}px` }
    const next = zoneAt(kind, ev.clientX, ev.clientY)
    if (active && active !== next) active.zone.leave()
    active = next
    active?.zone.over(ev.clientX, ev.clientY)
  }

  function finish(commit: boolean, x: number, y: number) {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key)
    document.body.style.userSelect = userSelect
    picture?.remove()
    picture = null
    if (!started) return
    markDragEnded()
    const zone = active
    active = null
    if (zone) { if (commit) zone.zone.drop(x, y); else zone.zone.leave() }
    onEnd?.()
  }
  function up(ev: PointerEvent) { finish(true, ev.clientX, ev.clientY) }
  function cancel() { finish(false, 0, 0) }
  function key(ev: KeyboardEvent) { if (ev.key === 'Escape') finish(false, 0, 0) }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key)
  return () => finish(false, 0, 0)
}

// Props for a grip: pressing it starts the drag of `sourceOf(el)` (the row or chip the grip is in).
export function gripProps(kind: string, id: string, sourceOf: (grip: HTMLElement) => HTMLElement | null, drag: { start: (id: string) => void; end: () => void }) {
  return {
    onPointerDown: (e: { button: number; clientX: number; clientY: number; currentTarget: EventTarget; stopPropagation: () => void }) => {
      if (e.button !== 0) return
      const source = sourceOf(e.currentTarget as HTMLElement)
      if (!source) return
      e.stopPropagation()
      beginPointerDrag({ kind, source, event: e, onStart: () => drag.start(id), onEnd: drag.end })
    },
    style: { touchAction: 'none' as const },
  }
}
