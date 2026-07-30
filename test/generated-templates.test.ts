// src/starter-templates.ts is generated from templates-src/*.canvas but
// committed, because Obsidian's health check lints the repo without running
// generators. That only works if the generator is deterministic across
// machines — otherwise the committed copy and a fresh build disagree, and the
// person who notices is whoever's CI run goes red.
//
// It wasn't, and CI caught it on 1.1.11: .canvas files are text, so git checks
// them out CRLF on a Windows clone and LF on Linux, and the generator embeds
// their contents verbatim into a string literal. The same commit produced
// output differing by 5,263 carriage returns depending on where it ran.
//
// Asserted here rather than left to CI so it fails on the machine that broke
// it, at the moment it breaks.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { STARTER_TEMPLATES } from '../src/starter-templates';

const TEMPLATES = join(__dirname, '..', 'templates-src');
const CR = String.fromCharCode(13);

const sourceFiles = readdirSync(TEMPLATES).filter(f => f.endsWith('.canvas')).sort();

describe('generated starter templates', () => {
  it('has an entry per source file', () => {
    expect(sourceFiles.length).toBeGreaterThan(10);
    expect(STARTER_TEMPLATES).toHaveLength(sourceFiles.length);
  });

  it('embeds no carriage returns, so the output is checkout-independent', () => {
    const withCR = STARTER_TEMPLATES.filter(t => t.json.includes(CR)).map(t => t.name);
    expect(
      withCR,
      'These embed CR, so this file was generated from a CRLF checkout and will ' +
      'differ from one generated on Linux. scripts/generate-starter-templates.mjs ' +
      `must normalise newlines: ${withCR.join(', ')}`,
    ).toEqual([]);
  });

  it('is ordered independently of the running platform\'s collation', () => {
    // Two template names contain an em dash, and localeCompare's treatment of
    // punctuation depends on the ICU data Node was built with. Code-unit order
    // is the same everywhere.
    // Mirrors the generator: sort the FILENAMES, then strip the extension.
    // Sorting after stripping gives a different order, because '.' and ' '
    // compare differently — which is why this asserts the real order rather
    // than a re-derived-from-scratch one.
    const expected = [...sourceFiles]
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map(f => f.slice(0, -'.canvas'.length));
    expect(STARTER_TEMPLATES.map(t => t.name)).toEqual(expected);
  });

  it('matches the sources once their newlines are normalised', () => {
    // The real drift check: committed output must equal what the sources say,
    // regardless of how those sources happen to be checked out right now.
    for (const file of sourceFiles) {
      const name = file.slice(0, -'.canvas'.length);
      const entry = STARTER_TEMPLATES.find(t => t.name === name);
      expect(entry, `no generated entry for ${file}`).toBeDefined();
      const source = readFileSync(join(TEMPLATES, file), 'utf8').split(CR).join('');
      expect(entry?.json, `${file} is stale — run: npm run generate-templates`).toBe(source);
    }
  });

  it('embeds valid JSON for every template', () => {
    for (const t of STARTER_TEMPLATES) {
      expect(() => JSON.parse(t.json) as unknown, `${t.name} is not valid JSON`).not.toThrow();
    }
  });
});
