import { SectionTitle, KpiTile, Gauge } from "../components/ui.jsx";
import { Icon } from "../components/Icons.jsx";

export default function DCMA({ a }) {
  const { dcma } = a;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="g-kpi" style={{ alignItems: "stretch" }}>
        <div className="card card-pad" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <Gauge value={dcma.passed} max={dcma.total} label="DCMA Score" sub={`of ${dcma.total}`}
            tone={dcma.passed >= 11 ? "success" : dcma.passed >= 8 ? "warning" : "danger"} format={(v) => Math.round(v)} />
          <div className="body-1" style={{ fontWeight: 700, marginTop: 4 }}>{dcma.rating}</div>
        </div>
        <KpiTile label="Checks passed" value={dcma.passed} sub={`of ${dcma.total} applicable`} tone="success" big />
        <KpiTile label="CPLI" value={dcma.cpli.toFixed(2)} sub="critical path length index" tone={dcma.cpli >= 0.95 ? "success" : "danger"} big />
        <KpiTile label="BEI" value={dcma.bei.toFixed(2)} sub="baseline execution index" tone={dcma.bei >= 0.95 ? "success" : "danger"} big />
      </div>

      <div className="card">
        <div style={{ padding: "18px 20px 4px" }}>
          <SectionTitle icon={<Icon.shield size={18} />} right={<span className="body-2 muted">Defense Contract Management Agency · 14-point assessment</span>}>
            DCMA 14-Point Schedule Assessment
          </SectionTitle>
        </div>
        <div className="g-2col">
          {dcma.checks.map((c, i) => (
            <div key={c.id} style={{
              padding: "16px 20px",
              borderTop: "1px solid var(--border-1)",
              borderRight: i % 2 === 0 ? "1px solid var(--border-1)" : "none",
              display: "flex", gap: 14, alignItems: "flex-start",
            }}>
              <span style={{
                width: 30, height: 30, borderRadius: 9999, flex: "0 0 30px",
                display: "grid", placeItems: "center",
                background: c.pass === null ? "var(--bg-mute)" : c.pass ? "var(--success-bg)" : "var(--danger-bg)",
                color: c.pass === null ? "var(--fg-4)" : c.pass ? "var(--success-ink)" : "var(--danger-ink)",
              }}>
                {c.pass === null ? <Icon.x size={15} /> : c.pass ? <Icon.check size={16} /> : <Icon.alert size={15} />}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span className="body-1" style={{ fontWeight: 600 }}>
                    <span className="mono" style={{ color: "var(--fg-4)", fontSize: 12, marginRight: 6 }}>{String(c.id).padStart(2, "0")}</span>
                    {c.name}
                  </span>
                  <span style={{
                    fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums",
                    color: c.pass === null ? "var(--fg-4)" : c.pass ? "var(--success-ink)" : "var(--danger-ink)",
                  }}>{c.value}</span>
                </div>
                <div className="body-2 muted" style={{ marginTop: 3 }}>{c.desc}</div>
                <div className="body-2" style={{ marginTop: 4, color: "var(--fg-4)", fontSize: 12 }}>{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
