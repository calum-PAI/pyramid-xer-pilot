// =============================================================
// Time-phased analytics: S-curves, resource histograms,
// WBS / phase / discipline rollups, and the look-ahead window.
// =============================================================
import { daysBetween, fmtDate } from "./model.js";
import { HARD_CSTR } from "./float.js";

function monthKey(d) {
  return d.getFullYear() * 12 + d.getMonth();
}
function keyToDate(k) {
  return new Date(Math.floor(k / 12), k % 12, 1);
}
function overlapDays(aStart, aEnd, bStart, bEnd) {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  return Math.max(0, (e - s) / 86400000);
}

// ── S-Curve: cumulative PV / EV / AC by month ────────────────
// opts: { activityFilter(a)=>bool, resourceType, from:Date, to:Date }
export function computeSCurve(model, evms, opts = {}) {
  const { activityFilter, resourceType, from, to } = opts;
  const acts = model.activities.filter(
    (a) => !activityFilter || activityFilter(a)
  );
  const dd = model.project.dataDate;
  const hasCost = model.hasCost;
  const byType = resourceType && resourceType !== "all";

  const basis = (a) => {
    if (!hasCost) return a.isMilestone ? 1 : Math.max(a.targetDur, 0.5);
    if (byType)
      return a.assigns.reduce(
        (s, as) =>
          s +
          (model.rsrcById[as.rsrcId]?.type === resourceType
            ? as.targetCost
            : 0),
        0
      );
    return a.budget;
  };
  const actualOf = (a, earned) => {
    if (!hasCost) return earned;
    if (byType)
      return a.assigns.reduce(
        (s, as) =>
          s +
          (model.rsrcById[as.rsrcId]?.type === resourceType
            ? as.actualCost
            : 0),
        0
      );
    return a.actualCost;
  };

  // month span
  const all = [];
  acts.forEach((a) => {
    [a.targetStart, a.targetEnd, a.start, a.finish].forEach(
      (d) => d && all.push(d)
    );
  });
  all.push(model.project.planStart, model.project.planFinish, dd);
  const valid = all.filter(Boolean);
  const minK = monthKey(new Date(Math.min(...valid)));
  const maxK = monthKey(new Date(Math.max(...valid)));

  const months = [];
  for (let k = minK; k <= maxK; k++) months.push(k);
  const plannedM = Object.fromEntries(months.map((k) => [k, 0]));
  const earnedM = Object.fromEntries(months.map((k) => [k, 0]));
  const actualM = Object.fromEntries(months.map((k) => [k, 0]));

  const spread = (bucket, start, end, amount) => {
    if (!start || !end || amount <= 0) return;
    if (end <= start) {
      bucket[monthKey(start)] = (bucket[monthKey(start)] || 0) + amount;
      return;
    }
    const totalDays = (end - start) / 86400000;
    for (let k = monthKey(start); k <= monthKey(end); k++) {
      const ms = keyToDate(k);
      const me = keyToDate(k + 1);
      const ov = overlapDays(start, end, ms, me);
      if (ov > 0) bucket[k] = (bucket[k] || 0) + amount * (ov / totalDays);
    }
  };

  acts.forEach((a) => {
    const b = basis(a);
    if (b <= 0) return; // no cost of this resource type on this activity
    // planned distribution over baseline/target window
    spread(plannedM, a.targetStart || a.start, a.targetEnd || a.finish, b);
    // earned distribution over actual window, capped at data date
    const es = a.actStart || a.start;
    let ee = a.actEnd || a.finish;
    if (ee && ee > dd) ee = dd;
    const earned = b * (a.pctComplete / 100);
    spread(earnedM, es, ee, earned);
    // actual cost distribution (same window)
    spread(actualM, es, ee, actualOf(a, earned));
  });

  let cp = 0,
    ce = 0,
    ca = 0;
  const allRows = months.map((k) => {
    cp += plannedM[k];
    const d = keyToDate(k);
    const past = d <= endOfMonth(dd);
    if (past) {
      ce += earnedM[k];
      ca += actualM[k];
    }
    return {
      key: k,
      date: d,
      planned: cp,
      earned: past ? ce : null,
      actual: past ? ca : null,
      isPast: past,
    };
  });

  // filtered-set totals (independent of any date-window clipping)
  const BAC = cp;
  const pastRows = allRows.filter((r) => r.isPast);
  const last = pastRows[pastRows.length - 1];
  const PV = last ? last.planned : 0;
  const EV = last ? last.earned || 0 : 0;
  const AC = last ? last.actual || 0 : 0;

  // date-window clipping for display (cumulative values preserved)
  let rows = allRows;
  if (from) rows = rows.filter((r) => endOfMonth(r.date) >= from);
  if (to) rows = rows.filter((r) => r.date <= endOfMonth(to));
  if (rows.length === 0) rows = allRows;

  return { rows, allRows, BAC, PV, EV, AC, dataDate: dd, empty: BAC <= 0 };
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59);
}

// ── Progress S-curves: Baseline plan / Current plan / Actual ─────
// Cumulative curves expressed as % of scope, weighted by the chosen metric
// (cost / hours / duration-%), bucketed daily/weekly/monthly.
// opts: { metric:'cost'|'hours'|'pct', period, activityFilter, resourceType, from, to }
export function computeSCurves(model, opts = {}) {
  const { metric = "cost", period = "month", activityFilter, resourceType, from, to } = opts;
  const acts = model.activities.filter((a) => !activityFilter || activityFilter(a));
  const dd = model.project.dataDate;
  const hasCost = model.hasCost;
  const byType = resourceType && resourceType !== "all";

  const basis = (a) => {
    if (metric === "hours") {
      const h = a.assigns.reduce(
        (s, as) => s + ((!byType || model.rsrcById[as.rsrcId]?.type === resourceType) ? as.targetQty || 0 : 0),
        0
      );
      return h || (a.isMilestone ? 0 : (a.targetDur || 1) * 8);
    }
    if (metric === "cost") {
      if (!hasCost) return a.isMilestone ? 1 : Math.max(a.targetDur, 0.5);
      if (byType)
        return a.assigns.reduce((s, as) => s + (model.rsrcById[as.rsrcId]?.type === resourceType ? as.targetCost : 0), 0);
      return a.budget;
    }
    return a.isMilestone ? 1 : Math.max(a.targetDur, 0.5); // pct → duration-weighted
  };

  const startB = bucketStartOf(period);
  const nextB = nextBucketOf(period);

  const all = [];
  acts.forEach((a) => [a.targetStart, a.targetEnd, a.start, a.finish].forEach((d) => d && all.push(d)));
  all.push(model.project.planStart, model.project.planFinish, dd);
  const valid = all.filter(Boolean);
  if (!valid.length) return { rows: [], empty: true, metric, period, dataDate: dd };
  const minB = startB(new Date(Math.min(...valid)));
  const maxD = new Date(Math.max(...valid));

  const baseM = {}, curM = {}, earnM = {};
  const spread = (map, s, e, amt) => {
    if (!s || !e || amt <= 0) return;
    if (e <= s) { const k = startB(s).getTime(); map[k] = (map[k] || 0) + amt; return; }
    const totalDays = (e - s) / 86400000;
    let b = startB(s);
    while (b < e) {
      const bn = nextB(b);
      const ov = overlapDays(s, e, b, bn);
      if (ov > 0) { const k = b.getTime(); map[k] = (map[k] || 0) + amt * (ov / totalDays); }
      b = bn;
    }
  };

  let totalBasis = 0;
  acts.forEach((a) => {
    const bval = basis(a);
    if (bval <= 0) return;
    totalBasis += bval;
    spread(baseM, a.targetStart || a.start, a.targetEnd || a.finish, bval);
    spread(curM, a.start || a.targetStart, a.finish || a.targetEnd, bval);
    const es = a.actStart || a.start;
    let ee = a.actEnd || a.finish;
    if (ee && ee > dd) ee = dd;
    spread(earnM, es, ee, bval * (a.pctComplete / 100));
  });

  const denom = totalBasis || 1;
  const rows = [];
  let cb = 0, cc = 0, ce = 0;
  let plannedAtDD = 0, earnedAtDD = 0, baselineAtDD = 0;
  let cursor = new Date(minB.getTime());
  let guard = 0;
  while (cursor <= maxD && guard++ < 6000) {
    const k = cursor.getTime();
    cb += baseM[k] || 0;
    cc += curM[k] || 0;
    ce += earnM[k] || 0;
    const past = cursor <= dd; // bucket started on/before the data date
    if (past) { plannedAtDD = cc; earnedAtDD = ce; baselineAtDD = cb; }
    rows.push({
      date: new Date(k),
      baseline: (cb / denom) * 100,
      current: (cc / denom) * 100,
      actual: past ? (ce / denom) * 100 : null,
      isPast: past,
    });
    cursor = nextB(cursor);
  }

  let display = rows;
  if (from) display = display.filter((r) => nextB(r.date) > from);
  if (to) display = display.filter((r) => r.date <= to);
  if (display.length === 0) display = rows;

  return {
    rows: display, dataDate: dd, metric, period,
    totalBasis, plannedAtDD, earnedAtDD, baselineAtDD,
    empty: totalBasis <= 0,
  };
}

// ── Resource histogram — time-phased man-hours ───────────────
// opts: { period:'day'|'week'|'month', groupBy:'resource'|'discipline'|'trade',
//         activityFilter, resourceType, from, to }
// Distributes each assignment's budgeted hours across the calendar into
// period buckets, grouped by resource / discipline / trade, with a cumulative
// curve and per-resource over-allocation (red-zone) detection.
const TRADE_LABEL = {
  RT_Labor: "Labour",
  RT_Equip: "Plant & Equipment",
  RT_Mtl: "Material",
};

function midnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function bucketStartOf(period) {
  if (period === "day") return (d) => midnight(d);
  if (period === "week")
    return (d) => {
      const m = midnight(d);
      const off = (m.getDay() + 6) % 7; // week starts Monday
      return new Date(m.getFullYear(), m.getMonth(), m.getDate() - off);
    };
  return (d) => new Date(d.getFullYear(), d.getMonth(), 1); // month
}
function nextBucketOf(period) {
  if (period === "day") return (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  if (period === "week") return (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  return (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
function periodHoursOf(period) {
  return period === "day" ? 8 : period === "week" ? 48 : 208; // 6-day @ 8h
}
function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

export function computeResourceHistogram(model, opts = {}) {
  const {
    period = "month",
    groupBy = "resource",
    activityFilter,
    resourceType,
    from,
    to,
  } = opts;
  const byType = resourceType && resourceType !== "all";
  const startB = bucketStartOf(period);
  const nextB = nextBucketOf(period);
  const periodHours = periodHoursOf(period);

  const groupInfo = (as, a) => {
    if (groupBy === "discipline") {
      const d = disciplineOf(a);
      return { id: "D:" + d, name: d };
    }
    if (groupBy === "trade") {
      const t = model.rsrcById[as.rsrcId]?.type || "RT_Labor";
      return { id: "T:" + t, name: TRADE_LABEL[t] || "Labour" };
    }
    const r = model.rsrcById[as.rsrcId];
    return { id: as.rsrcId, name: r?.name || "Resource" };
  };

  const buckets = {}; // startMs -> { date, total, byGroup:{} }
  const groupTotals = {};
  const groupNames = {};
  const groupCost = {}; // gid -> estimated cost
  const groupNonZero = {}; // gid -> [period totals] for cap fallback
  let minMs = Infinity, maxMs = -Infinity;

  const acts = model.activities.filter((a) => !activityFilter || activityFilter(a));
  acts.forEach((a) => {
    const start = a.start || a.targetStart;
    const end = a.finish || a.targetEnd;
    if (!start || !end) return;
    const totalDays = Math.max((end - start) / 86400000, 1);
    a.assigns.forEach((as) => {
      if (byType && model.rsrcById[as.rsrcId]?.type !== resourceType) return;
      const hours = as.targetQty || (a.targetDur || 1) * 8;
      if (hours <= 0) return;
      const { id: gid, name } = groupInfo(as, a);
      groupNames[gid] = name;
      groupCost[gid] = (groupCost[gid] || 0) + (as.targetCost || 0);

      let b = startB(start);
      while (b < end) {
        const bn = nextB(b);
        const ov = overlapDays(start, end, b, bn);
        if (ov > 0) {
          const portion = hours * (ov / totalDays);
          const ms = b.getTime();
          const bucket = buckets[ms] || (buckets[ms] = { date: new Date(ms), total: 0, byGroup: {} });
          bucket.total += portion;
          bucket.byGroup[gid] = (bucket.byGroup[gid] || 0) + portion;
          groupTotals[gid] = (groupTotals[gid] || 0) + portion;
          minMs = Math.min(minMs, ms);
          maxMs = Math.max(maxMs, ms);
        }
        b = bn;
      }
    });
  });

  if (!isFinite(minMs))
    return { rows: [], groups: [], caps: {}, peak: 0, cumulativeMax: 0, period, groupBy, periodHours, empty: true };

  // ordered group list (largest first)
  const groups = Object.keys(groupTotals)
    .sort((x, y) => groupTotals[y] - groupTotals[x])
    .map((id) => ({
      id,
      name: groupNames[id],
      total: groupTotals[id],
      type: groupBy === "resource" ? model.rsrcById[id]?.type : null,
    }));

  // walk every bucket in range (fill gaps) → rows + cumulative
  const rows = [];
  const groupPeak = {}; // gid -> peak hrs in a single period
  const groupPeakDate = {};
  let cum = 0, peak = 0;
  let cursor = new Date(minMs);
  const endCursor = new Date(maxMs);
  let guard = 0;
  while (cursor <= endCursor && guard++ < 5000) {
    const ms = cursor.getTime();
    const b = buckets[ms] || { date: new Date(ms), total: 0, byGroup: {} };
    cum += b.total;
    peak = Math.max(peak, b.total);
    groups.forEach((g) => {
      const v = b.byGroup[g.id];
      if (v > 0) {
        (groupNonZero[g.id] = groupNonZero[g.id] || []).push(v);
        if (v > (groupPeak[g.id] || 0)) {
          groupPeak[g.id] = v;
          groupPeakDate[g.id] = new Date(ms);
        }
      }
    });
    rows.push({ date: new Date(ms), total: b.total, byGroup: { ...b.byGroup }, cumulative: cum });
    cursor = nextB(cursor);
  }

  // over-allocation caps — only meaningful per resource
  const caps = {};
  if (groupBy === "resource") {
    groups.forEach((g) => {
      const maxUnits = model.rsrcById[g.id]?.maxUnits || 0;
      caps[g.id] =
        maxUnits > 0
          ? maxUnits * periodHours
          : Math.max(periodHours, Math.round(percentile(groupNonZero[g.id] || [], 0.85) * 1.15));
    });
  }

  // per-row over-allocation (hours above cap, per group + total)
  const groupOver = {}; // gid -> count of periods over cap
  rows.forEach((r) => {
    r.byOver = {};
    r.over = 0;
    if (groupBy === "resource") {
      groups.forEach((g) => {
        const v = r.byGroup[g.id] || 0;
        const o = Math.max(0, v - (caps[g.id] || Infinity));
        if (o > 0) {
          r.byOver[g.id] = o;
          r.over += o;
          groupOver[g.id] = (groupOver[g.id] || 0) + 1;
        }
      });
    }
  });

  // attach per-group summary stats
  groups.forEach((g) => {
    g.peakHrs = Math.round(groupPeak[g.id] || 0);
    g.peakDate = groupPeakDate[g.id] || null;
    g.overPeriods = groupOver[g.id] || 0;
    g.cost = groupCost[g.id] || 0;
    g.cap = caps[g.id] || 0;
  });

  // date-window clip for display
  let display = rows;
  if (from) display = display.filter((r) => nextB(r.date) > from);
  if (to) display = display.filter((r) => r.date <= to);
  if (display.length === 0) display = rows;

  const cumulativeMax = rows.length ? rows[rows.length - 1].cumulative : 0;
  const overPeriods = rows.filter((r) => r.over > 0).length;

  return {
    rows: display, allRows: rows, groups, caps, peak, cumulativeMax,
    period, groupBy, periodHours, overPeriods, empty: false,
  };
}

// ── WBS / phase rollup ───────────────────────────────────────
export function computeWBS(model) {
  const groups = {};
  model.activities.forEach((a) => {
    const key = a.wbs || "Project";
    const g =
      groups[key] ||
      (groups[key] = {
        name: key,
        total: 0,
        complete: 0,
        budget: 0,
        earned: 0,
        pctSum: 0,
        minFloat: Infinity,
        neg: 0,
        crit: 0,
        drivers: [],
      });
    g.total += 1;
    if (a.status === "TK_Complete") g.complete += 1;
    g.budget += a.budget;
    g.earned += a.budget * (a.pctComplete / 100);
    g.pctSum += a.pctComplete;
    g.minFloat = Math.min(g.minFloat, a.totalFloat);
    if (a.totalFloat < 0) g.neg += 1;
    if (a.critical) g.crit += 1;
    // the specific activities driving the branch's float status
    if (a.totalFloat <= 0)
      g.drivers.push({ code: a.code, name: a.name, float: a.totalFloat, done: a.status === "TK_Complete" });
  });

  return Object.values(groups)
    .map((g) => {
      // worst float first; incomplete drivers ahead of completed ones
      g.drivers.sort((x, y) => x.done - y.done || x.float - y.float);
      return {
        ...g,
        pctComplete: Math.round(g.pctSum / g.total),
        floatStatus:
          g.minFloat < 0 ? "Negative" : g.minFloat === 0 ? "Critical" : "Healthy",
      };
    })
    .sort((a, b) => a.minFloat - b.minFloat);
}

// ── Discipline classifier (keyword-based) ────────────────────
const DISCIPLINES = [
  ["Civil & Foundation", /civil|found|excavat|concrete|earthwork|pile|grade|backfill/i],
  ["Structural Steel", /steel|structur|erection|frame|beam|girder/i],
  ["Mechanical / Equipment", /mechan|equipment|compressor|pump|vessel|reactor|install|erection - /i],
  ["Piping", /pip(e|ing)|hydrotest|spool|bore|flange/i],
  ["Electrical", /electric|cable|transformer|switchgear|power|earthing/i],
  ["Instrumentation", /instrument|dcs|loop|control|calibrat/i],
  ["Commissioning", /commission|pre-comm|startup|handover|loop check|punch/i],
  ["Procurement", /procure|deliver|fabricat|manufactur|purchase|award/i],
];
export function disciplineOf(a) {
  const hay = `${a.name} ${a.wbsFull}`;
  for (const [label, re] of DISCIPLINES) if (re.test(hay)) return label;
  return "General";
}

// EPC lifecycle phase — derived from activity name / WBS keywords.
const PHASES = [
  ["Engineering", /design|spec|drawing|engineer|calc|model|review - /i],
  ["Procurement", /procure|deliver|fabricat|manufactur|purchase|award|supply/i],
  ["Commissioning", /commission|pre-comm|loop check|startup|start-up|handover|punch|performance test/i],
  ["Construction", /civil|found|excavat|concrete|pile|steel|erection|pip(e|ing)|electric|cable|instrument|install|hydrotest|grout|insulat|paving/i],
];
// User-defined key-term overrides, e.g. [{ term: "casting", phase: "Construction" }].
// Highest priority — lets the planner recategorise when the AI guess is wrong.
let PHASE_RULES = [];
try {
  if (typeof localStorage !== "undefined") {
    const r = JSON.parse(localStorage.getItem("pyramid.phaseRules"));
    if (Array.isArray(r)) PHASE_RULES = r.filter((x) => x && x.term && x.phase);
  }
} catch {}
export function setPhaseRules(rules) {
  PHASE_RULES = Array.isArray(rules) ? rules.filter((r) => r && r.term && r.phase) : [];
}
export function getPhaseRules() {
  return PHASE_RULES;
}

// A user-uploaded WBS / phase mapping (CSV) that overrides everything else.
// Shape: { byCode: { ACTIVITYCODE: phase }, rules: [{ term, phase }] }.
let UPLOAD_MAP = null;
export function setUploadPhaseMap(map) {
  UPLOAD_MAP =
    map && (Object.keys(map.byCode || {}).length || (map.rules || []).length) ? map : null;
}
export function getUploadPhaseMap() {
  return UPLOAD_MAP;
}

// Parse a two-column mapping file (CSV/TSV): [Activity ID | WBS keyword] , Phase.
export function parseWbsMapping(text) {
  const rows = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(splitCsvLine);
  return mappingFromRows(rows);
}

// Build the mapping from a rows array (shared by CSV and Excel readers).
export function mappingFromRows(input) {
  const rows = (input || [])
    .map((r) => (Array.isArray(r) ? r.map((c) => String(c == null ? "" : c)) : []))
    .filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return { byCode: {}, rules: [], count: 0 };
  let keyIdx = 0, phaseIdx = 1, start = 0;
  const h = rows[0].map((c) => c.toLowerCase().trim());
  if (h.some((c) => /phase|categor|group|discipline|wbs|activity|task|\bid\b|code|name/.test(c))) {
    start = 1;
    const pI = h.findIndex((c) => /phase|categor|group|discipline/.test(c));
    const wI = h.findIndex((c) => /wbs/.test(c));
    const kI = h.findIndex((c) => /activity|task|code|\bid\b|name/.test(c));
    phaseIdx = pI >= 0 ? pI : wI >= 0 ? wI : 1;
    keyIdx = kI >= 0 ? kI : phaseIdx === 0 ? 1 : 0;
  }
  const byCode = {}, rules = [];
  for (let i = start; i < rows.length; i++) {
    const key = (rows[i][keyIdx] || "").trim();
    const phase = (rows[i][phaseIdx] || "").trim();
    if (!key || !phase) continue;
    byCode[key.toUpperCase()] = phase;
    rules.push({ term: key, phase });
  }
  return { byCode, rules, count: rules.length };
}

function splitCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === "\t" || ch === ";") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
export const STD_PHASES = ["Engineering", "Procurement", "Construction", "Commissioning", "Other"];

// Returns { phase, source } where source is how it was decided:
//   'upload' → matched the user's uploaded WBS/phase mapping (explicit)
//   'custom' → matched a user key-term rule (explicit override)
//   'wbs'    → the activity's own top-level WBS branch (authoritative)
//   'name'   → AI-inferred from the activity name only (no WBS to align to)
//   'other'  → could not be categorised (no WBS, no keyword match)
export function phaseInfoOf(a) {
  const wbs = (a.wbsFull || "").toLowerCase();
  const name = (a.name || "").toLowerCase();
  // 1) user-uploaded WBS mapping (exact activity code, then keyword) — explicit override
  if (UPLOAD_MAP) {
    const code = (a.code || "").toUpperCase();
    if (UPLOAD_MAP.byCode[code]) return { phase: UPLOAD_MAP.byCode[code], source: "upload" };
    for (const r of UPLOAD_MAP.rules) {
      const t = String(r.term).toLowerCase();
      if (t && (name.includes(t) || wbs.includes(t))) return { phase: r.phase, source: "upload" };
    }
  }
  // 2) in-app key-term rules — explicit override
  for (const r of PHASE_RULES) {
    const t = String(r.term).toLowerCase();
    if (t && (name.includes(t) || wbs.includes(t))) return { phase: r.phase, source: "custom" };
  }
  // 3) WBS is authoritative — every activity aligns to its own top-level WBS
  //    branch (the schedule's own phase breakdown), never to a keyword guess.
  if (a.wbs && a.wbs !== "Project") return { phase: a.wbs, source: "wbs" };
  // 4) no WBS to align to → infer the lifecycle phase from the activity name
  for (const [label, re] of PHASES) if (re.test(name)) return { phase: label, source: "name" };
  // 5) nothing to go on
  return { phase: "Other", source: "other" };
}
export function phaseOf(a) {
  return phaseInfoOf(a).phase;
}

// Predicate builder shared by filtered views (S-curve, phase analysis…)
export function makeActivityFilter(f) {
  if (!f) return () => true;
  return (a) =>
    (f.wbs === "all" || !f.wbs || a.wbs === f.wbs) &&
    (f.phase === "all" || !f.phase || phaseOf(a) === f.phase) &&
    (f.discipline === "all" || !f.discipline || disciplineOf(a) === f.discipline);
}

// Discipline-level rollup (same EVM engine, grouped by discipline)
export function computeDisciplineAnalysis(model, opts = {}) {
  return computePhaseAnalysis(model, { ...opts, by: "discipline" });
}
export function shortDisc(name) {
  return String(name).split(" ")[0];
}

const monYr = (d) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });

// For a discipline with critical float exposure, work out WHICH activities are
// critical, WHY, the impact, and the best-practice recommendations. Shared by
// the Discipline view and the exported report.
export function disciplineNarrative(p, acts, model, clashes = []) {
  const inc = acts.filter((a) => a.status !== "TK_Complete");
  const crit = inc.filter((a) => a.totalFloat <= 0).sort((a, b) => a.totalFloat - b.totalFloat);
  const neg = crit.filter((a) => a.totalFloat < 0);
  const nearCrit = inc.filter((a) => a.totalFloat > 0 && a.totalFloat <= 10);
  const plural = (n, s = "ies", one = "y") => (n === 1 ? one : s);

  // per-activity "why it is critical"
  const items = crit.slice(0, 6).map((a) => {
    const succ = (model.succs[a.id] || []).length;
    const why = [];
    if (a.totalFloat < 0) why.push("already behind its required finish date");
    else why.push("on the driving path with zero float");
    if (HARD_CSTR[a.cstrType]) why.push(`pinned by a ${HARD_CSTR[a.cstrType]} constraint`);
    if (succ > 0) why.push(`${succ} successor${succ > 1 ? "s" : ""} depend on it`);
    return { code: a.code, name: a.name, float: a.totalFloat, why: why.join("; ") };
  });

  const clash = clashes.find((c) => c.disciplines.includes(p.name));

  // impact & risk
  const impact = [];
  impact.push(`${crit.length === 1 ? "This activity gates" : `These ${crit.length} activities gate`} ${shortDisc(p.name)}'s completion (forecast ${fmtDate(p.fcstEnd)}) — with zero or negative float, any slip flows straight through to the project finish date.`);
  if (p.spi < 0.95) impact.push(`The discipline is already behind plan (SPI ${p.spi.toFixed(2)}), so this exposure is live rather than theoretical.`);
  if (nearCrit.length) impact.push(`A further ${nearCrit.length} near-critical activit${plural(nearCrit.length)} (≤10d float) would join the critical path on only a minor slip.`);
  if (clash) impact.push(`It also peaks alongside ${clash.disciplines.filter((d) => d !== p.name).map(shortDisc).join(" & ")} in ${monYr(clash.date)} — a ${clash.risk.toLowerCase()}-risk clash window where congestion could compound the delay.`);

  // recommended actions
  const actions = [];
  actions.push(`Protect and expedite the activities above — assign your most reliable crews, clear their predecessors and long-lead materials early, and manage them daily.`);
  if (neg.length) actions.push(`Recover the ${neg.length} negative-float activit${plural(neg.length)}: re-sequence or fast-track where the logic allows, or add resources (crash) to the longest — starting with “${neg[0].name}”.`);
  if (crit.some((a) => HARD_CSTR[a.cstrType])) actions.push(`Review the hard date constraints on this path — convert “Mandatory”/“Finish On” to “Finish On or Before” deadlines so the true float is exposed, not masked.`);
  if (clash) actions.push(`Level resources around ${monYr(clash.date)} so ${shortDisc(p.name)} is not competing for the same crews and space as other trades.`);
  if (nearCrit.length) actions.push(`Add the ${nearCrit.length} near-critical activit${plural(nearCrit.length)} to the weekly watch-list and hold a small buffer ahead of handover.`);

  return { items, impact, actions: actions.slice(0, 4), crit, nearCrit, neg };
}

// ── Phase-level EVM rollup (Planned/Earned/Actual, SPI, float, forecast) ──
export function computePhaseAnalysis(model, opts = {}) {
  const { activityFilter, resourceType, by = "phase" } = opts;
  const infoOf =
    by === "discipline"
      ? (a) => ({ phase: disciplineOf(a), source: null })
      : phaseInfoOf;
  const acts = model.activities.filter(
    (a) => !activityFilter || activityFilter(a)
  );
  const dd = model.project.dataDate;
  const hasCost = model.hasCost;
  const byType = resourceType && resourceType !== "all";
  const basis = (a) => {
    if (!hasCost) return a.isMilestone ? 1 : Math.max(a.targetDur, 0.5);
    if (byType)
      return a.assigns.reduce(
        (s, as) =>
          s + (model.rsrcById[as.rsrcId]?.type === resourceType ? as.targetCost : 0),
        0
      );
    return a.budget;
  };
  const actualOf = (a) => {
    if (!hasCost) return basis(a) * (a.pctComplete / 100);
    if (byType)
      return a.assigns.reduce(
        (s, as) =>
          s + (model.rsrcById[as.rsrcId]?.type === resourceType ? as.actualCost : 0),
        0
      );
    return a.actualCost;
  };

  const groups = {};
  acts.forEach((a) => {
    const info = infoOf(a);
    const key = info.phase;
    const g =
      groups[key] ||
      (groups[key] = {
        name: key, total: 0, done: 0, inProg: 0, remaining: 0,
        budget: 0, earned: 0, actual: 0, pv: 0, pctSum: 0,
        minFloat: Infinity, maxFinish: null, minStart: null,
        src: { wbs: 0, name: 0, custom: 0, other: 0, upload: 0 },
      });
    if (info.source) g.src[info.source] += 1;
    const b = basis(a);
    g.total += 1;
    if (a.status === "TK_Complete") g.done += 1;
    else if (a.status === "TK_Active") g.inProg += 1;
    else g.remaining += 1;
    g.budget += b;
    g.earned += b * (a.pctComplete / 100);
    g.pctSum += a.pctComplete; // activity-level physical %, for the count-based average
    g.actual += actualOf(a);

    const ps = a.targetStart || a.start;
    const pe = a.targetEnd || a.finish;
    let pp = 0;
    if (a.isMilestone) pp = pe && dd >= pe ? 1 : 0;
    else if (ps && pe && pe > ps) pp = Math.max(0, Math.min(1, (dd - ps) / (pe - ps)));
    else if (pe) pp = dd >= pe ? 1 : 0;
    g.pv += b * pp;

    // float risk reflects work still to go — ignore completed activities
    if (a.status !== "TK_Complete")
      g.minFloat = Math.min(g.minFloat, a.totalFloat);
    const f = a.finish || a.targetEnd;
    if (f && (!g.maxFinish || f > g.maxFinish)) g.maxFinish = f;
    // earliest planned start → drives chronological (lifecycle) ordering
    const st = a.targetStart || a.start;
    if (st && (!g.minStart || st < g.minStart)) g.minStart = st;
  });

  return Object.values(groups)
    .map((g) => {
      const spi = g.pv > 0 ? g.earned / g.pv : 1;
      // count-based average of physical % complete — reconciles with the
      // Done / In-prog / Remaining activity counts shown alongside it.
      const pctComplete = g.total > 0 ? Math.round(g.pctSum / g.total) : 0;
      // cost/duration-weighted % (earned value) kept for reference / tooltips
      const pctEarned = g.budget > 0 ? Math.round((g.earned / g.budget) * 100) : 0;
      const floatRisk =
        !isFinite(g.minFloat) ? "Low" // all activities complete
          : g.minFloat <= 0 ? "High"
          : g.minFloat <= 20 ? "Medium"
          : "Low";
      // forecast end — SPI-stretch remaining duration for incomplete phases
      let fcstEnd = g.maxFinish;
      if (g.maxFinish && spi > 0 && spi < 1 && g.done < g.total) {
        const rem = Math.max((g.maxFinish - dd) / 86400000, 0);
        fcstEnd = new Date(dd.getTime() + (rem / spi) * 86400000);
      }
      return { ...g, spi, pctComplete, pctEarned, floatRisk, fcstEnd, hasCost };
    })
    // chronological by earliest start (project lifecycle order); the
    // uncategorised "Other" bucket always sorts last.
    .sort((a, b) => {
      if (a.name === "Other") return 1;
      if (b.name === "Other") return -1;
      const as = a.minStart ? a.minStart.getTime() : Infinity;
      const bs = b.minStart ? b.minStart.getTime() : Infinity;
      if (as !== bs) return as - bs;
      return b.total - a.total;
    });
}

// ── Discipline × Month heat map — % complete of planned work by month ──
export function computeDisciplineHeatMap(model, opts = {}) {
  const { activityFilter } = opts;
  const acts = model.activities.filter((a) => !activityFilter || activityFilter(a));
  const hasCost = model.hasCost;
  const basis = (a) => (hasCost ? a.budget || 1 : Math.max(a.targetDur, 0.5));

  const planned = {}; // disc -> { monthKey -> planned }
  const earned = {};
  const discTotals = {};
  let minK = Infinity, maxK = -Infinity;

  acts.forEach((a) => {
    const disc = disciplineOf(a);
    const s = a.targetStart || a.start;
    const e = a.targetEnd || a.finish;
    if (!s || !e) return;
    const b = basis(a);
    const totalDays = Math.max((e - s) / 86400000, 1);
    planned[disc] = planned[disc] || {};
    earned[disc] = earned[disc] || {};
    for (let k = monthKey(s); k <= monthKey(e); k++) {
      const ov = overlapDays(s, e, keyToDate(k), keyToDate(k + 1));
      if (ov <= 0) continue;
      const portion = b * (ov / totalDays);
      planned[disc][k] = (planned[disc][k] || 0) + portion;
      earned[disc][k] = (earned[disc][k] || 0) + portion * (a.pctComplete / 100);
      discTotals[disc] = (discTotals[disc] || 0) + portion;
      minK = Math.min(minK, k);
      maxK = Math.max(maxK, k);
    }
  });

  if (!isFinite(minK)) return { disciplines: [], months: [], cells: {} };

  const months = [];
  for (let k = minK; k <= maxK; k++)
    months.push({ key: k, date: keyToDate(k) });

  const disciplines = Object.keys(discTotals).sort((x, y) => discTotals[y] - discTotals[x]);
  const cells = {};
  disciplines.forEach((d) => {
    cells[d] = {};
    months.forEach((m) => {
      const p = planned[d][m.key] || 0;
      if (p > 0) cells[d][m.key] = { pct: Math.round(((earned[d][m.key] || 0) / p) * 100), planned: p };
    });
  });

  return { disciplines, months, cells };
}

// ── Clash detection — busy months where 3+ disciplines work concurrently ──
// A "clash" is a high-demand month (≥ 50% of the project's peak monthly load)
// in which 3+ disciplines each contribute a material share (≥ 12%) — the
// congestion windows where trades compete for the same time & space.
export function computeClashDetection(model, opts = {}) {
  const h = computeResourceHistogram(model, {
    period: "month",
    groupBy: "discipline",
    activityFilter: opts.activityFilter,
  });
  if (h.empty) return [];

  const nameById = {};
  h.groups.forEach((g) => (nameById[g.id] = g.name));
  const projPeak = Math.max(1, ...h.allRows.map((r) => r.total));

  const clashes = [];
  h.allRows.forEach((r) => {
    if (r.total < 0.5 * projPeak) return;
    const contrib = h.groups.filter((g) => (r.byGroup[g.id] || 0) >= 0.12 * r.total);
    if (contrib.length >= 3) {
      const ratio = r.total / projPeak;
      clashes.push({
        date: r.date,
        disciplines: contrib
          .sort((a, b) => (r.byGroup[b.id] || 0) - (r.byGroup[a.id] || 0))
          .map((g) => nameById[g.id]),
        count: contrib.length,
        peakHrs: Math.round(r.total),
        risk: ratio >= 0.85 || contrib.length >= 5 ? "High" : ratio >= 0.65 || contrib.length >= 4 ? "Medium" : "Low",
      });
    }
  });
  return clashes.sort((a, b) => b.peakHrs - a.peakHrs);
}

export function computeDiscipline(model) {
  const groups = {};
  model.activities.forEach((a) => {
    const key = disciplineOf(a);
    const g =
      groups[key] ||
      (groups[key] = {
        name: key,
        total: 0,
        complete: 0,
        budget: 0,
        pctSum: 0,
        minFloat: Infinity,
        neg: 0,
      });
    g.total += 1;
    if (a.status === "TK_Complete") g.complete += 1;
    g.budget += a.budget;
    g.pctSum += a.pctComplete;
    g.minFloat = Math.min(g.minFloat, a.totalFloat);
    if (a.totalFloat < 0) g.neg += 1;
  });
  return Object.values(groups)
    .map((g) => ({
      ...g,
      pctComplete: Math.round(g.pctSum / g.total),
      floatStatus:
        g.minFloat < 0 ? "Negative" : g.minFloat === 0 ? "Critical" : "Healthy",
    }))
    .sort((a, b) => b.total - a.total);
}

// ── Look-ahead window ────────────────────────────────────────
export function computeLookAhead(model, weeks = 6) {
  return computeLookAheadDetail(model, weeks).activities;
}

// Rich look-ahead: window activities + intelligence stats.
// The window is anchored to the START (Monday) of the current week when the
// schedule spans today (a live project); otherwise it falls back to the week
// of the data date, so historical files still surface upcoming work.
export function computeLookAheadDetail(model, weeks = 6) {
  const dd = model.project.dataDate;
  const weekStart = (d) => {
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const off = (m.getDay() + 6) % 7; // Monday = start of week
    return new Date(m.getFullYear(), m.getMonth(), m.getDate() - off);
  };
  const finishes = model.activities
    .map((a) => a.finish || a.targetEnd)
    .filter(Boolean);
  const projEnd = finishes.length
    ? new Date(Math.max(...finishes))
    : model.project.planFinish;

  const ddWeek = weekStart(dd);
  const todayWeek = weekStart(new Date());
  // use the real current week only if it lies within the schedule span
  const anchor =
    todayWeek >= ddWeek && todayWeek <= projEnd ? todayWeek : ddWeek;
  const horizon = new Date(anchor.getTime() + weeks * 7 * 86400000);

  const activities = model.activities
    .filter((a) => {
      if (a.status === "TK_Complete") return false;
      const s = a.start || a.targetStart;
      const f = a.finish || a.targetEnd;
      return (s && s <= horizon && f && f >= anchor) || a.status === "TK_Active";
    })
    .sort((a, b) => (a.start || 0) - (b.start || 0))
    .slice(0, 60);

  const inWindow = new Set(activities.map((a) => a.id));

  // activities due to start whose predecessor is not yet complete
  const incompletePred = activities.filter(
    (a) =>
      a.status === "TK_NotStart" &&
      (model.preds[a.id] || []).some(
        (r) => model.actById[r.predId]?.status !== "TK_Complete"
      )
  );

  const critical = activities.filter((a) => a.totalFloat <= 0);
  const nearCritical = activities.filter((a) => a.totalFloat > 0 && a.totalFloat <= 10);
  const healthy = activities.filter((a) => a.totalFloat > 10);
  const starting = activities.filter((a) => a.status === "TK_NotStart");
  const active = activities.filter((a) => a.status === "TK_Active");

  // next milestone at/after the window start
  const nextMilestone = model.activities
    .filter((a) => a.isMilestone && a.status !== "TK_Complete")
    .map((a) => ({ a, when: a.finish || a.targetEnd || a.start }))
    .filter((x) => x.when && x.when >= anchor)
    .sort((x, y) => x.when - y.when)[0];

  return {
    weeks,
    window: { from: anchor, to: horizon },
    activities,
    stats: {
      total: activities.length,
      starting: starting.length,
      active: active.length,
      incompletePred: incompletePred.length,
      critical: critical.length,
      nearCritical: nearCritical.length,
      healthy: healthy.length,
    },
    nextMilestone: nextMilestone
      ? { name: nextMilestone.a.name, code: nextMilestone.a.code, date: nextMilestone.when }
      : null,
  };
}
