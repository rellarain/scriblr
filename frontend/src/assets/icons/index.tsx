import type { ReactNode } from 'react'

export interface IconProps {
  size?: number
  className?: string
}

function IconBase({ size = 21, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

export function UserIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </IconBase>
}

export function BookFaceIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <path d="M8 3v18" strokeWidth={2.6} />
    <path d="M14 3v8l2.5-2.5 2.5 2.5v-8" />
  </IconBase>
}

export function PencilIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M4 20l1-5L16 4l4 4L9 19l-5 1Z" />
    <path d="M14 6l4 4" />
  </IconBase>
}

export function ShieldIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
  </IconBase>
}

export function GlobeIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18" />
    <path d="M12 3a14 14 0 0 0 0 18" />
  </IconBase>
}

export function SwapIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M4 8h13M13 4l4 4-4 4" />
    <path d="M20 16H7M11 12l-4 4 4 4" />
  </IconBase>
}

export function BriefcaseIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="3" y="7" width="18" height="12" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
  </IconBase>
}

export function CloseIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </IconBase>
}

export function GraduationCapIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M2 9l10-5 10 5-10 5-10-5Z" />
    <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
    <path d="M22 9v6" />
  </IconBase>
}

export function LockIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" strokeWidth={2.6} />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeWidth={2.6} />
  </IconBase>
}

export function UnlockIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" strokeWidth={2.6} />
    <path d="M8 11V7a4 4 0 0 1 7.5-2" strokeWidth={2.6} />
  </IconBase>
}

export function ChatBubblesIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="3" y="4" width="13" height="9" rx="2" fill="currentColor" stroke="none" />
    <rect x="8" y="9" width="13" height="9" rx="2" />
  </IconBase>
}

export function WrenchIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-3 3-2-2 3-3Z" />
  </IconBase>
}

export function BarChartIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="4" y="14" width="4" height="7" />
    <rect x="10" y="9" width="4" height="12" />
    <rect x="16" y="4" width="4" height="17" />
  </IconBase>
}

export function InboxIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M4 4h16l2 8v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7L4 4Z" />
    <path d="M2 12h5l2 3h6l2-3h5" />
  </IconBase>
}

// A hexagon, not a literal gear -- IconBase's shared strokeLinejoin="round"
// rounds its corners automatically, no separate arc path needed.
export function GearIcon(props: IconProps) {
  return <IconBase {...props}>
    <polygon points="12,2 20.66,7 20.66,17 12,22 3.34,17 3.34,7" strokeWidth={3.6} />
    <circle cx="12" cy="12" r="6" strokeWidth={3.6} />
  </IconBase>
}

// Three gears at different sizes (same hexagon+circle motif as GearIcon,
// just repeated) arranged like a gearbox -- the big gear meshing with a
// smaller one tucked against each side of it, all just touching, never
// overlapping -- rather than spread apart, so it reads as distinct from
// the plain single-gear Settings icon used everywhere else.
export function ConfigurationIcon(props: IconProps) {
  return <IconBase {...props}>
    <polygon points="8,5 13.2,8 13.2,14 8,17 2.8,14 2.8,8" strokeWidth={2} />
    <circle cx="8" cy="11" r="3.6" strokeWidth={2} />
    <polygon points="17.11,14.65 20.57,16.65 20.57,20.65 17.11,22.65 13.65,20.65 13.65,16.65" strokeWidth={1.5} />
    <circle cx="17.11" cy="18.65" r="2.4" strokeWidth={1.5} />
    <polygon points="15.89,1.58 18.31,2.98 18.31,5.78 15.89,7.18 13.47,5.78 13.47,2.98" strokeWidth={1} />
    <circle cx="15.89" cy="4.38" r="1.68" strokeWidth={1} />
  </IconBase>
}

export function PeopleIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="8" r="3" />
    <path d="M3 20v-1a6 6 0 0 1 6-6 6 6 0 0 1 6 6v1" />
    <path d="M15 13.5A6 6 0 0 1 21 19v1" />
  </IconBase>
}

export function ToningIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 10h.01M16 10h.01" />
    <path d="M8 14q4 4 8 0" />
  </IconBase>
}

export function FrownIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 10h.01M16 10h.01" />
    <path d="M8 16q4 -4 8 0" />
  </IconBase>
}

export function MixedFaceIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 10h.01M16 10h.01" />
    <path d="M8 14l8 2" />
  </IconBase>
}

export function NeutralFaceIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 10h.01M16 10h.01" />
    <path d="M8 15h8" />
  </IconBase>
}

export function SortingIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z" />
  </IconBase>
}

export function ExplicatingIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </IconBase>
}

export function VotingIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M1 7l2 2.5L9 3" />
    <path d="M13 3l8 7M21 3l-8 7" />
    <text x="5" y="21" fontSize="12" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle">{'&'}</text>
    <text x="17" y="21" fontSize="12" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle">?</text>
  </IconBase>
}

export function CheckboxIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 12.5l2.5 2.5L16 9" />
  </IconBase>
}

export function IntegratingIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M3 5h4l7 7M3 12h11M3 19h4l7-7M14 12h6" />
  </IconBase>
}

export function EnvelopeIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </IconBase>
}

export function TeamIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="8" cy="9" r="3" />
    <circle cx="16" cy="9" r="3" />
    <circle cx="12" cy="16" r="3" />
  </IconBase>
}

export function BuildingIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="5" y="3" width="14" height="18" rx="1" />
    <path d="M9 7h2M13 7h2M9 12h2M13 12h2" />
    <path d="M10 21v-4h4v4" />
  </IconBase>
}

export function LibraryIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M3 9L12 3l9 6" />
    <path d="M3 9h18" />
    <path d="M6 9v10M10 9v10M14 9v10M18 9v10" />
    <path d="M3 19h18" />
  </IconBase>
}

export function LayoutMiniIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <rect x="15" y="4" width="6" height="16" rx="1" fill="currentColor" stroke="none" />
  </IconBase>
}

export function LayoutMidiIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <rect x="11" y="4" width="10" height="16" rx="1" fill="currentColor" stroke="none" />
  </IconBase>
}

export function LayoutMaxIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" fill="currentColor" />
  </IconBase>
}

export function QueueIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="4" y="5" width="16" height="4" rx="1" />
    <rect x="4" y="10" width="16" height="4" rx="1" />
    <rect x="4" y="15" width="16" height="4" rx="1" />
  </IconBase>
}

export function PlusIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M12 5v14M5 12h14" />
  </IconBase>
}

export function CalendarIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </IconBase>
}

export function HelpIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" />
    <path d="M12 17h.01" strokeWidth={2.6} />
  </IconBase>
}

// Same circle outline as HelpIcon, with an "i" instead of a "?".
export function InfoIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" strokeWidth={2.2} />
    <path d="M12 7.5h.01" strokeWidth={2.8} />
  </IconBase>
}

// A trunk splitting into two branches, each ending in a node -- for
// Plot's category/subcategory/plotline branching structure.
export function PlotIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="12" cy="4" r="2" />
    <path d="M12 6v3M12 9l-6 5M12 9l6 5" />
    <circle cx="6" cy="16" r="2" />
    <circle cx="18" cy="16" r="2" />
  </IconBase>
}

export function BookmarkIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M6 3h12v18l-6-4-6 4V3Z" />
  </IconBase>
}

// Arrow out of a box -- exporting content out to a file.
export function ExportIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="4" y="14" width="16" height="6" rx="1" />
    <path d="M12 13V3M8 7l4-4 4 4" />
  </IconBase>
}

// A single page with text lines -- draft editing (Page Console).
export function PageIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="5" y="3" width="14" height="18" rx="1.5" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </IconBase>
}

// Two overlapping pages -- formatted preview (Pages Console), distinct
// from the single-page PageIcon above.
export function PagesIcon(props: IconProps) {
  return <IconBase {...props}>
    <rect x="7" y="2" width="13" height="17" rx="1.5" />
    <rect x="4" y="6" width="13" height="17" rx="1.5" />
  </IconBase>
}

export function TrashIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M4 7h16M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v6M14 11v6" />
  </IconBase>
}

export function ChevronRightIcon(props: IconProps) {
  return <IconBase {...props}><path d="M9 6l6 6-6 6" /></IconBase>
}

export function ChevronDownIcon(props: IconProps) {
  return <IconBase {...props}><path d="M6 9l6 6 6-6" /></IconBase>
}

export function ChevronLeftIcon(props: IconProps) {
  return <IconBase {...props}><path d="M15 6l-6 6 6 6" /></IconBase>
}

// Six-dot drag grip.
export function GripIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="9" cy="6" r="1.4" fill="currentColor" />
    <circle cx="15" cy="6" r="1.4" fill="currentColor" />
    <circle cx="9" cy="12" r="1.4" fill="currentColor" />
    <circle cx="15" cy="12" r="1.4" fill="currentColor" />
    <circle cx="9" cy="18" r="1.4" fill="currentColor" />
    <circle cx="15" cy="18" r="1.4" fill="currentColor" />
  </IconBase>
}

// Outlined heart -- a positive reaction (Pages console).
export function HeartIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M12 20.5s-8-4.9-8-10.4A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8 2.5c0 5.5-8 10.4-8 10.4z" />
  </IconBase>
}

// Outlined heart with a crack down the middle -- a negative reaction.
export function HeartHalvedIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M12 20.5s-8-4.9-8-10.4A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8 2.5c0 5.5-8 10.4-8 10.4z" />
    <path d="M12 7.6l-2.2 3.8 3.2 2.2-2 3.6" />
  </IconBase>
}

export function ClockIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </IconBase>
}

export function ListIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </IconBase>
}

export function ArcIcon(props: IconProps) {
  return <IconBase {...props}><path d="M3 19C6 5 18 5 21 19" /></IconBase>
}

export function ReactionIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
  </IconBase>
}

export function FlagIcon(props: IconProps) {
  return <IconBase {...props}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></IconBase>
}

export function SentenceIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 8h16M4 12h10M4 16h13" /></IconBase>
}

export function EyeIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </IconBase>
}

export function SunIcon(props: IconProps) {
  return <IconBase {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
  </IconBase>
}

export function SunriseIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M3 19h18M7 19a5 5 0 0 1 10 0" />
    <path d="M12 4v5M9.5 6.5L12 4l2.5 2.5" />
    <path d="M4.5 12.5l1.4 1.4M19.5 12.5l-1.4 1.4" />
  </IconBase>
}

export function SunsetIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M3 19h18M7 19a5 5 0 0 1 10 0" />
    <path d="M12 4v5M9.5 6.5L12 9l2.5-2.5" />
    <path d="M4.5 12.5l1.4 1.4M19.5 12.5l-1.4 1.4" />
  </IconBase>
}

export function MoonIcon(props: IconProps) {
  return <IconBase {...props}>
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
  </IconBase>
}
