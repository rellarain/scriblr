import type { ComponentType } from 'react'
import { FrownIcon, MixedFaceIcon, NeutralFaceIcon, ToningIcon, type IconProps } from '../assets/icons'
import { CATEGORY_LABEL, TONES, TONE_NAME } from './feedbackLogic'
import type { Tone, ToneCategory, ToneSummary } from './feedbackTypes'

// The tone of feedback: a face per tone, the swatch of a category, the bar of a statement's tones and the four faces to pick
// one. Colours: pleasant = the admin accent, unpleasant = the alert colour, neutral = a theme shade (`.fbScope`).

const TONE_ICON: Record<Tone, ComponentType<IconProps>> = {
  pleasant: ToningIcon, unpleasant: FrownIcon, mixed: MixedFaceIcon, neutral: NeutralFaceIcon,
}

export function ToneFace({ tone, size = 14, label }: { tone: Tone; size?: number; label?: string }) {
  const Icon = TONE_ICON[tone]
  return (
    <span className={`toneFaceIcon toneFaceIcon--${tone}`} title={label ?? TONE_NAME[tone]} aria-label={label ?? TONE_NAME[tone]} role="img">
      <Icon size={size} />
    </span>
  )
}

export function ToneSwatch({ category }: { category: ToneCategory | null }) {
  if (!category) return <span className="toneSwatch toneSwatch--none" title="No tone yet" />
  return <span className={`toneSwatch toneSwatch--${category}`} title={CATEGORY_LABEL[category]} aria-label={CATEGORY_LABEL[category]} role="img" />
}

export function ToneBar({ summary }: { summary: ToneSummary }) {
  const total = summary.pleasant + summary.unpleasant + summary.neutral
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`
  const label = summary.category
    ? `${CATEGORY_LABEL[summary.category]}: ${summary.pleasant} pleasant, ${summary.unpleasant} unpleasant, ${summary.neutral} neutral`
    : 'No tone yet'
  return (
    <span className="toneScore" title={label}>
      <ToneSwatch category={summary.category} />
      <span className="toneBar" role="img" aria-label={label}>
        <i className="toneBar-yes" style={{ width: pct(summary.pleasant) }} />
        <i className="toneBar-no" style={{ width: pct(summary.unpleasant) }} />
        <i className="toneBar-mid" style={{ width: pct(summary.neutral) }} />
      </span>
    </span>
  )
}

// Four face buttons, one pressed (or none yet): the tone staff give a message.
export function TonePicker({ value, onChange, label, disabled = false }: {
  value: Tone | null
  onChange: (tone: Tone | null) => void
  label: string
  disabled?: boolean
}) {
  return (
    <div className="toneRow--faces" role="group" aria-label={label}>
      {TONES.map(tone => {
        const Icon = TONE_ICON[tone]
        const on = value === tone
        return (
          <button
            key={tone} type="button" data-cf className={`toneFace toneFace--${tone}${on ? ' toneFace--on' : ''}`}
            aria-pressed={on} aria-label={TONE_NAME[tone]} title={TONE_NAME[tone]} disabled={disabled}
            onClick={() => onChange(tone)}
          >
            <Icon size={16} />
          </button>
        )
      })}
    </div>
  )
}

// How a writer feels about what they send: a smile and a frown, each pressed on its own. Both pressed is mixed; neither is
// nothing said.
export function FeelingPicker({ value, onChange, label }: {
  value: Tone | null
  onChange: (tone: Tone | null) => void
  label: string
}) {
  const happy = value === 'pleasant' || value === 'mixed'
  const unhappy = value === 'unpleasant' || value === 'mixed'
  const toneOf = (h: boolean, u: boolean): Tone | null => (h && u ? 'mixed' : h ? 'pleasant' : u ? 'unpleasant' : null)
  const face = (tone: 'pleasant' | 'unpleasant', on: boolean, next: () => Tone | null) => {
    const Icon = TONE_ICON[tone]
    return (
      <button
        type="button" className={`toneFace toneFace--${tone}${on ? ' toneFace--on' : ''}`}
        aria-pressed={on} aria-label={TONE_NAME[tone]} title={TONE_NAME[tone]} onClick={() => onChange(next())}
      >
        <Icon size={16} />
      </button>
    )
  }
  return (
    <div className="toneRow--faces fbFeelings" role="group" aria-label={label}>
      {face('pleasant', happy, () => toneOf(!happy, unhappy))}
      {face('unpleasant', unhappy, () => toneOf(happy, !unhappy))}
    </div>
  )
}
