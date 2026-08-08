interface Props {
  className?: string
}

// 2x2 grid glyph for "Dashboard" buttons.
function DashboardIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" className={className} aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="0.75" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="0.75" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="0.75" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="0.75" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export default DashboardIcon
