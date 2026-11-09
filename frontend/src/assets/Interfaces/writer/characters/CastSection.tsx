import { useMemo, useState } from 'react'
import type { CharacterDoc } from '../../../../api/types'
import { appearanceText } from './describe'
import { CharacterArt } from './figure/CharacterArt'
import { useFigureCopy } from './figure/figureModelStore'
import { agePresets, ageOf, atAge, describeFigure, figureDiff } from './figure/figureState'
import { PortraitCard, roleAge } from './PortraitCard'
import { PreviewSelect } from './PreviewSelect'
import { agePortrait } from './portrait/age'
import { AGES } from './portrait/library'
import { portraitDiff } from './portrait/diff'
import { Portrait } from './portrait/Portrait'
import { optionName } from './portrait/registry'
import type { Characters } from './useCharacters'

// The cast as a whole: every character at a glance, two characters side by side (with what differs in how they look and who they are), and a tool to show the open character
// at another age.
export function CastSection({ c, cast, doc, onOpen }: { c: Characters; cast: CharacterDoc[]; doc: CharacterDoc; onOpen: (id: string) => void }) {
  return (
    <div className="charSheet">
      <Overview cast={cast} openId={doc.id} onOpen={onOpen} />
      <Compare cast={cast} openId={doc.id} />
      <Age key={doc.id} c={c} doc={doc} />
    </div>
  )
}

// A text cut at a space to at most `max` characters, with an ellipsis when something was left out.
const shortText = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, '')}…`)

function Overview({ cast, openId, onOpen }: { cast: CharacterDoc[]; openId: string; onOpen: (id: string) => void }) {
  return (
    <section className="charPanel charWide" aria-label="Cast overview">
      <h3 className="charPanelTitle">The cast</h3>
      <ul className="charOverview">
        {cast.map(d => (
          <li key={d.id}>
            <button type="button" className="charCard" aria-pressed={d.id === openId} aria-label={`Open ${d.name}`} onClick={() => onOpen(d.id)}>
              <PortraitCard portrait={d.portrait} figure={d.figure} name={d.name} caption={roleAge(d.profile)} />
              {appearanceText(d.profile) && <span className="charCardText">{shortText(appearanceText(d.profile), 110)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Compare({ cast, openId }: { cast: CharacterDoc[]; openId: string }) {
  const [a, setA] = useState(openId)
  const [b, setB] = useState('')
  const left = cast.find(x => x.id === a) ?? cast[0]
  const right = cast.find(x => x.id === b && x.id !== left?.id) ?? cast.find(x => x.id !== left?.id)
  const leftCopy = useFigureCopy(left?.figure?.model), rightCopy = useFigureCopy(right?.figure?.model)
  // Two figures differ by what they are (the age, the forms, the colours); two portraits as before; one of each are drawn differently, and that is all that can be said.
  const diffs = useMemo(() => {
    if (!left || !right) return []
    if (left.figure && right.figure) return leftCopy && rightCopy ? figureDiff(describeFigure(leftCopy.content, left.figure), describeFigure(rightCopy.content, right.figure)) : []
    if (left.figure || right.figure) return ['One is drawn as a mannequin and the other as a portrait.']
    return portraitDiff(left.portrait, right.portrait)
  }, [left, right, leftCopy, rightCopy])
  const who = left && right ? (['role', 'age', 'occupation', 'height', 'build', 'skin', 'hair', 'eyes'] as const).filter(k => left.profile[k] !== right.profile[k]).map(k => `${k[0].toUpperCase()}${k.slice(1)}: ${left.profile[k] || 'none'} > ${right.profile[k] || 'none'}`) : []
  return (
    <section className="charPanel charWide" aria-label="Compare two characters">
      <h3 className="charPanelTitle">Compare</h3>
      {cast.length < 2 ? <p className="charHint">Make a second character to compare.</p> : (
        <>
          <div className="charRow">
            <select className="charSelect charSelect--auto" aria-label="First character" value={left?.id ?? ''} onChange={e => setA(e.target.value)}>{cast.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <span aria-hidden="true">and</span>
            <select className="charSelect charSelect--auto" aria-label="Second character" value={right?.id ?? ''} onChange={e => setB(e.target.value)}>{cast.filter(x => x.id !== left?.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </div>
          <div className="charCompare">
            {[left, right].map(d => d && (
              <figure key={d.id} className="charCompareItem">
                <PortraitCard portrait={d.portrait} figure={d.figure} name={d.name} caption={roleAge(d.profile)} label={`${d.name}, ${d.figure ? 'figure' : 'portrait'}`} />
                {appearanceText(d.profile) && <p className="charHint">{shortText(appearanceText(d.profile), 220)}</p>}
              </figure>
            ))}
          </div>
          <div className="charDiffs" aria-label="What differs">
            {diffs.length + who.length === 0 ? <p className="charHint">They look and read the same.</p> : <ul>{[...who, ...diffs].map(line => <li key={line}>{line}</li>)}</ul>}
          </div>
        </>
      )}
    </section>
  )
}

function Age({ c, doc }: { c: Characters; doc: CharacterDoc }) {
  return doc.figure ? <FigureAge c={c} doc={doc} /> : <PortraitAge c={c} doc={doc} />
}

// The same for a character with a figure: the ages are the model's own presets of the kind Age. A model with none has nothing to choose from.
function FigureAge({ c, doc }: { c: Characters; doc: CharacterDoc }) {
  const figure = doc.figure!
  const copy = useFigureCopy(figure.model)?.content
  const ages = useMemo(() => (copy ? agePresets(copy) : []), [copy])
  const now = copy ? ageOf(copy, figure) : undefined
  const [age, setAge] = useState(now?.id ?? '')
  const chosen = ages.find(a => a.id === age) ?? ages[0]
  const aged = copy && chosen ? atAge(copy, figure, chosen.id) : figure
  const same = !chosen || aged === figure || (!!now && chosen.id === now.id)
  const stage = chosen?.name ?? ''
  if (!copy || ages.length === 0) {
    return (
      <section className="charPanel charWide" aria-label="Age">
        <h3 className="charPanelTitle">Show {doc.name} at another age</h3>
        <p className="charHint">{copy ? 'This model has no ages to choose from.' : 'The model is loading.'}</p>
      </section>
    )
  }
  return (
    <section className="charPanel charWide" aria-label="Age">
      <h3 className="charPanelTitle">Show {doc.name} at another age</h3>
      <PreviewSelect
        label={`Show ${doc.name} as`} options={ages} value={chosen?.id ?? ''} onChange={setAge}
        thumb={o => <CharacterArt portrait={doc.portrait} figure={atAge(copy, figure, o.id)} crop="head" label="" className="charPickArt" />}
      />
      <div className="charCompare">
        <figure className="charCompareItem">
          <PortraitCard portrait={doc.portrait} figure={figure} name={doc.name} caption="As they are" label={`${doc.name}, as they are`} />
        </figure>
        <figure className="charCompareItem">
          <PortraitCard portrait={doc.portrait} figure={aged} name={doc.name} caption={same ? 'The same age' : stage} label={`${doc.name}, ${stage.toLowerCase()}`} />
        </figure>
      </div>
      <div className="charRow">
        <button type="button" className="charChip" disabled={same} onClick={() => { c.setFigure(aged); setAge(chosen?.id ?? '') }}>Change {doc.name} to this</button>
        <button type="button" className="charChip" disabled={same} onClick={() => { void c.create(`${doc.name}, ${stage.toLowerCase()}`.slice(0, 120), { portrait: doc.portrait, figure: aged, look: doc.look }) }}>Make a copy at this age</button>
      </div>
    </section>
  )
}

function PortraitAge({ c, doc }: { c: Characters; doc: CharacterDoc }) {
  const [age, setAge] = useState(doc.portrait.age)
  const aged = useMemo(() => agePortrait(doc.portrait, age), [doc.portrait, age])
  const same = aged.age === doc.portrait.age
  const stage = optionName('age', age)
  return (
    <section className="charPanel charWide" aria-label="Age">
      <h3 className="charPanelTitle">Show {doc.name} at another age</h3>
      <PreviewSelect
        label={`Show ${doc.name} as`} options={AGES} value={age} onChange={setAge}
        thumb={o => <Portrait portrait={agePortrait(doc.portrait, o.id)} crop="face" label="" className="charPickArt" />}
      />
      <div className="charCompare">
        <figure className="charCompareItem">
          <PortraitCard portrait={doc.portrait} name={doc.name} caption="As they are" label={`${doc.name}, as they are`} />
        </figure>
        <figure className="charCompareItem">
          <PortraitCard portrait={aged} name={doc.name} caption={same ? 'The same age' : stage} label={`${doc.name}, ${stage.toLowerCase()}`} />
        </figure>
      </div>
      <div className="charRow">
        <button type="button" className="charChip" disabled={same} onClick={() => { c.setPortrait(aged); setAge(aged.age) }}>Change {doc.name} to this</button>
        <button type="button" className="charChip" disabled={same} onClick={() => { void c.create(`${doc.name}, ${stage.toLowerCase()}`.slice(0, 120), { portrait: aged, look: doc.look }) }}>Make a copy at this age</button>
      </div>
    </section>
  )
}
