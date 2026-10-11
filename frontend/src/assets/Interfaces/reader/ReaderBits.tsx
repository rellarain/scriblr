import type { CSSProperties, ReactNode } from 'react'
import type { CatalogBook } from '../../../api/reader'
import { fillColorCss } from '../../../theme/bookColors'

// Small pieces the consoles share.

export const Meter = ({ percent, accent = false, label }: { percent: number; accent?: boolean; label?: string }) => (
  <span className="rdMeter" role="img" aria-label={label ?? `${Math.round(percent)}%`}>
    <i className={accent ? 'rdMeterFill rdMeterFill--accent' : 'rdMeterFill'} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
  </span>
)

export const Chip = ({ children, on = false, title }: { children: ReactNode; on?: boolean; title?: string }) => (
  <span className={on ? 'rdChip rdChip--on' : 'rdChip'} title={title}>{children}</span>
)

export const Stat = ({ value, label }: { value: ReactNode; label: string }) => (
  <div className="rdCard rdStat"><b>{value}</b><span className="rdMuted">{label}</span></div>
)

export const Card = ({ title, Icon, children, className }: { title?: ReactNode; Icon?: (p: { size?: number }) => ReactNode; children: ReactNode; className?: string }) => (
  <div className={className ? `rdCard ${className}` : 'rdCard'}>
    {title && <h3 className="rdCardTitle">{Icon && <Icon size={16} />}{title}</h3>}
    {children}
  </div>
)

// A cover: the book's own colour with its title, type and author, on the page's serif.
export function CoverBlock({ book, ratio = '2 / 3' }: { book: CatalogBook; ratio?: string }) {
  const style = { background: fillColorCss(book.hue), aspectRatio: ratio } as CSSProperties
  return (
    <div className="rdCover" style={style} aria-hidden="true">
      <span>{book.type}</span>
      <b>{book.title}</b>
      <span>{book.authorName}</span>
    </div>
  )
}
