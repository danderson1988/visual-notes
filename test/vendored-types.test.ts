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
//  2. The copies are written VERBATIM, with no directives of ours. They report
//     upstream's own `any`s and empty interfaces (~204 warnings) and that is
//     accepted, because it cannot be fixed: 1.1.6 added a described
//     `eslint-disable` header and the check rejected it as three separate hard
//     errors, failing the update. Chief among them, a list of rules may never
//     be disabled at all — including no-explicit-any, which is most of these.
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
import { PACKAGES, ROOT, declarationFiles, stripLintDirectives } from '../scripts/vendor-types.mjs';

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

    it('matches the installed copy, once upstream lint directives are stripped', () => {
      for (const f of declarationFiles(pkg)) {
        // Same transform the sync applies: comments only, so a difference
        // here is always a real declaration change.
        expect(
          read(join(destDir, f)) === stripLintDirectives(read(join(srcDir, f))),
          `types/${pkg.dest.replace('types/', '')}/${f} has drifted from ${pkg.src}/${f}. ` +
          'Because tsconfig `paths` resolves this module from the committed copy, the build is ' +
          'compiling against the stale one. Run: npm run sync-types',
        ).toBe(true);
      }
    });
  });
});
