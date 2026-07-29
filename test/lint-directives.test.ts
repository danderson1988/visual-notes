// Obsidian's plugin check runs ESLint with its own config, which enables the
// eslint-comments `require-description` rule: a disable directive with no
// inline reason is reported as a hard **Error**, not a warning, and fails the
// check outright.
//
// 1.1.3 shipped exactly that — a bare `// eslint-disable-next-line
// @typescript-eslint/require-await` in view.ts, with the explanation on the
// preceding comment lines where the rule can't see it. The plugin failed to
// pass on update as a result.
//
// Our own lint can't catch this: the rule lives in a plugin we don't depend
// on, and adding it would mean guessing at their exact config. A source scan
// is cheaper and pins the thing that actually matters — every directive
// carries its reason inline, in the `-- reason` form the rule requires.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return entry.endsWith('.ts') ? [full] : [];
  });
}

// eslint-disable / -next-line / -line, and eslint-enable.
const DIRECTIVE = /\/[/*]\s*(eslint-disable(?:-next-line|-line)?|eslint-enable)\b([^\n*]*)/g;

describe('eslint directive comments', () => {
  const files = tsFiles(SRC);

  it('finds source files to scan', () => {
    // Guards the walk: an empty list would make the assertions below vacuous.
    expect(files.length).toBeGreaterThan(20);
  });

  it('every directive carries an inline `-- reason` description', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const [, kind, rest] of text.matchAll(DIRECTIVE)) {
        // `--` is the separator the rule looks for. Anything after it is the
        // description; text before it is the rule list being disabled.
        const described = rest.includes('--') && rest.split('--')[1].trim().length > 0;
        if (!described) {
          const line = text.slice(0, text.indexOf(kind)).split('\n').length;
          offenders.push(`${file.split(/[\\/]/).pop()}:${line} (${kind})`);
        }
      }
    }
    expect(offenders, `Undescribed eslint directive(s) — Obsidian's check treats these as errors: ${offenders.join(', ')}`)
      .toEqual([]);
  });
});
