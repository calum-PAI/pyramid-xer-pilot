import { SectionTitle, KpiTile, Gauge } from "../components/ui.jsx";
import { Icon } from "../components/Icons.jsx";
import { fmtMoney, fmtDate } from "../lib/model.js";
import { spiLabel, cpiLabel } from "../lib/evms.js";

export default function EVMS({ a }) {
  const { evms, model } = a;
  const cur = model.project.currency;
  const spiL = spiLabel(evms.SPI);
  const cpiL = cpiLabel(evms.CPI);
  // Cost-performance metrics are only real when actual cost has been captured.
  // Otherwise AC is synthesised (= EV), so CPI/CV/EAC/VAC/TCPI collapse to a
  // trivially "perfect" reading — we show them as not-yet-measured instead.
  const costMeasured = evms.costMeasured;

  // costDep = depends on measured actual cost (meaningless until AC is real)
  const metrics = [
    ["Budget at Completion", "BAC", evms.BAC, "Total authorized budget for all scope.", false],
    ["Planned Value", "PV", evms.PV, "Budgeted cost of work scheduled to date (BCWS).", false],
    ["Earned Value", "EV", evms.EV, "Budgeted cost of work performed to date (BCWP).", false],
    ["Actual Cost", "AC", evms.AC, "Actual cost of work performed to date (ACWP).", true],
    ["Schedule Variance", "SV = EV − PV", evms.SV, "Positive = ahead of schedule.", false],
    ["Cost Variance", "CV = EV − AC", evms.CV, "Positive = under budget.", true],
    ["Estimate at Completion", "EAC = BAC / CPI", evms.EAC, "Forecast total cost at completion.", true],
    ["Estimate to Complete", "ETC = EAC − AC", evms.ETC, "Forecast remaining cost.", true],
    ["Variance at Completion", "VAC = BAC − EAC", evms.VAC, "Forecast over/under-run at completion.", true],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="g-cards-2">
        <div className="card card-pad">
          <SectionTitle icon={<Icon.dollar size={18} />}>Performance Indices</SectionTitle>
          <div className="g-gauges" style={{ gap: 8 }}>
            <Gauge value={evms.SPI} max={1.3} label="SPI" sub="schedule" tone={spiL.tone} format={(v) => v.toFixed(2)} />
            {costMeasured ? (
              <>
                <Gauge value={evms.CPI} max={1.3} label="CPI" sub="cost" tone={cpiL.tone} format={(v) => v.toFixed(2)} />
                <Gauge value={evms.TCPI} max={1.3} label="TCPI" sub="to complete" tone={evms.TCPI > 1.1 ? "danger" : "info"} format={(v) => v.toFixed(2)} />
              </>
            ) : (
              <CostNotMeasuredGauge />
            )}
          </div>
          <p className="body-2 muted" style={{ marginTop: 12 }}>
            SPI {evms.SPI.toFixed(2)} — {spiL.text}.{" "}
            {costMeasured ? (
              <>
                CPI {evms.CPI.toFixed(2)} — {cpiL.text}. TCPI {evms.TCPI.toFixed(2)} is the cost
                efficiency now required on remaining work to hit BAC.
              </>
            ) : (
              <>Cost performance (CPI / CV / EAC / VAC / TCPI) is not yet measurable — no actual cost has been recorded, so it is not shown.</>
            )}
          </p>
        </div>

        <div className="g-tiles" style={{ alignContent: "start" }}>
          <KpiTile label="% Planned" value={(evms.pctPlanned * 100).toFixed(1) + "%"} sub="PV / BAC" big />
          <KpiTile label="% Earned" value={(evms.pctEarned * 100).toFixed(1) + "%"} sub="EV / BAC" tone="success" big />
          {costMeasured ? (
            <KpiTile label="% Actual" value={(evms.pctActual * 100).toFixed(1) + "%"} sub="AC / BAC" tone="warning" big />
          ) : (
            <KpiTile label="% Actual" value="—" sub="cost not captured" big />
          )}
          <KpiTile label="Planned finish" value={fmtDate(model.project.planFinish)} sub="Contract / plan" big />
        </div>
      </div>

      <div className="card">
        <div style={{ padding: "18px 20px 4px" }}>
          <SectionTitle icon={<Icon.activity size={18} />}>Earned Value Metrics</SectionTitle>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead><tr><th>Metric</th><th>Formula</th><th style={{ textAlign: "right" }}>Value</th><th>Meaning</th></tr></thead>
            <tbody>
              {metrics.map(([name, formula, value, meaning, costDep]) => {
                const muted = costDep && !costMeasured;
                const neg = value < 0;
                const isVar = /Variance/.test(name);
                return (
                  <tr key={name}>
                    <td style={{ fontWeight: 600, color: "var(--fg-1)" }}>{name}</td>
                    <td className="mono" style={{ color: "var(--fg-4)", fontSize: 12 }}>{formula}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: muted ? "var(--fg-4)" : isVar ? (neg ? "var(--danger-ink)" : "var(--success-ink)") : "var(--fg-1)" }}>
                      {muted ? "Not measured" : model.hasCost ? fmtMoney(value, cur) : Math.round(value) + " d"}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>{meaning}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!model.hasCost ? (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-1)" }}>
            <span className="body-2 muted">
              This schedule is not cost-loaded — EVMS is computed on a duration-weighted work basis (values shown in days).
              Cost-performance metrics (CV / EAC / VAC) require actual cost and are shown as “Not measured”.
            </span>
          </div>
        ) : !costMeasured ? (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-1)" }}>
            <span className="body-2 muted">
              This schedule is cost-loaded but no actual cost has been recorded yet. Planned and earned value are
              valid; cost-performance metrics (CV / EAC / VAC / CPI / TCPI) cannot be measured until actuals are
              entered, so they are shown as “Not measured” rather than a misleading break-even reading.
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Placeholder shown in place of the CPI / TCPI gauges when no actual cost
// has been captured, so the dials never imply a break-even that wasn't measured.
function CostNotMeasuredGauge() {
  return (
    <div style={{
      flex: 1, minWidth: 180, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", textAlign: "center",
      gap: 6, padding: "8px 12px", color: "var(--fg-4)",
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: "var(--fg-3)" }}>—</div>
      <div className="body-2" style={{ fontWeight: 600 }}>CPI / TCPI</div>
      <div className="body-2 muted" style={{ fontSize: 11.5, maxWidth: 200 }}>
        No actual cost recorded — cost performance not yet measurable
      </div>
    </div>
  );
}
