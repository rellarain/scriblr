import type { ModelContent, ModelObject } from '../../../../api/types'
import { DRAPE_BIG, drapeOf, hasWeights } from './engine/drapeEdit'
import type { DrapeActions } from './rigActions'
import { Stepper } from './Stepper'

// How far the selected object drapes (phase O6), in the Rig tab: its weighted points hang back toward the way they were drawn when the body moves, so a coat's or a skirt's
// hem keeps hanging when the hips tilt. A stepper (no typed numbers); a twin follows its original.
export function DrapeSection({ content, object, actions }: { content: ModelContent; object: ModelObject | undefined; actions: DrapeActions }) {
  const heading = <h3 className="cmInsSub">Drape</h3>
  if (!object) return null
  const name = object.name.trim() || 'the object'
  const value = drapeOf(content, object)
  if (object.mirrorOf) {
    return (
      <section className="cmSec" aria-label="Drape">
        {heading}
        <p className="cmInsText">{name} is a twin: it drapes as its original does ({value}%).</p>
      </section>
    )
  }
  return (
    <section className="cmSec" aria-label="Drape">
      {heading}
      <Stepper label="Drape" value={`${value}%`} bigBy={DRAPE_BIG} lowerOff={value <= 0} raiseOff={value >= 100} onStep={(dir, big) => actions.stepDrape(object.id, dir, big)} />
      <p className="cmInsText">
        {`How far the points of ${name} that carry a weight hang back toward the way they were drawn when the body moves: the hem of a coat or a skirt keeps hanging when the hips tilt. `}
        {hasWeights(content, object) ? 'The points without a weight follow the body.' : 'None of its points carries a weight yet: mark the hem with the Weights tool.'}
      </p>
    </section>
  )
}
