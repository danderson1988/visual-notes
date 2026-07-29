// The settings tab has two rendering paths: Obsidian 1.13+ renders
// declaratively from getSettingDefinitions(), older versions call display()
// which builds the same settings imperatively. Both delegate to one shared
// buildX body per setting, so a setting can never *render* differently
// between them.
//
// What that shares nothing of is the INVENTORY. Adding a setting means
// remembering two separate places, and nothing used to complain if you
// didn't: the "Pan the canvas with" dropdown shipped in 1.0.71 with only the
// imperative call site, so it was invisible to everyone on 1.13+ — including
// a user who spent two update cycles trying to find it. The stale-build
// version notice had drifted the same way, which is the reason that user
// couldn't tell which build they were even running.
//
// These tests read settings.ts as source text rather than instantiating the
// tab, because the declarative path needs an Obsidian version the test
// environment doesn't have. Source-level is enough: what's being asserted is
// that the two lists mention the same builders.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '..', 'src', 'settings.ts'), 'utf8');

/** Builder methods referenced inside a slice of the file. */
function buildersIn(from: string, to: string): Set<string> {
  const start = src.indexOf(from);
  const end = src.indexOf(to, start + from.length);
  expect(start, `anchor not found: ${from}`).toBeGreaterThan(-1);
  expect(end, `anchor not found: ${to}`).toBeGreaterThan(start);
  return new Set(Array.from(src.slice(start, end).matchAll(/this\.(build\w+)\(/g), m => m[1]));
}

const declarative = () => buildersIn('getSettingDefinitions()', '// ── Imperative fallback');
const imperative = () => buildersIn('private renderImperative()', 'private build');

describe('settings tab: the two rendering paths stay in step', () => {
  it('finds builders on both paths at all', () => {
    // Guards the anchors above: if settings.ts is restructured so a slice
    // comes back empty, every other assertion here would pass vacuously.
    expect(declarative().size).toBeGreaterThan(15);
    expect(imperative().size).toBeGreaterThan(15);
  });

  it('every setting rendered imperatively is also declared for Obsidian 1.13+', () => {
    const missing = [...imperative()].filter(b => !declarative().has(b)).sort();
    expect(missing, `Missing from getSettingDefinitions(), so invisible on Obsidian 1.13+: ${missing.join(', ')}`)
      .toEqual([]);
  });

  it('every setting declared for Obsidian 1.13+ is also rendered imperatively', () => {
    const missing = [...declarative()].filter(b => !imperative().has(b)).sort();
    expect(missing, `Missing from renderImperative(), so invisible below Obsidian 1.13: ${missing.join(', ')}`)
      .toEqual([]);
  });

  it('covers the two settings that had actually drifted', () => {
    // Named explicitly so a future refactor that drops them is unmistakable.
    for (const builder of ['buildPanButton', 'buildVersionNotice']) {
      expect(declarative().has(builder), `${builder} missing from getSettingDefinitions()`).toBe(true);
      expect(imperative().has(builder), `${builder} missing from renderImperative()`).toBe(true);
    }
  });
});
