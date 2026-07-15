/** Tracks which card IDs are currently selected. */
export class SelectionManager {
  private ids = new Set<string>();

  has(id: string): boolean { return this.ids.has(id); }

  /** Replace selection with a single id. */
  select(id: string): void { this.ids = new Set([id]); }

  add(id: string): void { this.ids.add(id); }

  toggle(id: string): void {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
  }

  clear(): void { this.ids = new Set(); }

  getIds(): string[] { return [...this.ids]; }

  isEmpty(): boolean { return this.ids.size === 0; }

  size(): number { return this.ids.size; }
}
