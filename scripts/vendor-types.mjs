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
//  1. The copies get linted themselves, and CANNOT be silenced. 1.1.6 tried a
//     described `/* eslint-disable -- … */` header and the check rejected it
//     three ways at once, as hard errors that failed the update outright:
//     unlimited disables are forbidden, a block disable needs a matching
//     `eslint-enable`, and — decisively — a list of rules may never be
//     disabled at all, including @typescript-eslint/no-explicit-any, which is
//     what most of these warnings are. Copies are therefore written verbatim,
//     with no directives of ours. See test/lint-directives.test.ts.
//
//  2. esbuild honours `paths` too, and would resolve the three bundled modules
//     to .d.ts files, producing a main.js with them missing.
//     tsconfig.build.json drops `paths` and the build reads that instead — see
//     esbuild.config.mjs. Verified in test/vendored-types.test.ts.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `module` is the bare specifier tsconfig maps to `dest/entry`.
 *
 * `files` — which declarations to copy. Omit to copy every .d.ts in `src`,
 * which is what the packages whose entry re-exports siblings need. State it
 * explicitly to copy less: node_modules/obsidian also ships canvas.d.ts and
 * publish.d.ts, which nothing here imports and which contributed 37 warnings
 * of their own when copied for no reason.
 *
 * The copies report warnings of their own — upstream's `any`s, empty
 * interfaces and overlapping unions, ~204 of them, dominated by
 * no-explicit-any. Those are accepted: they cannot be suppressed (see above),
 * and they are the price of the src/ warnings going from 9,510 to zero.
 * Vendoring less is not an improvement — dropping a copy puts the far larger
 * flood back into our own code.
 *
 * After bumping any of these dependencies, run this script and re-measure.
 */
export const PACKAGES = [
  {
    module: 'obsidian', src: 'node_modules/obsidian', dest: 'types/obsidian',
    entry: 'obsidian.d.ts', files: ['obsidian.d.ts'],
  },
  {
    module: 'sortablejs', src: 'node_modules/@types/sortablejs', dest: 'types/sortablejs',
    entry: 'index.d.ts',
  },
  {
    module: 'perfect-freehand', src: 'node_modules/perfect-freehand/dist/types', dest: 'types/perfect-freehand',
    entry: 'index.d.ts',
  },
  {
    module: 'html-to-image', src: 'node_modules/html-to-image/lib', dest: 'types/html-to-image',
    entry: 'index.d.ts',
  },
];

/**
 * Removes ESLint directive comments from a vendored copy.
 *
 * These files exist only to carry type information, so a lint directive in one
 * is noise — and actively dangerous noise: @types/sortablejs ships two
 * undescribed `eslint-disable-next-line` comments, and an undescribed
 * directive is a hard error for Obsidian's check (it failed 1.1.3 over exactly
 * that). 1.1.6 masked them by accident with a file-level disable of its own;
 * removing that would have exposed them.
 *
 * Stripping them cannot change a declaration — they are comments. The drift
 * comparison in test/vendored-types.test.ts applies this same transform to
 * upstream before comparing, so real changes are still caught.
 */
// Plain string checks rather than a regex: this needs to match both comment
// styles, and getting the escaping wrong in a regex is exactly how an earlier
// attempt silently matched nothing at all.
const DIRECTIVE_STARTS = [
  '// eslint-disable', '//eslint-disable', '/* eslint-disable', '/*eslint-disable',
  '// eslint-enable',  '//eslint-enable',  '/* eslint-enable',  '/*eslint-enable',
];

export function stripLintDirectives(text) {
  const NL = String.fromCharCode(10);
  return text
    .split(NL)
    .filter(line => !DIRECTIVE_STARTS.some(p => line.trim().startsWith(p)))
    .join(NL);
}

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
      // No directives of ours added, and upstream's stripped — see above.
      writeFileSync(join(destAbs, f), stripLintDirectives(readFileSync(join(ROOT, pkg.src, f), 'utf8')));
    }
    summary.push(`${pkg.module}: ${files.length} file(s) -> ${pkg.dest}`);
  }
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const line of syncTypes()) console.log('  ' + line);
  console.log('Vendored type definitions refreshed.');
}
