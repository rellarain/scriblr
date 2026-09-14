import type { ChannelTag, Tone } from '../helperTypes'
import { FrownIcon, MixedFaceIcon, NeutralFaceIcon, ToningIcon } from '../../../icons'

export function isPleasant(tone?: Tone) {
  return tone === 'pleasant' || tone === 'mixed'
}
export function isUnpleasant(tone?: Tone) {
  return tone === 'unpleasant' || tone === 'mixed'
}
export function combineTone(pleasant: boolean, unpleasant: boolean): Tone {
  if (pleasant && unpleasant) return 'mixed'
  if (pleasant) return 'pleasant'
  if (unpleasant) return 'unpleasant'
  return 'neutral'
}

export function ToneStatusIcon({ tone, size }: { tone?: Tone; size?: number }) {
  switch (tone) {
    case 'pleasant': return <ToningIcon size={size ?? 20} />
    case 'unpleasant': return <FrownIcon size={size ?? 20} />
    case 'mixed': return <MixedFaceIcon size={size ?? 20} />
    default: return <NeutralFaceIcon size={size ?? 20} />
  }
}

export const TONE_ORDER: Tone[] = ['pleasant', 'unpleasant', 'mixed', 'neutral']

export function rankTone(order: Tone[], tone?: Tone): number {
  if (!tone) return order.length
  const index = order.indexOf(tone)
  return index === -1 ? order.length : index
}

export function channelTagLabel(tag: ChannelTag): string {
  return `${tag.page} > ${tag.component} > ${tag.feature}`
}

export function sameChannelTag(a: ChannelTag, b: ChannelTag): boolean {
  return a.page === b.page && a.component === b.component && a.feature === b.feature
}
