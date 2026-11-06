import type { MapJourney } from '../../../../api/types'
import { colourOf, type Whereabouts } from './mapJourneys'
import type { MapThemeDef } from './mapThemes'
import type { MapView } from './mapView'

// Journeys on the canvas: each path as a line with an arrow where it turns toward the next stop and a dot at each stop (the chosen journey's dots are numbered), and, when
// a point of the story is chosen, a marker with the character's initial where each of them is at that point. The colours are the journeys' own (the map's art).

export interface JourneyView {
  list: MapJourney[]
  // The names of the characters (a character that is gone has none, and is drawn with a question mark).
  names: Map<string, string>
  selectedId: string | null
  // Whether the paths are drawn (the markers are drawn whenever `at` is set).
  showPaths: boolean
  at: Whereabouts[] | null
}

const WHITE = '#ffffff'
const initialOf = (name: string | undefined) => (name?.trim()[0] ?? '?').toUpperCase()

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, size: number) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
  const a = Math.atan2(y1 - y0, x1 - x0)
  ctx.beginPath()
  ctx.moveTo(mx + Math.cos(a) * size, my + Math.sin(a) * size)
  ctx.lineTo(mx + Math.cos(a + 2.5) * size, my + Math.sin(a + 2.5) * size)
  ctx.lineTo(mx + Math.cos(a - 2.5) * size, my + Math.sin(a - 2.5) * size)
  ctx.closePath()
  ctx.fill()
}

export function drawJourneys(ctx: CanvasRenderingContext2D, jv: JourneyView, view: MapView, theme: MapThemeDef) {
  const px = (x: number) => view.x + x * view.zoom
  const py = (y: number) => view.y + y * view.zoom
  const unit = Math.max(6, Math.min(22, view.zoom * 0.5))
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (jv.showPaths) {
    jv.list.forEach((j, index) => {
      const colour = colourOf(j, index)
      const chosen = j.id === jv.selectedId
      if (j.stops.length === 0) return
      if (j.stops.length > 1) {
        ctx.beginPath()
        j.stops.forEach((s, i) => { if (i === 0) ctx.moveTo(px(s.x), py(s.y)); else ctx.lineTo(px(s.x), py(s.y)) })
        ctx.strokeStyle = theme.halo
        ctx.lineWidth = chosen ? 6 : 4.5
        ctx.stroke()
        ctx.strokeStyle = colour
        ctx.lineWidth = chosen ? 3 : 2
        ctx.stroke()
        ctx.fillStyle = colour
        for (let i = 1; i < j.stops.length; i += 1) arrow(ctx, px(j.stops[i - 1].x), py(j.stops[i - 1].y), px(j.stops[i].x), py(j.stops[i].y), chosen ? 7 : 5)
      }
      j.stops.forEach((s, i) => {
        const r = chosen ? unit * 0.55 : unit * 0.3
        ctx.beginPath()
        ctx.arc(px(s.x), py(s.y), r, 0, Math.PI * 2)
        ctx.fillStyle = colour
        ctx.fill()
        ctx.strokeStyle = WHITE
        ctx.lineWidth = 1.5
        ctx.stroke()
        if (chosen) {
          ctx.fillStyle = WHITE
          ctx.font = `bold ${Math.max(9, Math.round(r * 1.2))}px system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(i + 1), px(s.x), py(s.y) + 0.5)
        }
      })
    })
  }
  if (jv.at) {
    for (const w of jv.at) {
      const index = jv.list.findIndex(j => j.id === w.journeyId)
      if (index < 0) continue
      const colour = colourOf(jv.list[index], index)
      const r = unit * 0.8
      ctx.beginPath()
      ctx.arc(px(w.x), py(w.y), r, 0, Math.PI * 2)
      ctx.fillStyle = colour
      ctx.fill()
      ctx.strokeStyle = WHITE
      ctx.lineWidth = 2.5
      ctx.stroke()
      ctx.fillStyle = WHITE
      ctx.font = `bold ${Math.max(10, Math.round(r * 1.1))}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(initialOf(jv.names.get(w.characterId)), px(w.x), py(w.y) + 0.5)
    }
  }
  ctx.restore()
}
