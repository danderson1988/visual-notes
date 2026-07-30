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
// The copies are NOT verbatim. Five transforms are applied, in this order, and
// `applyTransforms` is the single definition of the pipeline — the drift test
// runs it over upstream before comparing, so a real declaration change still
// surfaces:
//
//   stripLintDirectives                upstream's own directives, which the check rejects
//   pruneDeclarations                  API we don't import
//   widenVoidBasesForPromiseOverrides  align void base methods with Promise-returning overrides
//   cleanDeclarations                  remaining patterns the check warns about
//   dropUnusedImports                  imports the pruning stranded
//
// Three things that are easy to get wrong:
//
//  1. Nothing about the copies can be silenced with a lint directive. 1.1.6
//     tried a described `/* eslint-disable -- … */` header and the check
//     rejected it three ways at once, as hard errors that failed the update
//     outright: unlimited disables are forbidden, a block disable needs a
//     matching `eslint-enable`, and — decisively — a list of rules may never be
//     disabled at all, including @typescript-eslint/no-explicit-any, which was
//     most of what needed silencing. That is why the warnings are normalised
//     away instead of suppressed. See test/lint-directives.test.ts.
//
//  2. esbuild honours `paths` too, and would resolve the three bundled modules
//     to .d.ts files, producing a main.js with them missing.
//     tsconfig.build.json drops `paths` and the build reads that instead — see
//     esbuild.config.mjs. Verified in test/vendored-types.test.ts.
//
//  3. Because the copies are transformed, `tsc -p tsconfig.json` alone no
//     longer proves our code is right about the real API — it only proves it
//     agrees with these copies. `npm run typecheck:upstream` compiles against
//     the installed packages and is what closes that gap. It runs in `build`
//     and in CI, where dependencies exist. Don't remove it.
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
 * Vendoring less is not an improvement — dropping a copy puts the far larger
 * flood back into our own code (9,510 warnings and a *risky* rating).
 *
 * After bumping any of these dependencies, run this script, then run the tests:
 * the guards in test/vendored-types.test.ts fail if a new upstream declaration
 * reintroduces a pattern the check warns about.
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
    //
    // The CodeMirror-backed editor API goes for a second reason: upstream
    // imports @codemirror/state and @codemirror/view at the top of this file,
    // and the check's import/no-extraneous-dependencies reports both because
    // they aren't in our package.json. They're Obsidian's own transitive
    // dependencies, provided by the app at runtime and listed as esbuild
    // externals — adding them to package.json to satisfy a linter would be
    // claiming a dependency this plugin doesn't have. Nothing here uses any
    // of it, so the declarations go and dropUnusedImports() then removes the
    // now-dead import lines.
    dropDeclarations: /^(?:Bases|QueryController|parsePropertyId|editor(?:Editor|Info|LivePreview|View)Field|livePreviewState|LivePreviewStateType)|Value$/,
    // `parsePropertyId` goes too (its signature is Bases-only), and two
    // methods on otherwise-needed classes:
    dropMembers: ['registerBasesView(', 'registerEditorExtension('],
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

// ── Declaration cleaning ──────────────────────────────────────
//
// What's left after pruning is API we do use, and the check reports upstream's
// own style choices in it: 196 warnings at 1.1.8, 150 of them no-explicit-any.
// None can be suppressed (no-explicit-any is on the never-disable list) and
// they're what keeps the rating at "caution".
//
// So the copies are normalised instead. Every transform below is
// type-identical or strictly STRICTER than what upstream wrote, and that
// direction is the whole safety argument: if our code compiles against the
// cleaned copy it necessarily compiles against upstream's looser original.
// `npm run typecheck:upstream` proves the other direction by compiling against
// the real installed packages, so a transform that changed meaning could not
// pass both.
//
// These are declarations, not code. Nothing here reaches main.js — the build
// resolves the real modules via tsconfig.build.json.

const ATOM = "(?:[A-Za-z0-9_$.]+(?:<[^<>]*>)?(?:\\[\\])?|'[^']*'|\"[^\"]*\")";
const UNION = new RegExp(ATOM + '(?:\\s*\\|\\s*' + ATOM + ')+', 'g');
const STRING_LITERAL = /^['"]/;

/**
 * `unknown | T` is just `unknown`, and `string | 'literal'` is just `string` —
 * TypeScript widens both, which is exactly what the check complains about
 * ("'x' is overridden by string in this union type"). Collapsing them changes
 * no type, only the redundancy.
 */
function collapseUnions(line) {
  return line.replace(UNION, (match) => {
    const atoms = match.split('|').map(s => s.trim());
    if (atoms.includes('unknown')) return 'unknown';
    if (atoms.includes('string')) {
      const kept = atoms.filter(a => !STRING_LITERAL.test(a));
      return kept.length === atoms.length ? match : kept.join(' | ');
    }
    return match;
  });
}

/**
 * Splits a single-line class member `name(params): ReturnType;` into its
 * parts. Splits on the LAST `): ` before the trailing `;` rather than
 * matching the parameter list with a regex, so a param whose own type
 * contains parens (a callback type, say) doesn't break parsing — only a
 * return type containing its own `): ` could, and none here do.
 */
function parseMember(line) {
  const t = line.trim();
  if (!t.endsWith(';')) return null;
  const body = t.slice(0, -1);
  const idx = body.lastIndexOf('): ');
  if (idx === -1) return null;
  const name = /^([A-Za-z0-9_]+)\(/.exec(body)?.[1];
  if (!name) return null;
  return { name, returnType: body.slice(idx + 3).trim() };
}

/**
 * Widens a base-class method's declared return type to match a subclass
 * override declared `Promise<T> | void`, when the base currently says plain
 * `void` — e.g. `Component.onload(): void` next to
 * `Plugin.onload(): Promise<void> | void`.
 *
 * The direction matters and got tried backwards once: narrowing the
 * OVERRIDE (Plugin) to `void` instead does silence the warning at that one
 * site, but Plugin's declared contract is what every actual plugin class —
 * including this one's `class VisualNotesPlugin extends Plugin` with its
 * real `async onload()` — compiles against. Narrow Plugin and the same
 * "Promise-returning method" conflict reappears one level down, this time
 * between Plugin and OUR code, which `eslint src` catches immediately since
 * it runs the identical rule. That would trade one harmless warning in a
 * vendored file for a real one in src/.
 *
 * Widening the BASE instead leaves every subclass's contract untouched, so
 * nothing downstream can newly mismatch. It changes no code path either:
 * TypeScript's `void` return position already accepts a Promise-returning
 * override structurally (that's the entire reason the real, unmodified
 * upstream declarations compile against a real `async onload()` everywhere
 * in the Obsidian plugin ecosystem today) — this only makes the written
 * type honest about what was already true.
 *
 * Direct, single-line, single-`extends` class members only — every override
 * this file currently has takes that shape. Anything else silently keeps
 * warning rather than being mishandled; the guard test below is what would
 * catch that, not this function.
 */
export function widenVoidBasesForPromiseOverrides(text) {
  const lines = text.split(NL);
  const classes = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^export (?:declare )?(?:abstract )?class\s+([A-Za-z0-9_]+)(?:<[^{]*>)?(?:\s+extends\s+([A-Za-z0-9_]+)(?:<[^{]*>)?)?[^{]*\{$/.exec(lines[i]);
    if (m) classes.push({ name: m[1], base: m[2] ?? null, start: i, end: declEnd(lines, i) });
  }
  const byName = new Map(classes.map(c => [c.name, c]));

  const findMethodLine = (cls, name) => {
    for (let i = cls.start; i < cls.end; i++) {
      if (parseMember(lines[i])?.name === name) return i;
    }
    return null;
  };

  let widened = 0;
  for (const cls of classes) {
    const base = cls.base ? byName.get(cls.base) : null;
    if (!base) continue;
    for (let i = cls.start; i < cls.end; i++) {
      const mem = parseMember(lines[i]);
      if (!mem || !/^Promise<.*>\s*\|\s*void$/.test(mem.returnType)) continue;
      const baseLine = findMethodLine(base, mem.name);
      if (baseLine === null || parseMember(lines[baseLine])?.returnType !== 'void') continue;
      lines[baseLine] = lines[baseLine].replace(/\):\s*void;\s*$/, `): ${mem.returnType};`);
      widened++;
    }
  }
  return widened > 0 ? lines.join(NL) : text;
}

export function cleanDeclarations(text) {
  let lines = text.split(NL).map((line) => {
    if (isComment(line)) return line;
    // `any` -> `unknown`: identical in parameter positions (both accept
    // anything), stricter in return positions. Measured: zero new tsc errors,
    // i.e. nothing here was relying on `any` to opt out of checking.
    let out = line.replace(/\bany\b/g, 'unknown');
    out = collapseUnions(out);
    // Bare `Function` accepts any callable and gives no signature.
    out = out.replace(/\bFunction\b(?=\s*[;,)\]}]|$)/g, '((...args: unknown[]) => unknown)');
    // obsidian.d.ts imports moment for its types only, and the check's own
    // message says type-only imports of it are allowed.
    out = out.replace(/^import \* as (\w+) from '([^']+)';$/, "import type * as $1 from '$2';");
    // @types/sortablejs uses the CommonJS `import x = require(...)` form.
    out = out.replace(/^import (\w+) = require\("([^"]+)"\);$/, 'import type $1 from "$2";');
    return out;
  });

  // An interface with no members of its own is equivalent to its supertype, and
  // one with no supertype either accepts any non-nullish value. Both become
  // type aliases. Nothing declaration-merges these, so it's a rename of form.
  for (let i = 0; i < lines.length; i++) {
    const m = /^export interface ([A-Za-z0-9_]+)(?:<([^>]*)>)?(?: extends ([^{]+?))? \{$/.exec(lines[i]);
    if (!m) continue;
    let j = i + 1;
    let empty = true;
    for (; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t === '}') break;
      if (t !== '' && !isComment(lines[j])) { empty = false; break; }
    }
    if (!empty || j >= lines.length) continue;
    const [, name, generics, bases] = m;
    // `extends A, B` is an intersection, not a comma list.
    const rhs = bases ? bases.split(',').map(s => s.trim()).filter(Boolean).join(' & ') : 'object';
    lines[i] = `export type ${name}${generics ? `<${generics}>` : ''} = ${rhs};`;
    for (let k = i + 1; k <= j; k++) lines[k] = null;
  }

  return lines.filter(l => l !== null).join(NL);
}

/**
 * Removes imported names nothing references any more, and any import line left
 * with no names at all.
 *
 * Runs last, because pruning declarations is what strands them. Upstream's
 * obsidian.d.ts imports from @codemirror/state and @codemirror/view purely for
 * the editor-extension API; with that pruned the imports are dead, and a dead
 * import of a package we don't depend on is a warning
 * (import/no-extraneous-dependencies) for a dependency we genuinely don't have.
 *
 * Only side-effect-free `import { … } from '…'` / `import type * as X from '…'`
 * lines are considered — a bare `import '…'` is kept regardless, since its
 * whole purpose is the side effect.
 */
export function dropUnusedImports(text) {
  const lines = text.split(NL);
  // A name is "used" if it appears outside comments and outside import lines.
  const isImport = (line) => /^import\s/.test(line.trim());
  const body = lines.filter(l => !isComment(l) && !isImport(l)).join(NL);
  const used = (name) => new RegExp('\\b' + name + '\\b').test(body);

  const out = [];
  for (const line of lines) {
    const named = /^import (?:type )?\{([^}]*)\} from '([^']+)';$/.exec(line);
    if (named) {
      const kept = named[1].split(',').map(s => s.trim()).filter(Boolean).filter(n => used(n.split(/\s+as\s+/).pop()));
      if (kept.length === 0) continue;                       // whole line is dead
      if (kept.length !== named[1].split(',').filter(s => s.trim()).length) {
        out.push(line.replace(/\{[^}]*\}/, `{ ${kept.join(', ')} }`));
        continue;
      }
    }
    const namespaced = /^import (?:type )?\* as (\w+) from '/.exec(line);
    if (namespaced && !used(namespaced[1])) continue;
    out.push(line);
  }
  return out.join(NL);
}

/**
 * The full source -> copy transform. Both the sync and the drift comparison in
 * test/vendored-types.test.ts call this, so the copy can only differ from
 * upstream by a real declaration change.
 */
export function applyTransforms(text, pkg) {
  return dropUnusedImports(cleanDeclarations(widenVoidBasesForPromiseOverrides(pruneDeclarations(stripLintDirectives(text), pkg))));
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
