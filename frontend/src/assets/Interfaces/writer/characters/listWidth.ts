// The width of the cast list (the column of characters beside the page of the open one): 200px until the handle on its right edge is dragged, then what was set, held between
// 160px and 40% of the console (never more than 420px, so the page of the open character keeps the room it needs). It is kept on this computer
// (`scriblr.characters.list.width`); null is the default. Only a console wide enough to have the list beside the page (860px, see characters.scss) shows the handle.

export const LIST_MIN_W = 160
export const LIST_DEFAULT_W = 200
export const LIST_MAX_W = 420
export const LIST_MAX_FRACTION = 0.4
export const LIST_WIDTH_KEY = 'scriblr.characters.list.width'

// A dragged width, held between the minimum and the greater of the minimum and 40% of the console (up to 420px).
export const clampListWidth = (width: number, containerWidth: number): number =>
  Math.round(Math.min(Math.max(width, LIST_MIN_W), Math.max(LIST_MIN_W, Math.min(LIST_MAX_W, containerWidth * LIST_MAX_FRACTION))))

// The CSS variable that gives the column its width: the same limits again in CSS, so shrinking the window holds a stored width too. Nothing for the default.
export function listVars(width: number | null): Record<string, string> {
  return width === null ? {} : { '--char-list-w': `min(max(${width}px, ${LIST_MIN_W}px), ${LIST_MAX_W}px, ${LIST_MAX_FRACTION * 100}%)` }
}
