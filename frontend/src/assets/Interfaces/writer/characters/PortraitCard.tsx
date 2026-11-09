import type { CharacterFigure, CharacterPortrait, CharacterProfile, FigureModel } from '../../../../api/types'
import { CharacterArt } from './figure/CharacterArt'

// The role and the age of a character as the line under their portrait ("Navigator · age 29"; empty when neither is written).
export function roleAge(profile: CharacterProfile): string {
  return [profile.role, profile.age && `age ${profile.age}`].filter(Boolean).join(' · ')
}

// A portrait card: the character's picture on its tile (the figure when it has one, else the portrait), and under it the name and a small line (the role and the age). It is
// only spans, so it can sit inside a button. The text is on the surface beside the tile, never on it, so it keeps the contrast of every other text. A figure is shown as a bust
// (the model's bust frame) unless `crop` is "card", the whole figure (the big card of the Portrait section).
export function PortraitCard({ portrait, figure, copies, name, caption, label = '', className = 'charPortraitCard', crop = 'bust' }: {
  portrait: CharacterPortrait | null | undefined; figure?: CharacterFigure | null; copies?: Record<string, FigureModel> | null; name: string; caption?: string; label?: string; className?: string
  crop?: 'bust' | 'card'
}) {
  return (
    <span className={className}>
      <CharacterArt portrait={portrait} figure={figure} copies={copies} crop={crop} label={label} className="charPortraitArt" />
      <span className="charCardName">{name}</span>
      {caption !== undefined && <span className="charCaption">{caption || ' '}</span>}
    </span>
  )
}
