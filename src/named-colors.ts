// A broad-spectrum palette of whimsically-named colors (the "Gulf Stream" /
// "Honey Flower" style naming popularized by classic "name that color"
// datasets) — used to give a swatch card a human-readable name instead of
// just a hex code. Not official Pantone names (those are trademarked and
// licensed); this is an independently curated set covering the same kind
// of broad hue/tone range.

export interface NamedColor {
  name: string;
  hex: string;
}

const BASE_NAMED_COLORS: NamedColor[] = [
  { name: 'Pure Black',      hex: '#000000' },
  { name: 'Mine Shaft',      hex: '#2B2B2B' },
  { name: 'Charcoal',        hex: '#3A3A3A' },
  { name: 'Gravel',          hex: '#4B4B4B' },
  { name: 'Dove Gray',       hex: '#6E6E6E' },
  { name: 'Silver Chalice',  hex: '#A0A0A0' },
  { name: 'Alto',            hex: '#D9D9D9' },
  { name: 'Gallery',         hex: '#EEEEEE' },
  { name: 'Pure White',      hex: '#FFFFFF' },
  { name: 'Merlin',          hex: '#39393A' },
  { name: 'Bunker',          hex: '#131313' },

  { name: 'Cardinal',        hex: '#C41E3A' },
  { name: 'Guardsman Red',   hex: '#BA0110' },
  { name: 'Milano Red',      hex: '#B81104' },
  { name: 'Thunderbird',     hex: '#C02B18' },
  { name: 'Crimson',         hex: '#DC143C' },
  { name: 'Mexican Red',     hex: '#A72525' },
  { name: 'Persian Red',     hex: '#CC3333' },
  { name: 'Chestnut',        hex: '#B94E48' },
  { name: 'Brick Red',       hex: '#C62D42' },
  { name: 'Mandy',           hex: '#E12C4E' },
  { name: 'Amaranth',        hex: '#E52B50' },
  { name: 'Cerise',          hex: '#DE3163' },
  { name: 'Razzmatazz',      hex: '#E3256B' },
  { name: 'Rouge',           hex: '#A23B6C' },
  { name: 'Vin Rouge',       hex: '#7B3F61' },
  { name: 'Maroon Flush',    hex: '#6F2232' },
  { name: 'Burgundy',        hex: '#800020' },
  { name: 'Falu Red',        hex: '#7B1818' },
  { name: 'Sangria',         hex: '#92000A' },

  { name: 'Tuscany',         hex: '#D2691E' },
  { name: 'Trinidad',        hex: '#E64E03' },
  { name: 'Blaze Orange',    hex: '#FF6600' },
  { name: 'Pumpkin',         hex: '#FF7518' },
  { name: 'Tahiti Gold',     hex: '#EE7600' },
  { name: 'Sunshade',        hex: '#FF9E2C' },
  { name: 'Neon Carrot',     hex: '#FFA343' },
  { name: 'Sandy Brown',     hex: '#F4A460' },
  { name: 'Fire Bush',       hex: '#E6A324' },
  { name: 'Buttercup',       hex: '#F3AB37' },
  { name: 'Gamboge',         hex: '#E49B0F' },
  { name: 'Marigold',        hex: '#EAA221' },
  { name: 'Saffron',         hex: '#F4C430' },
  { name: 'Golden Grass',    hex: '#DAA520' },
  { name: 'Ochre',           hex: '#CC7722' },
  { name: 'Sienna',          hex: '#A0522D' },
  { name: 'Copper',          hex: '#B87333' },
  { name: 'Cinnamon',        hex: '#8B4513' },
  { name: 'Bracken',         hex: '#5A3825' },
  { name: 'Coffee',          hex: '#6F4E37' },
  { name: 'Potters Clay',    hex: '#8A6642' },
  { name: 'Sand Dune',       hex: '#967117' },

  { name: 'Golden Fizz',     hex: '#F9F740' },
  { name: 'Turbo',           hex: '#F8E10A' },
  { name: 'Lemon',           hex: '#FDE910' },
  { name: 'Corn',            hex: '#E8CC3C' },
  { name: 'Ripe Lemon',      hex: '#F4D03F' },
  { name: 'Dandelion',       hex: '#F0E130' },
  { name: 'Golden Sand',     hex: '#F0DB7D' },
  { name: 'Straw',           hex: '#E4D96F' },
  { name: 'Khaki',           hex: '#C3B091' },
  { name: 'Sage',            hex: '#9CAF88' },
  { name: 'Olive Drab',      hex: '#6B8E23' },
  { name: 'Fern Green',      hex: '#4F7942' },
  { name: 'Chateau Green',   hex: '#4CA050' },
  { name: 'Fruit Salad',     hex: '#4F9D5D' },
  { name: 'Forest Green',    hex: '#228B22' },
  { name: 'Camarone',        hex: '#0B6E4F' },
  { name: 'Sherwood Green',  hex: '#0C4A3E' },
  { name: 'Pine Tree',       hex: '#2A3B2E' },
  { name: 'Parsley',         hex: '#134F1F' },
  { name: 'Malachite',       hex: '#0BDA51' },
  { name: 'Emerald',         hex: '#50C878' },
  { name: 'Jade',            hex: '#00A86B' },
  { name: 'Sea Green',       hex: '#2E8B57' },
  { name: 'Mint',            hex: '#3EB489' },
  { name: 'Shamrock',        hex: '#33CC99' },
  { name: 'Persian Green',   hex: '#00A693' },
  { name: 'Niagara',         hex: '#0C9C8D' },
  { name: 'Gulf Stream',     hex: '#84B0B0' },
  { name: 'Neptune',         hex: '#7CB0A1' },
  { name: 'Puerto Rico',     hex: '#3FC1AE' },
  { name: 'Turquoise',       hex: '#30D5C8' },
  { name: 'Robin Egg Blue',  hex: '#00CCCC' },
  { name: 'Bondi Blue',      hex: '#0095B6' },
  { name: 'Teal',            hex: '#008080' },
  { name: 'Blue Lagoon',     hex: '#1E90A0' },
  { name: 'Eastern Blue',    hex: '#1E9AB0' },
  { name: 'Pelorous',        hex: '#3AA9C3' },
  { name: 'Cyan',            hex: '#00FFFF' },
  { name: 'Sky Blue',        hex: '#87CEEB' },
  { name: 'Picton Blue',     hex: '#45B1E8' },
  { name: 'Curious Blue',    hex: '#2E8FCC' },
  { name: 'Cerulean',        hex: '#007BA7' },
  { name: 'Deep Cerulean',   hex: '#007BA7' },
  { name: 'Denim',           hex: '#1560BD' },
  { name: 'Endeavour',       hex: '#0056A7' },
  { name: 'Cobalt',          hex: '#0047AB' },
  { name: 'Congress Blue',   hex: '#02478E' },
  { name: 'Sapphire',        hex: '#0F52BA' },
  { name: 'Governor Bay',    hex: '#3D4EC0' },
  { name: 'Royal Blue',      hex: '#4169E1' },
  { name: 'Blue Ribbon',     hex: '#2E5CFF' },
  { name: 'Free Speech Blue',hex: '#4156C5' },
  { name: 'Indigo',          hex: '#4B0082' },
  { name: 'Persian Blue',    hex: '#1C39BB' },
  { name: 'Navy',            hex: '#000080' },
  { name: 'Astronaut',       hex: '#2B3A67' },
  { name: 'Bay of Many',     hex: '#273A81' },
  { name: 'Gulf Blue',       hex: '#03163C' },
  { name: 'Midnight',        hex: '#191970' },

  { name: 'Violet',          hex: '#8F00FF' },
  { name: 'Electric Violet', hex: '#8B00FF' },
  { name: 'Purple Heart',    hex: '#69359C' },
  { name: 'Seance',          hex: '#7B2D8E' },
  { name: 'Honey Flower',    hex: '#631664' },
  { name: 'Clairvoyant',     hex: '#480656' },
  { name: 'Scarlet Gum',     hex: '#431560' },
  { name: 'Jagger',          hex: '#350E57' },
  { name: 'Eminence',        hex: '#6C3082' },
  { name: 'Vivid Violet',    hex: '#9F00C5' },
  { name: 'Deep Magenta',    hex: '#CC00CC' },
  { name: 'Magenta',         hex: '#FF00FF' },
  { name: 'Fuchsia Pink',    hex: '#FF77FF' },
  { name: 'Orchid',          hex: '#DA70D6' },
  { name: 'Heliotrope',      hex: '#DF73FF' },
  { name: 'Lavender',        hex: '#B57EDC' },
  { name: 'Wisteria',        hex: '#C9A0DC' },
  { name: 'Thistle',         hex: '#D8BFD8' },
  { name: 'Mauve',           hex: '#E0B0FF' },
  { name: 'Amethyst',        hex: '#9966CC' },
  { name: 'Plum',            hex: '#8E4585' },
  { name: 'Byzantium',       hex: '#702963' },
  { name: 'Pompadour',       hex: '#660045' },

  { name: 'Pink Flamingo',   hex: '#FC74FD' },
  { name: 'Hot Pink',        hex: '#FF69B4' },
  { name: 'French Rose',     hex: '#F64A8A' },
  { name: 'Brink Pink',      hex: '#FB607F' },
  { name: 'Wild Watermelon', hex: '#FC6C85' },
  { name: 'Persimmon',       hex: '#FF6B4A' },
  { name: 'Coral',           hex: '#FF7F50' },
  { name: 'Salmon',          hex: '#FA8072' },
  { name: 'Tan Hide',        hex: '#FA9D5A' },
  { name: 'Apricot',         hex: '#FBCEB1' },
  { name: 'Peach',           hex: '#FFE5B4' },
  { name: 'Bisque',          hex: '#FFE4C4' },
  { name: 'Blanched Almond', hex: '#FFEBCD' },
  { name: 'Champagne',       hex: '#F7E7CE' },
  { name: 'Linen',           hex: '#FAF0E6' },
  { name: 'Seashell',        hex: '#FFF5EE' },
  { name: 'Snow',            hex: '#FFFAFA' },
];

// A denser, more evenly-graduated set of sophisticated, muted, "designer
// swatch book" tones — the kind of broad, professionally-curated spread
// people mean when they say "Pantone-style" colors. These are NOT Pantone
// colors: no PMS numbers, no official formulas, no Pantone naming, and
// every value here was chosen independently rather than copied from any
// proprietary color-matching system. Any resemblance to a particular
// famous shade is coincidental to both being "a plausible muted teal" (or
// red, or violet, etc.) — there are only so many of those.
export const PANTONE_ESQUE_COLORS: NamedColor[] = [
  { name: 'Velvet Twilight',   hex: '#2E3A59' },
  { name: 'Deep Marsala',      hex: '#964B44' },
  { name: 'Violet Storm',      hex: '#5F4B8B' },
  { name: 'Meadow Green',      hex: '#7A9B5E' },
  { name: 'Quartz Blush',      hex: '#E8B4B8' },
  { name: 'Sky Serenity',      hex: '#9BB7D4' },
  { name: 'Emerald Isle',      hex: '#189A6C' },
  { name: 'Orchid Radiance',   hex: '#B565A7' },
  { name: 'Tangerine Blaze',   hex: '#DD6B3B' },
  { name: 'Honeysuckle Bloom', hex: '#E0637A' },
  { name: 'Turquoise Bay',     hex: '#2FA5A0' },
  { name: 'Golden Mimosa',     hex: '#E8B84B' },
  { name: 'Iris Blue',         hex: '#4B5FA6' },
  { name: 'Chili Red',         hex: '#9A2B2B' },
  { name: 'Aqua Breeze',       hex: '#7FC7D9' },
  { name: 'Scarlet Flame',     hex: '#C21F3A' },
  { name: 'Cerulean Sky',      hex: '#2E7FB8' },
  { name: 'Fuchsia Bloom',     hex: '#C13E82' },
  { name: 'Sand Dollar',       hex: '#D8C4A8' },
  { name: 'Nebulous Grey',     hex: '#8C9199' },
  { name: 'Sunlit Coral',      hex: '#F0805A' },
  { name: 'Provence Lavender', hex: '#8E97C7' },
  { name: 'Amberglow',         hex: '#D98E33' },
  { name: 'Balsam Green',      hex: '#3E6B4F' },
  { name: 'Rosewater',         hex: '#E8C4C0' },
  { name: 'Denim Wash',        hex: '#4A6A8A' },
  { name: 'Plum Wine',         hex: '#5E3049' },
  { name: 'Citrine Yellow',    hex: '#D9B93C' },
  { name: 'Slate Storm',       hex: '#4A555F' },
  { name: 'Papaya Whip',       hex: '#F2A46A' },
  { name: 'Deep Lagoon',       hex: '#1F5E63' },
  { name: 'Mauve Mist',        hex: '#A98CA5' },
  { name: 'Terracotta Clay',   hex: '#B5573C' },
  { name: 'Glacier Blue',      hex: '#A9C6D9' },
  { name: 'Moss Grove',        hex: '#5C6E4A' },
  { name: 'Berry Crush',       hex: '#8E2A5B' },
  { name: 'Toasted Almond',    hex: '#C9A57D' },
  { name: 'Peacock Teal',      hex: '#106E7C' },
  { name: 'Blush Petal',       hex: '#EBC0C6' },
  { name: 'Ink Navy',          hex: '#1F2A44' },
  { name: 'Marigold Fields',   hex: '#E8981F' },
  { name: 'Wild Aster',        hex: '#7A5FA6' },
  { name: 'Pine Forest',       hex: '#2C4A3E' },
  { name: 'Dusty Rose',        hex: '#C48A8F' },
  { name: 'Cobalt Depths',     hex: '#274E8E' },
  { name: 'Saffron Spice',     hex: '#E0A438' },
  { name: 'Seafoam Whisper',   hex: '#A9D6C7' },
  { name: 'Garnet Red',        hex: '#7A1F2B' },
  { name: 'Lilac Haze',        hex: '#C3AED6' },
  { name: 'Olive Harvest',     hex: '#8A8B4A' },
];

const VIVID_COLORS: NamedColor[] = [
  { name: 'True Red',        hex: '#EE1C25' },
  { name: 'Blaze Orange',    hex: '#FF5E13' },
  { name: 'Solar Yellow',    hex: '#FFD400' },
  { name: 'Electric Lime',   hex: '#B4E600' },
  { name: 'Kelly Green',     hex: '#00A651' },
  { name: 'Spring Emerald',  hex: '#00C48C' },
  { name: 'Vivid Teal',      hex: '#00B4B0' },
  { name: 'Cyan Pop',        hex: '#00C2E0' },
  { name: 'Azure Punch',     hex: '#0091FF' },
  { name: 'Royal Cobalt',    hex: '#1E4FE0' },
  { name: 'Ultramarine',     hex: '#3F3FE0' },
  { name: 'Electric Indigo', hex: '#6A26D9' },
  { name: 'Vivid Violet',    hex: '#9B1FE0' },
  { name: 'Magenta Punch',   hex: '#E619B0' },
  { name: 'Hot Pink Flare',  hex: '#FF2E88' },
  { name: 'Rose Red',        hex: '#FF1F5C' },
  { name: 'Coral Flash',     hex: '#FF5C4D' },
  { name: 'Tangerine Pop',   hex: '#FF8A00' },
  { name: 'Golden Flash',    hex: '#FFC700' },
  { name: 'Chartreuse Zap',  hex: '#CFFF00' },
  { name: 'Neon Mint',       hex: '#00FFA3' },
  { name: 'Aqua Splash',     hex: '#00E5FF' },
  { name: 'Sky Punch',       hex: '#2EA8FF' },
  { name: 'Cobalt Flash',    hex: '#2952FF' },
  { name: 'Purple Zing',     hex: '#8B2EFF' },
  { name: 'Fuchsia Zap',     hex: '#FF2ED1' },
  { name: 'Crimson Pop',     hex: '#FF1744' },
  { name: 'Amber Zap',       hex: '#FFA000' },
  { name: 'Lime Punch',      hex: '#8BE000' },
  { name: 'Jade Flash',      hex: '#00E091' },
];

const PASTEL_COLORS: NamedColor[] = [
  { name: 'Pastel Blush',    hex: '#FADCE1' },
  { name: 'Cotton Candy',    hex: '#F7CFE0' },
  { name: 'Baby Lilac',      hex: '#E4D6F2' },
  { name: 'Powder Violet',   hex: '#D9D4F0' },
  { name: 'Periwinkle Mist', hex: '#D2DEF5' },
  { name: 'Baby Blue',       hex: '#CDE7F0' },
  { name: 'Robins Egg Soft', hex: '#CBEEE8' },
  { name: 'Mint Whisper',    hex: '#CFF0DA' },
  { name: 'Sage Mist',       hex: '#DCEBD0' },
  { name: 'Butter Cream',    hex: '#FBF3CE' },
  { name: 'Vanilla',         hex: '#FCEBC9' },
  { name: 'Peach Sorbet',    hex: '#FBDCC8' },
  { name: 'Melon Cream',     hex: '#FAD2C6' },
  { name: 'Blush Pink',      hex: '#F6D2D6' },
  { name: 'Rose Powder',     hex: '#F2D6E0' },
  { name: 'Lavender Fog',    hex: '#E6DCF2' },
  { name: 'Soft Periwinkle', hex: '#DADCF0' },
  { name: 'Sky Whisper',     hex: '#D6E6F5' },
  { name: 'Seafoam Pastel',  hex: '#D2EFE8' },
  { name: 'Honeydew Soft',   hex: '#DFF2D8' },
  { name: 'Cream Sand',      hex: '#F5EAD6' },
  { name: 'Apricot Cream',   hex: '#F7DFC8' },
  { name: 'Petal Pink',      hex: '#F5D9DE' },
  { name: 'Wisteria Soft',   hex: '#E2D6EC' },
];

const EARTH_COLORS: NamedColor[] = [
  { name: 'Terracotta',      hex: '#C16B4A' },
  { name: 'Adobe Clay',      hex: '#A85D3D' },
  { name: 'Desert Sand',     hex: '#D8B98A' },
  { name: 'Sienna Earth',    hex: '#9C5A34' },
  { name: 'Umber Brown',     hex: '#6B4A2E' },
  { name: 'Bark Brown',      hex: '#4E3A28' },
  { name: 'Toffee',          hex: '#8B5E3C' },
  { name: 'Camel',           hex: '#C19A6B' },
  { name: 'Wheat Field',     hex: '#DCC48E' },
  { name: 'Olive Grove',     hex: '#7C7A3F' },
  { name: 'Moss',            hex: '#6E7A4F' },
  { name: 'Fern',            hex: '#5B7455' },
  { name: 'Forest Floor',    hex: '#3E4D34' },
  { name: 'Clay Rust',       hex: '#A8512F' },
  { name: 'Brick Earth',     hex: '#8C3E2A' },
  { name: 'Sandstone',       hex: '#C9A671' },
  { name: 'Driftwood',       hex: '#A99878' },
  { name: 'Stone Grey',      hex: '#8A8577' },
  { name: 'Slate Earth',     hex: '#5F5A50' },
  { name: 'Peat',            hex: '#463A2E' },
  { name: 'Ochre Earth',     hex: '#C1852F' },
  { name: 'Cedar',           hex: '#7A4B32' },
  { name: 'Mushroom',        hex: '#9C8D7C' },
  { name: 'Acorn',           hex: '#6B4F35' },
];

const GRAYSCALE_COLORS: NamedColor[] = [
  { name: 'Ink Black',       hex: '#0A0A0A' },
  { name: 'Onyx',            hex: '#1C1C1C' },
  { name: 'Graphite',        hex: '#2E2E2E' },
  { name: 'Charcoal Grey',   hex: '#404040' },
  { name: 'Iron Grey',       hex: '#565656' },
  { name: 'Slate',           hex: '#6E6E6E' },
  { name: 'Pewter',          hex: '#8A8A8A' },
  { name: 'Ash Grey',        hex: '#A3A3A3' },
  { name: 'Silver Mist',     hex: '#BEBEBE' },
  { name: 'Fog Grey',        hex: '#D6D6D6' },
  { name: 'Cloud White',     hex: '#EAEAEA' },
  { name: 'Off White',       hex: '#F5F5F5' },
  { name: 'Warm Grey',       hex: '#9C948A' },
  { name: 'Cool Grey',       hex: '#8A929C' },
  { name: 'Taupe Grey',      hex: '#8C8177' },
  { name: 'Steel Blue Grey', hex: '#71818C' },
];

export const NAMED_COLORS: NamedColor[] = [
  ...BASE_NAMED_COLORS, ...PANTONE_ESQUE_COLORS,
  ...VIVID_COLORS, ...PASTEL_COLORS, ...EARTH_COLORS, ...GRAYSCALE_COLORS,
];

export interface ColorPalette {
  id: string;
  label: string;
  colors: NamedColor[];
}

// The palette-grid feature's menu of choices — grouped by mood/tone so
// "generate a grid" can offer more than one flavor rather than a single
// fixed set. None of these are Pantone (see the disclaimer on
// PANTONE_ESQUE_COLORS above); they're just organized by feel.
export const COLOR_PALETTES: ColorPalette[] = [
  { id: 'muted',     label: 'Muted',     colors: PANTONE_ESQUE_COLORS },
  { id: 'vivid',     label: 'Vivid',     colors: VIVID_COLORS },
  { id: 'pastel',    label: 'Pastel',    colors: PASTEL_COLORS },
  { id: 'earth',     label: 'Earth Tones', colors: EARTH_COLORS },
  { id: 'grayscale', label: 'Grayscale', colors: GRAYSCALE_COLORS },
];

// Simple redmean weighted RGB distance — perceptually a bit better than
// plain Euclidean without needing a full Lab conversion, plenty accurate
// for "closest named color" purposes.
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const rMean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}

/** Finds the nearest named color to `hex` in the palette above. */
export function nearestColorName(hex: string): string {
  const target = hexToRgb(hex);
  let best = NAMED_COLORS[0];
  let bestDist = Infinity;
  for (const c of NAMED_COLORS) {
    const d = colorDistance(target, hexToRgb(c.hex));
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best.name;
}

/** Picks a random entry from the named palette — used to seed a new swatch card. */
export function randomNamedColor(): NamedColor {
  return NAMED_COLORS[Math.floor(Math.random() * NAMED_COLORS.length)];
}
