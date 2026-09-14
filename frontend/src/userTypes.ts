// The header's "current user" card -- no auth/current-user concept exists
// elsewhere in this shell yet, so this is a minimal placeholder shape.
export interface CurrentUser {
  displayName: string
  orgId: string
  photoUrl?: string
}
