import { KpiTile, Gauge, Donut, StatusPill, AiCallout, SectionTitle } from "../components/ui.jsx";
import { Icon } from "../components/Icons.jsx";
import { fmtMoney, fmtMoneyShort, fmtDate } from "../lib/model.js";
import { spiLabel, cpiLabel } from "../lib/evms.js";

export default function Overview({ a }) {
  const { model, evms, dcma, floatA } = a;
  const cur = model.project.currency;
  const c = model.counts;
  const pct1 = (x) => (x * 100).toFixed(1) + "%";

  const spiL = spiLabel(evms.SPI);
  const cpiL = cpiLabel(evms.CPI);
  const unresourced = model.hasCost
    ? model.activities.filter((x) => !x.isMilestone && x.budget <= 0).length
    : model.activities.filter((x) => !x.isMilestone).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPI strip */}
      <div style={grid(6)}>
        <KpiTile label="SPI" value={evms.SPI.toFixed(2)} sub="Schedule" tone={spiL.tone} />
        <KpiTile label="CPI" value={evms.CPI.toFixed(2)} sub="Cost" tone={cpiL.tone} />
        <KpiTile label="% Planned" value={pct1(evms.pctPlanned)} sub="PV / BAC" />
        <KpiTile label="% Earned" value={pct1(evms.pctEarned)} sub="EV / BAC" />
        <KpiTile label="% Actual" value={pct1(evms.pctActual)} sub="AC / BAC" />
        <KpiTile label="Float Health" value={`${floatA.criticalPct}%`} sub="Critical" tone={floatA.criticalPct > 25 ? "danger" : "info"} />
      </div>
      <div style={grid(6)}>
        <KpiTile label="BAC" value={fmtMoneyShort(evms.BAC, cur)} sub="Budget" />
        <KpiTile label="EAC" value={fmtMoneyShort(evms.EAC, cur)} sub="Forecast" />
        <KpiTile label="ETC" value={fmtMoneyShort(evms.ETC, cur)} sub="To complete" />
        <KpiTile label="VAC" value={fmtMoneyShort(evms.VAC, cur)} sub="Variance" tone={evms.VAC < 0 ? "danger" : "success"} />
        <KpiTile label="TCPI" value={evms.TCPI.toFixed(2)} sub="To complete" />
        <KpiTile label="DCMA" value={`${dcma.passed}/${dcma.total}`} sub={dcma.rating} tone={dcma.passed >= 11 ? "success" : dcma.passed >= 8 ? "warning" : "danger"} />
      </div>

      {/* Project summary + gauges */}
      <div className="g-split-3-2">
        <div className="card card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Icon.file size={18} stroke="var(--brand-primary)" />
            <h3 className="h3" style={{ fontSize: 20 }}>{model.project.name}</h3>
          </div>
          <div className="body-2 muted" style={{ marginBottom: 16 }}>
            <span className="mono">{a.fileName || model.project.shortName + ".xer"}</span> · Data date {fmtDate(model.project.dataDate)}
          </div>
          <div style={grid(3, 12)}>
            <Meta label="Plan start" value={fmtDate(model.project.planStart)} />
            <Meta label="Planned finish" value={fmtDate(model.project.planFinish)} />
            <Meta label="Total activities" value={c.activities} />
            <Meta label="Relationships" value={model.counts.relationships} />
            <Meta label="Resources" value={c.resources} />
            <Meta label="Baseline" value={model.hasBaseline ? "Yes" : "No"} />
            <Meta label="Cost loaded" value={model.hasCost ? "Yes" : "No"} />
            <Meta label="Schedule version" value={model.project.shortName} />
          </div>
        </div>

        <div className="card card-pad">
          <SectionTitle icon={<Icon.pie size={18} />}>Activity Status</SectionTitle>
          <Donut
            centerLabel={c.activities}
            centerSub="activities"
            segments={[
              { label: "Complete", value: c.complete, color: "var(--success)" },
              { label: "In progress", value: c.inProgress, color: "var(--warning)" },
              { label: "Not started", value: c.notStarted, color: "var(--border-2)" },
            ]}
          />
        </div>
      </div>

      {/* Health gauges */}
      <div className="card card-pad">
        <SectionTitle icon={<Icon.activity size={18} />}>Schedule Health Gauges</SectionTitle>
        <div className="g-gauges">
          <Gauge value={evms.SPI} max={1.3} label="SPI" sub="schedule" tone={spiL.tone} format={(v) => v.toFixed(2)} />
          <Gauge value={evms.CPI} max={1.3} label="CPI" sub="cost" tone={cpiL.tone} format={(v) => v.toFixed(2)} />
          <Gauge value={floatA.criticalPct} max={100} label="Float Health" sub="critical %" tone={floatA.criticalPct > 25 ? "danger" : "info"} format={(v) => Math.round(v) + "%"} />
          <Gauge value={dcma.passed} max={dcma.total} label="DCMA Score" sub={`of ${dcma.total}`} tone={dcma.passed >= 11 ? "success" : dcma.passed >= 8 ? "warning" : "danger"} format={(v) => Math.round(v)} />
        </div>
      </div>

      {/* Critical activities */}
      <div className="card">
        <div style={{ padding: "18px 20px 4px" }}>
          <SectionTitle icon={<Icon.route size={18} />}>Top Critical / Near-Critical Activities</SectionTitle>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th><th>Act ID</th><th>Name</th><th>WBS</th><th>Start</th><th>Finish</th>
                <th style={{ textAlign: "right" }}>Total float</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {floatA.critical.slice(0, 10).map((t, i) => (
                <tr key={t.id}>
                  <td className="muted">{i + 1}</td>
                  <td className="mono" style={{ color: "var(--brand-primary)", fontWeight: 500 }}>{t.code}</td>
                  <td style={{ color: "var(--fg-1)", fontWeight: 500 }}>{t.name}</td>
                  <td className="muted">{t.wbs}</td>
                  <td>{fmtDate(t.start)}</td>
                  <td>{fmtDate(t.finish)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: t.totalFloat < 0 ? "var(--danger-ink)" : "var(--fg-3)" }}>
                    {t.totalFloat.toFixed(1)}d
                  </td>
                  <td><StatusPill tone={statusTone(t.status)}>{t.statusLabel}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* WBS summary */}
      <div className="card">
          <div style={{ padding: "18px 20px 4px" }}>
            <SectionTitle icon={<Icon.layers size={18} />}>WBS Summary</SectionTitle>
            <p className="body-2 muted" style={{ margin: "6px 0 2px", fontSize: 12.5, lineHeight: 1.5 }}>
              <strong style={{ color: "var(--fg-3)" }}>Float status</strong> reflects the least slack in each WBS branch:
              <strong style={{ color: "var(--danger-ink)" }}> Negative</strong> &mdash; behind the dates it needs to hit;
              <strong style={{ color: "var(--warning-ink)" }}> Critical</strong> &mdash; zero float, sitting on the critical path so any delay moves the finish date;
              <strong style={{ color: "var(--success-ink)" }}> Healthy</strong> &mdash; positive float (spare time). The comment explains why each branch is flagged.
            </p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr><th>WBS</th><th style={{ textAlign: "right" }}>Acts</th><th style={{ textAlign: "right" }}>% Complete</th><th>Float status</th><th>Why it's flagged</th></tr>
              </thead>
              <tbody>
                {a.wbs.map((w) => (
                  <tr key={w.name}>
                    <td style={{ fontWeight: 500, color: "var(--fg-1)" }}>{w.name}</td>
                    <td style={{ textAlign: "right" }}>{w.total}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{w.pctComplete}%</td>
                    <td><StatusPill tone={floatStatusTone(w.floatStatus)}>{w.floatStatus}</StatusPill></td>
                    <td className="muted" style={{ fontSize: 12.5, lineHeight: 1.45, maxWidth: 360 }}>{wbsWhy(w)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      {/* AI Schedule Intelligence — full-width summary of the review */}
      <AiCallout>
        <p className="body-1" style={{ color: "var(--fg-3)", marginTop: 0 }}>
          <strong>{model.project.name}</strong> is currently <strong>{c.complete} of {c.activities}</strong> activities
          complete ({pct1(c.complete / c.activities)}). The schedule is <strong style={{ color: toneColor(spiL.tone) }}>{spiL.text}</strong> (SPI {evms.SPI.toFixed(2)})
          and {model.hasCost ? <>is <strong style={{ color: toneColor(cpiL.tone) }}>{cpiL.text}</strong> (CPI {evms.CPI.toFixed(2)})</> : <>not cost-loaded</>}.
          {" "}<strong>{floatA.counts.critical}</strong> activities sit on the critical path and <strong>{floatA.counts.negative}</strong> have negative float
          {floatA.counts.negative > 0 ? (
            <span style={{ color: "var(--danger-ink)", fontWeight: 600 }}> — immediate action required</span>
          ) : (
            <span> — no immediate delay risk</span>
          )}.
          {" "}Schedule quality rates <strong>{dcma.rating}</strong> (DCMA {dcma.passed}/{dcma.total}).
        </p>
        <ul style={{ margin: "14px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {floatA.counts.negative > 0 && (
            <Insight tone="danger">
              <strong>{floatA.counts.negative} activities have negative float</strong> — the schedule is already in delay against its constraints.
            </Insight>
          )}
          {model.hasCost && (
            <Insight tone={evms.VAC < 0 ? "danger" : "success"}>
              Cost performance (CPI {evms.CPI.toFixed(2)}) projects {evms.VAC < 0 ? "an overrun" : "a saving"} of <strong>{fmtMoney(Math.abs(evms.VAC), cur)}</strong> at completion (EAC {fmtMoney(evms.EAC, cur)}).
            </Insight>
          )}
          <Insight tone={dcma.passed >= 11 ? "success" : "warning"}>
            DCMA failures: {dcma.checks.filter((x) => x.applicable && !x.pass).map((x) => x.name).slice(0, 5).join(", ") || "none — schedule passes all checks"}.
          </Insight>
          {unresourced > 0 && (
            <Insight tone="warning">
              <strong>{unresourced} activities are unresourced</strong> — earned value and histogram accuracy is reduced.
            </Insight>
          )}
        </ul>
      </AiCallout>
    </div>
  );
}

function Insight({ tone, children }) {
  const dot = { danger: "var(--danger)", warning: "var(--warning)", success: "var(--success)", info: "var(--info)" }[tone];
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ width: 7, height: 7, borderRadius: 9999, background: dot, marginTop: 7, flex: "0 0 7px" }} />
      <span className="body-2" style={{ color: "var(--fg-3)" }}>{children}</span>
    </li>
  );
}
function Meta({ label, value, tone }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 10 }}>{label}</div>
      <div className="body-1" style={{ fontWeight: 600, marginTop: 2, color: tone ? toneColor(tone) : "var(--fg-1)" }}>{value}</div>
    </div>
  );
}
const grid = (n, gap = 16) => ({ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap });
function statusTone(s) { return s === "TK_Complete" ? "success" : s === "TK_Active" ? "warning" : "neutral"; }
function floatStatusTone(s) { return s === "Negative" ? "danger" : s === "Critical" ? "warning" : "success"; }

// List the driving activities (code, name, float), worst first, capped.
function listDrivers(arr, cap = 3) {
  const top = arr.slice(0, cap).map((d) => `${d.code} ${d.name} (${Math.round(d.float)}d)`);
  const more = arr.length - top.length;
  return top.join("; ") + (more > 0 ? `; +${more} more` : "");
}

// Plain-English reason a WBS branch carries its float status, naming the
// specific activities that drive it.
function wbsWhy(w) {
  const f = isFinite(w.minFloat) ? Math.round(w.minFloat) : null;
  const drivers = w.drivers || [];
  if (w.floatStatus === "Negative") {
    const neg = drivers.filter((d) => d.float < 0);
    return `${w.neg} activit${w.neg === 1 ? "y is" : "ies are"} in negative float (as low as ${f}d) — already behind the dates needed to hit the plan. Driving activities: ${listDrivers(neg)}.`;
  }
  if (w.floatStatus === "Critical") {
    return `${w.crit} activit${w.crit === 1 ? "y sits" : "ies sit"} on the critical path at zero float — any slip flows straight to the project finish. Critical activities: ${listDrivers(drivers)}.`;
  }
  return `Lowest total float ${f == null ? "—" : f + "d"} — comfortable slack, so this branch is not currently driving the finish date.`;
}
function toneColor(t) { return { danger: "var(--danger-ink)", warning: "var(--warning-ink)", success: "var(--success-ink)", info: "var(--info-ink)" }[t] || "var(--fg-1)"; }
