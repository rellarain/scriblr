interface Props {
  className?: string
}

// Download-into-tray glyph for "Export PDF" buttons.
function ExportIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" className={className} aria-hidden="true">
      <path
        d="M8 1.5v7.5M5 6.5l3 3 3-3M2.5 11.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default ExportIcon
