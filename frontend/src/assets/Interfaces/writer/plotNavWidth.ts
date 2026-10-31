// The width of the Plot contents beside the editor (PlotNav.tsx): 250px until dragged, then held between PLOT_NAV_MIN_W and 45% of the
// Plot tool so the editor keeps its room. The dragged width is kept on this machine (`scriblr.writer.plotNavWidth`); the compact layout,
// where the contents are a bar that folds down, has no width to change.

export const PLOT_NAV_W = 250
export const PLOT_NAV_MIN_W = 200
export const PLOT_NAV_MAX_FRACTION = 0.45
export const PLOT_NAV_KEY = 'scriblr.writer.plotNavWidth'

// A dragged width, held between the minimum and 45% of the tool (never under the minimum, however narrow the tool).
export const clampNavWidth = (width: number, containerWidth: number): number =>
  Math.round(Math.min(Math.max(width, PLOT_NAV_MIN_W), Math.max(PLOT_NAV_MIN_W, containerWidth * PLOT_NAV_MAX_FRACTION)))

// The panel's flex-basis: the same limits again in CSS, so shrinking the window holds a stored width too.
export const navBasis = (width: number): string => `min(max(${width}px, ${PLOT_NAV_MIN_W}px), ${PLOT_NAV_MAX_FRACTION * 100}%)`
