import type { ComponentType, CSSProperties } from 'react'
import type { Facet } from '../../../../lib/facets'
import { DraftIcon, FolderIcon, OutlineIcon, PlotIcon, RevisionIcon, type IconProps } from '../../../icons'
import { ICON_PX } from './IconBtn'

// A facet's icon, the same one its level uses, drawn in the facet's own colour. It stands where the facet's name is written beside it (a chip, a
// legend row), so it is hidden from assistive tech; the colour is the console's contrast-checked facet colour.
const FACET_ICON: Record<Facet, ComponentType<IconProps>> = {
  outline: OutlineIcon,
  plot: PlotIcon,
  draft: DraftIcon,
  revision: RevisionIcon,
  project: FolderIcon,
}

export function FacetIcon({ facet, size = ICON_PX }: { facet: Facet; size?: number }) {
  const Icon = FACET_ICON[facet]
  return <span className="wrFacetIcon" aria-hidden="true" style={{ '--facet': `var(--wr-f-${facet})` } as CSSProperties}><Icon size={size} /></span>
}
