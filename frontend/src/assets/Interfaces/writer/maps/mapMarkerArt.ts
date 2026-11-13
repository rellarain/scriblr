// The silhouettes of the map markers that come with the app: what were the symbols a map was stamped with before shape libraries (four sets of flat,
// one-colour silhouettes, each one SVG path in a 24 by 24 box, filled by the even-odd rule so a door or a window is a hole). mapShapeSeed.ts turns each into
// a library shape of the Markers category ("marker:<id>"), and the server turns every old symbol into a copy of its marker, keeping its id.

export interface MapSymbolDef { id: string; name: string; path: string }
export interface MapSymbolSet { id: 'settlements' | 'nature' | 'interior' | 'landmarks'; name: string; symbols: MapSymbolDef[] }

export const SYMBOL_BOX = 24

export const SYMBOL_SETS: MapSymbolSet[] = [
  {
    id: 'settlements', name: 'Settlements',
    symbols: [
      { id: 'village', name: 'Village', path: 'M2 20V12l4-4 4 4v8ZM12 20v-6l4.5-4.5L21 14v6Z' },
      { id: 'town', name: 'Town', path: 'M3 20V11l4-4 4 4v9ZM11 20V8l5-5 5 5v12Z' },
      { id: 'city', name: 'City', path: 'M3 20V10h4v10ZM8 20V5h5v15ZM14 20V9h3v11ZM18 20v-6h3v6Z' },
      { id: 'castle', name: 'Castle', path: 'M3 20V8h3v2h2V8h2v2h4V8h2v2h2V8h3v12h-6v-5a3 3 0 0 0-6 0v5Z' },
      { id: 'fort', name: 'Fort', path: 'M3 5h5v3h8V5h5v15H3Z' },
      { id: 'tower', name: 'Tower', path: 'M8 21V9H6V4h3v2h2V4h2v2h2V4h3v5h-2v12Z' },
      { id: 'farm', name: 'Farm', path: 'M3 20v-9l5-5 5 5v9ZM15 20v-7h6v7Z' },
      { id: 'ruins', name: 'Ruins', path: 'M3 20v-8h3V9h3v5h2V7h3v4h2V9h3v11Z' },
    ],
  },
  {
    id: 'nature', name: 'Nature',
    symbols: [
      { id: 'tree', name: 'Tree', path: 'M12 3a6 6 0 0 1 3.500 10.900V20h-7v-6.100A6 6 0 0 1 12 3Z' },
      { id: 'pine', name: 'Pine', path: 'M12 2l6 8h-3l4 6H5l4-6H6ZM11 16h2v5h-2Z' },
      { id: 'palm', name: 'Palm', path: 'M11 21V12h2v9ZM12 12C9 12 6 10 4 7c3-1 6 0 8 3 2-3 5-4 8-3-2 3-5 5-8 5Z' },
      { id: 'mountain', name: 'Mountain', path: 'M2 20L10 5l4 7 3-4 5 12Z' },
      { id: 'volcano', name: 'Volcano', path: 'M2 20l6-10h8l6 10ZM9.500 10L8 5l3 2 1-3 1 3 3-2-1.500 5Z' },
      { id: 'hill', name: 'Hill', path: 'M2 20a10 9 0 0 1 20 0Z' },
      { id: 'cave', name: 'Cave', path: 'M2 20c0-6 4-12 10-12s10 6 10 12h-5v-3a5 5 0 0 0-10 0v3Z' },
      { id: 'bush', name: 'Bush', path: 'M3 20a4 4 0 0 1 3-6.500A5 5 0 0 1 12 8a5 5 0 0 1 6 5.500A4 4 0 0 1 21 20Z' },
    ],
  },
  {
    id: 'interior', name: 'Interior',
    symbols: [
      { id: 'door', name: 'Door', path: 'M5 21V3h14v18h-3V6H8v15ZM14 12h2v2h-2Z' },
      { id: 'stairs', name: 'Stairs', path: 'M3 21v-4h5v-4h5V9h5V5h3v16Z' },
      { id: 'table', name: 'Table', path: 'M3 8h18v3h-2v9h-2v-9H7v9H5v-9H3Z' },
      { id: 'chair', name: 'Chair', path: 'M7 3h10v9H7ZM6 13h12v3h-2v5h-2v-5h-4v5H8v-5H6Z' },
      { id: 'bed', name: 'Bed', path: 'M3 7h2v6h14a2 2 0 0 1 2 2v5h-2v-2H5v2H3ZM6 8h5a2 2 0 0 1 0 4H6Z' },
      { id: 'chest', name: 'Chest', path: 'M3 9a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v3H3ZM3 13h7v2h4v-2h7v6H3Z' },
      { id: 'fireplace', name: 'Fireplace', path: 'M3 4h18v17H3ZM8 21v-8a4 4 0 0 1 8 0v8Z' },
      { id: 'pillar', name: 'Pillar', path: 'M6 4h12v3h-2v10h2v3H6v-3h2V7H6Z' },
    ],
  },
  {
    id: 'landmarks', name: 'Landmarks and travel',
    symbols: [
      { id: 'temple', name: 'Temple', path: 'M12 3l10 5v2H2V8ZM4 11h3v7H4ZM10.500 11h3v7h-3ZM17 11h3v7h-3ZM2 19h20v2H2Z' },
      { id: 'monument', name: 'Monument', path: 'M11 2h2l2 6-1 13h-4L9 8Z' },
      { id: 'bridge', name: 'Bridge', path: 'M2 9h20v3h-3v8h-2v-8a5 5 0 0 0-10 0v8H5v-8H2Z' },
      { id: 'harbour', name: 'Harbour', path: 'M11 6.200a3 3 0 1 1 2 0V9h3v2h-3v7.200c3-.3 5-2.300 5.500-5H20c-.5 4.500-3.500 7.800-8 7.800S4.500 16.700 4 12.200h1.500c.5 2.700 2.500 4.700 5.500 5V11H8V9h3Z' },
      { id: 'ship', name: 'Ship', path: 'M3 15h18l-3 5H6ZM11 4v9H5ZM13 6l5 7h-5Z' },
      { id: 'signpost', name: 'Signpost', path: 'M11 3h2v18h-2ZM13 5h7l2 2.500-2 2.500h-7ZM11 11H4l-2 2.500L4 16h7Z' },
      { id: 'camp', name: 'Camp', path: 'M12 4L2 20h20ZM12 12l-3 8h6Z' },
      { id: 'battle', name: 'Battle', path: 'M5 3l7 7 7-7 2 2-7 7 7 7-2 2-7-7-7 7-2-2 7-7-7-7Z' },
      { id: 'interest', name: 'Point of interest', path: 'M12 2l3 7 7 .8-5.200 4.700 1.600 7.500L12 18l-6.400 4 1.600-7.500L2 9.800 9 9Z' },
      { id: 'mine', name: 'Mine', path: 'M3 10a9 9 0 0 1 18 0h-3a6 6 0 0 0-5-3v14h-2V7a6 6 0 0 0-5 3Z' },
    ],
  },
]

// What an id the library does not have becomes: a diamond.
export const UNKNOWN_SYMBOL_PATH = 'M12 3l9 9-9 9-9-9Z'
