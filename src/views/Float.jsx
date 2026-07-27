import { SectionTitle, KpiTile, StatusPill, AiCallout } from "../components/ui.jsx";
import { BarChart } from "../components/charts.jsx";
import { Icon } from "../components/Icons.jsx";
import { fmtDate } from "../lib/model.js";
import { floatNarrative } from "../lib/float.js";

function NarrativeList({ title, tone, items, icon }) {
  const dot = tone === "danger" ? "var(--danger)" : tone === "info" ? "var(--brand-300)" : "var(--success)";
  const ink = tone === "danger" ? "var(--danger-ink)" : tone === "info" ? "var(--brand-primary)" : "var(--success-ink)";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {icon}
        <span className="eyebrow" style={{ fontSize: 10.5, color: ink }}>{title}</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((t, i) => (
          <li key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <span style={{ width: 6, height: 6, borderRadius: 9999, background: dot, marginTop: 6, flex: "0 0 6px" }} />
            <span className="body-2" style={{ color: "var(--fg-3)", fontSize: 12.5, lineHeight: 1.55 }}>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Float({ a }) {
  const { floatA, model } = a;
  const { verdict, findings, actions } = floatNarrative(floatA, model);
  const vTone = { danger: "var(--danger-ink)", warning: "var(--warning-ink)", success: "var(--success-ink)" }[verdict.tone];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="g-kpi">
        <KpiTile label="Critical activities" value={floatA.counts.critical} sub="total float ≤ 0" tone="warning" />
        <KpiTile label="Negative float" value={floatA.counts.negative} sub="behind constraint" tone={floatA.counts.negative ? "danger" : "success"} />
        <KpiTile label="Near-critical" value={floatA.counts.nearCritical} sub="1–10 days float" tone="info" />
        <KpiTile label="Critical %" value={floatA.criticalPct + "%"} sub="of all activities" tone={floatA.criticalPct > 25 ? "danger" : "info"} />
      </div>

      <div className="g-split-2-3">
        <div className="card card-pad">
          <SectionTitle icon={<Icon.bars size={18} />}>Total Float Distribution</SectionTitle>
          <BarChart
            height={240}
            items={floatA.buckets.map((b) => ({ label: b.label, value: b.count, tone: b.tone }))}
            colorFor={(it) => ({ danger: "var(--danger)", warning: "var(--warning)", info: "var(--brand-300)", success: "var(--success)" }[it.tone])}
          />
        </div>

        <div className="card">
          <div style={{ padding: "18px 20px 4px" }}>
            <SectionTitle icon={<Icon.route size={18} />}>Negative-Float Exposure</SectionTitle>
          </div>
          <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Act ID</th><th>Name</th><th>Finish</th><th style={{ textAlign: "right" }}>Total float</th></tr></thead>
              <tbody>
                {floatA.negative.length === 0 ? (
                  <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>No negative float — schedule is within its constraints.</td></tr>
                ) : floatA.negative.map((t) => (
                  <tr key={t.id}>
                    <td className="mono" style={{ color: "var(--brand-primary)", fontWeight: 500 }}>{t.code}</td>
                    <td style={{ fontWeight: 500, color: "var(--fg-1)" }}>{t.name}</td>
                    <td>{fmtDate(t.finish)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--danger-ink)", fontVariantNumeric: "tabular-nums" }}>{t.totalFloat.toFixed(1)}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: "18px 20px 4px" }}>
          <SectionTitle icon={<Icon.activity size={18} />} right={<span className="body-2 muted">{floatA.drivingPath.length} incomplete critical activities</span>}>
            Driving / Critical Path
          </SectionTitle>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr><th>#</th><th>Act ID</th><th>Name</th><th>WBS</th><th>Start</th><th>Finish</th><th style={{ textAlign: "right" }}>Float</th><th>Status</th></tr>
            </thead>
            <tbody>
              {floatA.drivingPath.map((t, i) => (
                <tr key={t.id}>
                  <td className="muted">{i + 1}</td>
                  <td className="mono" style={{ color: "var(--brand-primary)", fontWeight: 500 }}>{t.code}</td>
                  <td style={{ fontWeight: 500, color: "var(--fg-1)" }}>{t.name}</td>
                  <td className="muted">{t.wbs}</td>
                  <td>{fmtDate(t.start)}</td>
                  <td>{fmtDate(t.finish)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: t.totalFloat < 0 ? "var(--danger-ink)" : "var(--warning-ink)" }}>{t.totalFloat.toFixed(1)}d</td>
                  <td><StatusPill tone={t.status === "TK_Active" ? "warning" : "neutral"}>{t.statusLabel}</StatusPill></td>
                </tr>
              ))}
              {floatA.drivingPath.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>No incomplete critical activities.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Narrative — findings + best-practice recommendations */}
      <AiCallout title="AI Narrative — Findings & Recommendations">
        <div
          className="body-2"
          style={{
            display: "flex", gap: 9, alignItems: "flex-start",
            background: "var(--bg-app)", border: "1px solid var(--border-1)",
            borderRadius: 12, padding: "12px 14px", marginBottom: 16,
          }}
        >
          <span style={{ marginTop: 1, flex: "0 0 auto", color: vTone }}><Icon.activity size={15} /></span>
          <span style={{ color: "var(--fg-2, var(--fg-1))", fontWeight: 600 }}>
            <span style={{ color: vTone }}>Assessment: </span>{verdict.text}
          </span>
        </div>
        <div className="ai-narr-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <NarrativeList
            title="Key findings" tone="info" items={findings}
            icon={<Icon.route size={13} stroke="var(--brand-primary)" />}
          />
          <NarrativeList
            title="Recommended actions" tone="success" items={actions}
            icon={<Icon.check size={13} stroke="var(--success-ink)" />}
          />
        </div>
      </AiCallout>
    </div>
  );
}
