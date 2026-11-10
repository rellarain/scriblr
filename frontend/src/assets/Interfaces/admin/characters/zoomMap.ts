// The zoom slider of the view toolbar. The slider runs 0..1 along a logarithmic scale from a quarter of the fit to eight times it, so each step feels the same at every zoom, and
// the wheel over it moves it: scrolling down zooms in and scrolling up zooms out (the way round that was asked for; the page's own scrolling is the other way).

export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 8

const span = Math.log(ZOOM_MAX / ZOOM_MIN)

export const clampZoom = (z: number): number => (Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : 1)
// A zoom as a position on the slider (0..1) and back.
export const zoomToSlider = (z: number): number => Math.log(clampZoom(z) / ZOOM_MIN) / span
export const sliderToZoom = (v: number): number => clampZoom(ZOOM_MIN * Math.exp(Math.min(1, Math.max(0, v)) * span))

// The zoom after one turn of the wheel with this deltaY: down (positive) zooms in, up (negative) zooms out, by a tenth of the slider for an ordinary notch.
export function wheelZoom(z: number, deltaY: number): number {
  if (!deltaY) return clampZoom(z)
  const notch = Math.min(3, Math.max(0.2, Math.abs(deltaY) / 100))
  return sliderToZoom(zoomToSlider(z) + Math.sign(deltaY) * 0.1 * notch)
}

export const zoomText = (z: number): string => `${Math.round(clampZoom(z) * 100)}%`
