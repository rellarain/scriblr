interface Props {
  className?: string
}

// Nested-list glyph for "Manage structure"/"Manage chapters" buttons.
function OutlineIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" className={className} aria-hidden="true">
      <path
        d="M2.5 3.5h11M5 8h8.5M5 12.5h8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="2.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export default OutlineIcon
