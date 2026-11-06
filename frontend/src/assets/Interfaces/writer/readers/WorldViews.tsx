import { useEffect, useRef, useState } from 'react'
import type { MapDoc, ReaderCharacter } from '../../../../api/types'
import { CharacterArt } from '../characters/art/CharacterArt'
import { BASE_CELL_PX, renderMapImage } from '../maps/mapExport'
import { draftOf } from '../maps/mapModel'
import './readers.scss'

// A published map and a published character as a reader sees them: shared by the Reader's book page and by the author's preview, so what is previewed is what is read.

// The longest side of a map in pixels, as it is shown (a bigger map has smaller cells; the page scales it down to fit).
const MAP_VIEW_PX = 960

// The map drawn as it is exported: every layer, with the scale bar, compass and legend it has switched on.
export function MapView({ doc }: { doc: MapDoc }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const draft = draftOf(doc)
    const scale = Math.min(1, MAP_VIEW_PX / (BASE_CELL_PX * Math.max(doc.width, doc.height)))
    const out = renderMapImage(draft, scale, new Set(draft.layers.map(l => l.id)))
    const target = ref.current
    const ctx = target?.getContext('2d') ?? null
    if (!out || !target || !ctx) { setFailed(true); return }
    setFailed(false)
    target.width = out.width
    target.height = out.height
    ctx.drawImage(out, 0, 0)
  }, [doc])
  if (failed) return <p className="rvHint" role="status">The map could not be drawn here.</p>
  return <canvas ref={ref} className="wvMap" role="img" aria-label={`Map: ${doc.title}`} />
}

// A character card: a close-up, the name, the fields the author made public and the links to other published characters. With `onOpen`, a link to a character
// that is `shown` (a card is on the page for them) jumps to that card; one to a character not shown (not revealed yet) is only named. `focused` marks the card jumped to.
export function CharacterCard({ card, onOpen, shown, focused = false }: { card: ReaderCharacter; onOpen?: (id: string) => void; shown?: ReadonlySet<string>; focused?: boolean }) {
  return (
    <article className={focused ? 'wvCard wvCard--focus' : 'wvCard'} id={`wvCard-${card.id}`} aria-label={card.name}>
      <div className="wvCardArt"><CharacterArt look={card.look} mode="closeup" label={`${card.name}, close-up`} className="wvArt" /></div>
      <div className="wvCardBody">
        <h4 className="wvCardName">{card.name}</h4>
        {card.fields.length === 0 && <p className="rvHint">Nothing more is told yet.</p>}
        <dl className="wvFields">
          {card.fields.map(f => (
            <div key={f.key} className="wvField">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
        {card.relationships.length > 0 && (
          <ul className="wvLinks" aria-label={`${card.name}, relationships`}>
            {card.relationships.map(r => (
              <li key={r.targetId}>
                {onOpen && (!shown || shown.has(r.targetId)) ? <button type="button" className="wvLink" aria-label={`Go to ${r.targetName}`} onClick={() => onOpen(r.targetId)}>{r.targetName}</button> : <b>{r.targetName}</b>}
                <span className="rvHint"> · {r.label}{r.description ? `: ${r.description}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}
