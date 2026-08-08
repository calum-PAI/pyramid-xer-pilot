import { useMemo, useState } from "react";
import FilterBar, { FILTER_DEFAULTS } from "../components/FilterBar.jsx";
import { GroupedBarChart, SeriesLegend } from "../components/charts.jsx";
import { SectionTitle, StatusPill, AiCallout, KpiTile } from "../components/ui.jsx";
import { Icon } from "../components/Icons.jsx";
import { fmtMoneyShort, fmtDate, fmtPct } from "../lib/model.js";
import {
  computeDisciplineAnalysis,
  computeDisciplineHeatMap,
  computeClashDetection,
  makeActivityFilter,
  shortDisc,
  disciplineOf,
  disciplineNarrative,
} from "../lib/curves.js";

const SERIES = [
  { key: "budget", label: "Planned (BAC)", color: "var(--capri-300)" },
  { key: "earned", label: "Earned (BCWP)", color: "var(--brand-primary)" },
  { key: "actual", label: "Actual (ACWP)", color: "var(--success)" },
];

function heatColor(pct) {
  if (pct >= 80) return { bg: "var(--success)", fg: "#fff" };
  if (pct >= 20) return { bg: "var(--warning)", fg: "#fff" };
  return { bg: "var(--danger)", fg: "#fff" };
}

export default function Discipline({ a }) {
  const { model } = a;
  const cur = model.project.currency;
  const [applied, setApplied] = useState(FILTER_DEFAULTS);
  const fmt = (v) => (model.hasCost ? fmtMoneyShort(v, cur) : Math.round(v) + "d");

  const filter = useMemo(() => makeActivityFilter(applied), [applied]);
  const disc = useMemo(() => computeDisciplineAnalysis(model, { activityFilter: filter, resourceType: applied.resourceType }), [model, filter, applied.resourceType]);
  const heat = useMemo(() => computeDisciplineHeatMap(model, { activityFilter: filter }), [model, filter]);
  const clashes = useMemo(() => computeClashDetection(model, { activityFilter: filter }), [model, filter]);

  const groups = disc.map((p) => ({ label: shortDisc(p.name), values: [p.budget, p.earned, p.actual] }));
  const highRisk = disc.filter((p) => p.floatRisk === "High").length;

  // activities grouped by discipline — feeds the critical-exposure narrative
  const actsByDisc = useMemo(() => {
    const by = {};
    model.activities.forEach((a) => {
      if (!filter(a)) return;
      (by[disciplineOf(a)] = by[disciplineOf(a)] || []).push(a);
    });
    return by;
  }, [model, filter]);
  const criticalDisc = disc.filter((p) => p.floatRisk === "High");
  const otherDisc = disc.filter((p) => p.floatRisk !== "High");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <FilterBar model={model} applied={applied} onApply={setApplied} />

      <div className="g-tiles">
        <KpiTile label="Disciplines" value={disc.length} sub="in selection" />
        <KpiTile label="At risk" value={highRisk} sub="critical float" tone={highRisk ? "danger" : "success"} />
        <KpiTile label="Clash windows" value={clashes.length} sub="3+ disciplines" tone={clashes.length ? "warning" : "success"} />
      </div>

      {/* Grouped bar chart */}
      <div className="card card-pad">
        <SectionTitle icon={<Icon.bars size={18} />}>Planned vs Earned by Discipline</SectionTitle>
        {groups.length === 0 ? <Empty /> : (
          <>
            <SeriesLegend items={SERIES} />
            <GroupedBarChart groups={groups} series={SERIES} fmt={fmt} />
          </>
        )}
      </div>

      {/* Discipline summary */}
      <div className="card">
        <div style={{ padding: "18px 20px 4px" }}>
          <SectionTitle icon={<Icon.grid size={18} />}>Discipline Summary</SectionTitle>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Discipline</th>
                <th style={{ textAlign: "right" }}>Acts</th>
                <th style={{ textAlign: "right" }}>Done</th>
                <th style={{ textAlign: "right" }}>In prog</th>
                <th style={{ textAlign: "right" }}>Remaining</th>
                <th style={{ textAlign: "right" }}>% Compl</th>
                <th style={{ textAlign: "right" }}>SPI</th>
                <th>Float risk</th>
                <th>Fcst end</th>
              </tr>
            </thead>
            <tbody>
              {disc.map((p) => (
                <tr key={p.name}>
                  <td style={{ fontWeight: 600, color: "var(--fg-1)" }}>{shortDisc(p.name)}</td>
                  <td style={{ textAlign: "right" }}>{p.total}</td>
                  <td style={{ textAlign: "right" }}>{p.done}</td>
                  <td style={{ textAlign: "right" }}>{p.inProg}</td>
                  <td style={{ textAlign: "right" }}>{p.remaining}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtPct(p.pctComplete)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: p.spi < 0.95 ? "var(--danger-ink)" : p.spi > 1.05 ? "var(--success-ink)" : "var(--fg-1)" }}>{p.spi.toFixed(2)}</td>
                  <td><StatusPill tone={p.floatRisk === "High" ? "danger" : p.floatRisk === "Medium" ? "warning" : "success"}>{p.floatRisk}</StatusPill></td>
                  <td>{fmtDate(p.fcstEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Heat map */}
      <div className="card">
        <div style={{ padding: "18px 20px 4px" }}>
          <SectionTitle icon={<Icon.activity size={18} />}>Discipline × Month Heat Map <span className="body-2 muted" style={{ fontWeight: 400 }}>(% complete by planned period)</span></SectionTitle>
        </div>
        <div style={{ overflowX: "auto", padding: "4px 20px 20px" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 3, minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...HM.corner }}>Discipline</th>
                {heat.months.map((mo) => (
                  <th key={mo.key} style={HM.colHead}>
                    {mo.date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }).toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heat.disciplines.map((d) => (
                <tr key={d}>
                  <td style={HM.rowHead}>{shortDisc(d)}</td>
                  {heat.months.map((mo) => {
                    const cell = heat.cells[d][mo.key];
                    if (!cell) return <td key={mo.key} style={HM.empty}>·</td>;
                    const c = heatColor(cell.pct);
                    return (
                      <td key={mo.key} title={`${shortDisc(d)} · ${mo.date.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}: ${fmtPct(cell.pct)} complete`}
                        style={{ ...HM.cell, background: c.bg, color: c.fg }}>
                        {Math.round(cell.pct)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "0 20px 18px" }}>
          {[["≥ 80% complete", "var(--success)"], ["20–79%", "var(--warning)"], ["< 20% (behind)", "var(--danger)"]].map(([l, c]) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
              <span className="body-2 muted">{l}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Clash detection */}
      <div className="card">
        <div style={{ padding: "18px 20px 4px" }}>
          <SectionTitle icon={<Icon.alert size={18} />}>Clash Detection <span className="body-2 muted" style={{ fontWeight: 400 }}>(3+ disciplines peaking together)</span></SectionTitle>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr><th>Period</th><th>Disciplines in conflict</th><th style={{ textAlign: "right" }}>Peak hrs</th><th>Risk</th></tr>
            </thead>
            <tbody>
              {clashes.map((cl, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: "var(--fg-1)" }}>{cl.date.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</td>
                  <td>{cl.disciplines.map(shortDisc).join(", ")}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{cl.peakHrs.toLocaleString()}</td>
                  <td><StatusPill tone={cl.risk === "High" ? "danger" : cl.risk === "Medium" ? "warning" : "success"}>{cl.risk}</StatusPill></td>
                </tr>
              ))}
              {clashes.length === 0 && (
                <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>No clashes — disciplines are well sequenced with no 3-way concurrent peaks.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI narrative — critical float exposure, activity-level */}
      <AiCallout title="Discipline AI Narrative">
        {criticalDisc.length === 0 ? (
          <p className="body-2" style={{ margin: 0, color: "var(--fg-3)" }}>
            No discipline currently carries critical float exposure — every system in the selection is running with positive float. Keep monitoring the near-critical items in the summary table each reporting period.
          </p>
        ) : (
          <>
            <p className="body-2" style={{ margin: "0 0 4px", color: "var(--fg-2, var(--fg-1))", fontWeight: 600 }}>
              {criticalDisc.length} discipline{criticalDisc.length > 1 ? "s" : ""} carr{criticalDisc.length > 1 ? "y" : "ies"} critical float exposure. The activities driving each are broken out below with the impact and the recommended recovery.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 8 }}>
              {criticalDisc.map((p) => {
                const n = disciplineNarrative(p, actsByDisc[p.name] || [], model, clashes);
                return (
                  <div key={p.name} style={{ borderTop: "1px solid var(--border-1)", paddingTop: 14 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                      <strong className="body-1" style={{ color: "var(--fg-1)" }}>{shortDisc(p.name)}</strong>
                      <StatusPill tone="danger">Critical float exposure</StatusPill>
                      <span className="body-2" style={{ color: "var(--fg-4)", fontVariantNumeric: "tabular-nums" }}>
                        {n.crit.length} critical{n.neg.length ? ` · ${n.neg.length} negative` : ""} · worst {n.crit[0] ? n.crit[0].totalFloat.toFixed(0) : "0"}d · SPI {p.spi.toFixed(2)} · fcst {fmtDate(p.fcstEnd)}
                      </span>
                    </div>

                    <NarrLabel icon={<Icon.route size={13} stroke="var(--danger-ink)" />} tone="danger">Critical activities &amp; why</NarrLabel>
                    {n.items.length === 0 ? (
                      <p className="body-2 muted" style={{ margin: "0 0 10px" }}>Exposure is driven by rolled-up float; no single incomplete activity is at or below zero in this selection.</p>
                    ) : (
                      <ul style={{ margin: "0 0 12px", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                        {n.items.map((it) => (
                          <li key={it.code} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                            <span style={{ width: 6, height: 6, borderRadius: 9999, background: "var(--danger)", marginTop: 6, flex: "0 0 6px" }} />
                            <span className="body-2" style={{ color: "var(--fg-3)", fontSize: 12.5, lineHeight: 1.5 }}>
                              <span className="mono" style={{ color: "var(--brand-primary)", fontWeight: 500 }}>{it.code}</span>{" "}
                              <strong style={{ color: "var(--fg-1)" }}>{it.name}</strong>{" "}
                              <span style={{ color: "var(--danger-ink)", fontWeight: 700 }}>({it.float.toFixed(0)}d)</span>{" "}
                              — {it.why}.
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="ai-narr-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <NarrList title="Impact & risk" tone="warning" items={n.impact} />
                      <NarrList title="Recommended actions" tone="success" items={n.actions} />
                    </div>
                  </div>
                );
              })}
            </div>

            {otherDisc.length > 0 && (
              <div style={{ borderTop: "1px solid var(--border-1)", marginTop: 16, paddingTop: 12 }}>
                <NarrLabel tone="success">Other disciplines</NarrLabel>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                  {otherDisc.map((p) => (
                    <li key={p.name} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                      <span style={{ width: 6, height: 6, borderRadius: 9999, background: p.floatRisk === "Medium" ? "var(--warning)" : "var(--success)", marginTop: 6, flex: "0 0 6px" }} />
                      <span className="body-2" style={{ color: "var(--fg-3)", fontSize: 12.5 }}>
                        <strong style={{ color: "var(--fg-1)" }}>{shortDisc(p.name)}</strong>: {fmtPct(p.pctComplete)} complete, {p.done}/{p.total} done —{" "}
                        {p.floatRisk === "Medium" ? "some near-critical float, monitor closely" : "healthy float"}{p.spi < 0.95 ? `, behind plan (SPI ${p.spi.toFixed(2)})` : ""}.
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </AiCallout>
    </div>
  );
}

function NarrLabel({ icon, tone, children }) {
  const ink = tone === "danger" ? "var(--danger-ink)" : tone === "warning" ? "var(--warning-ink)" : "var(--success-ink)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      {icon}
      <span className="eyebrow" style={{ fontSize: 10.5, color: ink }}>{children}</span>
    </div>
  );
}

function NarrList({ title, tone, items }) {
  const dot = tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--success)";
  const ink = tone === "danger" ? "var(--danger-ink)" : tone === "warning" ? "var(--warning-ink)" : "var(--success-ink)";
  return (
    <div>
      <span className="eyebrow" style={{ fontSize: 10.5, color: ink, display: "block", marginBottom: 8 }}>{title}</span>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
        {items.map((t, i) => (
          <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ width: 6, height: 6, borderRadius: 9999, background: dot, marginTop: 6, flex: "0 0 6px" }} />
            <span className="body-2" style={{ color: "var(--fg-3)", fontSize: 12.5, lineHeight: 1.55 }}>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const HM = {
  corner: { position: "sticky", left: 0, background: "var(--fg-1)", color: "#fff", fontSize: 11, fontWeight: 600, textAlign: "left", padding: "8px 12px", borderRadius: 6, whiteSpace: "nowrap", zIndex: 1 },
  colHead: { fontSize: 10, fontWeight: 600, color: "var(--fg-4)", padding: "6px 8px", whiteSpace: "nowrap", textAlign: "center" },
  rowHead: { position: "sticky", left: 0, background: "var(--bg-app)", fontSize: 12.5, fontWeight: 600, color: "var(--fg-1)", padding: "8px 12px", whiteSpace: "nowrap", textAlign: "right", zIndex: 1 },
  cell: { textAlign: "center", fontSize: 12, fontWeight: 700, padding: "9px 10px", borderRadius: 6, minWidth: 46, fontVariantNumeric: "tabular-nums" },
  empty: { textAlign: "center", color: "var(--border-2)", fontSize: 14, padding: "9px 10px", background: "var(--bg-wash)", borderRadius: 6 },
};

function Empty() {
  return (
    <div style={{ textAlign: "center", padding: 48 }}>
      <Icon.bars size={26} stroke="var(--fg-5)" />
      <div className="subheading" style={{ marginTop: 12 }}>No data for this selection</div>
      <p className="body-2 muted" style={{ marginTop: 6 }}>Try widening the filters.</p>
    </div>
  );
}
