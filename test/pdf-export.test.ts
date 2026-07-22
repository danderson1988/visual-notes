import { describe, it, expect } from 'vitest';
import { buildSingleImagePdf, dataUrlToBytes } from '../src/pdf-export';

// These tests parse the hand-written PDF back apart and check the exact
// invariants a PDF reader relies on (xref offsets pointing at real "N 0
// obj" lines, stream /Length matching actual byte length, startxref
// pointing at the real "xref" keyword) — the class of bug that's easy to
// get subtly wrong by hand and that a real PDF viewer would just reject
// outright with no useful error, so it's worth locking in directly rather
// than only eyeballing the output.

function textAt(bytes: Uint8Array, start: number, len: number): string {
  return new TextDecoder('latin1').decode(bytes.subarray(start, start + len));
}

describe('pdf-export: dataUrlToBytes', () => {
  it('decodes a base64 data URL back to the original bytes', () => {
    // "hi" base64-encoded, wrapped as a data URL like canvas.toDataURL() produces.
    const dataUrl = 'data:image/jpeg;base64,aGk=';
    const bytes = dataUrlToBytes(dataUrl);
    expect(new TextDecoder().decode(bytes)).toBe('hi');
  });
});

describe('pdf-export: buildSingleImagePdf', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9]); // fake but non-trivial bytes
  const pdf = buildSingleImagePdf(jpeg, 800, 600);
  const text = new TextDecoder('latin1').decode(pdf);

  it('starts with a PDF header', () => {
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
  });

  it('embeds the exact JPEG bytes with a matching /Length', () => {
    const idx = text.indexOf('/Filter /DCTDecode');
    expect(idx).toBeGreaterThan(-1);
    const lengthMatch = text.slice(idx, idx + 60).match(/\/Length (\d+)/);
    expect(lengthMatch).toBeTruthy();
    expect(Number(lengthMatch![1])).toBe(jpeg.length);

    const streamStart = text.indexOf('stream\n', idx) + 'stream\n'.length;
    const embedded = pdf.subarray(streamStart, streamStart + jpeg.length);
    expect(Array.from(embedded)).toEqual(Array.from(jpeg));
  });

  it('sizes the page from pixels at 96dpi converted to points (72/96)', () => {
    const match = text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBeCloseTo(800 * 72 / 96, 2);
    expect(Number(match![2])).toBeCloseTo(600 * 72 / 96, 2);
  });

  it('every xref offset points at the start of its own "N 0 obj" line', () => {
    const xrefIdx = text.indexOf('xref\n');
    expect(xrefIdx).toBeGreaterThan(-1);
    // Skip "xref\n0 6\n" and the free entry, then read 5 twenty-byte entries.
    const tableStart = text.indexOf('\n', text.indexOf('\n', xrefIdx) + 1) + 1;
    for (let objNum = 1; objNum <= 5; objNum++) {
      const entryStart = tableStart + objNum * 20;
      const entry = textAt(pdf, entryStart, 20);
      expect(entry).toMatch(/^\d{10} \d{5} n \n$/);
      const offset = Number(entry.slice(0, 10));
      expect(textAt(pdf, offset, `${objNum} 0 obj`.length)).toBe(`${objNum} 0 obj`);
    }
  });

  it('startxref points at the real "xref" keyword', () => {
    const match = text.match(/startxref\n(\d+)\n%%EOF$/);
    expect(match).toBeTruthy();
    const offset = Number(match![1]);
    expect(textAt(pdf, offset, 4)).toBe('xref');
  });

  it('the content stream /Length matches its actual byte length', () => {
    const contentIdx = text.lastIndexOf('<< /Length');
    const lengthMatch = text.slice(contentIdx, contentIdx + 40).match(/\/Length (\d+)/);
    const declaredLen = Number(lengthMatch![1]);
    const streamStart = text.indexOf('stream\n', contentIdx) + 'stream\n'.length;
    const streamEnd = text.indexOf('\nendstream', streamStart);
    expect(streamEnd - streamStart).toBe(declaredLen);
  });
});
