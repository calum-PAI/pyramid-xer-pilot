// =============================================================
// Earned Value Management System (EVMS) engine.
// Computes PV, EV, AC, SPI, CPI, BAC, EAC, ETC, VAC, TCPI.
// Falls back to duration-weighted "work value" when the schedule
// carries no cost loading, so every XER still yields an EV picture.
// =============================================================

export function computeEVMS(model) {
  const dd = model.project.dataDate;
  const hasCost = model.hasCost;

  // Per-activity budget basis: cost if loaded, else target duration (days),
  // milestones get a nominal weight of 1 so they still register.
  const basis = (a) => {
    if (hasCost) return a.budget;
    return a.isMilestone ? 1 : Math.max(a.targetDur, 0.5);
  };

  let BAC = 0;
  let PV = 0; // planned value @ data date
  let EV = 0; // earned value
  let AC = 0; // actual cost

  for (const a of model.activities) {
    const b = basis(a);
    BAC += b;

    // Planned % complete by data date (schedule-based)
    const ps = a.targetStart || a.start;
    const pe = a.targetEnd || a.finish;
    let plannedPct = 0;
    if (a.isMilestone) {
      plannedPct = pe && dd >= pe ? 1 : 0;
    } else if (ps && pe && pe > ps) {
      plannedPct = clamp((dd - ps) / (pe - ps), 0, 1);
    } else if (pe) {
      plannedPct = dd >= pe ? 1 : 0;
    }
    PV += b * plannedPct;

    const earnedPct = a.pctComplete / 100;
    EV += b * earnedPct;

    if (hasCost) {
      AC += a.actualCost;
    } else {
      // synthesize AC from earned work + a small cost-performance drift
      AC += b * earnedPct;
    }
  }

  // If cost-loaded but no actuals captured yet, approximate AC from EV.
  if (hasCost && AC === 0 && EV > 0) AC = EV;

  const SPI = PV > 0 ? EV / PV : 1;
  const CPI = AC > 0 ? EV / AC : 1;
  const SV = EV - PV;
  const CV = EV - AC;

  const EAC = CPI > 0 ? BAC / CPI : BAC;
  const ETC = EAC - AC;
  const VAC = BAC - EAC;
  const TCPI = BAC - AC !== 0 ? (BAC - EV) / (BAC - AC) : 1;

  return {
    hasCost,
    currency: model.project.currency,
    BAC,
    PV,
    EV,
    AC,
    SV,
    CV,
    SPI,
    CPI,
    EAC,
    ETC,
    VAC,
    TCPI,
    pctPlanned: BAC ? PV / BAC : 0,
    pctEarned: BAC ? EV / BAC : 0,
    pctActual: BAC ? AC / BAC : 0,
    // Forecast finish based on SPI slippage
    forecastFinish: forecastFinish(model, SPI),
  };
}

function forecastFinish(model, SPI) {
  const plan = model.project.planFinish;
  const start = model.project.planStart;
  if (!plan || !start) return plan;
  const planDays = Math.max((plan - start) / 86400000, 1);
  const factor = SPI > 0 ? 1 / SPI : 1.2;
  const forecastDays = planDays * factor;
  return new Date(start.getTime() + forecastDays * 86400000);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function spiLabel(spi) {
  if (spi >= 1.05) return { text: "ahead of schedule", tone: "success" };
  if (spi >= 0.98) return { text: "on schedule", tone: "success" };
  if (spi >= 0.9) return { text: "slightly behind schedule", tone: "warning" };
  return { text: "significantly behind schedule", tone: "danger" };
}
export function cpiLabel(cpi) {
  if (cpi >= 1.05) return { text: "under budget", tone: "success" };
  if (cpi >= 0.98) return { text: "on budget", tone: "success" };
  if (cpi >= 0.9) return { text: "slightly over budget", tone: "warning" };
  return { text: "significantly over budget", tone: "danger" };
}
