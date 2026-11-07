import type { CharacterPortrait, CharacterProfile } from '../../../../api/types'
import { Portrait } from './portrait/Portrait'

// The role and the age of a character as the line under their portrait ("Navigator · age 29"; empty when neither is written).
export function roleAge(profile: CharacterProfile): string {
  return [profile.role, profile.age && `age ${profile.age}`].filter(Boolean).join(' · ')
}

// A portrait card: the portrait on its tile, and under it the name and a small line (the role and the age). It is only spans, so it can sit inside a button. The text is on the
// surface beside the tile, never on it, so it keeps the contrast of every other text.
export function PortraitCard({ portrait, name, caption, label = '', className = 'charPortraitCard' }: {
  portrait: CharacterPortrait | null | undefined; name: string; caption?: string; label?: string; className?: string
}) {
  return (
    <span className={className}>
      <Portrait portrait={portrait} label={label} className="charPortraitArt" />
      <span className="charCardName">{name}</span>
      {caption !== undefined && <span className="charCaption">{caption || ' '}</span>}
    </span>
  )
}
