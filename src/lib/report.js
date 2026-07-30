// =============================================================
// Consolidated "Programme Summary" report model.
// Milestone-centric rollup for the exportable report.
// =============================================================
import { daysBetween } from "./model.js";

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}
function monthKey(d) {
  return d.getFullYear() * 12 + d.getMonth();
}

export function buildReport(a, lookaheadMonths = 6) {
  const { model, evms, scurve } = a;
  const dd = model.project.dataDate;
  const monthAgo = addMonths(dd, -1);
  const horizon = addMonths(dd, lookaheadMonths);

  const milestones = model.activities.filter((m) => m.isMilestone);
  const total = milestones.length;

  // ── Completed milestones ──
  const completed = milestones
    .filter((m) => m.status === "TK_Complete")
    .map((m) => {
      const baseline = m.targetEnd || m.targetStart || m.finish;
      const done = m.actEnd || m.finish || baseline;
      const varDays = baseline && done ? daysBetween(done, baseline) : 0; // +ve = early
      return { m, baseline, done, varDays, inPeriod: done && done > monthAgo && done <= dd };
    })
    .sort((x, y) => (y.done || 0) - (x.done || 0));

  // ── Remaining milestones — shown in the lookahead, reconciled to the total ──
  // Everything due by the horizon is listed, INCLUDING anything already overdue
  // (forecast before the window) so a delayed milestone is never silently
  // dropped. Milestones forecast beyond the horizon are counted separately so
  // completed + upcoming + beyond always reconciles to the milestone total.
  const remaining = milestones.filter((m) => m.status !== "TK_Complete");
  const upcoming = remaining
    .map((m) => {
      const baseline = m.targetEnd || m.targetStart;
      const forecast = m.finish || m.targetEnd;
      const varDays = baseline && forecast ? daysBetween(forecast, baseline) : 0;
      return { m, baseline, forecast, varDays, status: varDays >= 0 ? "On-Track" : "Delayed" };
    })
    .filter((x) => x.forecast && x.forecast <= horizon)
    .sort((x, y) => (x.forecast || 0) - (y.forecast || 0));
  const onTrack = upcoming.filter((u) => u.status === "On-Track").length;
  const delayed = upcoming.length - onTrack;
  const beyondCount = remaining.length - upcoming.length; // forecast past the horizon

  // ── SPI trend from the S-curve (cumulative EV/PV per past month) ──
  // The headline SPI/SV use the authoritative EVMS figures; the final trend
  // point is anchored to them so the sparkline ends at the to-date value
  // (the raw last month is partial and would dip artificially).
  const spiTrend = scurve.rows
    .filter((r) => r.isPast && r.planned > 0 && r.earned != null)
    .map((r) => ({ date: r.date, spi: r.earned / r.planned }));
  const spiToDate = evms.SPI;
  if (spiTrend.length) spiTrend[spiTrend.length - 1] = { date: dd, spi: spiToDate };
  const spiLastMonth = spiTrend.length > 1 ? spiTrend[spiTrend.length - 2].spi : spiToDate;

  const svRows = scurve.rows.filter((r) => r.isPast && r.earned != null);
  const prev = svRows[svRows.length - 2];
  const scheduleVar = evms.SV;
  const scheduleVarLast = prev ? prev.earned - prev.planned : scheduleVar;

  // ── Milestone completion bars (per month) ──
  const compByMonth = {};
  completed.forEach((c) => { if (c.done) compByMonth[monthKey(c.done)] = (compByMonth[monthKey(c.done)] || 0) + 1; });
  const completedBars = monthSeries(compByMonth, dd, -8, 0);

  // ── Upcoming per month (stacked on-track / delayed) ──
  const upByMonth = {};
  upcoming.forEach((u) => {
    const k = monthKey(u.forecast);
    upByMonth[k] = upByMonth[k] || { onTrack: 0, delayed: 0 };
    upByMonth[k][u.status === "Delayed" ? "delayed" : "onTrack"] += 1;
  });
  const lookaheadBars = [];
  for (let i = 0; i <= lookaheadMonths; i++) {
    const d = addMonths(new Date(dd.getFullYear(), dd.getMonth(), 1), i);
    const b = upByMonth[monthKey(d)] || { onTrack: 0, delayed: 0 };
    lookaheadBars.push({ date: d, ...b });
  }

  const plannedDone = milestones.filter((m) => {
    const b = m.targetEnd || m.targetStart;
    return b && b <= dd;
  }).length;

  // Programme completion is reported against the PLANNED (contract) completion
  // date — the schedule's own finish — not a synthetic forecast. On-track status
  // reflects schedule performance to date (SPI), consistent with the platform.
  const ops = [{
    project: model.project.shortName,
    planned: model.project.planFinish,
    spi: evms.SPI,
    onTrack: evms.SPI >= 0.95,
  }];

  // ── Live execution: in-progress & delayed (negative-float) activities ──
  // The milestone roll-ups above miss current task execution, so the summary
  // would otherwise show nothing in progress or behind. Surface both here so
  // the report reconciles with the platform's Activity-Status / Float views.
  const tasks = model.activities.filter((x) => !x.isMilestone);
  const inProgress = tasks.filter((x) => x.status === "TK_Active");
  const delayedTasks = tasks.filter((x) => x.status !== "TK_Complete" && x.totalFloat < 0);
  const byFloat = (x, y) => x.totalFloat - y.totalFloat; // worst float first
  // In-progress activities always lead (so live work is never crowded out by
  // the negative-float backlog), followed by the remaining delayed activities.
  const inProgIds = new Set(inProgress.map((t) => t.id));
  const executionRows = [
    ...[...inProgress].sort(byFloat),
    ...delayedTasks.filter((t) => !inProgIds.has(t.id)).sort(byFloat),
  ]
    .map((t) => ({
      id: t.id, code: t.code, name: t.name, wbs: t.wbs,
      pct: t.pctComplete, float: t.totalFloat, statusLabel: t.statusLabel,
      active: t.status === "TK_Active", delayed: t.totalFloat < 0,
    }));
  const execution = {
    inProgressCount: inProgress.length,
    delayedCount: delayedTasks.length,
    rows: executionRows.slice(0, 12),
    hiddenCount: Math.max(0, executionRows.length - 12),
  };

  return {
    generatedAt: new Date(),
    period: dd,
    portfolio: model.project.shortName,
    projectName: model.project.name,
    lookaheadMonths, horizon,
    currency: model.project.currency,
    spiToDate, spiLastMonth,
    spiTrend: spiTrend.slice(-7),
    scheduleVar, scheduleVarLast,
    actualPct: evms.pctEarned * 100,
    plannedPct: evms.pctPlanned * 100,
    ops,
    execution,
    milestones: {
      total,
      completedCount: completed.length,
      pctCompletion: total ? (completed.length / total) * 100 : 0,
      completedInMonth: completed.filter((c) => c.inPeriod).length,
      plannedPct: total ? (plannedDone / total) * 100 : 0,
      upcomingCount: upcoming.length,
      onTrack, delayed,
      remainingCount: remaining.length,
      beyondCount,
    },
    completed, upcoming, completedBars, lookaheadBars,
  };
}

function monthSeries(map, anchor, from, to) {
  const out = [];
  for (let i = from; i <= to; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
    out.push({ date: d, count: map[monthKey(d)] || 0 });
  }
  return out;
}
