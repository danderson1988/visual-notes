// ── JSON Canvas interop ──────────────────────────────────────────────────
//
// Obsidian's native Canvas files are plain JSON conforming to the open
// JSON Canvas spec (https://jsoncanvas.org): a `nodes` array and an `edges`
// array. There are exactly four native node types — text, file, link, group —
// and native edges connect two nodes with an optional label/color.
//
// Visual Notes's card model (file-types.ts) is much richer than that (kanban
// columns, checklists with nested items, sticky notes with inline rich text,
// elbow-routed connections with arrowheads, etc). To get real interop we:
//
//   1. Write valid, spec-compliant nodes/edges so ANY canvas-compatible tool
//      (including Obsidian's own built-in Canvas view) can open the file and
//      see something sensible — a rendered checklist, a linked note, an
//      embedded image, a playable audio file, and so on.
//   2. Additionally stash each card's full original data on an `ib` key on
//      its node (the spec explicitly allows arbitrary extra keys for
//      forward-compatibility). When Visual Notes itself opens the file, it
//      reads `ib` back for full fidelity — kanban WIP limits, checklist
//      headers, sticky text-color spans, connection arrowhead style, etc.
//   3. NEVER destroy content we don't understand. Any node or edge with no
//      `ib` tag that Visual Notes can't confidently round-trip is preserved
//      byte-for-byte in `VisualNotesFile.foreignNodes` / `foreignEdges` and
//      re-emitted unchanged on save. This matters because a user (or another
//      plugin) may add plain native content directly in Obsidian's Canvas
//      view — Visual Notes must not silently delete it next time it saves.
//
// Known v1 limitation: if a foreign tool edits the *native* projection of an
// `ib`-tagged node (e.g. someone hand-edits the markdown text of a checklist
// node in native Canvas), Visual Notes does a best-effort one-way patch of the
// simple text-bearing fields back into the structured card (see
// `reconcileNativeEdits` below) but does not attempt a full markdown parse
// of arbitrary edits. Structural changes (added checklist items, kanban
// items) made purely in native Canvas will not be picked up.

import {
  VisualNotesFile, Card, Connection, DrawingStroke,
  StickyCard, ChecklistCard, CommentCard, TableCard, ImageCard, AudioCard,
  NoteLinkCard, BookmarkCard, KanbanColumnCard, KanbanBoardCard,
  MapCard, FileCard, GroupCard, KanbanItem,
  CheckersCard,
} from './file-types';
import { isGoogleMapsUrl } from './thumbnail-utils';
import { nearestColorName } from './named-colors';

// ── JSON Canvas spec types ───────────────────────────────────────────────

export type CanvasColor = string; // hex "#RRGGBB" or a preset "1".."6"
export type CanvasEdgeSide = 'top' | 'right' | 'bottom' | 'left';

export interface CanvasNodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
  ib?: unknown; // Visual Notes's stashed rich card data (extra key; spec-legal)
  [key: string]: unknown;
}

export interface CanvasTextNode extends CanvasNodeBase { type: 'text'; text: string; }
export interface CanvasFileNode extends CanvasNodeBase { type: 'file'; file: string; subpath?: string; }
export interface CanvasLinkNode extends CanvasNodeBase { type: 'link'; url: string; }
export interface CanvasGroupNode extends CanvasNodeBase {
  type: 'group'; label?: string; background?: string; backgroundStyle?: 'cover' | 'ratio' | 'repeat';
}

export type CanvasNode = CanvasTextNode | CanvasFileNode | CanvasLinkNode | CanvasGroupNode;

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: CanvasEdgeSide;
  toNode: string;
  toSide?: CanvasEdgeSide;
  color?: CanvasColor;
  label?: string;
  ib?: unknown; // Visual Notes's stashed connection style data
  [key: string]: unknown;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  // Visual Notes's file-level metadata (viewport, layout mode, dotsHidden).
  // Root-level extra keys are spec-legal the same way node/edge extras are.
  ib?: {
    version: number; layout: 'grid' | 'freeform'; dotsHidden?: boolean;
    viewport?: { x: number; y: number; zoom: number }; drawings?: DrawingStroke[];
    // Connections with a free (non-card) end at either side — the JSON
    // Canvas edge spec requires both fromNode/toNode to reference real
    // nodes, so these can't become edges and are stashed here instead,
    // same idea as `drawings`.
    freeLines?: Connection[];
    // Archived cards — deliberately NOT emitted as nodes so they stay
    // hidden in native Canvas too; fully recoverable from here.
    archived?: Card[];
  };
  [key: string]: unknown;
}

export const IB_FORMAT_VERSION = 1;

/** True if this JSON was authored (at some point) by Visual Notes. */
export function isVisualNotesCanvas(data: CanvasData): boolean {
  return !!data.ib && typeof data.ib === 'object' && typeof (data.ib as { version?: unknown }).version === 'number';
}

// Sub-nodes synthesized for kanban board content carry structured ids so we
// can tell them apart from top-level cards when reading a file back in, and
// so they're never treated as valid connection endpoints.
//   Legacy single-column card:  `${columnId}__item__${itemId}`
//   Multi-column board card:    `${boardId}::kbhdr::${columnId}`               (column header)
//                                `${boardId}::kbitem::${columnId}::${itemId}`  (item)
const kanbanItemNodeId = (columnId: string, itemId: string) => `${columnId}__item__${itemId}`;
const isKanbanItemNodeId = (id: string) => id.includes('__item__') || id.includes('::kbitem::') || id.includes('::kbhdr::');

const kanbanBoardHeaderNodeId = (boardId: string, columnId: string) => `${boardId}::kbhdr::${columnId}`;
const kanbanBoardItemNodeId = (boardId: string, columnId: string, itemId: string) => `${boardId}::kbitem::${columnId}::${itemId}`;

function parseKanbanBoardNodeId(id: string): { boardId: string; columnId: string; itemId: string | null } | null {
  let m = id.match(/^(.+)::kbitem::(.+)::(.+)$/);
  if (m) return { boardId: m[1], columnId: m[2], itemId: m[3] };
  m = id.match(/^(.+)::kbhdr::(.+)$/);
  if (m) return { boardId: m[1], columnId: m[2], itemId: null };
  return null;
}

// Default sizes used when a card has no stored w/h (e.g. was created in grid
// mode and has never had freeform dimensions).
const DEFAULT_SIZE: Record<Card['kind'], { w: number; h: number }> = {
  'tile': { w: 200, h: 120 },
  'sticky': { w: 240, h: 200 },
  'checklist': { w: 280, h: 260 },
  'comment': { w: 260, h: 180 },
  'table': { w: 320, h: 220 },
  'image': { w: 320, h: 240 },
  'audio': { w: 280, h: 100 },
  'note-link': { w: 300, h: 200 },
  'bookmark': { w: 320, h: 160 },
  'kanban-column': { w: 280, h: 400 },
  'kanban-board': { w: 580, h: 420 },
  'column': { w: 260, h: 320 },
  'map': { w: 480, h: 360 },
  'swatch': { w: 160, h: 160 },
  'file': { w: 260, h: 300 },
  'callout': { w: 320, h: 100 },
  'group': { w: 400, h: 300 },
  'calendar': { w: 460, h: 420 },
  'checkers': { w: 340, h: 380 },
};

// ── Visual Notes → native JSON Canvas ──────────────────────────────────────

export function visualNotesToCanvas(board: VisualNotesFile): CanvasData {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  for (const card of board.cards) {
    nodes.push(...cardToNodes(card));
  }

  const freeLines: Connection[] = [];
  for (const conn of board.connections) {
    if (conn.fromCardId && conn.toCardId) edges.push(connectionToEdge(conn));
    else freeLines.push(conn);
  }

  // Re-emit anything Visual Notes doesn't understand, untouched.
  if (board.foreignNodes) nodes.push(...board.foreignNodes);
  if (board.foreignEdges) edges.push(...board.foreignEdges);

  return {
    nodes,
    edges,
    ib: {
      version: IB_FORMAT_VERSION,
      layout: board.layout,
      dotsHidden: board.dotsHidden,
      viewport: board.viewport,
      drawings: board.drawings.length ? board.drawings : undefined,
      freeLines: freeLines.length ? freeLines : undefined,
      archived: board.archived?.length ? board.archived : undefined,
    },
  };
}

function baseRect(card: Card): { x: number; y: number; w: number; h: number } {
  const d = DEFAULT_SIZE[card.kind];
  return { x: card.x ?? 0, y: card.y ?? 0, w: card.w ?? d.w, h: card.h ?? d.h };
}

// Strip positional fields before stashing a card in `ib` — position already
// lives at the top level of the node, and we don't want two sources of truth
// that can silently drift apart. z is deliberately NOT stripped here: unlike
// x/y/w/h it has no top-level equivalent in the JSON Canvas spec, so `ib` is
// the only place it can survive a round trip.
function stashable<T extends Card>(card: T): T {
  const { x: _x, y: _y, w: _w, h: _h, ...rest } = card;
  return rest as T;
}

function cardToNodes(card: Card): CanvasNode[] {
  const { x, y, w, h } = baseRect(card);
  const base = { id: card.id, x, y, width: w, height: h };

  switch (card.kind) {
    case 'tile': {
      const t = card;
      if (t.target.kind === 'folder') {
        return [{ ...base, type: 'text', text: `📁 **${t.label}**${t.subtitle ? `\n${t.subtitle}` : ''}`, color: t.color, ib: stashable(t) }];
      }
      return [{ ...base, type: 'file', file: t.target.path, color: t.color, ib: stashable(t) }];
    }

    case 'sticky': {
      const s = card;
      return [{ ...base, type: 'text', text: s.text, color: s.color, ib: stashable(s) }];
    }

    case 'checklist': {
      const c = card;
      return [{ ...base, type: 'text', text: checklistToMarkdown(c), color: c.color, ib: stashable(c) }];
    }

    case 'comment': {
      const c = card;
      return [{ ...base, type: 'text', text: commentToMarkdown(c), color: c.color, ib: stashable(c) }];
    }

    case 'table': {
      const t = card;
      return [{ ...base, type: 'text', text: tableToMarkdown(t), color: t.color, ib: stashable(t) }];
    }

    case 'image': {
      const img = card;
      if (img.source.type === 'external') {
        return [{ ...base, type: 'link', url: img.source.url, ib: stashable(img) }];
      }
      return [{ ...base, type: 'file', file: img.source.path, ib: stashable(img) }];
    }

    case 'audio': {
      const a = card;
      return [{ ...base, type: 'file', file: a.source.path, ib: stashable(a) }];
    }

    case 'note-link': {
      const n = card;
      return [{ ...base, type: 'file', file: n.path, ib: stashable(n) }];
    }

    case 'bookmark': {
      const b = card;
      return [{ ...base, type: 'link', url: b.url, ib: stashable(b) }];
    }

    case 'map': {
      const m = card;
      return [{ ...base, type: 'link', url: m.url, ib: stashable(m) }];
    }

    case 'swatch': {
      const s = card;
      return [{ ...base, type: 'text', text: `${s.color.toUpperCase()} — ${nearestColorName(s.color)}`, color: s.color, ib: stashable(s) }];
    }

    case 'file': {
      const f = card;
      return [{ ...base, type: 'file', file: f.path, ib: stashable(f) }];
    }

    case 'callout': {
      const c = card;
      // Obsidian callout markdown so native Canvas renders it as a proper
      // callout block rather than plain text.
      const body = c.text.split('\n').map(l => `> ${l}`).join('\n');
      return [{ ...base, type: 'text', text: `> [!note] ${c.icon ?? '💡'}\n${body}`, color: c.color, ib: stashable(c) }];
    }

    case 'group': {
      // This is a 1:1 match with the JSON Canvas spec's own group node —
      // native Canvas renders and lets you drag/resize this exactly like
      // one of its own groups, no ib fallback needed for the visuals.
      const g = card;
      const group: CanvasGroupNode = { ...base, type: 'group', label: g.label, color: g.color, ib: stashable(g) };
      return [group];
    }

    case 'kanban-column': {
      const k = card;
      const group: CanvasGroupNode = {
        ...base, type: 'group', label: k.titleHidden ? undefined : k.title,
        color: k.topColor ?? k.color, ib: stashable(k),
      };
      const itemNodes = layoutKanbanItems(k, x, y, w, h);
      return [group, ...itemNodes];
    }

    case 'kanban-board': {
      const b = card;
      const group: CanvasGroupNode = {
        ...base, type: 'group', label: b.titleHidden ? undefined : b.title, ib: stashable(b),
      };
      return [group, ...layoutKanbanBoard(b, x, y, w, h)];
    }

    case 'column': {
      // v1: no per-child native-canvas projection (unlike kanban-board's
      // header/item text nodes) — just a labeled group, with the full
      // children array preserved in `ib`. Opening this in native Canvas
      // shows an empty labeled box rather than a degraded child preview;
      // Column Board's own view still renders every child in full.
      const col = card;
      const group: CanvasGroupNode = {
        ...base, type: 'group', label: col.titleHidden ? undefined : col.title,
        color: col.color, ib: stashable(col),
      };
      return [group];
    }

    // Calendar is a pure view over other cards' data — there are no items
    // of its own to project, so native Canvas just gets a placeholder text
    // node and the view config rides along in `ib`.
    case 'calendar': {
      const c = card;
      return [{ ...base, type: 'text', text: `📅 **${c.title ?? 'Calendar'}**\n*(Visual Notes calendar view)*`, ib: stashable(c) }];
    }

    case 'checkers': {
      const c = card;
      return [{ ...base, type: 'text', text: checkersToMarkdown(c), ib: stashable(c) }];
    }
  }
}

function checkersToMarkdown(c: CheckersCard): string {
  const glyph = (p: CheckersCard['board'][number], dark: boolean): string => {
    if (!p) return dark ? '⬛' : '⬜';
    if (p === 'r') return '🔴';
    if (p === 'R') return '🟠';
    if (p === 'b') return '⚫';
    return '🟣'; // 'B' — black king
  };
  const rows: string[] = [];
  for (let row = 0; row < 8; row++) {
    let line = '';
    for (let col = 0; col < 8; col++) {
      const dark = (row + col) % 2 === 1;
      line += glyph(c.board[row * 8 + col], dark);
    }
    rows.push(line);
  }
  const status = c.winner ? `${c.winner === 'r' ? 'Red' : 'Black'} wins!` : `${c.turn === 'r' ? 'Red' : 'Black'} to move`;
  return `**Checkers** — ${status}\n\n${rows.join('\n')}`;
}

function layoutKanbanBoard(b: KanbanBoardCard, gx: number, gy: number, gw: number, gh: number): CanvasNode[] {
  const pad = 12;
  const gap = 12;
  const headerH = 28;
  const itemH = 44;
  const n = Math.max(1, b.columns.length);
  const colW = Math.max(120, (gw - pad * 2 - gap * (n - 1)) / n);
  const nodes: CanvasNode[] = [];

  b.columns.forEach((col, ci) => {
    const cx = gx + pad + ci * (colW + gap);
    const cy = gy + (b.titleHidden ? pad : pad + 24);

    if (!col.titleHidden) {
      nodes.push({
        id: kanbanBoardHeaderNodeId(b.id, col.id),
        type: 'text',
        x: cx, y: cy, width: colW, height: headerH,
        text: `**${col.title ?? 'Untitled'}** (${col.items.length})`,
        color: col.topColor ?? col.color,
      });
    }

    const itemsStartY = cy + (col.titleHidden ? 0 : headerH + 8);
    col.items.forEach((item, ii) => {
      nodes.push({
        id: kanbanBoardItemNodeId(b.id, col.id, item.id),
        type: 'text',
        x: cx, y: itemsStartY + ii * (itemH + 8),
        width: colW, height: itemH,
        text: item.done ? `- [x] ${item.text}` : `- [ ] ${item.text}`,
        ib: item,
      });
    });
  });

  return nodes;
}

function commentToMarkdown(c: CommentCard): string {
  const fmt = (author: string | undefined, ts: number, text: string) =>
    `**${author || 'Anonymous'}** _(${new Date(ts).toLocaleString()})_\n${text}`;
  const lines = [fmt(c.author, c.createdAt, c.text)];
  for (const r of c.replies) lines.push(`\n---\n${fmt(r.author, r.createdAt, r.text)}`);
  return lines.join('\n');
}

function tableToMarkdown(t: TableCard): string {
  const esc = (s: string) => s.replace(/\n/g, ' ').replace(/\|/g, '\\|');
  const header = `| ${t.columns.map(c => esc(c.label || ' ')).join(' | ')} |`;
  const sep = `| ${t.columns.map(() => '---').join(' | ')} |`;
  const rows = t.rows.map(r => `| ${t.columns.map(c => esc(r.cells[c.id] ?? '')).join(' | ')} |`);
  const title = !t.titleHidden && t.title ? `### ${t.title}\n\n` : '';
  return title + [header, sep, ...rows].join('\n');
}

function checklistToMarkdown(c: ChecklistCard): string {
  const lines = c.items.map(item => {
    const indent = item.parentId ? '  ' : '';
    const text = item.isHeader ? `**${item.text}**` : item.text;
    return `${indent}- [${item.done ? 'x' : ' '}] ${text}`;
  });
  const title = !c.titleHidden && c.title ? `### ${c.title}\n\n` : '';
  return title + lines.join('\n');
}

// Stacks kanban items vertically as their own text nodes, geometrically
// inside the group's rectangle — JSON Canvas groups are purely spatial
// (a node "belongs" to a group by being inside its bounds), there's no
// explicit parent-id field, so simple geometric placement is enough.
function layoutKanbanItems(k: KanbanColumnCard, gx: number, gy: number, gw: number, gh: number): CanvasNode[] {
  const pad = 12;
  const headerH = k.titleHidden ? 8 : 36;
  const itemH = 44;
  const nodes: CanvasNode[] = [];
  k.items.forEach((item, i) => {
    const iy = gy + headerH + pad + i * (itemH + 8);
    nodes.push({
      id: kanbanItemNodeId(k.id, item.id),
      type: 'text',
      x: gx + pad,
      y: iy,
      width: Math.max(60, gw - pad * 2),
      height: itemH,
      text: item.done ? `- [x] ${item.text}` : `- [ ] ${item.text}`,
      ib: item,
    });
  });
  return nodes;
}

// Only ever called for connections with both ends card-anchored (see the
// fromCardId/toCardId filter in visualNotesToCanvas) — free-point ends can't
// become a spec-legal edge and are stashed in ib.freeLines instead.
function connectionToEdge(conn: Connection): CanvasEdge {
  const { fromCardId: _f, toCardId: _t, color: _c, label: _l, id: _id, ...rest } = conn;
  return {
    id: conn.id,
    fromNode: conn.fromCardId!,
    toNode: conn.toCardId!,
    color: conn.color,
    label: conn.label,
    ib: rest, // routing, elbowOrientation, style, arrowhead, thickness
  };
}

// ── Native JSON Canvas → Visual Notes ──────────────────────────────────────

export function canvasToVisualNotes(data: CanvasData): VisualNotesFile {
  const cards: Card[] = [];
  const foreignNodes: CanvasNode[] = [];
  const kanbanSubNodesByCardId = new Map<string, CanvasNode[]>();

  // First pass: separate kanban sub-nodes (legacy single-column items, or
  // multi-column board headers/items) from everything else, bucketed by the
  // id of the top-level card that owns them.
  for (const node of data.nodes) {
    if (!isKanbanItemNodeId(node.id)) continue;
    const ownerId = node.id.includes('__item__')
      ? node.id.split('__item__')[0]
      : parseKanbanBoardNodeId(node.id)?.boardId ?? null;
    if (!ownerId) continue;
    const list = kanbanSubNodesByCardId.get(ownerId) ?? [];
    list.push(node);
    kanbanSubNodesByCardId.set(ownerId, list);
  }

  for (const node of data.nodes) {
    if (isKanbanItemNodeId(node.id)) continue; // handled via their parent group

    const card = nodeToCard(node, kanbanSubNodesByCardId.get(node.id));
    if (card) cards.push(card);
    else foreignNodes.push(node);
  }

  const connections: Connection[] = [];
  const foreignEdges: CanvasEdge[] = [];
  const cardIds = new Set(cards.map(c => c.id));

  for (const edge of data.edges) {
    const conn = edgeToConnection(edge);
    if (conn && conn.fromCardId && conn.toCardId && cardIds.has(conn.fromCardId) && cardIds.has(conn.toCardId)) {
      connections.push(conn);
    } else {
      foreignEdges.push(edge);
    }
  }

  const meta = data.ib;
  // Free-point-ended connections round-trip through ib.freeLines (see
  // visualNotesToCanvas) rather than as edges — merge them back in. Drop any
  // whose surviving end no longer references a real card (the card was
  // deleted by something that doesn't know about freeLines).
  for (const line of meta?.freeLines ?? []) {
    if (line.fromCardId && !cardIds.has(line.fromCardId)) continue;
    if (line.toCardId && !cardIds.has(line.toCardId)) continue;
    connections.push(line);
  }

  return {
    version: 3,
    layout: meta?.layout ?? 'freeform',
    dotsHidden: meta?.dotsHidden,
    viewport: meta?.viewport,
    cards,
    connections,
    drawings: meta?.drawings ?? [],
    archived: meta?.archived,
    foreignNodes: foreignNodes.length ? foreignNodes : undefined,
    foreignEdges: foreignEdges.length ? foreignEdges : undefined,
  };
}

function nodeToCard(node: CanvasNode, itemNodes?: CanvasNode[]): Card | null {
  const pos = { x: node.x, y: node.y, w: node.width, h: node.height };

  if (node.ib && typeof node.ib === 'object') {
    const card = reconcileNativeEdits({ ...(node.ib as Card), id: node.id, ...pos }, node);
    if (card.kind === 'kanban-column' && itemNodes) {
      card.items = reconcileKanbanItemsGeneric(card.items, itemNodes, id => id.split('__item__')[1] ?? null);
    }
    if (card.kind === 'kanban-board' && itemNodes) {
      card.columns = card.columns.map(col => {
        const nodesForCol = itemNodes.filter(n => {
          const p = parseKanbanBoardNodeId(n.id);
          return p?.columnId === col.id && p.itemId !== null;
        });
        return {
          ...col,
          items: reconcileKanbanItemsGeneric(col.items, nodesForCol, id => parseKanbanBoardNodeId(id)?.itemId ?? null),
        };
      });
    }
    return card;
  }

  // Foreign node (no Visual Notes metadata) — synthesize a reasonable card
  // from whatever native type it is, so dropping a note/image straight into
  // native Canvas still shows up as a usable card in Visual Notes.
  switch (node.type) {
    case 'file': {
      const path = node.file;
      const ext = path.split('.').pop()?.toLowerCase() ?? '';
      if (['jpg','jpeg','png','gif','webp','svg','bmp','avif'].includes(ext)) {
        const card: ImageCard = { kind: 'image', id: node.id, ...pos, source: { type: 'vault', path } };
        return card;
      }
      if (['mp3','wav','ogg','flac','m4a','opus'].includes(ext)) {
        const card: AudioCard = { kind: 'audio', id: node.id, ...pos, source: { type: 'vault', path } };
        return card;
      }
      if (ext === 'md' || ext === 'canvas') {
        const card: NoteLinkCard = { kind: 'note-link', id: node.id, ...pos, path, displayMode: 'preview' };
        return card;
      }
      // Anything else (PDF, zip, spreadsheet, …) — a generic file card,
      // which renders a live preview for PDFs and an icon tile otherwise.
      const card: FileCard = { kind: 'file', id: node.id, ...pos, path };
      return card;
    }
    case 'link': {
      if (isGoogleMapsUrl(node.url)) {
        const card: MapCard = { kind: 'map', id: node.id, ...pos, url: node.url };
        return card;
      }
      const card: BookmarkCard = { kind: 'bookmark', id: node.id, ...pos, url: node.url };
      return card;
    }
    case 'text': {
      const card: StickyCard = { kind: 'sticky', id: node.id, ...pos, text: node.text, color: (node.color as string) ?? '#FDE68A' };
      return card;
    }
    case 'group': {
      // A group made directly in native Canvas — round-trips as a group
      // card here too, same spatial semantics either way.
      const card: GroupCard = { kind: 'group', id: node.id, ...pos, label: node.label, color: node.color };
      return card;
    }
  }
}

// Best-effort one-way patch: if the node's native text/file/url diverges
// from what Visual Notes would itself have generated for this card (i.e. it
// was hand-edited in native Canvas), pull the simple scalar fields back in.
// Structural edits (added/removed checklist or kanban items) aren't parsed.
function reconcileNativeEdits<T extends Card>(card: T, node: CanvasNode): T {
  if (card.kind === 'sticky' && node.type === 'text' && node.text !== card.text) {
    return { ...card, text: node.text };
  }
  if (card.kind === 'note-link' && node.type === 'file' && node.file !== card.path) {
    return { ...card, path: node.file };
  }
  if (card.kind === 'file' && node.type === 'file' && node.file !== card.path) {
    return { ...card, path: node.file };
  }
  if (card.kind === 'bookmark' && node.type === 'link' && node.url !== card.url) {
    return { ...card, url: node.url };
  }
  if (card.kind === 'map' && node.type === 'link' && node.url !== card.url) {
    // New link means the cached short-link resolution no longer applies.
    return { ...card, url: node.url, resolvedUrl: undefined, resolveFailed: undefined };
  }
  if (card.kind === 'group' && node.type === 'group' && (node.label !== card.label || node.color !== card.color)) {
    return { ...card, label: node.label, color: node.color };
  }
  return card;
}

function reconcileKanbanItemsGeneric(
  items: KanbanItem[],
  itemNodes: CanvasNode[],
  getItemId: (nodeId: string) => string | null,
): KanbanItem[] {
  const byId = new Map<string, CanvasNode>();
  for (const n of itemNodes) {
    const iid = getItemId(n.id);
    if (iid) byId.set(iid, n);
  }
  return items.map(item => {
    const node = byId.get(item.id);
    if (!node || node.type !== 'text') return item;
    const m = /^-\s*\[( |x)\]\s*(.*)$/s.exec(node.text.trim());
    if (!m) return item;
    return { ...item, done: m[1] === 'x', text: m[2] };
  });
}

function edgeToConnection(edge: CanvasEdge): Connection | null {
  const ib = edge.ib as Partial<Connection> | undefined;
  return {
    id: edge.id,
    fromCardId: edge.fromNode,
    toCardId: edge.toNode,
    color: edge.color ?? ib?.color ?? '#6b7280',
    label: edge.label ?? ib?.label,
    labelSize: ib?.labelSize,
    routing: ib?.routing ?? 'straight',
    elbowOrientation: ib?.elbowOrientation,
    bend: ib?.bend,
    style: ib?.style ?? 'solid',
    arrowhead: ib?.arrowhead ?? 'end',
    thickness: ib?.thickness ?? 2,
  };
}