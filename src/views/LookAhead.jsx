import { useMemo, useState } from "react";
import { SectionTitle, StatusPill, KpiTile, AiCallout, Segmented } from "../components/ui.jsx";
import { Icon } from "../components/Icons.jsx";
import { fmtDate, fmtPct } from "../lib/model.js";
import { computeLookAheadDetail } from "../lib/curves.js";

const WEEKS = [["2", "2-Week"], ["4", "4-Week"], ["6", "6-Week"]];

// Left accent colour keyed to float health / progress
function accentFor(t) {
  if (t.totalFloat < 0) return "var(--danger)";
  if (t.totalFloat === 0) return "var(--warning)";
  if (t.status === "TK_Active") return "var(--brand-300)";
  if (t.totalFloat <= 10) return "var(--warning)";
  return "var(--success)";
}

export default function LookAhead({ a }) {
  const { model } = a;
  const [weeks, setWeeks] = useState("6");

  const la = useMemo(
    () => computeLookAheadDetail(model, parseInt(weeks, 10)),
    [model, weeks]
  );
  const s = la.stats;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Filter row */}
      <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Segmented options={WEEKS} value={weeks} onChange={setWeeks} />
        <span className="body-2 muted">
          Window: <strong style={{ color: "var(--fg-3)" }}>{fmtDate(la.window.from)}</strong> → <strong style={{ color: "var(--fg-3)" }}>{fmtDate(la.window.to)}</strong>
        </span>
      </div>

      <div className="g-kpi">
        <KpiTile label="In the window" value={s.total} sub={`next ${weeks} weeks`} />
        <KpiTile label="In progress" value={s.active} sub="currently active" tone="warning" />
        <KpiTile label="Starting soon" value={s.starting} sub="not yet started" />
        <KpiTile label="Critical" value={s.critical} sub="float ≤ 0" tone={s.critical ? "danger" : "success"} />
      </div>

      <div className="g-split-3-2">
        {/* Table */}
        <div className="card" style={{ order: 1 }}>
          <div style={{ padding: "18px 20px 4px" }}>
            <SectionTitle icon={<Icon.calendar size={18} />}>{weeks}-Week Look-Ahead</SectionTitle>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 6 }}>Act ID</th>
                  <th>Activity</th>
                  <th>Start</th>
                  <th>Finish</th>
                  <th style={{ textAlign: "right" }}>Dur</th>
                  <th style={{ textAlign: "right" }}>%</th>
                  <th style={{ textAlign: "right" }}>TF</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {la.activities.map((t) => (
                  <tr key={t.id}>
                    <td style={{ paddingLeft: 0 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 3, height: 26, borderRadius: 2, background: accentFor(t), flex: "0 0 3px" }} />
                        <span className="mono" style={{ color: "var(--brand-primary)", fontWeight: 500 }}>{t.code}</span>
                      </span>
                    </td>
                    <td style={{ fontWeight: 500, color: "var(--fg-1)" }}>{t.name}</td>
                    <td>{fmtDate(t.start)}</td>
                    <td>{fmtDate(t.finish)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.targetDur.toFixed(0)}d</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtPct(t.pctComplete)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: t.totalFloat < 0 ? "var(--danger-ink)" : "var(--fg-3)", fontWeight: t.totalFloat <= 0 ? 700 : 400 }}>{t.totalFloat.toFixed(1)}d</td>
                    <td><StatusPill tone={t.status === "TK_Active" ? "warning" : "neutral"}>{t.statusLabel}</StatusPill></td>
                  </tr>
                ))}
                {la.activities.length === 0 && (
                  <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 28 }}>No activities in the next {weeks} weeks.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Look-Ahead Intelligence */}
        <div style={{ order: 2 }}>
          <AiCallout title="Look-Ahead Intelligence">
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <Bullet tone={s.incompletePred ? "danger" : "success"}>
                <strong>{s.incompletePred}</strong> {s.incompletePred === 1 ? "activity" : "activities"} due to start with an incomplete predecessor
              </Bullet>
              <Bullet tone={s.critical ? "danger" : "success"}>
                <strong>{s.critical}</strong> critical {s.critical === 1 ? "activity" : "activities"} in window
              </Bullet>
              <Bullet tone={s.nearCritical ? "warning" : "success"}>
                <strong>{s.nearCritical}</strong> near-critical {s.nearCritical === 1 ? "activity" : "activities"} (≤ 10d float)
              </Bullet>
              <Bullet tone="success">
                <strong>{s.healthy}</strong> {s.healthy === 1 ? "activity" : "activities"} with healthy float
              </Bullet>
              <Bullet tone="info">
                <strong>{s.total}</strong> total {s.total === 1 ? "activity" : "activities"} in the next {weeks} weeks
              </Bullet>
              <Bullet tone="info">
                Next milestone: {la.nextMilestone
                  ? <><strong>{la.nextMilestone.name}</strong> ({fmtDate(la.nextMilestone.date)})</>
                  : "none scheduled"}
              </Bullet>
            </ul>
          </AiCallout>
        </div>
      </div>
    </div>
  );
}

function Bullet({ tone, children }) {
  const dot = { danger: "var(--danger)", warning: "var(--warning)", success: "var(--success)", info: "var(--info)" }[tone];
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ width: 7, height: 7, borderRadius: 9999, background: dot, marginTop: 7, flex: "0 0 7px" }} />
      <span className="body-2" style={{ color: "var(--fg-3)" }}>{children}</span>
    </li>
  );
}
