import type { ReactNode } from 'react'
import { ChevronDownIcon, ChevronRightIcon, PencilIcon } from '../../../icons'

// The pieces a chapter or arc card is headed with, shared by the Outline level's contents (OutlineNav) and the Draft level's chapter
// tile: the number badge, the line of counts and the header row itself.

// The number, underlined in the node's own colour (the stripe colour the card sets as --wr-node-accent). Where nothing near it says
// what is numbered, `label` does ("Chapter 1").
export function NumberBadge({ n, label }: { n: number; label?: string }) {
  return label ? <span className="wrNumBadge" role="img" aria-label={label}>{n}</span> : <span className="wrNumBadge">{n}</span>
}

// What a card holds, in one line: "1 act · 2 scenes · 12 words".
export function StatsLine({ items }: { items: string[] }) {
  return (
    <div className="wrNodeStats">
      {items.map(item => <span key={item}>{item}</span>)}
    </div>
  )
}

// One row: a grip, the number, the title, then the card's tools at the right. The title is the input it is edited in (an open card), or,
// on a card that is not open, a button that opens it (its title is only text there).
export function CardHeader({ grip, number, title, onTitle, label, placeholder, pick, write, toggle }: {
  grip?: ReactNode
  number: number
  title: string
  onTitle: (title: string) => void
  // The input's name and its placeholder.
  label: string
  placeholder: string
  // Given on a card that is not open: its button's name, what it reads when it has no title, and what it does.
  pick?: { label: string; untitled: string; onClick: () => void }
  // The Write pencil: opens the chapter in the Draft level.
  write?: { label: string; onClick: () => void }
  // The fold chevron at the top right: what the card is ("chapter" or "arc"), and whether its contents show.
  toggle?: { kind: string; open: boolean; onClick: () => void }
}) {
  const shown = title.trim()
  const verb = toggle?.open ? 'Collapse' : 'Expand'
  return (
    <div className="wrCardHead">
      {grip}
      <NumberBadge n={number} />
      {pick ? (
        <button type="button" className="wrCardTitleBtn" aria-label={pick.label} title={shown || pick.untitled} onClick={pick.onClick}>
          {shown || pick.untitled}
        </button>
      ) : (
        <input
          className="wrCardTitleInput" placeholder={placeholder} value={title} data-kf="" aria-label={label}
          onChange={e => onTitle(e.target.value)}
        />
      )}
      {write && (
        <button type="button" className="wrIconBtn wrIconBtn--light" title="Write" aria-label={write.label} onClick={write.onClick}>
          <PencilIcon size={15} />
        </button>
      )}
      {toggle && (
        <button
          type="button" className="wrIconBtn wrIconBtn--light" aria-expanded={toggle.open}
          aria-label={`${verb} ${toggle.kind} ${number}`} title={`${verb} the ${toggle.kind}`} onClick={toggle.onClick}
        >
          {toggle.open ? <ChevronDownIcon size={15} /> : <ChevronRightIcon size={15} />}
        </button>
      )}
    </div>
  )
}
