// types/obsidian.d.ts is a committed copy of the Obsidian API typings that
// normally arrive via the `obsidian` devDependency, and tsconfig.json's
// `paths` resolves the API from it.
//
// Why it exists: Obsidian's plugin health check lints this repo WITHOUT
// installing dependencies. A type-aware lint with no types makes every value
// obtained from the API error-typed, so every call on one trips
// no-unsafe-call — measured at 9,510 messages (4,137 of them no-unsafe-call)
// against code that compiles cleanly. Resolving the API from a committed copy
// takes that to zero, because it no longer depends on node_modules existing.
//
// The cost is that the copy can silently fall behind the devDependency, and
// because `paths` wins, our own build would keep compiling against the stale
// one — hiding real API changes at exactly the moment they matter (an
// Obsidian upgrade). This test is what makes that impossible.
//
// To refresh after bumping the obsidian devDependency: npm run sync-obsidian-types
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const VENDORED = join(ROOT, 'types', 'obsidian.d.ts');
const UPSTREAM = join(ROOT, 'node_modules', 'obsidian', 'obsidian.d.ts');

describe('vendored Obsidian API typings', () => {
  it('the committed copy exists', () => {
    expect(existsSync(VENDORED), `${VENDORED} is missing — tsconfig paths resolves the API from it`).toBe(true);
  });

  it('matches the installed obsidian devDependency exactly', () => {
    expect(existsSync(UPSTREAM), 'obsidian devDependency not installed — run npm ci').toBe(true);
    const vendored = readFileSync(VENDORED);
    const upstream = readFileSync(UPSTREAM);
    expect(
      vendored.equals(upstream),
      'types/obsidian.d.ts has drifted from node_modules/obsidian/obsidian.d.ts. ' +
      'Because tsconfig `paths` resolves the API from the committed copy, the build is ' +
      'compiling against the stale one. Run: npm run sync-obsidian-types',
    ).toBe(true);
  });

  it('is the copy tsconfig actually resolves the API from', () => {
    // Guards against the mapping being edited away while the file lingers —
    // which would silently put us back to depending on node_modules, and
    // bring the whole warning flood back on Obsidian's checker.
    const tsconfig = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8');
    expect(tsconfig).toContain('./types/obsidian.d.ts');
  });
});
