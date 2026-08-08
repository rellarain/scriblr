interface Props {
  className?: string
}

// Small inline floppy-disk glyph for the manual "save a snapshot now"
// action -- no naming step, the snapshot's label is always its own
// timestamp (see RevisionSnapshot.label).
function SaveIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" className={className} aria-hidden="true">
      <path
        d="M2.75 2.5h8.5l2.25 2.25v8.25a.5.5 0 0 1-.5.5H2.75a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.75 2.5v3.5h5v-3.5M4.75 13.5v-4h6.5v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default SaveIcon
