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

  // ── Upcoming milestones (incomplete, within lookahead) ──
  const upcoming = milestones
    .filter((m) => m.status !== "TK_Complete")
    .map((m) => {
      const baseline = m.targetEnd || m.targetStart;
      const forecast = m.finish || m.targetEnd;
      const varDays = baseline && forecast ? daysBetween(forecast, baseline) : 0;
      return { m, baseline, forecast, varDays, status: varDays >= 0 ? "On-Track" : "Delayed" };
    })
    .filter((x) => x.forecast && x.forecast >= monthAgo && x.forecast <= horizon)
    .sort((x, y) => (x.forecast || 0) - (y.forecast || 0));
  const onTrack = upcoming.filter((u) => u.status === "On-Track").length;
  const delayed = upcoming.length - onTrack;

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

  const ops = [{
    project: model.project.shortName,
    pa: model.project.planFinish,
    forecast: evms.forecastFinish,
    onTrack: evms.forecastFinish <= model.project.planFinish,
  }];

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
    milestones: {
      total,
      completedCount: completed.length,
      pctCompletion: total ? (completed.length / total) * 100 : 0,
      completedInMonth: completed.filter((c) => c.inPeriod).length,
      plannedPct: total ? (plannedDone / total) * 100 : 0,
      upcomingCount: upcoming.length,
      onTrack, delayed,
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
