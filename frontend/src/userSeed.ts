import type { CurrentUser } from './userTypes'

// Placeholder "logged-in user" -- no auth/current-user concept exists yet in
// this shell. A seeded placeholder until a real account system replaces it. No photoUrl -- HeaderUserCard
// falls back to the generic UserIcon glyph.
export const CURRENT_USER: CurrentUser = {
  displayName: 'Jordan Ellis',
  orgId: 'ORG-4471',
  role: 'admin',
}
