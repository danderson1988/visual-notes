import { App, Notice } from 'obsidian';

// The one place this plugin reaches into Obsidian's private command registry.
// `app.commands` is not part of the public API, so it can change or vanish in
// any Obsidian release, and a command id belongs to whichever community plugin
// registered it. Isolated here so there is a single site to fix when either
// moves, and so the failure is a clear Notice rather than a TypeError from
// inside a click handler.

/** Obsidian's private command registry, as much of it as we use. */
interface CommandRegistry {
  commands?: Record<string, unknown>;
  executeCommandById(id: string): boolean;
}

function registry(app: App): CommandRegistry | null {
  const candidate = (app as unknown as { commands?: unknown }).commands;
  if (typeof candidate !== 'object' || candidate === null) return null;
  const exec = (candidate as { executeCommandById?: unknown }).executeCommandById;
  return typeof exec === 'function' ? (candidate as CommandRegistry) : null;
}

/** Whether `id` is a command Obsidian currently knows about. */
export function isCommandAvailable(app: App, id: string): boolean {
  const reg = registry(app);
  // No `commands` map means we can't tell — report available and let
  // runCommand's own failure path handle it, rather than hiding a button that
  // might work.
  return reg ? (reg.commands ? id in reg.commands : true) : false;
}

/**
 * Runs a command by id. Returns false and shows `unavailableMessage` if the
 * private API is missing, the command isn't registered, or it throws.
 */
export function runCommand(app: App, id: string, unavailableMessage: string): boolean {
  const reg = registry(app);
  if (!reg || !isCommandAvailable(app, id)) {
    new Notice(unavailableMessage);
    return false;
  }
  try {
    reg.executeCommandById(id);
    return true;
  } catch {
    new Notice(unavailableMessage);
    return false;
  }
}

/** Command id registered by the community "Kanban" plugin. */
export const KANBAN_CREATE_BOARD_COMMAND = 'obsidian-kanban:create-new-kanban-board';
