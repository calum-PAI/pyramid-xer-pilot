import { SectionTitle, StatusPill, ProgressBar, KpiTile } from "../components/ui.jsx";
import { BarChart } from "../components/charts.jsx";
import { Icon } from "../components/Icons.jsx";
import { fmtMoneyShort, fmtPct } from "../lib/model.js";

// Shared by Phase Analysis (WBS) and Discipline Analysis.
export default function Rollup({ a, mode }) {
  const rows = mode === "phase" ? a.wbs : a.discipline;
  const model = a.model;
  const cur = model.project.currency;
  const title = mode === "phase" ? "Phase Analysis (WBS)" : "Discipline Analysis";
  const icon = mode === "phase" ? <Icon.layers size={18} /> : <Icon.sliders size={18} />;

  const negGroups = rows.filter((r) => r.floatStatus === "Negative").length;
  const avgPct = Math.round((rows.reduce((s, r) => s + r.pctComplete, 0) / (rows.length || 1)) * 10) / 10;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="g-tiles">
        <KpiTile label={mode === "phase" ? "WBS phases" : "Disciplines"} value={rows.length} sub="in schedule" />
        <KpiTile label="Groups at risk" value={negGroups} sub="negative float" tone={negGroups ? "danger" : "success"} />
        <KpiTile label="Average progress" value={fmtPct(avgPct)} sub="across groups" />
      </div>

      <div className="card card-pad">
        <SectionTitle icon={icon}>Activities by {mode === "phase" ? "Phase" : "Discipline"}</SectionTitle>
        <BarChart
          items={rows.map((r) => ({
            label: r.name,
            value: r.total,
            tone: r.floatStatus === "Negative" ? "danger" : r.floatStatus === "Critical" ? "warning" : "info",
          }))}
          colorFor={(it) => ({ danger: "var(--danger)", warning: "var(--warning)", info: "var(--brand-300)" }[it.tone])}
        />
      </div>

      <div className="card">
        <div style={{ padding: "18px 20px 4px" }}>
          <SectionTitle icon={icon}>{title}</SectionTitle>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>{mode === "phase" ? "WBS Phase" : "Discipline"}</th>
                <th style={{ textAlign: "right" }}>Acts</th>
                <th style={{ textAlign: "right" }}>Complete</th>
                <th style={{ width: 180 }}>Progress</th>
                {model.hasCost && <th style={{ textAlign: "right" }}>Budget</th>}
                <th style={{ textAlign: "right" }}>Neg. float</th>
                <th>Float status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td style={{ fontWeight: 600, color: "var(--fg-1)" }}>{r.name}</td>
                  <td style={{ textAlign: "right" }}>{r.total}</td>
                  <td style={{ textAlign: "right" }}>{r.complete}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ProgressBar value={r.pctComplete} tone={r.pctComplete === 100 ? "success" : "info"} />
                      <span className="body-2" style={{ fontVariantNumeric: "tabular-nums", width: 34, textAlign: "right" }}>{fmtPct(r.pctComplete)}</span>
                    </div>
                  </td>
                  {model.hasCost && <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoneyShort(r.budget, cur)}</td>}
                  <td style={{ textAlign: "right", fontWeight: r.neg ? 700 : 400, color: r.neg ? "var(--danger-ink)" : "var(--fg-4)" }}>{r.neg || "—"}</td>
                  <td><StatusPill tone={r.floatStatus === "Negative" ? "danger" : r.floatStatus === "Critical" ? "warning" : "success"}>{r.floatStatus}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
