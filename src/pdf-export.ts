// Minimal single-page, single-image PDF writer.
//
// Board export only ever needs to wrap one already-rendered raster image
// into one PDF page — a full PDF library (jsPDF, the obvious choice, pulls
// in html2canvas + canvg + dompurify as hard dependencies of its bundle
// even though we'd never call any of the HTML/SVG features that need them;
// together they added ~1.4MB unminified to main.js for zero functional
// benefit here) is unwarranted. JPEG bytes drop directly into a PDF's
// DCTDecode image stream with no re-encoding, so the whole format reduces
// to a handful of fixed objects — small enough to hand-write and unit-test
// directly rather than take on that dependency weight.
//
// PDF object layout (all fixed, one of each):
//   1 Catalog → 2 Pages → 3 Page → 4 Image XObject (the JPEG) → 5 Content stream

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function buildSingleImagePdf(jpegBytes: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  // PDF page geometry is in points (1/72"); treat exported pixels as 96dpi.
  const pageW = (widthPx * 72 / 96).toFixed(2);
  const pageH = (heightPx * 72 / 96).toFixed(2);

  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [0]; // 1-indexed; offsets[0] unused
  let pos = 0;

  const pushBytes = (bytes: Uint8Array) => { parts.push(bytes); pos += bytes.length; };
  const pushText = (s: string) => pushBytes(enc.encode(s));
  const startObj = (n: number) => { offsets[n] = pos; pushText(`${n} 0 obj\n`); };
  const endObj = () => pushText('endobj\n');

  pushText('%PDF-1.4\n');

  startObj(1); pushText('<< /Type /Catalog /Pages 2 0 R >>\n'); endObj();
  startObj(2); pushText('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n'); endObj();

  startObj(3);
  pushText(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
    `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n`
  );
  endObj();

  startObj(4);
  pushText(
    `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushText('\nendstream\n');
  endObj();

  // Content stream: scale the unit square to the full page, then paint Im0.
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  startObj(5);
  pushText(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\n`);
  endObj();

  const xrefStart = pos;
  const objCount = 6; // objects 1..5 plus the mandatory free entry 0
  pushText(`xref\n0 ${objCount}\n`);
  pushText('0000000000 65535 f \n');
  for (let i = 1; i < objCount; i++) {
    pushText(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
