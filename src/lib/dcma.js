// =============================================================
// DCMA 14-Point Schedule Assessment
// Defense Contract Management Agency schedule-quality metrics.
// Each check returns pass/fail against the standard threshold.
// =============================================================
import { daysBetween } from "./model.js";

const HARD_CSTR = new Set([
  "CS_MANDSTART",
  "CS_MANDFIN",
  "CS_MSO",
  "CS_MEO",
  "CS_MEOB", // finish on or before behaves as a hard limit
]);

export function computeDCMA(model) {
  const acts = model.activities;
  const rels = model.relationships;
  const dd = model.project.dataDate;
  const incomplete = acts.filter((a) => a.status !== "TK_Complete");
  const logicEligible = acts.filter((a) => !a.isMilestone);

  const checks = [];
  const add = (c) => checks.push(c);

  // 1 ── Logic: missing predecessor or successor
  const missingLogic = logicEligible.filter(
    (a) => model.preds[a.id].length === 0 || model.succs[a.id].length === 0
  );
  add(
    check(
      1,
      "Logic",
      "Activities missing a predecessor or successor link.",
      missingLogic.length,
      logicEligible.length,
      5,
      "pct-max",
      "Every task should be tied into the network on both ends."
    )
  );

  // 2 ── Leads (negative lag)
  const leads = rels.filter((r) => r.lag < 0);
  add(
    check(
      2,
      "Leads",
      "Relationships with a negative lag (lead).",
      leads.length,
      rels.length,
      0,
      "count-zero",
      "Leads compress logic artificially — target zero."
    )
  );

  // 3 ── Lags
  const lags = rels.filter((r) => r.lag > 0);
  add(
    check(
      3,
      "Lags",
      "Relationships carrying a positive lag.",
      lags.length,
      rels.length,
      5,
      "pct-max",
      "Excessive lags hide real activities inside links."
    )
  );

  // 4 ── Relationship types (FS should dominate)
  const nonFS = rels.filter((r) => r.type !== "PR_FS");
  add(
    check(
      4,
      "Relationship Types",
      "Non Finish-to-Start relationships.",
      nonFS.length,
      rels.length,
      10,
      "pct-max",
      "At least 90% of links should be Finish-to-Start."
    )
  );

  // 5 ── Hard constraints
  const hard = acts.filter((a) => HARD_CSTR.has(a.cstrType) || HARD_CSTR.has(a.cstrType2));
  add(
    check(
      5,
      "Hard Constraints",
      "Activities with a hard (mandatory) date constraint.",
      hard.length,
      acts.length,
      5,
      "pct-max",
      "Hard constraints override logic and mask float."
    )
  );

  // 6 ── High float (> 44 days)
  const highFloat = incomplete.filter((a) => a.totalFloat > 44);
  add(
    check(
      6,
      "High Float",
      "Activities with total float greater than 44 days.",
      highFloat.length,
      incomplete.length,
      5,
      "pct-max",
      "High float often signals missing or broken logic."
    )
  );

  // 7 ── Negative float
  const negFloat = incomplete.filter((a) => a.totalFloat < 0);
  add(
    check(
      7,
      "Negative Float",
      "Activities with negative total float.",
      negFloat.length,
      incomplete.length,
      0,
      "count-zero",
      "Negative float means the plan already breaches a constraint."
    )
  );

  // 8 ── High duration (baseline duration > 44 working days)
  // Measured against incomplete *task* activities only — milestones have no
  // duration and would otherwise dilute the ratio.
  const incompleteTasks = incomplete.filter((a) => !a.isMilestone);
  const highDur = incompleteTasks.filter(
    (a) => (a.targetDur || a.remainDur) > 44
  );
  add(
    check(
      8,
      "High Duration",
      "Incomplete task activities with a baseline duration over 44 days.",
      highDur.length,
      incompleteTasks.length,
      5,
      "pct-max",
      "Long tasks should be broken into measurable pieces."
    )
  );

  // 9 ── Invalid dates
  const invalid = acts.filter((a) => {
    if (a.status === "TK_NotStart" && a.start && a.start < dd) return true;
    if (a.status !== "TK_Complete" && a.finish && a.finish < dd) return true;
    if (a.actStart && a.actStart > dd) return true;
    if (a.actEnd && a.actEnd > dd) return true;
    return false;
  });
  add(
    check(
      9,
      "Invalid Dates",
      "Forecast dates in the past or actual dates in the future.",
      invalid.length,
      acts.length,
      0,
      "count-zero",
      "No forecast should sit before the data date."
    )
  );

  // 10 ── Resources
  if (model.hasCost) {
    const noRsrc = acts.filter((a) => !a.isMilestone && a.budget <= 0);
    add(
      check(
        10,
        "Resources",
        "Task activities without cost or resource loading.",
        noRsrc.length,
        acts.filter((a) => !a.isMilestone).length,
        5,
        "pct-max",
        "A cost-loaded schedule should resource every task."
      )
    );
  } else {
    add({
      id: 10,
      name: "Resources",
      desc: "Task activities without cost or resource loading.",
      value: "N/A",
      detail: "Schedule is not cost/resource loaded — test not applicable.",
      pass: null,
      applicable: false,
      count: 0,
      total: acts.length,
      hint: "A cost-loaded schedule should resource every task.",
    });
  }

  // 11 ── Missed tasks (baseline finish passed, not complete)
  // Ratio is against the tasks that were baseline-due by the data date — the
  // proper denominator for a "missed task" rate (not the whole activity list).
  const dueByNow = acts.filter((a) => a.targetEnd && a.targetEnd < dd);
  const missed = dueByNow.filter((a) => a.status !== "TK_Complete");
  add(
    check(
      11,
      "Missed Tasks",
      "Activities past their baseline finish but not complete.",
      missed.length,
      dueByNow.length,
      5,
      "pct-max",
      "Tracks slippage against the baseline finish dates."
    )
  );

  // 12 ── Critical path test (continuous path to completion)
  const cp = criticalPathTest(model);
  add({
    id: 12,
    name: "Critical Path Test",
    desc: "A continuous critical path reaches project completion.",
    value: cp.valid ? "Pass" : "Broken",
    detail: cp.detail,
    pass: cp.valid,
    applicable: true,
    count: cp.count,
    total: incomplete.length,
    hint: "Network logic must produce an unbroken driving path from the data date to project finish.",
  });

  // 13 ── CPLI — Critical Path Length Index
  const cpli = computeCPLI(model);
  add({
    id: 13,
    name: "CPLI",
    desc: "Critical Path Length Index (≥ 0.95 target).",
    value: cpli.toFixed(2),
    detail:
      cpli >= 0.95
        ? "Critical path can meet the contract finish."
        : "Critical path is longer than the time available.",
    pass: cpli >= 0.95,
    applicable: true,
    count: 0,
    total: 0,
    hint: "(CP length in working days + project total float) ÷ CP length. Assumes a 5-day working week.",
  });

  // 14 ── BEI — Baseline Execution Index
  const bei = computeBEI(model);
  add({
    id: 14,
    name: "BEI",
    desc: "Baseline Execution Index (≥ 0.95 target).",
    value: bei.toFixed(2),
    detail:
      bei >= 0.95
        ? "Completing tasks at or above the baseline plan rate."
        : "Completing fewer tasks than the baseline required.",
    pass: bei >= 0.95,
    applicable: true,
    count: 0,
    total: 0,
    hint: "Tasks completed ÷ tasks that should be complete by now.",
  });

  const applicable = checks.filter((c) => c.applicable);
  const passed = applicable.filter((c) => c.pass).length;
  const total = applicable.length;
  const rating =
    passed >= 13 ? "Excellent" : passed >= 11 ? "Good" : passed >= 8 ? "Fair" : "Poor";

  return { checks, passed, total, rating, cpli, bei };
}

function check(id, name, desc, count, total, threshold, mode, hint) {
  let value, pass;
  if (mode === "pct-max") {
    const pct = total > 0 ? (count / total) * 100 : 0;
    value = `${pct.toFixed(1)}%`;
    pass = pct <= threshold;
  } else {
    value = String(count);
    pass = count <= threshold;
  }
  return {
    id,
    name,
    desc,
    value,
    detail: `${count} of ${total} · threshold ${
      mode === "pct-max" ? "≤ " + threshold + "%" : "= " + threshold
    }`,
    pass,
    applicable: true,
    count,
    total,
    hint,
  };
}

// ── Critical-path continuity test (DCMA #12) ──────────────────
// Better than "some activity is critical": verify the zero/negative-float
// activities form an UNBROKEN chain of driving logic from the current
// data-date front through to the activity that finishes the project.
//   1. the project's last-finishing remaining activity must itself be critical
//      (the critical path must actually reach completion); and
//   2. walking backward through critical→critical predecessor links from that
//      finish driver must reach the live front (an in-progress activity, or a
//      critical activity already under way at the data date). If every backward
//      chain instead dead-ends at a future critical activity with no critical
//      predecessor, the driving path is disconnected from progress — "Broken".
function criticalPathTest(model) {
  const dd = model.project.dataDate;
  const incomplete = model.activities.filter((a) => a.status !== "TK_Complete");
  const critical = incomplete.filter((a) => a.totalFloat <= 0);
  if (!critical.length)
    return { valid: false, count: 0, detail: "No critical (zero/negative-float) activities in the remaining schedule." };

  // (1) the critical path must extend to project completion
  const finOf = (a) => a.finish || a.targetEnd;
  const lastFinish = incomplete.reduce((m, a) => {
    const f = finOf(a);
    return f && (!m || f > m) ? f : m;
  }, null);
  const endAct = critical.reduce((best, a) => {
    const f = finOf(a);
    if (!f) return best;
    return !best || f > finOf(best) ? a : best;
  }, null);
  if (!endAct || !lastFinish || daysBetween(finOf(endAct), lastFinish) > 1)
    return { valid: false, count: critical.length, detail: "Critical path does not extend to the project completion date." };

  // (2) walk back critical→critical predecessor links from the finish driver
  const critSet = new Set(critical.map((a) => a.id));
  const projectStarted = model.activities.some((a) => a.status !== "TK_NotStart");
  const seen = new Set();
  const stack = [endAct.id];
  let reachedFront = false;
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const a = model.actById[id];
    const critPreds = (model.preds[id] || []).filter((r) => critSet.has(r.predId));
    if (a) {
      const st = a.start || a.targetStart;
      const atFront =
        a.status === "TK_Active" ||
        (st && st <= dd) ||
        (!projectStarted && critPreds.length === 0);
      if (atFront) reachedFront = true;
    }
    critPreds.forEach((r) => stack.push(r.predId));
  }

  if (!reachedFront)
    return {
      valid: false,
      count: critical.length,
      detail: "Critical activities do not form a continuous chain back to the data-date front — the driving path is broken.",
    };

  return {
    valid: true,
    count: seen.size,
    detail: `Continuous critical path of ${seen.size} activities links the data date to project completion.`,
  };
}

// ── CPLI — Critical Path Length Index (Primavera-consistent) ──────
// CPLI = (Critical Path Length + Project Total Float) / Critical Path Length
// P6 works in WORKING days, so both terms must share that basis:
//   • Critical Path Length = working days from the data date to the project
//     (must-)finish date — not calendar days.
//   • Project Total Float  = the total float already carried on the driving
//     path (stored by P6 in working days), i.e. the min remaining total float.
// The previous version mixed calendar-day length with working-day float, which
// skewed the index; counting weekdays removes that unit mismatch.
function computeCPLI(model) {
  const start = model.project.dataDate;
  const finish = model.project.planFinish;
  if (!start || !finish || finish <= start) return 1;
  const wpw = model.workweekDays || 5; // P6 default global calendar is 5-day
  const cpLength = Math.max(workingDaysBetween(start, finish, wpw), 1); // working days
  // project total float on the driving path (P6 stores this in working days)
  const incomplete = model.activities.filter((a) => a.status !== "TK_Complete");
  const projFloat = incomplete.length
    ? Math.min(...incomplete.map((a) => a.totalFloat))
    : 0;
  return (cpLength + projFloat) / cpLength;
}

// Count working days in [start, end): weekdays for a 5-day week, Mon–Sat for
// a 6-day week, or every calendar day when a 7-day week is in force.
function workingDaysBetween(start, end, wpw = 5) {
  if (!start || !end || end <= start) return 0;
  const totalDays = Math.round((end - start) / 86400000);
  if (wpw >= 7) return totalDays;
  let count = 0;
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let i = 0; i < totalDays; i++) {
    const dow = d.getDay(); // 0 Sun … 6 Sat
    const isWork = wpw >= 6 ? dow !== 0 : dow !== 0 && dow !== 6;
    if (isWork) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function computeBEI(model) {
  const dd = model.project.dataDate;
  const shouldBeDone = model.activities.filter(
    (a) => a.targetEnd && a.targetEnd <= dd
  );
  const actuallyDone = model.activities.filter(
    (a) => a.status === "TK_Complete"
  );
  if (shouldBeDone.length === 0) return 1;
  return actuallyDone.length / shouldBeDone.length;
}
