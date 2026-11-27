import { useState } from 'react'
import { AID_LIMITS, type StyleAids } from '../styleAids'
import { useStyleAids } from './useStyleAids'

// The Draft's style aids, in its Settings tile: long sentences, repeated words and the reading level, each on or off, kept on this machine
// for every chapter.

// A whole number in the text of a setting; a value outside its limits is put back to the nearest limit when the field is left.
function Count({ label, value, limits, onChange }: { label: string; value: number; limits: readonly [number, number]; onChange: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    const n = Number.parseInt(text ?? '', 10)
    if (Number.isFinite(n)) onChange(Math.min(limits[1], Math.max(limits[0], n)))
    setText(null)
  }
  return (
    <input
      className="wrAidCount" type="number" inputMode="numeric" aria-label={label} min={limits[0]} max={limits[1]}
      value={text ?? String(value)} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit() }}
    />
  )
}

function Aid({ name, on, onToggle, children }: { name: string; on: boolean; onToggle: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="wrAid">
      <label className="wrShowAssigned"><input type="checkbox" role="switch" checked={on} onChange={e => onToggle(e.target.checked)} /><span className="wrAidName">{name}</span></label>
      <span className="wrAidHint">{children}</span>
    </div>
  )
}

export function StyleAidsSettings() {
  const [aids, set] = useStyleAids()
  const toggle = (key: keyof Pick<StyleAids, 'long' | 'repeat' | 'read'>) => (on: boolean) => set({ [key]: on })
  return (
    <section className="wrStyleAids" aria-label="Style aids">
      <span className="wrLabel">Style aids</span>
      <Aid name="Long sentences" on={aids.long} onToggle={toggle('long')}>
        Underline a sentence longer than <Count label="Words in a long sentence" value={aids.longWords} limits={AID_LIMITS.longWords} onChange={n => set({ longWords: n })} /> words.
      </Aid>
      <Aid name="Repeated words" on={aids.repeat} onToggle={toggle('repeat')}>
        Mark a word used again within <Count label="Words apart" value={aids.repeatGap} limits={AID_LIMITS.repeatGap} onChange={n => set({ repeatGap: n })} /> words. Small words (the, and, of) are left out.
      </Aid>
      <Aid name="Readability" on={aids.read} onToggle={toggle('read')}>
        Show each moment&rsquo;s reading level beside its title (for English text).
      </Aid>
      <span className="wrAidHint">Each aid is kept on this machine, for every chapter.</span>
    </section>
  )
}

export default StyleAidsSettings
