import { setIcon } from 'obsidian';
import { CheckersCard, CheckersPiece } from './file-types';
import { CHECKERS_DEFAULT_W, CHECKERS_DEFAULT_H } from './freeform-view-shared';
import type { FreeformRenderer } from './freeform-view';

declare module './freeform-view' {
  interface FreeformRenderer {
    renderCheckersContent(el: HTMLElement, card: CheckersCard): void;
    handleCheckersSquareClick(el: HTMLElement, card: CheckersCard, idx: number): void;
    resetCheckers(el: HTMLElement, card: CheckersCard): void;
    addCheckersAt(x: number, y: number): void;
  }
}

// ── Pure game logic (no DOM, no FreeformRenderer) ────────────────────────

export function initialCheckersBoard(): (CheckersPiece | null)[] {
  const board: (CheckersPiece | null)[] = new Array(64).fill(null);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 !== 1) continue; // only dark squares are playable
      if (row < 3) board[row * 8 + col] = 'b';
      else if (row > 4) board[row * 8 + col] = 'r';
    }
  }
  return board;
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}
function rowColOf(idx: number): [number, number] { return [Math.floor(idx / 8), idx % 8]; }
function idxOf(row: number, col: number): number { return row * 8 + col; }
function colorOf(p: CheckersPiece): 'r' | 'b' { return (p === 'r' || p === 'R') ? 'r' : 'b'; }
function isKing(p: CheckersPiece): boolean { return p === 'R' || p === 'B'; }

export interface CheckersJump { to: number; captured: number; }

// Legal destinations for the piece at `idx` — plain moves and (separately)
// capture jumps. Never both onto the same square, so callers can freely
// union the two lists for "click a highlighted square" UI without ambiguity.
export function checkersPieceMoves(
  board: (CheckersPiece | null)[], idx: number,
): { simple: number[]; jumps: CheckersJump[] } {
  const piece = board[idx];
  const simple: number[] = [];
  const jumps: CheckersJump[] = [];
  if (!piece) return { simple, jumps };
  const color = colorOf(piece);
  const [row, col] = rowColOf(idx);
  const rowDirs = isKing(piece) ? [-1, 1] : (color === 'r' ? [-1] : [1]);
  for (const dr of rowDirs) {
    for (const dc of [-1, 1]) {
      const nr = row + dr, nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      const ni = idxOf(nr, nc);
      const occ = board[ni];
      if (!occ) { simple.push(ni); continue; }
      if (colorOf(occ) === color) continue;
      const jr = row + dr * 2, jc = col + dc * 2;
      if (!inBounds(jr, jc)) continue;
      const ji = idxOf(jr, jc);
      if (!board[ji]) jumps.push({ to: ji, captured: ni });
    }
  }
  return { simple, jumps };
}

// Mutates `card` in place: moves the piece, removes a captured piece (if
// any), and promotes to king on reaching the far row.
export function applyCheckersMove(card: CheckersCard, from: number, to: number, captured?: number): void {
  const piece = card.board[from];
  if (!piece) return;
  card.board[from] = null;
  card.board[to] = piece;
  if (captured !== undefined) card.board[captured] = null;
  const [toRow] = rowColOf(to);
  if (piece === 'r' && toRow === 0) card.board[to] = 'R';
  if (piece === 'b' && toRow === 7) card.board[to] = 'B';
}

// Sets card.winner when the side to move has no pieces, or no legal move at
// all, left — called right after a turn switch.
export function checkCheckersWinner(card: CheckersCard): void {
  let redLeft = false, blackLeft = false;
  for (const p of card.board) {
    if (!p) continue;
    if (colorOf(p) === 'r') redLeft = true; else blackLeft = true;
  }
  if (!redLeft) { card.winner = 'b'; return; }
  if (!blackLeft) { card.winner = 'r'; return; }
  const toMoveHasMove = card.board.some((p, i) => {
    if (!p || colorOf(p) !== card.turn) return false;
    const { simple, jumps } = checkersPieceMoves(card.board, i);
    return simple.length > 0 || jumps.length > 0;
  });
  if (!toMoveHasMove) card.winner = card.turn === 'r' ? 'b' : 'r';
}

// ── FreeformRenderer methods ──────────────────────────────────────────────

export const cardsCheckersMethods = {
  renderCheckersContent(this: FreeformRenderer, el: HTMLElement, card: CheckersCard): void {
    el.addClass('visual-notes-freeform-checkers-card');

    const header = el.createDiv('visual-notes-checkers-header');
    const status = header.createDiv('visual-notes-checkers-status');
    if (card.winner) {
      status.setText(`${card.winner === 'r' ? 'Red' : 'Black'} wins!`);
      status.addClass(card.winner === 'r' ? 'is-red' : 'is-black');
    } else {
      status.setText(`${card.turn === 'r' ? 'Red' : 'Black'} to move`);
      status.addClass(card.turn === 'r' ? 'is-red' : 'is-black');
    }
    const resetBtn = header.createDiv('visual-notes-checkers-reset');
    setIcon(resetBtn, 'rotate-ccw');
    resetBtn.setAttribute('aria-label', 'New game');
    resetBtn.setAttribute('tabindex', '0');
    resetBtn.addEventListener('pointerdown', e => e.stopPropagation());
    resetBtn.addEventListener('click', (e) => { e.stopPropagation(); this.resetCheckers(el, card); });
    resetBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.resetCheckers(el, card); }
    });

    const w = parseFloat(el.style.width) || (card.w ?? CHECKERS_DEFAULT_W);
    const h = parseFloat(el.style.height) || (card.h ?? CHECKERS_DEFAULT_H);
    const boardSize = Math.max(160, Math.min(w - 16, h - 16 - 36));

    const wrap = el.createDiv('visual-notes-checkers-board-wrap');
    const boardEl = wrap.createDiv('visual-notes-checkers-board');
    boardEl.style.width = `${boardSize}px`;
    boardEl.style.height = `${boardSize}px`;

    const selected = this.checkersSelected.get(card.id) ?? null;
    const { simple, jumps } = selected !== null ? checkersPieceMoves(card.board, selected) : { simple: [], jumps: [] };
    const legalTargets = new Set<number>([...simple, ...jumps.map(j => j.to)]);

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const idx = idxOf(row, col);
        const dark = (row + col) % 2 === 1;
        const sq = boardEl.createDiv('visual-notes-checkers-square');
        sq.toggleClass('is-dark', dark);
        sq.toggleClass('is-light', !dark);

        const piece = card.board[idx];
        if (piece) {
          const pc = sq.createDiv('visual-notes-checkers-piece');
          pc.addClass(colorOf(piece) === 'r' ? 'is-red' : 'is-black');
          if (isKing(piece)) {
            pc.addClass('is-king');
            setIcon(pc.createSpan('visual-notes-checkers-crown'), 'crown');
          }
        }
        if (dark && idx === selected) sq.addClass('is-selected');
        if (dark && legalTargets.has(idx)) sq.addClass('is-legal-target');

        if (dark && !card.winner) {
          sq.setAttribute('tabindex', '0');
          sq.addEventListener('pointerdown', e => e.stopPropagation());
          sq.addEventListener('click', (e) => { e.stopPropagation(); this.handleCheckersSquareClick(el, card, idx); });
        }
      }
    }

    this.appendResizeHandles(el);
  },

  handleCheckersSquareClick(this: FreeformRenderer, el: HTMLElement, card: CheckersCard, idx: number): void {
    if (card.winner) return;
    const selMap = this.checkersSelected;
    const forcedSet = this.checkersForced;
    const selected = selMap.get(card.id) ?? null;
    const isForced = forcedSet.has(card.id);
    const piece = card.board[idx];

    const switchTurn = () => {
      selMap.delete(card.id); forcedSet.delete(card.id);
      card.turn = card.turn === 'r' ? 'b' : 'r';
      checkCheckersWinner(card);
    };

    if (selected !== null) {
      const { simple, jumps } = checkersPieceMoves(card.board, selected);
      const jump = jumps.find(j => j.to === idx);
      if (jump) {
        this.pushUndo();
        applyCheckersMove(card, selected, jump.to, jump.captured);
        const more = checkersPieceMoves(card.board, jump.to).jumps;
        if (more.length > 0) { selMap.set(card.id, jump.to); forcedSet.add(card.id); }
        else switchTurn();
        this.renderCardContent(el, card);
        this.scheduleSave();
        return;
      }
      if (!isForced && simple.includes(idx)) {
        this.pushUndo();
        applyCheckersMove(card, selected, idx);
        switchTurn();
        this.renderCardContent(el, card);
        this.scheduleSave();
        return;
      }
      if (isForced) return; // mid multi-jump: only a further jump is a legal click
      if (piece && colorOf(piece) === card.turn && idx !== selected) selMap.set(card.id, idx);
      else selMap.delete(card.id);
      this.renderCardContent(el, card);
      return;
    }

    if (!isForced && piece && colorOf(piece) === card.turn) {
      selMap.set(card.id, idx);
      this.renderCardContent(el, card);
    }
  },

  resetCheckers(this: FreeformRenderer, el: HTMLElement, card: CheckersCard): void {
    this.pushUndo();
    card.board = initialCheckersBoard();
    card.turn = 'r';
    card.winner = undefined;
    this.checkersSelected.delete(card.id);
    this.checkersForced.delete(card.id);
    this.renderCardContent(el, card);
    this.scheduleSave();
  },

  addCheckersAt(this: FreeformRenderer, x: number, y: number): void {
    const card: CheckersCard = {
      id: crypto.randomUUID(), kind: 'checkers', x, y,
      w: CHECKERS_DEFAULT_W, h: CHECKERS_DEFAULT_H, z: this.nextZ(),
      board: initialCheckersBoard(), turn: 'r',
    };
    this.pushUndo(); this.board.cards.push(card); void this.saveNow();
    this.createCardEl(card);
    this.selection.select(card.id); this.refreshSelectionVisuals();
  },
};
