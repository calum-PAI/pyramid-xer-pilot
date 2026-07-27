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
  const highDur = incomplete.filter(
    (a) => !a.isMilestone && (a.targetDur || a.remainDur) > 44
  );
  add(
    check(
      8,
      "High Duration",
      "Incomplete activities with a baseline duration over 44 days.",
      highDur.length,
      incomplete.length,
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
  const missed = acts.filter(
    (a) =>
      a.status !== "TK_Complete" &&
      a.targetEnd &&
      a.targetEnd < dd
  );
  add(
    check(
      11,
      "Missed Tasks",
      "Activities past their baseline finish but not complete.",
      missed.length,
      acts.length,
      5,
      "pct-max",
      "Tracks slippage against the baseline finish dates."
    )
  );

  // 12 ── Critical path test (continuous path to completion)
  const critCount = incomplete.filter((a) => a.critical).length;
  const cpValid = critCount > 0;
  add({
    id: 12,
    name: "Critical Path Test",
    desc: "A continuous critical path reaches project completion.",
    value: cpValid ? "Pass" : "Broken",
    detail: cpValid
      ? `${critCount} incomplete activities form the critical path.`
      : "No continuous critical path detected.",
    pass: cpValid,
    applicable: true,
    count: critCount,
    total: incomplete.length,
    hint: "Network logic must produce an unbroken driving path.",
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
    hint: "(Path length + project total float) ÷ path length.",
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

function computeCPLI(model) {
  const start = model.project.dataDate;
  const finish = model.project.planFinish;
  if (!start || !finish) return 1;
  const cpLength = Math.max(daysBetween(start, finish), 1);
  // project total float = min total float across critical activities
  const crit = model.activities.filter((a) => a.status !== "TK_Complete");
  const projFloat = crit.length
    ? Math.min(...crit.map((a) => a.totalFloat))
    : 0;
  return (cpLength + projFloat) / cpLength;
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
