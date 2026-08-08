interface Props {
  className?: string
}

// Branching-thread glyph for "Plot" buttons.
function PlotIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" className={className} aria-hidden="true">
      <path
        d="M4 4v3.5c0 1.5 1 2 4 2s4 .5 4 2V13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="4" cy="3" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="13" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="6.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export default PlotIcon
