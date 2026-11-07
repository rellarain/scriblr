import type { CharacterPortrait } from '../../../../../api/types'

// A portrait as it is drawn: the colours that follow others are settled (the brows and the facial hair take the hair's colour, the lips a natural one from the skin), and the
// hair colour is already greyed for the age. The drawing code works on this, so it never meets a null colour.
export type Drawn = Omit<CharacterPortrait, 'browColor' | 'lipColor' | 'facialHairColor'> & { browColor: string; lipColor: string; facialHairColor: string }
