import { useMemo, type CSSProperties, type ReactNode } from 'react'
import type { OutlineNode } from '../../../api/types'
import { bookScopeVars, bookThemeHue } from '../../../theme/bookColors'
import { useThemeState } from '../../../theme/useTheme'

// Re-tints everything inside for one book: the book's theme colour replaces the
// app theme's hue (surfaces, cards, backgrounds) and, when it is set, its accent
// colour replaces the accent hue (buttons, highlights, focus, the chapter paper's
// tint). Saturation and lightness stay the active zone's own, and so do the ink
// and the fills' ink, so text stays readable.
//
// The derived tokens are re-declared for `.wrBookScope` (theme/theme.scss and
// writer.scss), which is what makes the override reach descendants.
export function BookScope({ book, className, flow = false, children }: {
  book: OutlineNode | undefined
  className?: string
  // Lay out as if the wrapper were not there (sidebar panels inside a flex column).
  flow?: boolean
  children: ReactNode
}) {
  const { settings, activeZone, effectiveRole } = useThemeState()
  const palette = settings.zones[activeZone].palette
  const themeHue = book ? bookThemeHue(book) : null
  // The book's secondary colour is required: none stored means its primary hue.
  const accentHue = book ? book.accentHue ?? themeHue : null
  const vars = useMemo(
    () => (themeHue === null ? null : bookScopeVars(palette, activeZone, effectiveRole, themeHue, accentHue)),
    [palette, activeZone, effectiveRole, themeHue, accentHue],
  )
  if (!vars) return className ? <div className={className}>{children}</div> : <>{children}</>
  return (
    <div
      className={`wrBookScope${flow ? ' wrBookScope--flow' : ''}${className ? ` ${className}` : ''}`}
      style={vars as CSSProperties}
    >
      {children}
    </div>
  )
}

export default BookScope
