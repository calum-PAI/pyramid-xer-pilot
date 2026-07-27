// =============================================================
// Contractor Programme Review Letter generator.
// Builds a formal review letter from the analysed schedule,
// following the contractor-programme-review skill structure.
// Works two ways: a deterministic builder (offline) and, when an
// OpenAI key is set, an LLM prompt grounded in the same data.
// =============================================================
import { fmtDate, fmtMoneyShort, daysBetween } from "./model.js";
import {
  computePhaseAnalysis, computeDisciplineAnalysis, computeClashDetection,
  computeLookAheadDetail, shortDisc,
} from "./curves.js";

const PH = "[●]"; // placeholder for project-specific info not in the XER

// Recommend an acceptance status from the data (user can override).
export function recommendStatus(a) {
  const { evms, dcma, floatA } = a;
  if (floatA.counts.negative > 0 || dcma.passed < 8 || evms.SPI < 0.9) return "not accepted";
  if (dcma.passed < 12 || evms.SPI < 0.98 || floatA.counts.critical > 0) return "accepted subject to comments";
  return "accepted";
}
export const STATUS_LABELS = {
  "accepted": "Accepted",
  "accepted subject to comments": "Accepted subject to comments",
  "not accepted": "Not accepted / resubmission required",
  "reviewed without acceptance": "Reviewed without acceptance",
};

export function defaultMeta(a) {
  const m = a.model;
  return {
    project: m.project.name || PH,
    contractor: PH,
    contractRef: PH,
    programmeRef: m.project.shortName || PH,
    dataDate: fmtDate(m.project.dataDate),
    reviewer: PH,
    position: "Project Manager",
    org: PH,
    acceptance: recommendStatus(a),
    resubmitDays: "14",
  };
}

// ── Draft persistence (saved in this browser, per project) ───
const LS_PREFIX = "pyramid.letter.";
function letterKey(a) {
  return LS_PREFIX + (a.model.project.shortName || a.model.project.id || "project");
}
export function saveLetterDraft(a, data) {
  try {
    localStorage.setItem(letterKey(a), JSON.stringify({ md: data.md, meta: data.meta, savedAt: Date.now() }));
    return Date.now();
  } catch { return null; }
}
export function loadLetterDraft(a) {
  try { const s = localStorage.getItem(letterKey(a)); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function clearLetterDraft(a) {
  try { localStorage.removeItem(letterKey(a)); } catch {}
}

// ── Deterministic letter model ───────────────────────────────
export function buildReviewLetter(a, meta) {
  const { model, evms, dcma, floatA, histogram, risks } = a;
  const cur = evms.currency;
  const M = (v) => fmtMoneyShort(v, cur);
  const dq = (id) => dcma.checks.find((c) => c.id === id) || {};
  const status = meta.acceptance;
  const statusPhrase = STATUS_LABELS[status].toLowerCase();

  const phases = computePhaseAnalysis(model, {});
  const disc = computeDisciplineAnalysis(model, {});
  const clashes = computeClashDetection(model, {});
  const la = computeLookAheadDetail(model, 6);

  const planFin = model.project.planFinish;
  const fcstFin = evms.forecastFinish;
  const slipDays = daysBetween(planFin, fcstFin);
  const slipWord = slipDays > 0 ? `${slipDays} calendar days behind` : slipDays < 0 ? `${-slipDays} calendar days ahead of` : "in line with";
  const posSentence = slipDays === 0
    ? "This places the forecast in line with the planned completion date."
    : `This indicates a forecast position approximately ${slipWord} the planned completion date.`;

  const sec = [];

  // 1 — Overall position
  sec.push({
    n: 1, heading: "Overall Position",
    paras: [
      `The submitted programme forecasts completion on ${fmtDate(fcstFin)}, compared with the planned completion date of ${fmtDate(planFin)}. ${posSentence}`,
      `The reported critical path runs through ${floatA.drivingPath.slice(0, 4).map((t) => t.name).join(", ") || PH}, culminating in project completion. The reliability of the forecast is affected by the schedule-quality and float matters set out below (DCMA ${dcma.passed}/${dcma.total}, ${dcma.rating}; ${floatA.counts.critical} critical and ${floatA.counts.negative} negative-float activities).`,
      `Based on our review, the programme is considered ${statusPhrase}.`,
    ],
    bullets: [],
  });

  // 2 — Areas of compliance
  sec.push({
    n: 2, heading: "Areas of Compliance",
    paras: ["The following aspects of the submission are noted as generally compliant. Compliance in these areas does not constitute acceptance of the programme as a whole:"],
    bullets: [
      `The programme identifies a clear data date of ${fmtDate(model.project.dataDate)}.`,
      `The submission is analysable and structured, comprising ${model.counts.activities} activities and ${model.counts.relationships} logic links.`,
      "S-curve reporting (planned / earned / actual) has been provided.",
      histogram && !histogram.empty ? "Resource histograms have been provided." : "Resource data is limited; histograms could not be fully derived.",
      "A short-term look-ahead has been provided.",
      "Critical path and total-float information has been provided.",
      `DCMA 14-point schedule-quality metrics have been provided (${dcma.passed}/${dcma.total}).`,
      risks && risks.length ? "A risk register has been produced." : "A risk register was not evident and is requested.",
      evms.hasCost ? "Earned-value (cost-loaded) information has been provided." : "The programme is not cost-loaded; earned-value is approximated from durations.",
    ],
  });

  // 3 — Contractual & milestone compliance
  const negMilestones = model.activities.filter((x) => x.isMilestone && x.totalFloat < 0);
  sec.push({
    n: 3, heading: "Contractual and Milestone Compliance",
    paras: ["The following matters require clarification or correction against the Contract requirements and the Employer's Requirements:"],
    bullets: [
      `Contractual milestones, sectional completion dates and key dates should be confirmed against the Contract; the following are shown as placeholders pending confirmation: ${PH}.`,
      negMilestones.length ? `${negMilestones.length} milestone(s) currently carry negative float, including "${negMilestones[0].name}" (${negMilestones[0].totalFloat.toFixed(0)}d).` : "No milestone is currently shown with negative float, subject to confirmation of the contractual milestone set.",
      `The forecast completion of ${fmtDate(fcstFin)} is ${slipWord} the planned date and should be reconciled against the contractual completion obligation.`,
      "Employer deliverables, access dates and third-party approvals should be clearly identified and logically linked.",
    ],
  });

  // 4 — Logic & integrity
  sec.push({
    n: 4, heading: "Programme Logic and Schedule Integrity",
    paras: ["Our review of the network logic identifies the following, which reduce the reliability of calculated float, the critical path and the forecast completion:"],
    bullets: [
      `Logic completeness (DCMA #1): ${dq(1).value} of activities are missing a predecessor and/or successor (target ${dq(1).count != null ? "≤ 5%" : PH}).`,
      `Leads / negative lag (DCMA #2): ${dq(2).value}. Leads should be eliminated.`,
      `Lags (DCMA #3): ${dq(3).value}. Long lags should be replaced with explicit activities.`,
      `Hard constraints (DCMA #5): ${dq(5).value}. Retained hard constraints must be justified; artificial constraints should be removed.`,
      `High-duration activities (DCMA #8): ${dq(8).value}. Long activities should be broken down to improve progress control.`,
      "A narrative should be provided explaining all retained constraints, lags and open ends.",
    ],
  });

  // 5 — Critical path & float
  sec.push({
    n: 5, heading: "Critical Path and Float",
    paras: [`The programme identifies a critical path with ${floatA.criticalPct}% of activities critical (total float ≤ 0). The nearest driving activities are noted below. The following concerns affect the reliability of the critical path:`],
    bullets: [
      ...floatA.drivingPath.slice(0, 5).map((t) => `${t.code} ${t.name} — ${t.totalFloat.toFixed(0)}d float, finish ${fmtDate(t.finish)}.`),
      floatA.counts.negative ? `Negative float is present on ${floatA.counts.negative} activit${floatA.counts.negative === 1 ? "y" : "ies"} (worst ${floatA.negative[0].totalFloat.toFixed(0)}d on "${floatA.negative[0].name}"), indicating the current logic cannot meet an imposed date.` : "No negative float is present against the current constraint set.",
      `Critical Path Length Index (CPLI) is ${dcma.cpli.toFixed(2)} and the Baseline Execution Index (BEI) is ${dcma.bei.toFixed(2)}${dcma.cpli < 0.95 ? " — the critical path has insufficient time to meet the target" : ""}.`,
      `${floatA.counts.nearCritical} near-critical activit${floatA.counts.nearCritical === 1 ? "y" : "ies"} (1–10 days float) require monitoring.`,
      "A clear critical-path narrative should be provided, identifying primary and near-critical paths, the causes of any negative float, and proposed mitigation.",
    ],
  });

  // 6 — Progress & S-curve
  const plannedPct = Math.round(evms.pctPlanned * 100);
  const earnedPct = Math.round(evms.pctEarned * 100);
  sec.push({
    n: 6, heading: "Progress and S-Curve Performance",
    paras: [`As at the data date, planned progress was approximately ${plannedPct}% against earned progress of ${earnedPct}%, a variance of ${earnedPct - plannedPct}% (SPI ${evms.SPI.toFixed(2)}).`],
    bullets: [
      evms.SPI < 0.98 ? "Actual progress is below the planned curve; the forecast therefore relies on an increase in production over that achieved to date." : "Progress is broadly in line with the planned curve; the achieved rate should be sustained.",
      "The basis of progress weighting (quantity / cost / earned value) should be confirmed and reconciled against site records.",
      "Any back-loading of work or productivity spikes in later periods should be substantiated.",
      `Substantiation is requested for reported progress and for the productivity assumptions underpinning the forecast completion of ${fmtDate(fcstFin)}.`,
    ],
  });

  // 7 — Resource analysis
  const over = histogram && !histogram.empty ? histogram.groups.filter((g) => g.overPeriods > 0) : [];
  sec.push({
    n: 7, heading: "Resource Analysis",
    paras: histogram && !histogram.empty
      ? [`The resource histograms indicate total demand of approximately ${Math.round(histogram.cumulativeMax).toLocaleString()} hours, peaking at ${Math.round(histogram.peak).toLocaleString()} hours in a single period across ${histogram.groups.length} resources.`]
      : ["Resource information is limited. A fully resource-loaded programme is requested to allow feasibility to be assessed."],
    bullets: [
      over.length ? `Over-allocation is indicated for: ${over.slice(0, 5).map((g) => `${g.name} (${g.overPeriods} period${g.overPeriods > 1 ? "s" : ""})`).join(", ")}. These peaks are not supported by an evident mobilisation plan.` : "No material resource over-allocation was identified, subject to confirmation of the resourcing basis.",
      "A resource mobilisation plan is requested confirming how forecast labour, plant, supervision and subcontractor resources will be achieved, including any ramp-up.",
      "Potential trade stacking in constrained work areas should be reviewed against access and productivity assumptions.",
    ],
  });

  // 8 — Look-ahead
  sec.push({
    n: 8, heading: "Look-Ahead and Short-Term Constraints",
    paras: [`The ${la.weeks}-week look-ahead (${fmtDate(la.window.from)} to ${fmtDate(la.window.to)}) contains ${la.stats.total} activities (${la.stats.starting} starting, ${la.stats.active} in progress).`],
    bullets: [
      la.stats.incompletePred ? `${la.stats.incompletePred} activit${la.stats.incompletePred === 1 ? "y is" : "ies are"} due to start with an incomplete predecessor and may not be ready to proceed.` : "No look-ahead activity was identified as starting with an incomplete predecessor.",
      `${la.stats.critical} critical and ${la.stats.nearCritical} near-critical activities fall within the window and warrant close control.`,
      "A constraints-removal plan is requested identifying design, materials, access, permits, RAMS and temporary-works status, with responsible owners and required dates.",
    ],
  });

  // 9 — Phase & discipline
  const worstPhase = [...phases].filter((p) => p.done < p.total).sort((x, y) => x.spi - y.spi)[0];
  const critDisc = disc.filter((p) => p.floatRisk === "High");
  sec.push({
    n: 9, heading: "Phase and Discipline Analysis",
    paras: ["Our review by phase and discipline identifies the following:"],
    bullets: [
      worstPhase ? `Phase "${worstPhase.name}" is the weakest performer (SPI ${worstPhase.spi.toFixed(2)}, ${worstPhase.pctComplete}% complete, forecast ${fmtDate(worstPhase.fcstEnd)}).` : "All phases are complete or on plan.",
      critDisc.length ? `${critDisc.length} discipline(s) carry critical float exposure, notably ${shortDisc(critDisc[0].name)}.` : "No discipline currently carries critical float exposure.",
      clashes.length ? `${clashes.length} congestion / clash window(s) were identified where three or more disciplines peak together, notably ${clashes[0].date.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}.` : "No three-way discipline clash windows were identified.",
      "A phase-by-phase and discipline-by-discipline recovery strategy is requested where forecast dates exceed requirements.",
    ],
  });

  // 10 — EVMS
  if (evms.hasCost) {
    sec.push({
      n: 10, heading: "Earned Value Review",
      paras: ["The earned-value information indicates:"],
      bullets: [
        `Planned Value (PV): ${M(evms.PV)} · Earned Value (EV): ${M(evms.EV)} · Actual Cost (AC): ${M(evms.AC)}.`,
        `Schedule Variance (SV): ${M(evms.SV)} · Cost Variance (CV): ${M(evms.CV)}.`,
        `SPI ${evms.SPI.toFixed(2)} · CPI ${evms.CPI.toFixed(2)} · EAC ${M(evms.EAC)} · VAC ${M(evms.VAC)}.`,
        "Earned-value performance must be reconciled with the critical path and S-curve: favourable EV does not confirm that critical activities are being achieved.",
      ],
    });
  }

  // 11 — Risk register
  sec.push({
    n: evms.hasCost ? 11 : 10, heading: "Risk Register",
    paras: risks && risks.length ? ["The risk register identifies the following principal exposures. The following matters are noted:"] : ["A programme-linked risk register is requested."],
    bullets: [
      ...(risks || []).slice(0, 5).map((r) => `[${r.severity}] ${r.category}: ${r.title}.`),
      "Not all risks appear linked to programme activities; mitigation actions should be reflected in the programme with owners, response dates and quantified time impacts.",
    ],
  });

  // 12 — Opportunities
  sec.push({
    n: evms.hasCost ? 12 : 11, heading: "Opportunities",
    paras: ["The following opportunities should be considered to protect or improve the forecast:"],
    bullets: [
      "Correct missing logic and open ends, and replace long lags with explicit activities.",
      "Remove artificial constraints so that dates are logic-driven.",
      "Re-sequence works to open additional work fronts and increase resources on critical and near-critical activities.",
      "Advance procurement approvals for long-lead items and improve off-site fabrication / modularisation.",
      "Undertake progressive testing and commissioning by zone, and break down long-duration activities.",
      "Link risk-mitigation actions directly to programme activities and monitor the near-critical path.",
    ],
  });

  // 13 — Required actions
  sec.push({
    n: evms.hasCost ? 13 : 12, heading: "Required Actions",
    paras: [`The Contractor is requested to provide the following within ${meta.resubmitDays} days:`],
    bullets: [
      "Revised programme addressing the comments in this letter, with a supporting narrative explaining the forecast completion date.",
      "Critical-path and near-critical-path report, and a schedule-quality report resolving the logic issues identified.",
      "Milestone-compliance table and a schedule-variance report against the accepted baseline.",
      "Resource mobilisation plan, updated S-curves and updated resource histograms by trade.",
      "Updated look-ahead with a constraints-removal plan and responsible owners.",
      "Updated phase and discipline analysis, updated earned-value report (where applicable) and an updated, programme-linked risk register.",
      "Explanation of all logic changes, constraints, lags, and added / deleted activities, and a recovery plan where forecast dates exceed requirements.",
    ],
  });

  // 14 — Reservation of rights
  sec.push({
    n: evms.hasCost ? 14 : 13, heading: "Reservation of Rights",
    paras: ["Nothing in this review should be taken as acceptance of delay, acceptance of entitlement to an extension of time, acceptance of entitlement to additional payment, approval of the Contractor's means and methods, or relief from the Contractor's obligations under the Contract. All rights and remedies of the Employer under the Contract are expressly reserved."],
    bullets: [],
  });

  // 15 — Conclusion
  sec.push({
    n: evms.hasCost ? 15 : 14, heading: "Conclusion",
    paras: [`In conclusion, the programme is ${statusPhrase} pending resolution of the matters identified above. ${status === "accepted" ? "The Contractor should continue to update and maintain the programme in accordance with the Contract." : `The Contractor is required to submit a revised programme and supporting narrative within ${meta.resubmitDays} days.`}`],
    bullets: [],
  });

  const subject = `Review of Contractor's Programme Submission — ${meta.project} — ${meta.programmeRef} — Data Date ${meta.dataDate}`;
  const refPara = `We refer to your programme submission reference ${meta.programmeRef}, with a stated data date of ${meta.dataDate}.`;
  const basisPara = `We have reviewed the submission against the requirements of the Contract, the Employer's Requirements, the accepted baseline programme and current progress information, including the S-curves, resource histograms, look-ahead, phase and discipline analysis, earned-value data, float and critical-path analysis, DCMA quality metrics and risk register. Our review has considered contractual compliance, technical quality, logic integrity, progress status, resource feasibility, critical-path reliability and risk exposure.`;

  return { subject, refPara, basisPara, sections: sec, status };
}

// ── Serialise the letter model to Markdown text ──────────────
export function letterToMarkdown(letter, meta) {
  const L = [];
  L.push(`**Subject:** ${letter.subject}`, "");
  L.push(`Dear ${meta.contractor},`, "");
  L.push(letter.refPara, "");
  L.push(letter.basisPara, "");
  letter.sections.forEach((s) => {
    L.push(`## ${s.n}. ${s.heading}`);
    (s.paras || []).forEach((p) => L.push(p, ""));
    (s.bullets || []).forEach((b) => L.push(`- ${b}`));
    L.push("");
  });
  L.push("Yours faithfully,", "");
  L.push(meta.reviewer, meta.position, meta.org);
  return L.join("\n");
}

// ── LLM path (used when an OpenAI key is set) ────────────────
export const LETTER_SYSTEM = `You are an expert construction scheduler and programme reviewer acting for the Employer / Project Manager. Draft a formal Contractor's Programme Review letter based ONLY on the SCHEDULE DATA and META provided.

Perspective: the party reviewing the contractor's submitted programme. Tone: professional, contract-aware, evidence-based, never aggressive. Do NOT determine entitlement to extension of time or additional payment. Use "[●]" as a placeholder for contract-specific information not present in the data (contract dates, contractor name, references). Where information is missing, state the limitation rather than assuming compliance.

Structure the letter with these numbered sections: 1. Overall Position (state forecast vs planned completion and the recommended acceptance status), 2. Areas of Compliance, 3. Contractual and Milestone Compliance, 4. Programme Logic and Schedule Integrity, 5. Critical Path and Float, 6. Progress and S-Curve Performance, 7. Resource Analysis, 8. Look-Ahead and Short-Term Constraints, 9. Phase and Discipline Analysis, 10. Earned Value Review (only if cost-loaded), Risk Register, Key Risks, Opportunities, Required Actions, Reservation of Rights, Conclusion.

Reconcile S-curve, EVMS, resource and critical-path findings. Highlight where schedule-quality issues affect critical-path reliability. Separate compliance, risks, opportunities and required actions. Conclude with the acceptance status from META and, unless accepted, a resubmission deadline. Include the standard reservation-of-rights clause. Begin with "**Subject:** …" then "Dear [contractor]," and end with a "Yours faithfully," sign-off using the META reviewer details. Output Markdown using "## " for section headings and "- " for bullets.`;

// System prompt for redrafting a highlighted excerpt of the letter.
export const REDRAFT_SYSTEM = `You are editing a formal Contractor's Programme Review letter written for the Employer / Project Manager. Rewrite ONLY the excerpt provided, following the user's instruction. Keep the professional, contract-aware, evidence-based tone. Preserve all facts, figures, dates and "[●]" placeholders exactly — do not invent new numbers or commitments. Preserve any Markdown formatting present in the excerpt ("## " headings, "- " bullets, "**bold**"). Return only the rewritten excerpt, with no preamble, explanation, or surrounding quotation marks.`;

export function buildRedraftPrompt(excerpt, instruction) {
  return `INSTRUCTION: ${instruction && instruction.trim() ? instruction.trim() : "Improve clarity, flow and professionalism while keeping the meaning and all figures unchanged."}\n\nEXCERPT:\n${excerpt}`;
}

export function buildLetterUserPrompt(meta, scheduleContext) {
  const metaLines = [
    `Project: ${meta.project}`,
    `Contractor: ${meta.contractor}`,
    `Contract reference: ${meta.contractRef}`,
    `Programme reference: ${meta.programmeRef}`,
    `Data date: ${meta.dataDate}`,
    `Recommended acceptance status: ${STATUS_LABELS[meta.acceptance]}`,
    `Resubmission period (days): ${meta.resubmitDays}`,
    `Reviewer: ${meta.reviewer}, ${meta.position}, ${meta.org}`,
  ].join("\n");
  return `Draft the programme review letter now.\n\nMETA:\n${metaLines}\n\nSCHEDULE DATA:\n${scheduleContext}`;
}
