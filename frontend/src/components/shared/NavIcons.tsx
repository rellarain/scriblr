// Simple stroke-based line icons for the project nav, sized to inherit
// currentColor so they match both the active and inactive link states.
function IconOutline() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="3" cy="5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="15" r="1.1" fill="currentColor" stroke="none" />
      <line x1="7" y1="5" x2="17" y2="5" strokeLinecap="round" />
      <line x1="7" y1="10" x2="17" y2="10" strokeLinecap="round" />
      <line x1="7" y1="15" x2="17" y2="15" strokeLinecap="round" />
    </svg>
  )
}

function IconDraft() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M13.5 2.5l4 4-9.5 9.5-4.6 1 1-4.6 9.1-9.1z" strokeLinejoin="round" strokeLinecap="round" />
      <line x1="11.8" y1="4.2" x2="15.8" y2="8.2" strokeLinecap="round" />
    </svg>
  )
}

function IconRead() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path
        d="M10 5.2c-1.1-1-2.9-1.7-4.7-1.7-1 0-1.9.15-2.6.4v10.6c.7-.25 1.6-.4 2.6-.4 1.8 0 3.6.7 4.7 1.7 1.1-1 2.9-1.7 4.7-1.7 1 0 1.9.15 2.6.4V3.9c-.7-.25-1.6-.4-2.6-.4-1.8 0-3.6.7-4.7 1.7z"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line x1="10" y1="5.2" x2="10" y2="16.2" strokeLinecap="round" />
    </svg>
  )
}

function IconRevise() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8.3" cy="8.3" r="5.3" />
      <line x1="12.3" y1="12.3" x2="17.5" y2="17.5" strokeLinecap="round" />
    </svg>
  )
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1" />
      <rect x="11" y="2.5" width="6.5" height="4" rx="1" />
      <rect x="11" y="8.5" width="6.5" height="9" rx="1" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1" />
    </svg>
  )
}

export { IconOutline, IconDraft, IconRead, IconRevise, IconDashboard }
