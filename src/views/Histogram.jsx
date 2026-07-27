import { useMemo, useState } from "react";
import { ResourceHistogramChart } from "../components/charts.jsx";
import { SectionTitle, KpiTile } from "../components/ui.jsx";
import { Icon } from "../components/Icons.jsx";
import FilterBar, { FILTER_DEFAULTS } from "../components/FilterBar.jsx";
import { computeResourceHistogram, makeActivityFilter } from "../lib/curves.js";
import { fmtMoneyShort } from "../lib/model.js";

function typeLabel(g, groupBy) {
  if (groupBy !== "resource") return groupBy === "trade" ? "Trade" : "Disc";
  return g.type === "RT_Equip" ? "Equip" : g.type === "RT_Mtl" ? "Mat" : "Labor";
}

const PALETTE = [
  "#3267FF", "#14B8A6", "#F59E0B", "#5B4FD1", "#0EA5B5",
  "#DB6B97", "#A07A4E", "#0000C6", "#65C24F", "#66B7FF",
  "#9333EA", "#0767D5",
];

const PERIODS = [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]];
const GROUPS = [["resource", "Resource"], ["discipline", "Discipline"], ["trade", "Trade"]];

export default function Histogram({ a }) {
  const { model } = a;
  const cur = model.project.currency;
  const [applied, setApplied] = useState(FILTER_DEFAULTS);
  const [period, setPeriod] = useState("week");
  const [groupBy, setGroupBy] = useState("resource");

  const hist = useMemo(
    () =>
      computeResourceHistogram(model, {
        period,
        groupBy,
        activityFilter: makeActivityFilter(applied),
        resourceType: applied.resourceType,
        from: applied.from ? new Date(applied.from + "T00:00") : null,
        to: applied.to ? new Date(applied.to + "T23:59") : null,
      }),
    [model, applied, period, groupBy]
  );

  const colorMap = {};
  hist.groups.forEach((g, i) => (colorMap[g.id] = PALETTE[i % PALETTE.length]));
  const colorFor = (id) => colorMap[id] || "var(--brand-300)";
  const totalHrs = hist.groups.reduce((s, g) => s + g.total, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <FilterBar model={model} applied={applied} onApply={setApplied} />

      {hist.empty ? (
        <Empty />
      ) : (
        <>
          <div className="g-kpi">
            <KpiTile label={groupBy === "resource" ? "Resources" : groupBy === "discipline" ? "Disciplines" : "Trades"} value={hist.groups.length} sub="loaded" />
            <KpiTile label="Peak demand" value={`${Math.round(hist.peak)}`} sub={`hrs / ${period === "day" ? "day" : period === "week" ? "week" : "month"}`} tone="warning" />
            <KpiTile label="Total man-hours" value={Math.round(totalHrs).toLocaleString()} sub="in selection" />
            <KpiTile label="Over-allocated" value={hist.overPeriods || 0} sub="periods over cap" tone={hist.overPeriods ? "danger" : "success"} />
          </div>

          <div className="card card-pad">
            {/* Toggle rows */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <Segmented options={PERIODS} value={period} onChange={setPeriod} />
              <Segmented options={GROUPS} value={groupBy} onChange={setGroupBy} />
            </div>

            <ResourceHistogramChart data={hist} colorFor={colorFor} unit="Hrs" />

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", marginTop: 16 }}>
              {hist.groups.map((g) => (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: colorFor(g.id) }} />
                  <span className="body-2 muted">{g.name}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 16, height: 3, borderRadius: 2, background: "var(--brand-primary)" }} />
                <span className="body-2 muted">Cumulative</span>
              </div>
            </div>

            {groupBy === "resource" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--danger)", flex: "0 0 10px" }} />
                <span className="body-2 muted" style={{ fontSize: 12.5 }}>
                  Red zones indicate over-allocation vs resource max units (capacity = units × {hist.periodHours} hrs/period cap).
                </span>
              </div>
            )}
          </div>

          {/* Resource summary table */}
          <div className="card">
            <div style={{ padding: "18px 20px 4px" }}>
              <SectionTitle icon={<Icon.grid size={18} />}>
                {groupBy === "resource" ? "Resource" : groupBy === "discipline" ? "Discipline" : "Trade"} Summary
              </SectionTitle>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{groupBy === "resource" ? "Resource / Group" : groupBy === "discipline" ? "Discipline" : "Trade"}</th>
                    <th>Type</th>
                    <th style={{ textAlign: "right" }}>Peak hrs/period</th>
                    <th>Peak period</th>
                    <th style={{ textAlign: "right" }}>Over-alloc periods</th>
                    <th style={{ textAlign: "right" }}>Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {hist.groups.map((g) => (
                    <tr key={g.id}>
                      <td style={{ fontWeight: 500, color: "var(--fg-1)" }}>
                        <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: colorFor(g.id), marginRight: 8 }} />
                        {g.name}
                      </td>
                      <td className="muted">{typeLabel(g, groupBy)}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{g.peakHrs.toLocaleString()}</td>
                      <td>{g.peakDate ? g.peakDate.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) : "—"}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: g.overPeriods ? 700 : 400, color: g.overPeriods ? "var(--danger-ink)" : "var(--fg-4)" }}>
                        {groupBy === "resource" ? g.overPeriods : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{model.hasCost ? fmtMoneyShort(g.cost, cur) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: "var(--bg-tint)", borderRadius: 9999, padding: 3, gap: 2 }}>
      {options.map(([v, label]) => {
        const active = v === value;
        return (
          <button key={v} onClick={() => onChange(v)}
            style={{
              border: 0, cursor: "pointer", borderRadius: 9999, padding: "7px 16px",
              font: "500 13px var(--font-sans)",
              background: active ? "var(--brand-primary)" : "transparent",
              color: active ? "#fff" : "var(--fg-3)",
              boxShadow: active ? "var(--shadow-sm)" : "none",
              transition: "all 150ms var(--ease-out)",
            }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Empty() {
  return (
    <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
      <Icon.bars size={28} stroke="var(--fg-5)" />
      <div className="subheading" style={{ marginTop: 12 }}>No resource assignments found</div>
      <p className="body-2 muted" style={{ marginTop: 6 }}>This schedule is not resource-loaded, or the filters exclude all assignments — histograms need TASKRSRC data in the XER.</p>
    </div>
  );
}
