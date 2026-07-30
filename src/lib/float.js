// =============================================================
// Float & critical-path analysis.
// =============================================================
import { fmtDate } from "./model.js";

export function computeFloat(model) {
  const acts = model.activities;
  const incomplete = acts.filter((a) => a.status !== "TK_Complete");

  // Float exposure is a forward-looking measure — a completed activity's stored
  // float is historical and not a live risk, so critical / negative / the float
  // distribution are all assessed over INCOMPLETE (remaining) work only.
  const critical = incomplete
    .filter((a) => a.totalFloat <= 0)
    .sort((a, b) => a.totalFloat - b.totalFloat);
  const negative = incomplete
    .filter((a) => a.totalFloat < 0)
    .sort((a, b) => a.totalFloat - b.totalFloat);
  const nearCritical = incomplete
    .filter((a) => a.totalFloat > 0 && a.totalFloat <= 10)
    .sort((a, b) => a.totalFloat - b.totalFloat);

  // driving / longest path = critical (already incomplete) in chronological order
  const drivingPath = [...critical].sort((a, b) => (a.start || 0) - (b.start || 0));

  // float distribution buckets — over remaining (incomplete) activities
  const buckets = [
    { label: "Negative", min: -Infinity, max: -0.001, count: 0, tone: "danger" },
    { label: "0 (Critical)", min: -0.001, max: 0.001, count: 0, tone: "warning" },
    { label: "1–5d", min: 0.001, max: 5, count: 0, tone: "info" },
    { label: "6–20d", min: 5, max: 20, count: 0, tone: "info" },
    { label: "21–44d", min: 20, max: 44, count: 0, tone: "success" },
    { label: "> 44d", min: 44, max: Infinity, count: 0, tone: "success" },
  ];
  incomplete.forEach((a) => {
    const f = a.totalFloat;
    for (const b of buckets) {
      if (f > b.min && f <= b.max) {
        b.count++;
        break;
      }
    }
  });

  // Critical activities (now incomplete-only) as a share of the whole schedule —
  // denominator kept as total activities so it reconciles with the "N of total"
  // wording used in the float narrative.
  const criticalPct = acts.length
    ? Math.round((critical.length / acts.length) * 100)
    : 0;

  return {
    critical,
    negative,
    nearCritical,
    drivingPath,
    buckets,
    criticalPct,
    counts: {
      critical: critical.length,
      negative: negative.length,
      nearCritical: nearCritical.length,
    },
  };
}

// P6 "hard" constraints that override network logic (DCMA flags these).
export const HARD_CSTR = {
  CS_MANDSTART: "Mandatory Start", CS_MANDFIN: "Mandatory Finish",
  CS_MSO: "Start On", CS_MEO: "Finish On",
  CS_MEOB: "Finish On or Before", CS_MSOB: "Start On or Before",
};

// Build an assessment, findings and best-practice recommendations from the
// float analysis. Shared by the Float view and the exported report so both
// tell the same story.
export function floatNarrative(floatA, model) {
  const findings = [], actions = [];
  const total = model.activities.length;
  const { critical, negative, nearCritical, drivingPath, criticalPct } = floatA;

  const worst = negative[0];
  const constrainedNeg = negative.filter((a) => a.cstrType);
  const constrainedCrit = critical.filter((a) => HARD_CSTR[a.cstrType]);
  const dpFins = drivingPath.map((a) => a.finish || a.targetEnd).filter(Boolean);
  const dpEnd = dpFins.length ? new Date(Math.max(...dpFins)) : null;
  const notStarted = drivingPath.filter((a) => a.status === "TK_NotStart").length;
  const plural = (n) => (n === 1 ? "y" : "ies");

  // ── Headline verdict ──
  const verdict = negative.length
    ? { tone: "danger", text: `The schedule is currently infeasible against its imposed dates — ${negative.length} activit${plural(negative.length)} carry negative float and need active recovery.` }
    : criticalPct > 30
    ? { tone: "warning", text: `The critical path is unusually dense (${criticalPct}% of activities); the plan has little tolerance for delay and should be tightened.` }
    : critical.length
    ? { tone: "success", text: `The critical path is within its constraints — keep it protected and logic-driven.` }
    : { tone: "success", text: `No critical or negative float in the current data — the network has healthy slack throughout.` };

  // ── Findings (with justification) ──
  if (negative.length) {
    findings.push(`${negative.length} activit${plural(negative.length)} sit in negative float — the worst is ${worst.totalFloat.toFixed(0)}d on “${worst.name}”. Negative float means the logic cannot meet a required date, so the plan is mathematically infeasible until it is recovered.`);
  }
  if (constrainedNeg.length) {
    findings.push(`${constrainedNeg.length} of the negative-float activities carry a date constraint — constraints, not logic, are the most common hidden source of negative float and should be verified before any acceleration is planned.`);
  }
  if (criticalPct > 30) {
    findings.push(`${criticalPct}% of activities are critical (${critical.length} of ${total}) — well above the ~15–25% of a healthy network. An over-critical schedule usually signals missing logic, excessive hard constraints, or an over-compressed target.`);
  } else if (critical.length) {
    findings.push(`${criticalPct}% of activities are on the zero-float critical path (${critical.length} of ${total}) — a proportionate driving path for a network of this size.`);
  }
  if (constrainedCrit.length) {
    findings.push(`${constrainedCrit.length} critical activit${plural(constrainedCrit.length)} use a hard constraint (e.g. ${HARD_CSTR[constrainedCrit[0].cstrType]}) that overrides the network — these can mask true slippage and inflate the critical path.`);
  }
  if (nearCritical.length) {
    findings.push(`${nearCritical.length} near-critical activit${plural(nearCritical.length)} hold only 1–10 days of float — a minor slip on any of them would pull it straight onto the critical path.`);
  }
  if (drivingPath.length) {
    findings.push(`The driving path runs through ${drivingPath.length} incomplete activit${plural(drivingPath.length)}${dpEnd ? `, finishing ${fmtDate(dpEnd)}` : ""}${notStarted ? `; ${notStarted} of them have not started yet` : ""}.`);
  }

  // ── Recommendations (best-practice) ──
  if (negative.length) {
    actions.push(`Recover the negative float in order: first confirm the date driver — a hard constraint or an out-of-sequence actual is often the cause — then compress by fast-tracking (overlapping sequential work) or crashing (adding resources to the longest tasks), beginning with “${worst.name}”.`);
  }
  if (constrainedNeg.length || constrainedCrit.length) {
    actions.push(`Let logic drive the dates. Best practice (and the DCMA standard) is to minimise hard constraints — convert “Mandatory”/“Finish On” constraints to “Finish On or Before” deadlines so slippage is exposed by float rather than hidden by the constraint.`);
  }
  if (criticalPct > 30) {
    actions.push(`Reduce critical-path fragility: review the ${critical.length} critical activities for missing predecessors/successors and open ends, and split long critical tasks into smaller resource-loaded steps so the true driving path is visible.`);
  }
  if (nearCritical.length) {
    actions.push(`Put the ${nearCritical.length} near-critical activit${plural(nearCritical.length)} on the weekly watch-list and, where feasible, add a small schedule margin (buffer) ahead of the completion milestone to absorb minor slips.`);
  }
  if (drivingPath.length) {
    actions.push(`Focus delivery on the driving path — assign your most reliable crews to these ${drivingPath.length} activities, expedite their long-lead inputs, and manage them daily; every day saved here comes straight off the project finish date.`);
  }

  if (!findings.length) findings.push("No critical, near-critical or negative-float activities were found — the network is running with comfortable slack.");
  if (!actions.length) actions.push("Maintain the current logic-driven plan and keep monitoring float trends each reporting period; no corrective action is needed now.");

  return { verdict, findings: findings.slice(0, 5), actions: actions.slice(0, 5) };
}
