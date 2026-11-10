import type { ModelContent, ModelHsl, ModelSlot } from '../../../../api/types'
import { ColorRange } from '../../../../components/ColorRange'
import { LockIcon, UnlockIcon } from '../../../icons'
import { paletteOf, resolveColour } from './engine/colour'
import { FREE, LOCK_PARTS, type LockPart } from './engine/locks'
import type { TestState } from './engine/presets'

// The parts of a slot's colour that an object (or a style) holds: for each colour slot it is painted from, its hue, saturation and lightness each locked to one value
// or free. A locked part keeps its value whatever colour is chosen for the slot (a default colour or a swatch of the palette) and whatever the look is rolled to; a
// free part comes from the colour chosen. The sliders show the locked values, and a lock starts from the colour the test character has now.
export interface HslLocksProps {
  content: ModelContent
  state: Pick<TestState, 'colours'>
  slots: ModelSlot[]
  locks: Record<string, ModelHsl> | undefined
  // what holds the locks, for the names of the controls: the object or the style
  owner: string
  onChange: (slotId: string, part: LockPart, value: number | null) => void
}

const label = (name: string, fallback: string) => name.trim() || fallback

export function HslLocks({ content, state, slots, locks, owner, onChange }: HslLocksProps) {
  if (slots.length === 0) return <p className="cmInsText">{owner} is painted from no colour slot, so it has no colour to hold parts of.</p>
  return (
    <div className="cmLocks">
      {slots.map(slot => {
        const slotName = label(slot.name, 'Untitled slot'), lock = locks?.[slot.id] ?? FREE
        const now = resolveColour(slot, state.colours?.[slot.id], paletteOf(content))
        const start: Record<LockPart, number> = { h: Math.round(now.h), s: Math.round(now.s), l: Math.round(now.l) }
        return (
          <div key={slot.id} className="cmLockSlot" role="group" aria-label={`Colour locks of ${slotName} on ${owner}`}>
            <h4 className="cmInsSub">{slotName}</h4>
            {LOCK_PARTS.map(part => {
              const value = lock[part.id], on = value !== null
              const name = `${part.name.toLowerCase()} of ${slotName} on ${owner}`
              return (
                <div key={part.id} className="cmLockRow">
                  <button
                    type="button" className={`cmIconBtn cmIconBtn--small${on ? ' cmIconBtn--on' : ''}`} aria-pressed={on} aria-label={`Lock ${name}`}
                    title={on ? `The ${part.name.toLowerCase()} is locked: it keeps this value whatever colour is chosen or rolled. Press to free it.` : `Lock the ${part.name.toLowerCase()} at its value now, so it stays whatever colour is chosen or rolled`}
                    onClick={() => onChange(slot.id, part.id, on ? null : start[part.id])}
                  >{on ? <LockIcon size={12} /> : <UnlockIcon size={12} />}</button>
                  <span className="cmLockName">{part.name}</span>
                  {on ? (
                    part.id === 'h'
                      ? <ColorRange label={`Locked ${name}`} value={value} min={0} max={359} sat={Math.max(lock.s ?? now.s, 20)} light={Math.min(Math.max(lock.l ?? now.l, 25), 75)} onChange={v => onChange(slot.id, 'h', v)} />
                      : <span className="cmRange"><input type="range" min={0} max={100} value={value} aria-label={`Locked ${name}`} onChange={e => onChange(slot.id, part.id, Number(e.target.value))} /><output>{value}%</output></span>
                  ) : <span className="cmInsText">free</span>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
