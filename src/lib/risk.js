// =============================================================
// Auto-generated risk register.
// =============================================================
import { fmtDate } from "./model.js";

// ── Auto-generated risk register ─────────────────────────────
export function buildRiskRegister(model, evms, dcma, floatA) {
  const risks = [];
  const dd = model.project.dataDate;
  let n = 1;
  const rid = () => "R-" + String(n++).padStart(2, "0");

  if (floatA.negative.length > 0) {
    const worst = floatA.negative[0];
    risks.push({
      id: rid(),
      category: "Schedule",
      title: "Negative float — plan breaches constraint",
      desc: `${floatA.negative.length} activities carry negative total float (worst ${worst.totalFloat.toFixed(
        1
      )}d on “${worst.name}”). The schedule cannot meet its target dates without acceleration.`,
      likelihood: 5,
      impact: 4,
      mitigation:
        "Re-sequence or fast-track the driving path; recover lag via added shifts or crews on the most negative activities.",
      owner: "Planning",
    });
  }

  if (evms.CPI < 0.98 && model.hasCost) {
    risks.push({
      id: rid(),
      category: "Cost",
      title: "Cost performance below plan",
      desc: `CPI ${evms.CPI.toFixed(
        2
      )} projects an over-run of ${money(evms.VAC, evms.currency)} at completion (EAC ${money(
        evms.EAC,
        evms.currency
      )}).`,
      likelihood: 4,
      impact: 4,
      mitigation:
        "Review earned-value on active work packages; contain scope creep and re-baseline the cost forecast.",
      owner: "Commercial",
    });
  }

  if (evms.SPI < 0.95) {
    risks.push({
      id: rid(),
      category: "Schedule",
      title: "Schedule performance eroding",
      desc: `SPI ${evms.SPI.toFixed(
        2
      )} indicates the project is earning value slower than planned. Forecast finish ${fmtDate(
        evms.forecastFinish
      )}.`,
      likelihood: 4,
      impact: 4,
      mitigation:
        "Deploy a recovery schedule; focus supervision on near-critical activities to lift the earn rate.",
      owner: "Project Controls",
    });
  }

  const highFloat = model.activities.filter(
    (a) => a.status !== "TK_Complete" && a.totalFloat > 44
  );
  if (highFloat.length > 0) {
    risks.push({
      id: rid(),
      category: "Logic",
      title: "Open / missing network logic",
      desc: `${highFloat.length} activities show total float above 44 days — a common symptom of missing predecessors or open ends that hide the true critical path.`,
      likelihood: 3,
      impact: 3,
      mitigation:
        "Audit predecessor/successor links on high-float activities; close open ends before the next update.",
      owner: "Planning",
    });
  }

  const longDur = model.activities.filter(
    (a) => a.status !== "TK_Complete" && !a.isMilestone && a.remainDur > 44
  );
  if (longDur.length > 0) {
    risks.push({
      id: rid(),
      category: "Execution",
      title: "Long-duration activities reduce control",
      desc: `${longDur.length} incomplete activities exceed 44 days of remaining duration, limiting progress visibility between updates.`,
      likelihood: 3,
      impact: 3,
      mitigation:
        "Break long tasks into measurable steps with interim milestones for tighter progress tracking.",
      owner: "Execution",
    });
  }

  const missed = model.activities.filter(
    (a) => a.status !== "TK_Complete" && a.targetEnd && a.targetEnd < dd
  );
  if (missed.length > 0) {
    risks.push({
      id: rid(),
      category: "Schedule",
      title: "Missed baseline finishes",
      desc: `${missed.length} activities are past their baseline finish but not yet complete, pushing downstream logic.`,
      likelihood: 4,
      impact: 3,
      mitigation:
        "Status missed activities urgently; assess knock-on delay and update remaining durations.",
      owner: "Site",
    });
  }

  if (dcma.passed < 11) {
    const failed = dcma.checks
      .filter((c) => c.applicable && !c.pass)
      .map((c) => c.name)
      .slice(0, 4)
      .join(", ");
    risks.push({
      id: rid(),
      category: "Quality",
      title: "Schedule quality below DCMA standard",
      desc: `Only ${dcma.passed}/${dcma.total} DCMA checks pass (${dcma.rating}). Weak areas: ${failed}. Analytics built on a low-quality schedule carry higher uncertainty.`,
      likelihood: 3,
      impact: 4,
      mitigation:
        "Remediate failing DCMA checks (logic, constraints, lags) before relying on forecasts for reporting.",
      owner: "Project Controls",
    });
  }

  const hardCstr = model.activities.filter((a) => /MAND|MSO|MEO/.test(a.cstrType));
  if (hardCstr.length > 2) {
    risks.push({
      id: rid(),
      category: "Logic",
      title: "Hard constraints overriding logic",
      desc: `${hardCstr.length} activities carry hard date constraints that can mask float and distort the critical path.`,
      likelihood: 2,
      impact: 3,
      mitigation:
        "Replace mandatory constraints with driving logic wherever the sequence permits.",
      owner: "Planning",
    });
  }

  return risks
    .map((r) => {
      const score = r.likelihood * r.impact;
      return {
        ...r,
        score,
        severity:
          score >= 15
            ? "Critical"
            : score >= 9
            ? "High"
            : score >= 5
            ? "Medium"
            : "Low",
      };
    })
    .sort((a, b) => b.score - a.score);
}

function money(v, cur) {
  // light-weight, avoids circular import
  const sym = { INR: "₹", USD: "$", EUR: "€", GBP: "£" }[cur] || "$";
  return `${v < 0 ? "-" : ""}${sym}${Math.abs(Math.round(v)).toLocaleString(
    cur === "INR" ? "en-IN" : "en-US"
  )}`;
}

