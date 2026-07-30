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
    // The Bases API — 48 declarations (`Bases*`, `QueryController`, and the
    // `Value` class family), none of which this plugin imports. They are
    // dropped because the check's obsidianmd/no-unsupported-api reports them
    // as hard **Errors**: each `Value` subclass declares `extends` a base
    // whose `@since` is 1.10.0, and an `extends` clause is a reference, so
    // the declaration flags itself against a 1.7.2 floor. 19 errors, purely
    // from mirroring declarations nothing here uses. Same reasoning as
    // `files` above, just at declaration rather than file granularity.
    //
    // Raising minAppVersion would also clear them, and that is the wrong
    // trade: it buys a clean report by dropping users, for an API this
    // plugin never calls.
    dropDeclarations: /^(?:Bases|QueryController|parsePropertyId)|Value$/,
    // `parsePropertyId` goes too (its signature is Bases-only), and one
    // method on an otherwise-needed class:
    dropMembers: ['registerBasesView('],
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

// ── Declaration pruning ───────────────────────────────────────
//
// Mirroring a whole .d.ts means every rule in the check runs against
// upstream's declarations, including ones for APIs this plugin never touches.
// `dropDeclarations` removes those, so what ships is the part we actually
// compile against. See the obsidian entry above for the 19 errors that made
// this necessary.
//
// Brace-matched rather than regex-sliced: a declaration ends where its body
// closes, and getting that wrong would silently truncate the file into
// something that still parses.

const NL = String.fromCharCode(10);
const DECL = /^export (?:declare )?(?:abstract )?(?:class|interface|type|function|const|enum|namespace)\s+([A-Za-z0-9_]+)/;

// Comment lines are skipped when counting braces and when looking for leftover
// references: `{@link Value}` in a doc block is neither a brace to balance nor
// a use of the symbol.
const isComment = (line) => {
  const t = line.trim();
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*');
};

const braceDelta = (line) => {
  let d = 0;
  for (const ch of line) {
    if (ch === '{') d++;
    else if (ch === '}') d--;
  }
  return d;
};

/** First line of the doc block attached to `start`, or `start` if there is none. */
function docStart(lines, start) {
  let i = start - 1;
  if (i < 0 || !lines[i].trim().endsWith('*/')) return start;
  if (lines[i].trim().startsWith('/*')) return i;            // single-line /** @public */
  while (i >= 0 && !lines[i].trim().startsWith('/*')) i--;
  return i < 0 ? start : i;
}

/** One past the last line of the declaration starting at `start`. */
function declEnd(lines, start) {
  let depth = 0;
  let sawBrace = false;
  for (let i = start; i < lines.length; i++) {
    if (!isComment(lines[i])) {
      if (lines[i].includes('{')) sawBrace = true;
      depth += braceDelta(lines[i]);
    }
    // A braced declaration ends when its body closes; an unbraced one
    // (`export type X = 'a' | 'b';`) at the semicolon.
    if (depth <= 0 && (sawBrace || lines[i].trim().endsWith(';'))) return i + 1;
  }
  return lines.length;
}

/**
 * Removes the declarations `pkg.dropDeclarations` matches, with their doc
 * blocks, plus any line containing one of `pkg.dropMembers`.
 *
 * Throws if a kept declaration still refers to something dropped. That is the
 * guard that makes this safe to carry across upstream upgrades: if a future
 * release wires the pruned API into one we do use, this fails loudly at sync
 * time instead of producing declarations that no longer compile.
 */
export function pruneDeclarations(text, pkg) {
  const members = pkg.dropMembers ?? [];
  if (!pkg.dropDeclarations && members.length === 0) return text;

  const lines = text.split(NL);
  const cut = new Array(lines.length).fill(false);
  const dropped = new Set();

  for (let i = 0; i < lines.length; i++) {
    const m = DECL.exec(lines[i]);
    if (m && pkg.dropDeclarations?.test(m[1])) {
      dropped.add(m[1]);
      const end = declEnd(lines, i);
      for (let k = docStart(lines, i); k < end; k++) cut[k] = true;
      i = end - 1;
    } else if (members.some(sig => lines[i].includes(sig))) {
      for (let k = docStart(lines, i); k <= i; k++) cut[k] = true;
    }
  }

  const kept = lines.filter((_, i) => !cut[i]);
  const dangling = [];
  for (const name of dropped) {
    const ref = new RegExp('\\b' + name + '\\b');
    kept.forEach((line, i) => {
      if (!isComment(line) && ref.test(line)) dangling.push(`${name} at line ${i + 1}: ${line.trim()}`);
    });
  }
  if (dangling.length > 0) {
    throw new Error(
      `${pkg.module}: pruning left references to dropped declarations. Widen dropDeclarations ` +
      `or dropMembers to cover them:${NL}  ${dangling.join(NL + '  ')}`,
    );
  }
  return kept.join(NL);
}

/**
 * The full source -> copy transform. Both the sync and the drift comparison in
 * test/vendored-types.test.ts call this, so the copy can only differ from
 * upstream by a real declaration change.
 */
export function applyTransforms(text, pkg) {
  return pruneDeclarations(stripLintDirectives(text), pkg);
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
    let cutLines = 0;
    for (const f of files) {
      // No directives of ours added, upstream's stripped, and declarations for
      // APIs we don't import pruned — see above.
      const source = readFileSync(join(ROOT, pkg.src, f), 'utf8');
      const copy = applyTransforms(source, pkg);
      writeFileSync(join(destAbs, f), copy);
      cutLines += source.split(NL).length - copy.split(NL).length;
    }
    const pruned = cutLines > 0 ? ` (${cutLines} lines pruned)` : '';
    summary.push(`${pkg.module}: ${files.length} file(s) -> ${pkg.dest}${pruned}`);
  }
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const line of syncTypes()) console.log('  ' + line);
  console.log('Vendored type definitions refreshed.');
}
