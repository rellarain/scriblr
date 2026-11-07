import { useMemo, useState } from 'react'
import type { CharacterDoc } from '../../../../api/types'
import { CharacterArt } from './art/CharacterArt'
import { AGE_RANGE, ageLook } from './age'
import { Slider } from './CharFields'
import { appearanceText } from './describe'
import { lookDiff } from './story'
import type { Characters } from './useCharacters'

// The cast as a whole: every character at a glance, two characters side by side (heights compared on one scale, with what differs in how they look and who they are), and
// a tool to age the open character up or down.
export function CastSection({ c, cast, doc, onOpen }: { c: Characters; cast: CharacterDoc[]; doc: CharacterDoc; onOpen: (id: string) => void }) {
  return (
    <div className="charSheet">
      <Overview cast={cast} openId={doc.id} onOpen={onOpen} />
      <Compare cast={cast} openId={doc.id} />
      <Age c={c} doc={doc} />
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
              <CharacterArt look={d.look} mode="closeup" label="" className="charArt" frame="fixed" />
              <span className="charCardName">{d.name}</span>
              <span className="charCaption">{[d.profile.role, d.profile.age && `age ${d.profile.age}`].filter(Boolean).join(' · ') || ' '}</span>
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
  const diffs = useMemo(() => (left && right ? lookDiff(left.look, right.look) : []), [left, right])
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
                <CharacterArt look={d.look} mode="full" label={`${d.name}, full body`} className="charArt" frame="fixed" />
                <figcaption className="charCaption">{d.name}</figcaption>
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
  const [years, setYears] = useState(0)
  const aged = useMemo(() => ageLook(doc.look, years), [doc.look, years])
  const label = years === 0 ? 'As they are' : years > 0 ? `${years} years older` : `${-years} years younger`
  return (
    <section className="charPanel charWide" aria-label="Age">
      <h3 className="charPanelTitle">Age {doc.name} up or down</h3>
      <Slider label="Years" value={years} min={AGE_RANGE.min} max={AGE_RANGE.max} step={AGE_RANGE.step} onChange={setYears} format={v => (v > 0 ? `+${v}` : String(v))} />
      <div className="charCompare">
        <figure className="charCompareItem">
          <CharacterArt look={aged} mode="closeup" label={`${doc.name}, ${label}`} className="charArt" frame="fixed" />
          <figcaption className="charCaption">{label}</figcaption>
        </figure>
        <figure className="charCompareItem">
          <CharacterArt look={aged} mode="full" label={`${doc.name}, ${label}, full body`} className="charArt" frame="fixed" />
        </figure>
      </div>
      <div className="charRow">
        <button type="button" className="charChip" disabled={years === 0} onClick={() => { c.setLook(aged); setYears(0) }}>Change {doc.name} to this</button>
        <button type="button" className="charChip" disabled={years === 0} onClick={() => { void c.create(`${doc.name}, ${label}`.slice(0, 120), aged) }}>Make a copy at this age</button>
      </div>
    </section>
  )
}
