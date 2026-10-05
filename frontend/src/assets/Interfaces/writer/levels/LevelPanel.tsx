import type { CSSProperties, ReactNode } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '../../../icons'
import { fillColorCss, hueOfCode, isLightColor, themeColorCss } from '../../../../theme/bookColors'
import type { Level, LevelSize } from './levelSizes'

// One tinted level of the Writer frame. Its header strip is how it changes size:
// clicking a Min level's strip opens it to Mid, the title promotes it to the focus
// (Max), and the chevron toggles Min/Mid. The focused (Max) level just shows its title.
function LevelPanel({ level, size, title, hue, tint, fill, onPromote, onSetSize, locked = false, headerless = false, headerExtras, className, minBody, children }: {
  level: Level
  size: Exclude<LevelSize, 'hidden'>
  title: string
  // The level's hue (0-360) tinting the panel; none = the app theme's own.
  hue?: number
  // The tint as CSS, when the colour code alone cannot say it (a stop of the parent needs the parent's hue).
  tint?: string
  // The flat fill of the panel as CSS (the colour at the accent's saturation and lightness), likewise.
  fill?: string
  onPromote: () => void
  onSetSize: (size: 'min' | 'mid') => void
  // No Min/Mid toggle (the project shelves beside the Dash have only one size).
  locked?: boolean
  // No header strip: the body brings its own (the Draft level's chapter tile, the Outline book editor).
  headerless?: boolean
  // The level's tab strip and quick actions, in its header between the title and the size toggle.
  headerExtras?: ReactNode
  className?: string
  // What a Min level shows under its header strip (the book spines, say).
  minBody?: ReactNode
  children?: ReactNode
}) {
  const isMin = size === 'min'
  const canToggle = size !== 'max' && !locked
  return (
    <section
      className={`wrLevel wrLevel--${level} wrLevel--${size}${className ? ` ${className}` : ''}`}
      aria-label={`${title} (${size})`} data-level={level} data-size={size}
      // The fill is held dark enough for white text (a lighter-brightness level has a pale fill instead, with dark text), whatever the
      // zone's own accent: the text on a level is set here, not taken from the zone's on-accent. The Draft level is paper.
      style={{
        ...(hue != null ? { '--wr-level-h': hueOfCode(hue), '--wr-level-tint': tint ?? themeColorCss(hue), '--wr-level-fill': fill ?? fillColorCss(hue) } : {}),
        ...(level !== 'draft' ? { '--on-accent': hue != null && isLightColor(hue) ? '#17120f' : '#ffffff' } : {}),
      } as CSSProperties}
    >
      {!headerless && <div
        className={isMin && !locked ? 'wrLevelHeader wrLevelHeader--min' : 'wrLevelHeader'}
        onClick={isMin && !locked ? () => onSetSize('mid') : undefined}
      >
        {size === 'max' || locked
          ? <h2 className="wrLevelTitle">{title}</h2>
          : (
            <button type="button" className="wrLevelTitle wrLevelTitle--link" title={`Open ${title}`} onClick={e => { e.stopPropagation(); onPromote() }}>
              {title}
            </button>
          )}
        {headerExtras}
        {canToggle && (
          <button
            type="button" className="wrLevelToggle"
            aria-label={isMin ? `Expand ${title}` : `Minimize ${title}`}
            onClick={e => { e.stopPropagation(); onSetSize(isMin ? 'mid' : 'min') }}
          >
            {isMin ? <ChevronRightIcon size={14} /> : <ChevronDownIcon size={14} />}
          </button>
        )}
      </div>}
      {isMin ? minBody : <div className="wrLevelBody">{children}</div>}
    </section>
  )
}

export default LevelPanel
