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
//  2. The copies get linted themselves. Upstream's own `any`s, empty
//     interfaces and overlapping unions were 193 warnings on obsidian.d.ts
//     alone, so that copy carries a described `eslint-disable` header —
//     described because a bare directive is a hard error that fails the check
//     outright (1.1.3's regression; see lint-directives.test.ts). The header
//     is NOT applied to copies that lint clean: a directive suppressing
//     nothing is a warning in its own right. PACKAGES records which is which.
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
import { PACKAGES, VENDOR_HEADER, ROOT, declarationFiles } from '../scripts/vendor-types.mjs';

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

    it('carries the lint-suppression header on exactly the declared files', () => {
      // Not blanket-applied: a directive that suppresses nothing is itself a
      // warning, so headering a clean copy trades one for another.
      for (const f of dts(destDir)) {
        const wanted = pkg.header.includes(f);
        expect(
          read(join(destDir, f)).startsWith(norm(VENDOR_HEADER)),
          wanted ? `${pkg.dest}/${f} is missing the header` : `${pkg.dest}/${f} has a header it does not need`,
        ).toBe(wanted);
      }
      // The "--" separator is what makes the directive acceptable to the
      // health check; a bare one is a hard error that fails it outright.
      expect(VENDOR_HEADER).toContain('eslint-disable --');
    });

    it('matches the installed copy below the header', () => {
      for (const f of declarationFiles(pkg)) {
        const raw = read(join(destDir, f));
        const vendored = pkg.header.includes(f) ? raw.slice(norm(VENDOR_HEADER).length) : raw;
        expect(
          vendored === read(join(srcDir, f)),
          `types/${pkg.dest.replace('types/', '')}/${f} has drifted from ${pkg.src}/${f}. ` +
          'Because tsconfig `paths` resolves this module from the committed copy, the build is ' +
          'compiling against the stale one. Run: npm run sync-types',
        ).toBe(true);
      }
    });
  });
});
