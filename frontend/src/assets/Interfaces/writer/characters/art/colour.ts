// Colour arithmetic for the figure: the shade and highlight of a flat colour, and a mix of two. A colour is #rrggbb (the art's colours are the author's data,
// so these are the only colours the figure draws with, besides the white of an eye).

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return [136, 136, 136]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const byte = (v: number) => Math.min(255, Math.max(0, Math.round(v)))

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(v => byte(v).toString(16).padStart(2, '0')).join('')}`
}

// `a` moved towards `b` by `t` (0 to 1).
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

// The second tone of the flat shading: the colour a little darker, with a touch of warmth so a shadow is not grey.
export function shade(color: string, amount = 0.18): string {
  return mix(color, '#2a1c3a', amount)
}

// The colour a little lighter (the lit side).
export function light(color: string, amount = 0.14): string {
  return mix(color, '#ffffff', amount)
}

// Relative luminance (0 dark to 1 light), for choosing a line that shows on a colour.
export function luminance(color: string): number {
  const [r, g, b] = hexToRgb(color).map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
