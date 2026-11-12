import { useMemo } from 'react'
import { cropAround, kindCrop } from './figurePictures'
import { overviewOf, type OverviewRow } from './figureEditing'
import { Figure } from './Figure'
import type { Ctx } from './FigureSteps'

// The overview of the figure (phase 6c-5): the head, the hair, the face, the body and the fantasy of the character, each part with a picture of what is chosen for it and its name.
// A part opens (step 2) when it is pressed; a ready look is chosen in the first step, so it only says what is on. The pictures are drawn when the overview is open.
export function FigureOverview({ ctx, onOpen, onFigure }: { ctx: Ctx; onOpen: (objectId: string) => void; onFigure: () => void }) {
  const { copy, figure } = ctx
  const sections = useMemo(() => overviewOf(copy, figure), [copy, figure])
  const picture = (r: OverviewRow) => (
    <>
      <span className="charOverviewThumb" aria-hidden="true">
        <Figure copy={copy} figure={figure} crop={r.objectId ? cropAround(copy, [figure], r.objectId) : kindCrop(r.label)} label="" className="charPickArt" />
      </span>
      <span className="charOverviewText"><span className="charOverviewLabel">{r.label}</span><span className="charOverviewValue">{r.value}</span></span>
    </>
  )
  return (
    <div className="charOverview" role="region" aria-label="Overview">
      <p className="charHint">What the figure is made of. Press a part to change it; the ready looks are chosen in the first step.</p>
      {sections.map(s => (
        <section key={s.id} className="charStepGroup" role="group" aria-label={s.name}>
          <h3 className="charStepTitle">{s.name}</h3>
          <ul className="charOverviewList">
            {s.rows.map(r => (
              <li key={r.key}>
                {r.objectId
                  ? <button type="button" className="charOverviewRow" aria-label={`${r.label}: ${r.value}`} title={`Change ${r.label.toLowerCase()}`} onClick={() => onOpen(r.objectId!)}>{picture(r)}</button>
                  : <button type="button" className="charOverviewRow charOverviewRow--look" aria-label={`${r.label}: ${r.value}`} title={`${r.label} is chosen in the first step`} onClick={onFigure}>{picture(r)}</button>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
