// =============================================================
// Primavera P6 .XER parser
// The XER format is a tab-delimited, table-oriented flat file.
// Each line begins with a record-type token:
//   ERMHDR  → file header (version, date, currency…)
//   %T      → table name  (e.g. TASK, TASKPRED, PROJECT)
//   %F      → field names for the current table
//   %R      → a data row for the current table
//   %E      → end of file
// This parser returns { header, tables } where each table is an
// array of plain objects keyed by field name.
// =============================================================

export function parseXER(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const tables = {};
  let currentTable = null;
  let currentFields = null;
  let header = {};

  for (const line of lines) {
    if (!line) continue;
    const cols = line.split("\t");
    const tag = cols[0];

    switch (tag) {
      case "ERMHDR": {
        // ERMHDR<TAB>version<TAB>date<TAB>...<TAB>currency
        header = {
          version: cols[1] || "",
          date: cols[2] || "",
          user: cols[4] || "",
          database: cols[6] || "",
          currency: cols[cols.length - 1] || "",
          raw: cols.slice(1),
        };
        break;
      }
      case "%T": {
        currentTable = cols[1];
        currentFields = null;
        if (!tables[currentTable]) tables[currentTable] = [];
        break;
      }
      case "%F": {
        currentFields = cols.slice(1);
        break;
      }
      case "%R": {
        if (!currentTable || !currentFields) break;
        const values = cols.slice(1);
        const row = {};
        for (let i = 0; i < currentFields.length; i++) {
          row[currentFields[i]] = values[i] !== undefined ? values[i] : "";
        }
        tables[currentTable].push(row);
        break;
      }
      default:
        // %E and unknown tags ignored
        break;
    }
  }

  return { header, tables };
}

// ── Value coercion helpers ───────────────────────────────────
export function num(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// XER dates look like "2024-08-01 08:00" or "2024-08-01"
export function xdate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  const [, y, mo, da, hh = "0", mm = "0"] = m;
  return new Date(+y, +mo - 1, +da, +hh, +mm);
}

export const HRS_PER_DAY = 8; // XER stores durations in hours; P6 default 8h/day
