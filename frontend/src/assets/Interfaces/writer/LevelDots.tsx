// The small circles at the top right of a tree of cards (the Plot contents, the plotline editor's Outline): one for each level that can
// fold, left to right, and after them one that shows each card's description. A level's circle is lit while any card of the level is open (a
// click closes them all) and an outline when they are all closed (a click opens them all); it is dimmed when no card of the level has anything
// under it. The description circle stands apart from them, filled in the alert hue while the descriptions are shown, and is dimmed when none has one.

export interface LevelDot {
  key: string
  // The level in the plural, as the circle's label names it ("Collapse all categories").
  plural: string
  // How many cards of the level can fold, and whether any of them is open.
  foldable: number
  open: boolean
  onClick: () => void
}

export function LevelDots({ groupLabel, levels, desc }: {
  groupLabel: string
  levels: LevelDot[]
  // `noun` is what the circle shows or hides ("full descriptions", "synopses").
  desc: { on: boolean; disabled: boolean; noun: string; onClick: () => void }
}) {
  const descLabel = desc.on ? `Hide ${desc.noun}` : `Show ${desc.noun}`
  return (
    <div className="wrNavTools">
      <div className="wrNavDots" role="group" aria-label={groupLabel}>
        {levels.map(level => {
          const label = level.open ? `Collapse all ${level.plural}` : `Expand all ${level.plural}`
          return (
            <button
              key={level.key} type="button" className={level.open ? 'wrNavDot wrNavDot--on' : 'wrNavDot'} disabled={level.foldable === 0}
              aria-label={label} aria-pressed={level.open} title={label} onClick={level.onClick}
            />
          )
        })}
      </div>
      <button
        type="button" className={desc.on ? 'wrNavDot wrNavDot--desc wrNavDot--on' : 'wrNavDot wrNavDot--desc'} disabled={desc.disabled}
        aria-label={descLabel} aria-pressed={desc.on} title={descLabel} onClick={desc.onClick}
      />
    </div>
  )
}
