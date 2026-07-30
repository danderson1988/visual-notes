// types/ holds committed copies of third-party type definitions, and
// tsconfig.json's `paths` resolves those modules from them.
//
// Why: Obsidian's plugin health check lints this repo WITHOUT installing
// dependencies. With no types resolvable, every value from a third-party
// module is error-typed and each call on one trips no-unsafe-call — measured
// at 9,510 messages against code `tsc` compiles cleanly, which is what rated
// the plugin risky. Resolving from committed copies takes that to zero.
//
// The costs, and what this file pins:
//
//  1. Drift. `paths` wins, so a stale copy silently becomes what we compile
//     against — hiding real API changes at exactly the moment they matter, an
//     upstream upgrade. Every copy is compared against its installed source.
//
//  2. The copies are NOT verbatim — see scripts/vendor-types.mjs for the
//     pipeline. They carry no directives of ours (1.1.6 added a described
//     `eslint-disable` header and the check rejected it as three separate hard
//     errors, failing the update), and no patterns the check warns about, since
//     a list of rules may never be disabled at all — including no-explicit-any,
//     which was 150 of 1.1.8's 196 warnings. Because they are transformed,
//     `npm run typecheck:upstream` is what proves our code still matches the
//     real API rather than only these copies.
//
//  3. esbuild honours `paths` too and would bundle declarations instead of the
//     real modules, so the build reads tsconfig.build.json, which drops them.
//     Verified here so the two configs can't silently diverge.
//
// Refresh after bumping any of these dependencies: npm run sync-types
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
// Imported rather than restated: the script writes these copies and this file
// checks them, so a second copy of the header or the package list could drift
// and let real drift slip through.
import { PACKAGES, ROOT, declarationFiles, applyTransforms } from '../scripts/vendor-types.mjs';

const norm = (s: string) => s.replace(/\r\n/g, '\n');
const read = (p: string) => norm(readFileSync(p, 'utf8'));
const dts = (dir: string) => readdirSync(dir).filter(f => f.endsWith('.d.ts')).sort();

describe('vendored third-party type definitions', () => {
  it('covers every module tsconfig maps', () => {
    // Guards against a mapping being added without a copy to back it, which
    // would break resolution outright, or removed while the copy lingers,
    // which would quietly restore the warning flood.
    const tsconfig = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8');
    for (const pkg of PACKAGES) {
      expect(tsconfig, `tsconfig.json has no paths mapping for ${pkg.module}`)
        .toContain(`"${pkg.module}": ["./${pkg.dest}/${pkg.entry}"]`);
    }
  });

  it('the build config drops paths so esbuild bundles the real modules', () => {
    const build = readFileSync(join(ROOT, 'tsconfig.build.json'), 'utf8');
    expect(build).toContain('"paths": {}');
    expect(readFileSync(join(ROOT, 'esbuild.config.mjs'), 'utf8')).toContain('tsconfig: "tsconfig.build.json"');
  });

  describe.each(PACKAGES.filter(p => p.dropDeclarations))('$module pruning', (pkg: typeof PACKAGES[number]) => {
    // Pruning is only sound while nothing here imports the pruned API. If a
    // future feature does, this fails and the entry in PACKAGES must narrow —
    // which will reintroduce the no-unsupported-api errors and force a real
    // decision about minAppVersion rather than a silent broken build.
    const copy = read(join(ROOT, pkg.dest, pkg.entry));
    const declared = (text: string) =>
      [...text.matchAll(/^export (?:declare )?(?:abstract )?(?:class|interface|type|function|const|enum|namespace)\s+([A-Za-z0-9_]+)/gm)]
        .map(m => m[1]);

    it('drops every declaration the manifest matches', () => {
      const leftover = declared(copy).filter(n => pkg.dropDeclarations?.test(n));
      expect(leftover, `still present in ${pkg.dest}/${pkg.entry}`).toEqual([]);
    });

    it('drops the listed members', () => {
      for (const sig of pkg.dropMembers ?? []) expect(copy).not.toContain(sig);
    });

    it('leaves no extends clause pointing at an API newer than minAppVersion', () => {
      // This is the condition that produced the 19 errors: an `extends` clause
      // is a reference, so a subclass of a newer-API base flags itself.
      const since = new Map<string, string>();
      const lines = copy.split('\n');
      lines.forEach((line, i) => {
        const decl = /^export (?:declare )?(?:abstract )?(?:class|interface|type|function|const|enum|namespace)\s+([A-Za-z0-9_]+)/.exec(line);
        if (!decl) return;
        for (let k = i - 1; k >= Math.max(0, i - 12); k--) {
          const tag = /@since ([0-9.]+)/.exec(lines[k]);
          if (tag) { since.set(decl[1], tag[1]); return; }
          if (lines[k].trim().startsWith('/**')) return;
        }
      });

      const floor = (JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as { minAppVersion: string }).minAppVersion;
      const parts = (v: string) => v.split('.').map(Number);
      const newer = (v: string) => {
        const [a, b, c] = parts(v), [x, y, z] = parts(floor);
        return a !== x ? a > x : b !== y ? b > y : (c || 0) > (z || 0);
      };

      const offenders: string[] = [];
      lines.forEach((line, i) => {
        const ext = /^export (?:declare )?(?:abstract )?class\s+[^{]*?\bextends\s+([A-Za-z0-9_]+)/.exec(line);
        const base = ext?.[1];
        const s = base ? since.get(base) : undefined;
        if (s && newer(s)) offenders.push(`${pkg.entry}:${i + 1} extends ${base ?? '?'} (@since ${s} > minAppVersion ${floor})`);
      });
      expect(offenders, `obsidianmd/no-unsupported-api reports these as errors: ${offenders.join(', ')}`).toEqual([]);
    });
  });

  describe('normalised copies carry no warning-triggering patterns', () => {
    // Every pattern below is one the check reported against 1.1.8's copies —
    // 196 warnings, 150 of them no-explicit-any, and the reason the rating sat
    // at "caution". None can be suppressed (no-explicit-any is on the
    // never-disable list), so cleanDeclarations() normalises them away instead.
    // If one comes back, the rating regresses, so this fails the build.
    const ATOM = "(?:[A-Za-z0-9_$.]+(?:<[^<>]*>)?(?:\\[\\])?|'[^']*'|\"[^\"]*\")";
    const union = new RegExp(ATOM + '(?:\\s*\\|\\s*' + ATOM + ')+', 'g');
    const isComment = (s: string) => {
      const t = s.trim();
      return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*');
    };

    const files = PACKAGES.flatMap((pkg: typeof PACKAGES[number]) =>
      dts(join(ROOT, pkg.dest)).map(f => [`${pkg.dest}/${f}`, read(join(ROOT, pkg.dest, f))] as const));

    it('scans every vendored file', () => {
      expect(files.length).toBeGreaterThan(20);
    });

    it('has no explicit `any`', () => {
      const hits = files.flatMap(([name, text]) => text.split('\n')
        .map((line, i) => (!isComment(line) && /\bany\b/.test(line) ? `${name}:${i + 1}` : null))
        .filter((x): x is string => x !== null));
      expect(hits, `no-explicit-any is on the check's never-disable list, so these cannot be silenced: ${hits.join(', ')}`).toEqual([]);
    });

    it('has no redundant union members', () => {
      const hits: string[] = [];
      for (const [name, text] of files) {
        text.split('\n').forEach((line, i) => {
          if (isComment(line)) return;
          for (const m of line.match(union) ?? []) {
            const atoms = m.split('|').map(s => s.trim());
            const absorbed = atoms.includes('unknown')
              || (atoms.includes('string') && atoms.some(a => /^['"]/.test(a)));
            if (absorbed) hits.push(`${name}:${i + 1} (${m.trim().slice(0, 48)})`);
          }
        });
      }
      expect(hits, `"x is overridden by" / "overrides all other types" warnings: ${hits.join(', ')}`).toEqual([]);
    });

    it('has no bare `Function`, empty interface, or non-type CommonJS import', () => {
      const hits: string[] = [];
      for (const [name, text] of files) {
        text.split('\n').forEach((line, i) => {
          if (isComment(line)) return;
          if (/\bFunction\b(?=\s*[;,)\]}]|$)/.test(line)) hits.push(`${name}:${i + 1} bare Function`);
          if (/^import \* as \w+ from /.test(line)) hits.push(`${name}:${i + 1} non-type namespace import`);
          if (/\brequire\(/.test(line)) hits.push(`${name}:${i + 1} require() import`);
        });
        for (const m of text.match(/^export interface [^{]*\{\s*\}/gm) ?? []) hits.push(`${name} empty interface: ${m.slice(0, 48)}`);
      }
      expect(hits, `remaining warning triggers: ${hits.join(', ')}`).toEqual([]);
    });
  });

  describe.each(PACKAGES)('$module', (pkg: typeof PACKAGES[number]) => {
    const srcDir = join(ROOT, pkg.src);
    const destDir = join(ROOT, pkg.dest);

    it('is installed, so drift can be detected at all', () => {
      expect(existsSync(srcDir), `${pkg.src} missing — run npm ci`).toBe(true);
    });

    it('vendors exactly the declarations the manifest calls for', () => {
      // A file added upstream must be copied (otherwise an import of it fails
      // to resolve for the health check); one removed upstream must not linger
      // here still being compiled against.
      expect(dts(destDir)).toEqual(declarationFiles(pkg));
    });

    it('has the entry file the paths mapping points at', () => {
      expect(existsSync(join(destDir, pkg.entry))).toBe(true);
    });

    it('adds no lint directives of our own', () => {
      // Anything we add here is a hard error for the health check: unlimited
      // disables are forbidden, block disables need a matching enable, and the
      // rules these files would need silenced are on a never-disable list.
      // Upstream's own targeted next-line directives are fine and preserved —
      // the byte comparison below is what keeps them honest.
      for (const f of dts(destDir)) {
        expect(
          read(join(destDir, f)).startsWith('/* eslint-disable'),
          `${pkg.dest}/${f} starts with a file-level eslint-disable; that fails Obsidian's check`,
        ).toBe(false);
      }
    });

    it('matches the installed copy, once the sync transform is applied', () => {
      for (const f of declarationFiles(pkg)) {
        // The same transform the sync applies — stripping upstream's lint
        // directives and pruning declarations we don't import — so a
        // difference here is always a real declaration change. applyTransforms
        // also throws if a prune left a dangling reference, which is how an
        // upstream release that wires a pruned API into a kept one surfaces.
        expect(
          read(join(destDir, f)) === applyTransforms(read(join(srcDir, f)), pkg),
          `types/${pkg.dest.replace('types/', '')}/${f} has drifted from ${pkg.src}/${f}. ` +
          'Because tsconfig `paths` resolves this module from the committed copy, the build is ' +
          'compiling against the stale one. Run: npm run sync-types',
        ).toBe(true);
      }
    });
  });
});
