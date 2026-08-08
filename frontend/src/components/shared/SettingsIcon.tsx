interface Props {
  className?: string
}

// Gear glyph for "Settings" buttons.
function SettingsIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 2.2v1.6M8 12.2v1.6M13.8 8h-1.6M3.8 8H2.2M11.86 4.14l-1.13 1.13M5.27 10.6l-1.13 1.13M11.86 11.86l-1.13-1.13M5.27 5.4 4.14 4.27"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default SettingsIcon
