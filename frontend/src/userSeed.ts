import type { CurrentUser } from './userTypes'

// Placeholder "logged-in user" -- no auth/current-user concept exists yet in
// this shell. Seeded the same way helper/queueSeed.ts seeds its mock data,
// until a real account system replaces it. No photoUrl -- HeaderUserCard
// falls back to the generic UserIcon glyph.
export const CURRENT_USER: CurrentUser = {
  displayName: 'Jordan Ellis',
  orgId: 'ORG-4471',
  role: 'admin',
}
