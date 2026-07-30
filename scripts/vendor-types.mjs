// Refreshes types/ from the installed dependencies. Run after bumping any of
// the packages in PACKAGES below:  npm run sync-types
//
// Why these copies exist: Obsidian's plugin health check lints this repo
// without installing anything. With no types resolvable, every value from a
// third-party module is error-typed and each call on one trips no-unsafe-call
// — 9,510 warnings against code that compiles cleanly, which is what rated the
// plugin risky. tsconfig `paths` resolves these modules from the copies here
// instead, so resolution never depends on node_modules existing.
//
// Two things that are easy to get wrong:
//
//  1. The copies get linted themselves, so a copy can trade one set of
//     warnings for another. See `header` below.
//
//  2. esbuild honours `paths` too, and would resolve the three bundled modules
//     to .d.ts files, producing a main.js with them missing.
//     tsconfig.build.json drops `paths` and the build reads that instead — see
//     esbuild.config.mjs. Verified in test/vendored-types.test.ts.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const VENDOR_HEADER =
  '/* eslint-disable -- Vendored third-party type definitions, copied verbatim from the\n' +
  '   package of the same name. Not this project\'s code: linting them reports on upstream\n' +
  '   style choices that cannot be changed without diverging from the file being mirrored.\n' +
  '   Managed by scripts/vendor-types.mjs; refresh with `npm run sync-types`. */\n';

/**
 * `module` is the bare specifier tsconfig maps to `dest/entry`.
 *
 * `files` — which declarations to copy. Omit to copy every .d.ts in `src`,
 * which is what the packages whose entry re-exports siblings need. State it
 * explicitly to copy less: node_modules/obsidian also ships canvas.d.ts and
 * publish.d.ts, which nothing here imports and which contributed 37 warnings
 * of their own when copied for no reason.
 *
 * `header` — which copies get the lint-suppression comment. Deliberately
 * per-file, not per-package: ESLint reports a directive that suppresses
 * nothing as a warning in its own right, so headering a clean file just trades
 * one warning for another (measured: 18 new "unused eslint-disable directive"
 * warnings when every copy carried one). Counts measured with nothing
 * installed, headers off:
 *
 *   obsidian/obsidian.d.ts        193  upstream `any`s, empty interfaces,
 *                                      overlapping unions, restricted `moment`
 *   html-to-image/types.d.ts        6  overlapping unions in a font-format type
 *   html-to-image/util.d.ts         1  an `any`
 *   sortablejs/index.d.ts           2  an overlapping union, + see below
 *   sortablejs/plugins.d.ts         2  a require()-style import, + see below
 *   (18 other copies)               0  no header
 *
 * Two warnings survive regardless: @types/sortablejs ships its own
 * eslint-disable comments for a rule this config doesn't enable, and ESLint
 * reports those as unused. A file-level disable doesn't suppress unused-
 * directive reporting, and stripping upstream's comments would mean the copies
 * no longer match what they mirror — not worth it for two warnings.
 *
 * After bumping any of these dependencies, re-measure and update the counts.
 */
export const PACKAGES = [
  {
    module: 'obsidian', src: 'node_modules/obsidian', dest: 'types/obsidian',
    entry: 'obsidian.d.ts', files: ['obsidian.d.ts'], header: ['obsidian.d.ts'],
  },
  {
    module: 'sortablejs', src: 'node_modules/@types/sortablejs', dest: 'types/sortablejs',
    entry: 'index.d.ts', header: ['index.d.ts', 'plugins.d.ts'],
  },
  {
    module: 'perfect-freehand', src: 'node_modules/perfect-freehand/dist/types', dest: 'types/perfect-freehand',
    entry: 'index.d.ts', header: [],
  },
  {
    module: 'html-to-image', src: 'node_modules/html-to-image/lib', dest: 'types/html-to-image',
    entry: 'index.d.ts', header: ['types.d.ts', 'util.d.ts'],
  },
];

/** Declarations a package contributes: its explicit list, or every .d.ts. */
export function declarationFiles(pkg) {
  return pkg.files ?? readdirSync(join(ROOT, pkg.src)).filter(f => f.endsWith('.d.ts')).sort();
}

export function syncTypes() {
  const summary = [];
  for (const pkg of PACKAGES) {
    const files = declarationFiles(pkg);
    const destAbs = join(ROOT, pkg.dest);
    // Cleared first so a file dropped upstream doesn't linger here and keep
    // being what we compile against.
    if (existsSync(destAbs)) rmSync(destAbs, { recursive: true });
    mkdirSync(destAbs, { recursive: true });
    for (const f of files) {
      const body = readFileSync(join(ROOT, pkg.src, f), 'utf8');
      writeFileSync(join(destAbs, f), pkg.header.includes(f) ? VENDOR_HEADER + body : body);
    }
    summary.push(`${pkg.module}: ${files.length} file(s), ${pkg.header.length} headered -> ${pkg.dest}`);
  }
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const line of syncTypes()) console.log('  ' + line);
  console.log('Vendored type definitions refreshed.');
}
