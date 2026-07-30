// Obsidian's plugin check runs ESLint with its own config and treats several
// things about disable directives as hard **Errors** that fail the update.
// This file encodes every rule we've learned the hard way, because our own
// lint cannot: the rules live in plugins we don't depend on, and guessing at
// their config is what caused the failures in the first place.
//
// What has actually broken a release:
//
//   1.1.3  a bare `// eslint-disable-next-line @typescript-eslint/require-await`
//          with the reason on the line above. "Unexpected undescribed
//          directive comment" — the reason must be inline, after `--`.
//
//   1.1.6  a described `/* eslint-disable -- … */` header on the vendored type
//          definitions, rejected three ways at once:
//            - "Unexpected unlimited 'eslint-disable' comment" — a disable with
//              no rule names listed is forbidden.
//            - "Requires 'eslint-enable' directive" — a block disable must be
//              paired with an enable.
//            - "Disabling '…' is not allowed" — a list of rules may never be
//              disabled, whatever the reason. @typescript-eslint/no-explicit-any
//              is on it, which was most of what needed silencing.
//
// The practical upshot: prefer restructuring code so no directive is needed.
// If one is genuinely unavoidable, it must be `-next-line` or `-line`, name
// its rules, avoid the restricted list, and carry an inline `-- reason`.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

// Verbatim from the check's own error message. Disabling any of these is an
// error no matter how it's written or justified.
const NEVER_DISABLE = [
  'obsidianmd/*',
  'no-console',
  'no-restricted-globals',
  '@typescript-eslint/no-restricted-imports',
  'no-alert',
  '@typescript-eslint/no-deprecated',
  '@typescript-eslint/no-explicit-any',
  '@microsoft/sdl/no-document-write',
  'no-eval',
  '@microsoft/sdl/no-inner-html',
  'obsidianmd/no-nodejs-modules',
];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return entry.endsWith('.ts') ? [full] : [];
  });
}

interface Directive { file: string; line: number; kind: string; rest: string }

/**
 * Directive comments in files the check analyses. Only a comment whose text
 * *begins* with the keyword counts — ESLint ignores mid-sentence mentions, and
 * so must we, or prose describing this problem would trip its own guard.
 */
function directives(dirs: string[]): Directive[] {
  const found: Directive[] = [];
  for (const dir of dirs) {
    for (const file of tsFiles(join(ROOT, dir))) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        const m = /^\s*\/[/*]\s*(eslint-disable(?:-next-line|-line)?|eslint-enable)\b(.*)$/.exec(line);
        if (m) found.push({ file: `${dir}/${file.split(/[\\/]/).pop()}`, line: i + 1, kind: m[1], rest: m[2] });
      });
    }
  }
  return found;
}

// types/ is included deliberately: the vendored declarations live there and
// 1.1.6's failure was entirely in those files.
const SCANNED = ['src', 'types'];

describe('eslint directive comments', () => {
  const all = directives(SCANNED);

  it('finds source files to scan', () => {
    // Guards the walk: an empty list would make everything below vacuous.
    expect(tsFiles(join(ROOT, 'src')).length).toBeGreaterThan(20);
    expect(tsFiles(join(ROOT, 'types')).length).toBeGreaterThan(5);
  });

  it('uses no unlimited (rule-less) disable', () => {
    const offenders = all
      .filter(d => d.kind !== 'eslint-enable')
      .filter(d => {
        const rules = d.rest.split('--')[0].replace(/\*\/\s*$/, '').trim();
        return rules.length === 0;
      })
      .map(d => `${d.file}:${d.line}`);
    expect(offenders, `Unlimited eslint-disable — a hard error for Obsidian's check: ${offenders.join(', ')}`).toEqual([]);
  });

  it('uses no whole-file/block disable, which would need a matching enable', () => {
    const offenders = all.filter(d => d.kind === 'eslint-disable').map(d => `${d.file}:${d.line}`);
    expect(offenders, `Block eslint-disable requires an eslint-enable pair; prefer -next-line: ${offenders.join(', ')}`).toEqual([]);
  });

  it('disables nothing on the check\'s never-disable list', () => {
    const offenders: string[] = [];
    for (const d of all) {
      const rules = d.rest.split('--')[0].replace(/\*\/\s*$/, '');
      for (const banned of NEVER_DISABLE) {
        const needle = banned.endsWith('/*') ? banned.slice(0, -1) : banned;
        if (rules.includes(needle)) offenders.push(`${d.file}:${d.line} (${banned})`);
      }
    }
    expect(offenders, `Disabling these is never allowed: ${offenders.join(', ')}`).toEqual([]);
  });

  it('gives every directive an inline `-- reason`', () => {
    const offenders = all
      .filter(d => d.kind !== 'eslint-enable')
      .filter(d => {
        const after = d.rest.split('--')[1];
        return !after || after.replace(/\*\/\s*$/, '').trim().length === 0;
      })
      .map(d => `${d.file}:${d.line}`);
    expect(offenders, `Undescribed directive — a hard error for Obsidian's check: ${offenders.join(', ')}`).toEqual([]);
  });
});
