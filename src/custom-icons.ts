import purpleIcon from '../assets/purple_icon.png';
import goldIcon from '../assets/gold_icon.png';
import greenIcon from '../assets/green_icon.png';
import orangeIcon from '../assets/orange_icon.png';
import pinkIcon from '../assets/pink_icon.png';
import redIcon from '../assets/red_icon.png';
import silverIcon from '../assets/silver_icon.png';
import skyblueIcon from '../assets/skyblue_icon.png';
import tealIcon from '../assets/teal_icon.png';

// Small images bundled with the plugin (see assets/, esbuild.config.mjs's
// dataurl loader, and images.d.ts) that are selectable anywhere a Lucide
// icon or emoji currently is — tile icons, kanban item icon badges, etc.
// Add an entry here for each new asset dropped into assets/. Source .jpg
// files get a transparent-background .png counterpart generated alongside
// them (background-keyed, not just an alpha strip) — only the .png is
// imported/bundled here.
export interface CustomIconDef {
  id: string;
  label: string;
  src: string;
}

export const CUSTOM_ICONS: CustomIconDef[] = [
  { id: 'purple_icon', label: 'Purple icon', src: purpleIcon },
  { id: 'gold_icon', label: 'Gold', src: goldIcon },
  { id: 'green_icon', label: 'Green', src: greenIcon },
  { id: 'orange_icon', label: 'Orange', src: orangeIcon },
  { id: 'pink_icon', label: 'Pink', src: pinkIcon },
  { id: 'red_icon', label: 'Red', src: redIcon },
  { id: 'silver_icon', label: 'Silver', src: silverIcon },
  { id: 'skyblue_icon', label: 'Sky blue', src: skyblueIcon },
  { id: 'teal_icon', label: 'Teal', src: tealIcon },
];

// Stored in the same `icon: string` field TileCard/KanbanItem already use
// for a Lucide id or emoji character — prefixed so it's unambiguous which
// kind of value it is.
const CUSTOM_ICON_PREFIX = 'asset:';

export function isCustomIconRef(icon: string | undefined): icon is string {
  return !!icon && icon.startsWith(CUSTOM_ICON_PREFIX);
}

export function customIconRef(id: string): string {
  return CUSTOM_ICON_PREFIX + id;
}

export function resolveCustomIconSrc(icon: string): string | undefined {
  return CUSTOM_ICONS.find(c => customIconRef(c.id) === icon)?.src;
}
