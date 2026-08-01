interface Props {
  className?: string
}

// Small inline trash-can glyph, used wherever "scrap"/orphaned-draft content
// needs a compact visual marker instead of a text label.
function TrashIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" className={className} aria-hidden="true">
      <path
        d="M3 4.5h10M6.25 4.5V3a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v1.5M4.75 4.5l.4 8.5a1 1 0 0 0 1 .95h3.7a1 1 0 0 0 1-.95l.4-8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default TrashIcon
