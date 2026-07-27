import { SectionTitle, KpiTile, StatusPill, TagPill } from "../components/ui.jsx";
import { Icon } from "../components/Icons.jsx";

const SEV_TONE = { Critical: "danger", High: "danger", Medium: "warning", Low: "info" };
const CAT_COLOR = {
  Schedule: "var(--tag-safety-bg)", Cost: "var(--tag-commercial-bg)",
  Logic: "var(--tag-technical-bg)", Quality: "var(--tag-operations-bg)",
  Execution: "var(--tag-construction-bg)",
};

export default function Risk({ a }) {
  const { risks } = a;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="g-kpi">
        <KpiTile label="Risks identified" value={risks.length} sub="auto-generated" />
        <KpiTile label="Critical / High" value={risks.filter((r) => r.score >= 9).length} sub="score ≥ 9" tone="danger" />
        <KpiTile label="Medium" value={risks.filter((r) => r.score >= 5 && r.score < 9).length} sub="score 5–8" tone="warning" />
        <KpiTile label="Highest score" value={risks[0]?.score ?? 0} sub={risks[0]?.severity ?? "—"} tone={SEV_TONE[risks[0]?.severity] || "info"} />
      </div>

      <div className="card">
        <div style={{ padding: "18px 20px 4px" }}>
          <SectionTitle icon={<Icon.alert size={18} />}>Auto-Generated Risk Register</SectionTitle>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {risks.map((r) => (
            <div key={r.id} style={{ padding: "18px 20px", borderTop: "1px solid var(--border-1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span className="mono" style={{ color: "var(--fg-4)", fontSize: 12 }}>{r.id}</span>
                <TagPill color={CAT_COLOR[r.category]}>{r.category}</TagPill>
                <span className="body-1" style={{ fontWeight: 600 }}>{r.title}</span>
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="body-2 muted">L{r.likelihood} × I{r.impact}</span>
                  <StatusPill tone={SEV_TONE[r.severity]}>{r.severity} · {r.score}</StatusPill>
                </span>
              </div>
              <p className="body-2" style={{ color: "var(--fg-3)", marginTop: 8, marginBottom: 8 }}>{r.desc}</p>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "var(--bg-tint)", borderRadius: 10, padding: "10px 12px" }}>
                <Icon.check size={15} stroke="var(--brand-primary)" />
                <span className="body-2" style={{ color: "var(--fg-3)" }}>
                  <strong style={{ color: "var(--fg-1)" }}>Mitigation:</strong> {r.mitigation}
                  <span className="muted"> · Owner: {r.owner}</span>
                </span>
              </div>
            </div>
          ))}
          {risks.length === 0 && (
            <div className="muted" style={{ padding: 28, textAlign: "center" }}>No material risks detected — the schedule is within tolerance.</div>
          )}
        </div>
      </div>
    </div>
  );
}
