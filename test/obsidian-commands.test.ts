// `app.commands` is private Obsidian API. It can change or disappear in any
// release, and the command ids belong to whichever community plugin registered
// them. This used to be an inline cast in a click handler, where any of those
// changes surfaced as a TypeError with no user-visible explanation.
import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import { isCommandAvailable, runCommand, KANBAN_CREATE_BOARD_COMMAND } from '../src/obsidian-commands';

const MSG = 'unavailable';

/** An App exposing only as much of the private command registry as asked for. */
function appWith(commands: unknown): App {
  return { commands } as unknown as App;
}

function registryWith(ids: string[], exec = vi.fn(() => true)) {
  return { commands: Object.fromEntries(ids.map(id => [id, {}])), executeCommandById: exec };
}

describe('isCommandAvailable', () => {
  it('is true for a registered command', () => {
    expect(isCommandAvailable(appWith(registryWith(['a:b'])), 'a:b')).toBe(true);
  });

  it('is false for an unregistered command', () => {
    expect(isCommandAvailable(appWith(registryWith(['a:b'])), 'other:id')).toBe(false);
  });

  it.each([
    ['commands missing entirely', undefined],
    ['commands not an object', 'nope'],
    ['commands null', null],
    ['no executeCommandById', { commands: {} }],
  ])('is false when %s', (_label, commands) => {
    expect(isCommandAvailable(appWith(commands), 'a:b')).toBe(false);
  });

  it('assumes available when the registry exists but exposes no command map', () => {
    // Can't enumerate, so don't hide a button that might work — runCommand's
    // own failure path covers it.
    expect(isCommandAvailable(appWith({ executeCommandById: vi.fn() }), 'a:b')).toBe(true);
  });
});

describe('runCommand', () => {
  it('executes a registered command and reports success', () => {
    const exec = vi.fn(() => true);
    expect(runCommand(appWith(registryWith(['a:b'], exec)), 'a:b', MSG)).toBe(true);
    expect(exec).toHaveBeenCalledWith('a:b');
  });

  it('returns false without invoking anything when the command is not registered', () => {
    const exec = vi.fn(() => true);
    expect(runCommand(appWith(registryWith(['a:b'], exec)), 'missing:id', MSG)).toBe(false);
    // The point of the guard: nothing is invoked when we know it isn't there.
    expect(exec).not.toHaveBeenCalled();
  });

  it('returns false when the private API is absent entirely', () => {
    expect(runCommand(appWith(undefined), 'a:b', MSG)).toBe(false);
  });

  it('survives a command that throws', () => {
    // A community plugin's own handler failing must not escape as an unhandled
    // TypeError out of a click handler.
    const exec = vi.fn(() => { throw new Error('plugin blew up'); });
    expect(runCommand(appWith(registryWith(['a:b'], exec)), 'a:b', MSG)).toBe(false);
    expect(exec).toHaveBeenCalled();
  });

  it('pins the Kanban command id', () => {
    // Hard-coded in the Kanban plugin, so a change here should be deliberate.
    expect(KANBAN_CREATE_BOARD_COMMAND).toBe('obsidian-kanban:create-new-kanban-board');
  });
});
