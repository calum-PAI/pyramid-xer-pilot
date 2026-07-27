// =============================================================
// Minimal, dependency-free .xlsx reader — keeps the app 100%
// in-browser & offline. Unzips the workbook with the platform
// DecompressionStream, then reads the first worksheet's cells.
// Only what's needed for a two-column mapping file.
// =============================================================

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined")
    throw new Error("This browser can't read .xlsx — please export the mapping as CSV.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Read a ZIP (xlsx) via its central directory → { entryName: Uint8Array }.
async function unzip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file.");
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let e = 0; e < count && dv.getUint32(off, true) === 0x02014b50; e++) {
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = dec.decode(buf.subarray(off + 46, off + 46 + nameLen));
    // only decompress the parts we care about
    if (/^xl\/(sharedStrings\.xml|worksheets\/.*\.xml)$/.test(name)) {
      const lNameLen = dv.getUint16(lho + 26, true);
      const lExtraLen = dv.getUint16(lho + 28, true);
      const dataStart = lho + 30 + lNameLen + lExtraLen;
      const comp = buf.subarray(dataStart, dataStart + compSize);
      out[name] = method === 0 ? comp : await inflateRaw(comp);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function colIndex(ref) {
  const m = String(ref).match(/^([A-Z]+)/);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseShared(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.getElementsByTagName("si")].map((si) =>
    [...si.getElementsByTagName("t")].map((t) => t.textContent).join("")
  );
}

function parseSheetRows(xml, shared) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const rows = [];
  for (const row of doc.getElementsByTagName("row")) {
    const cells = [];
    for (const c of row.getElementsByTagName("c")) {
      const col = colIndex(c.getAttribute("r") || "");
      const t = c.getAttribute("t");
      let val = "";
      if (t === "inlineStr") {
        const is = c.getElementsByTagName("t")[0];
        val = is ? is.textContent : "";
      } else {
        const v = c.getElementsByTagName("v")[0];
        const raw = v ? v.textContent : "";
        val = t === "s" ? shared[+raw] ?? "" : raw;
      }
      cells[col] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = "";
    rows.push(cells);
  }
  return rows;
}

// Read the first worksheet of an .xlsx as an array of string rows.
export async function readXlsxRows(arrayBuffer) {
  const files = await unzip(new Uint8Array(arrayBuffer));
  const dec = new TextDecoder();
  const shared = files["xl/sharedStrings.xml"]
    ? parseShared(dec.decode(files["xl/sharedStrings.xml"]))
    : [];
  const sheetKey =
    Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0] ||
    Object.keys(files).find((n) => /^xl\/worksheets\/.*\.xml$/.test(n));
  if (!sheetKey) throw new Error("No worksheet found in the Excel file.");
  return parseSheetRows(dec.decode(files[sheetKey]), shared);
}

export function isExcel(file) {
  return (
    /\.xlsx$/i.test(file.name) ||
    /spreadsheetml|officedocument\.spreadsheet/i.test(file.type || "")
  );
}
