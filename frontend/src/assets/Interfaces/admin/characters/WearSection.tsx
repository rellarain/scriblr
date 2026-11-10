import type { ModelContent, ModelObject } from '../../../../api/types'
import { LIMITS } from './engine/limits'
import { coveringObjects, underChoices, wornUnder } from './engine/wear'
import type { WearActions } from './rigActions'

// What the selected object is worn under (phase 6b), in the Rig tab: the garments or families whose outlines trim it while they are shown, so a shirt does not show outside a jacket
// and underwear does not show outside the clothes. With none of them shown it is drawn whole. A twin follows its original, and a member of a class with no list of its own follows
// the template's.
export function WearSection({ content, object, actions }: { content: ModelContent; object: ModelObject | undefined; actions: WearActions }) {
  const heading = <h3 className="cmInsSub">Worn under</h3>
  if (!object) return <section className="cmSec" aria-label="Worn under">{heading}<p className="cmInsText">Select an object to choose what it is worn under.</p></section>
  const name = object.name.trim() || 'the object'
  if (object.mirrorOf) {
    const original = content.objects.find(o => o.id === object.mirrorOf)
    const names = coveringObjects(content, object).map(o => o.name.trim() || 'Untitled object')
    return (
      <section className="cmSec" aria-label="Worn under">
        {heading}
        <p className="cmInsText">{name} is a twin: it is worn under what {original?.name.trim() || 'its original'} is worn under{names.length > 0 ? ` (${names.join(', ')})` : ''}, on its own side.</p>
      </section>
    )
  }
  const own = object.under ?? []
  const inherited = own.length === 0 && wornUnder(content, object).length > 0
  const choices = underChoices(content, object.id)
  // what it names that is no longer a choice (a body object, or a twin) stays visible so it can be taken off
  const known = new Set(choices.map(c => c.id))
  const stray = own.filter(id => !known.has(id)).map(id => ({ id, name: content.objects.find(o => o.id === id)?.name.trim() || content.classes?.find(k => k.id === id)?.name.trim() || '(gone)', family: !!content.classes?.some(k => k.id === id) }))
  const all = [...choices, ...stray]
  return (
    <section className="cmSec" aria-label="Worn under">
      {heading}
      {all.length === 0 ? (
        <p className="cmInsText">There is no other clothing to be worn under yet: give another object the Clothing layer.</p>
      ) : (
        <div className="cmChips" role="group" aria-label={`What ${name} is worn under`}>
          {all.map(c => {
            const on = own.includes(c.id)
            return (
              <button key={c.id} type="button" className={`cmChip cmChip--wide${on ? ' cmChip--on' : ''}`} aria-pressed={on}
                title={on ? `Stop trimming ${name} to ${c.name}` : `Trim ${name} to the outline of ${c.name} while it is shown`} onClick={() => actions.toggleUnder(object.id, c.id)}>
                {c.name}{c.family ? ' (family)' : ''}
              </button>
            )
          })}
        </div>
      )}
      <p className="cmInsText">
        {inherited
          ? `${name} follows its pattern: it is worn under what the pattern is. Choose a garment to give it a list of its own.`
          : `${name} is drawn only inside the outlines of what it is worn under while they are shown (a shirt does not show outside a jacket). Cut-outs are ignored, so an open neckline still shows what is under it. With none shown it is drawn whole.`}
        {` ${own.length} of ${LIMITS.underMax}.`}
      </p>
    </section>
  )
}
