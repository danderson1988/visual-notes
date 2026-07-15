import { App, TFile } from 'obsidian';

export interface HasThumbnail {
  thumbnail?: { type: 'vault'; path: string } | { type: 'external'; url: string };
}

/**
 * Resolves an optional thumbnail (on a TileCard, a KanbanItem, or anything
 * else carrying the same `thumbnail` shape) into a src usable in an <img>.
 * Vault images go through Obsidian's resource path API; external URLs are
 * used as-is. Returns null if there's no thumbnail or the vault file can't
 * be found (caller should fall back to its icon/color rendering).
 */
export function resolveThumbnailSrc(app: App, item: HasThumbnail): string | null {
  const thumb = item.thumbnail;
  if (!thumb) return null;
  if (thumb.type === 'external') return thumb.url;
  const file = app.vault.getAbstractFileByPath(thumb.path);
  return file instanceof TFile ? app.vault.getResourcePath(file) : null;
}

// ── YouTube helpers ───────────────────────────────────────────

/** Extracts the video ID from any common YouTube URL shape, or null if it isn't one. */
export function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(embed|shorts)\/([^/?]+)/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

/** Static thumbnail image URL for a YouTube video ID — no API key or embed needed. */
export function youTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

// ── Google Maps helpers ───────────────────────────────────────

/** True for any common Google Maps link shape (full or short). */
export function isGoogleMapsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'maps.app.goo.gl') return true;
    if (host === 'goo.gl' && u.pathname.startsWith('/maps')) return true;
    if (host.startsWith('maps.google.')) return true;
    if (/^google\.[a-z.]+$/.test(host) && u.pathname.startsWith('/maps')) return true;
    return false;
  } catch { return false; }
}

/** True for the short-link forms that carry no location data in the URL itself. */
export function isGoogleMapsShortLink(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    return host === 'maps.app.goo.gl' || (host === 'goo.gl' && u.pathname.startsWith('/maps'));
  } catch { return false; }
}

// Converts the "eye altitude" Google Maps puts in @lat,lng,ALTITUDEm links
// (used once you've zoomed past the point where it switches from a discrete
// zoom level to a continuous 3D-style altitude) into an approximate
// Slippy-map zoom level, via the standard Web Mercator meters-per-pixel
// relation. Not exact — Google's own camera-altitude math isn't public —
// but close enough that the embed opens at essentially the same zoomed-in
// view the copied link was showing, not the whole city.
function altitudeToZoom(altitudeMeters: number, lat: number): number {
  const z = Math.log2(591657550.5 * Math.cos(lat * Math.PI / 180) / altitudeMeters);
  return Math.max(1, Math.min(21, Math.round(z)));
}

// The `data=!3m1!1eN` (or `!1eN` anywhere in the data blob) segment records
// the active map layer: 3 = satellite, 4 = terrain. Maps to the embed API's
// older but still-supported `t=` layer param. Satellite maps to hybrid
// (`t=h`, satellite + roads/labels) rather than bare satellite (`t=k`)
// since that's what today's Maps UI actually shows by default when you pick
// "Satellite" — the labels toggle isn't captured in the URL at all.
function mapTypeParam(url: string): string | null {
  const m = url.match(/!1e(\d)/);
  if (!m) return null;
  if (m[1] === '3') return 'h';
  if (m[1] === '4') return 'p';
  return null;
}

/**
 * Builds a keyless Google Maps embed URL (`output=embed` — no API key
 * needed) from a full Google Maps link. Handles /maps/place/<name>,
 * /maps/@lat,lng,zoom (or the ,ALTITUDEm altitude form used at closer
 * zooms), /maps/search/?query=…, and plain ?q=… forms, carrying over the
 * satellite/terrain layer choice when present. Returns null when no
 * location can be extracted (e.g. an unresolved short link).
 */
export function googleMapsEmbedSrc(url: string): string | null {
  let query: string | null = null;
  let ll: string | null = null;
  let zoom: string | null = null;

  const place = url.match(/\/maps\/place\/([^/@?]+)/);
  if (place) query = decodeURIComponent(place[1].replace(/\+/g, ' '));

  const at = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(z|m)/);
  if (at) {
    ll = `${at[1]},${at[2]}`;
    const [, latStr, , distStr, unit] = at;
    zoom = String(unit === 'z' ? Math.round(Number(distStr)) : altitudeToZoom(Number(distStr), Number(latStr)));
  } else {
    const atNoZoom = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (atNoZoom) ll = `${atNoZoom[1]},${atNoZoom[2]}`;
  }

  if (!query) {
    const q = url.match(/[?&]q(?:uery)?=([^&#]+)/);
    if (q) query = decodeURIComponent(q[1].replace(/\+/g, ' '));
  }
  if (!query) {
    const search = url.match(/\/maps\/search\/([^/@?]+)/);
    if (search) query = decodeURIComponent(search[1].replace(/\+/g, ' '));
  }
  if (!query && ll) query = ll;
  if (!query) return null;

  let src = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  if (ll) src += `&ll=${encodeURIComponent(ll)}`;
  if (zoom) src += `&z=${zoom}`;
  const t = mapTypeParam(url);
  if (t) src += `&t=${t}`;
  return src;
}
