import { useMemo, useState } from "react";
import { ProgressSCurveChart } from "../components/charts.jsx";
import { SectionTitle, KpiTile, Segmented } from "../components/ui.jsx";
import { Icon } from "../components/Icons.jsx";
import FilterBar, { FILTER_DEFAULTS } from "../components/FilterBar.jsx";
import { fmtMoneyShort } from "../lib/model.js";
import { computeSCurves, makeActivityFilter } from "../lib/curves.js";

const METRICS = [["pct", "% Complete"], ["cost", "Cost"], ["hours", "Hours"]];
const PERIODS = [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]];
const METRIC_LABEL = { pct: "Duration", cost: "Cost", hours: "Hours" };

export default function SCurves({ a }) {
  const { model } = a;
  const cur = model.project.currency;
  const [applied, setApplied] = useState(FILTER_DEFAULTS);
  // "Cost" is only offered when the schedule is cost-loaded — otherwise there is
  // no cost to curve, so default to % complete and hide the Cost option.
  const metricOpts = model.hasCost ? METRICS : METRICS.filter(([k]) => k !== "cost");
  const [metric, setMetric] = useState(model.hasCost ? "cost" : "pct");
  const [period, setPeriod] = useState("week");

  const sc = useMemo(
    () =>
      computeSCurves(model, {
        metric,
        period,
        activityFilter: makeActivityFilter(applied),
        resourceType: applied.resourceType,
        from: applied.from ? new Date(applied.from + "T00:00") : null,
        to: applied.to ? new Date(applied.to + "T23:59") : null,
      }),
    [model, applied, metric, period]
  );

  // format a native-unit value for the KPI strip
  const fmtVal = (v) =>
    metric === "cost"
      ? model.hasCost ? fmtMoneyShort(v, cur) : Math.round(v) + "d"
      : metric === "hours"
      ? Math.round(v).toLocaleString() + " h"
      : Math.round(v) + "d";
  const pct = (v) => (sc.totalBasis ? ((v / sc.totalBasis) * 100).toFixed(1) : "0") + "%";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <FilterBar model={model} applied={applied} onApply={setApplied} />

      <div className="g-kpi">
        <KpiTile label="% Planned (baseline)" value={pct(sc.baselineAtDD)} sub="to data date" />
        <KpiTile label="% Complete (actual)" value={pct(sc.earnedAtDD)} sub="to data date" tone="success" />
        <KpiTile label={metric === "cost" ? "Actual to date" : "Earned to date"} value={fmtVal(sc.earnedAtDD)} sub="cumulative" tone="warning" />
        <KpiTile label={metric === "hours" ? "Total hours" : metric === "cost" ? "Budget (BAC)" : "Total duration"} value={fmtVal(sc.totalBasis)} sub="total scope" />
      </div>

      <div className="card card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <Segmented options={metricOpts} value={metric} onChange={setMetric} />
          <Segmented options={PERIODS} value={period} onChange={setPeriod} />
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", justifyContent: "center", marginBottom: 4 }}>
          <LegendItem label="Baseline Plan" color="var(--brand-300)" dashed />
          <LegendItem label="Current Plan" color="var(--brand-primary)" />
          <LegendItem label="Actual" color="var(--success)" thick />
        </div>

        {sc.empty ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Icon.trend size={26} stroke="var(--fg-5)" />
            <div className="subheading" style={{ marginTop: 12 }}>No data for this selection</div>
            <p className="body-2 muted" style={{ marginTop: 6 }}>Try a different metric or widen the filters.</p>
          </div>
        ) : (
          <ProgressSCurveChart data={sc} metricLabel={METRIC_LABEL[metric]} />
        )}

        <p className="body-2 muted" style={{ marginTop: 14, textAlign: "center" }}>
          Dashed = Baseline plan · Solid blue = Current planned · Green = Actual earned · <span style={{ color: "var(--danger-ink)", fontWeight: 600 }}>Red line = Data Date</span>
        </p>
      </div>
    </div>
  );
}

function LegendItem({ label, color, dashed, thick }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width="26" height="10">
        <line x1="0" y1="5" x2="26" y2="5" stroke={color} strokeWidth={thick ? 3 : 2}
          strokeDasharray={dashed ? "5 3" : "0"} />
      </svg>
      <span className="body-2 muted">{label}</span>
    </div>
  );
}
