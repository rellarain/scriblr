import { paintDefs, type PaintItem } from './engine/paint'
import { PaintDefs, PaintedPath, useSvgPrefix } from './PaintedPath'

// The Angles section (slice 9e) in the shape editor's Overview: the figure from the eight angles every 45° (the front, the front ¾ right, the right side, the back ¾ right,
// the back, the back ¾ left, the left side, the front ¾ left), each a small picture that turns the canvas to that angle. A part can be drawn at any of them: turned there,
// moving its points draws its outline at that angle (its Turning section lists the angles it is drawn at).

export interface AngleThumb { at: number; name: string; items: PaintItem[] }
export interface AnglesActions {
  thumbs: AngleThumb[]
  // the box every picture is drawn in (the same for all, so they compare), in the canvas's space
  box: { x: number; y: number; w: number; h: number }
  current: number
  onAngle: (at: number) => void
  // why the figure cannot be turned now (the angle is set by something else), or null
  off?: string | null
}

export function AnglesSection({ actions }: { actions: AnglesActions }) {
  const prefix = useSvgPrefix()
  const { box } = actions
  const pad = Math.max(box.w, box.h) * 0.04
  const vb = `${box.x - pad} ${box.y - pad} ${box.w + 2 * pad} ${box.h + 2 * pad}`
  return (
    <div className="cmDraw" role="group" aria-label="Angles">
      <h3 className="cmInsSub">Angles</h3>
      <div className="cmAngleStrip">
        {actions.thumbs.map((t, i) => {
          const on = Math.round(actions.current) % 360 === t.at
          return (
            <button key={t.at} type="button" className={`cmAngleThumb${on ? ' cmAngleThumb--on' : ''}`} aria-pressed={on} aria-label={`Seen from the ${t.name.toLowerCase()}`}
              title={`${t.name} (${t.at}°)`} disabled={!!actions.off} onClick={() => actions.onAngle(t.at)}>
              <svg viewBox={vb} aria-hidden="true" focusable="false">
                <PaintDefs defs={paintDefs(t.items, `${prefix}-${i}`)} />
                {t.items.map(item => <PaintedPath key={item.id} item={item} prefix={`${prefix}-${i}`} className="cmAngleShape" lineClass="cmAngleLine" />)}
              </svg>
              <span className="cmAngleName">{t.at}°</span>
            </button>
          )
        })}
      </div>
      <p className="cmInsText">{actions.off ?? 'Front, side and back: the joints turn. Turned to an angle, moving a part\'s points draws its outline there, so a part that twists along its length (the neck, a forearm, a shoulder, a hip) can have a drawing of its own at each angle; between the angles drawn, the outlines blend.'}</p>
    </div>
  )
}
