// Shared design-token color rules: a single lightness value drives all three
// colors (each progressively brighter), and saturation must strictly
// increase from theme -> accent -> alert.
export const SAT_STEP = 5
export const L_STEP = 8

export function deriveLightness(base: number): { theme: number; accent: number; alert: number } {
  const theme = base
  const accent = Math.min(100, theme + L_STEP)
  const alert = Math.min(100, accent + L_STEP)
  return { theme, accent, alert }
}

export function clampAccentSaturation(themeS: number, accentS: number): number {
  return Math.max(accentS, Math.min(100, themeS + SAT_STEP))
}

export function clampAlertSaturation(accentS: number, alertS: number): number {
  return Math.max(alertS, Math.min(100, accentS + SAT_STEP))
}
