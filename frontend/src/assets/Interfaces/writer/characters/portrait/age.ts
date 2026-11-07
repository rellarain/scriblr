import type { CharacterPortrait } from '../../../../../api/types'
import { AGES, AUTO_GREY } from './library'
import { greyAmount } from './scene'

// Age a portrait to another age: the age moves, a child has no beard, and a hair greying that was set by hand is given back to the age when the new age would look wrong with it
// (younger than the greying says, or older with less grey than the age brings). The author chooses whether to keep the result; nothing is stored here.

const indexOf = (age: string) => AGES.findIndex(a => a.id === age)
const BEARDED_FROM = indexOf('teen')

export function agePortrait(p: CharacterPortrait, age: string): CharacterPortrait {
  const to = indexOf(age)
  if (to < 0 || age === p.age) return p
  const from = indexOf(p.age)
  const next: CharacterPortrait = { ...p, age }
  if (to < BEARDED_FROM) next.facialHair = 'none'
  if (next.greying !== 'auto') {
    const auto = AUTO_GREY[age] || 0
    const amount = greyAmount(next)
    if ((to > from && amount < auto) || (to < from && amount > auto + 0.2)) next.greying = 'auto'
  }
  return next
}
