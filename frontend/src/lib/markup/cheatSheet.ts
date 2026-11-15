// The cheat sheet of the markup editor: every marker, what it makes and a line to copy. Shown in the editor's cheat sheet, drawn with the
// markup itself beside each example.

export interface CheatEntry { group: 'Headings' | 'Lists' | 'Text' | 'Knowledge checks'; example: string; meaning: string }

export const CHEAT_SHEET: CheatEntry[] = [
  { group: 'Headings', example: '###### Largest heading', meaning: 'Largest, bolder, underlined' },
  { group: 'Headings', example: '##### Large heading', meaning: 'Largest, bolder' },
  { group: 'Headings', example: '#### Heading', meaning: 'Larger, bolder, underlined' },
  { group: 'Headings', example: '### Heading', meaning: 'Larger, bolder' },
  { group: 'Headings', example: '## Small heading', meaning: 'Bold, underlined' },
  { group: 'Headings', example: '# Smallest heading', meaning: 'Bold' },
  { group: 'Lists', example: '> A dot', meaning: 'A dot bullet' },
  { group: 'Lists', example: '>> A number', meaning: 'Numbered 1, 2, 3' },
  { group: 'Lists', example: '>>> A ring', meaning: 'An indented ring' },
  { group: 'Lists', example: '>>>> A sub-number', meaning: 'Numbered 1.1 under the >> above' },
  { group: 'Text', example: '***Bold italic***, **bold**, *italic*', meaning: 'Bold italic, bold, italic' },
  { group: 'Text', example: '" A quote', meaning: 'A quote; lines together are one quote' },
  { group: 'Text', example: '\\*Not italic\\*', meaning: 'A backslash shows a marker as typed' },
  { group: 'Knowledge checks', example: '???? A question', meaning: 'A question' },
  { group: 'Knowledge checks', example: '???! A hint', meaning: 'A hint, one per press of Hint' },
  { group: 'Knowledge checks', example: '??! A right checkbox', meaning: 'A checkbox that should be ticked' },
  { group: 'Knowledge checks', example: '??? A wrong checkbox', meaning: 'A checkbox that should not be ticked' },
  { group: 'Knowledge checks', example: '?!! Why it is so', meaning: 'Explains the checkbox above' },
  { group: 'Knowledge checks', example: '?! The right choice', meaning: 'The one right choice' },
  { group: 'Knowledge checks', example: '?? A wrong choice', meaning: 'A wrong choice' },
  { group: 'Knowledge checks', example: '!! Why it is so', meaning: 'Explains the choice above' },
  { group: 'Knowledge checks', example: '? Type it here', meaning: 'A text field and its placeholder' },
  { group: 'Knowledge checks', example: '! An accepted answer', meaning: 'An answer the text field takes' },
]
