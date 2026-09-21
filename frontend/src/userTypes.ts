// The header's "current user" card -- no auth/current-user concept exists
// elsewhere in this shell yet, so this is a minimal placeholder shape.
export interface CurrentUser {
  displayName: string
  orgId: string
  // Placeholder role (no real accounts yet). Admins get the admin features
  // (the AUI panel, the admin accent theme color); the Dashboard settings' "View
  // as" switch can preview the other role.
  role: 'user' | 'admin'
  photoUrl?: string
}
