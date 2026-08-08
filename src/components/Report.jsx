import { useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import { fmtDate, fmtMoney, fmtMoneyShort } from "../lib/model.js";
import { buildReport } from "../lib/report.js";
import { floatNarrative } from "../lib/float.js";
import {
  computeSCurves, computeResourceHistogram, computePhaseAnalysis, computeDisciplineAnalysis, shortDisc,
  computeClashDetection, disciplineOf, disciplineNarrative,
} from "../lib/curves.js";
import { ProgressSCurveChart, ResourceHistogramChart } from "./charts.jsx";
import { spiLabel, cpiLabel } from "../lib/evms.js";
import logoWhite from "../assets/logo-white.svg";

const HIST_PALETTE = ["#3267FF", "#14B8A6", "#F59E0B", "#5B4FD1", "#0EA5B5", "#DB6B97", "#A07A4E", "#0000C6", "#65C24F", "#66B7FF"];

const NAVY = "#03285B";
const BRAND = "var(--brand-primary)";

export default function Report({ a, onClose }) {
  const [months, setMonths] = useState(6);
  const r = useMemo(() => buildReport(a, months), [a, months]);
  const cur = r.currency;
  const money = (v) => fmtMoneyShort(v, cur);
  const spiTone = (s) => (s >= 0.95 ? "var(--success-ink)" : "var(--danger-ink)");
  const pdelta = r.actualPct - r.plannedPct;

  const { model, evms, dcma, floatA, histogram } = a;
  const hasCost = model.hasCost; // when false, never render cost figures — schedule/work only
  // recomputed with the same engines the on-screen views use → figures align
  const scurveCost = useMemo(() => computeSCurves(model, { metric: "cost", period: "month" }), [model]);
  const histMonthly = useMemo(() => computeResourceHistogram(model, { period: "month", groupBy: "resource" }), [model]);
  const phases = useMemo(() => computePhaseAnalysis(model, {}), [model]);
  const disciplines = useMemo(() => computeDisciplineAnalysis(model, {}), [model]);
  const clashes = useMemo(() => computeClashDetection(model, {}), [model]);
  const actsByDisc = useMemo(() => {
    const by = {};
    model.activities.forEach((a) => { (by[disciplineOf(a)] = by[disciplineOf(a)] || []).push(a); });
    return by;
  }, [model]);
  const histColor = (id) => {
    const i = histMonthly.groups.findIndex((g) => g.id === id);
    return HIST_PALETTE[(i < 0 ? 0 : i) % HIST_PALETTE.length];
  };

  return (
    <div className="report-root" style={S.root}>
      {/* Action bar — not printed */}
      <div className="no-print" style={S.actions}>
        <span className="body-2 muted">Programme Summary · {r.projectName}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}><Icon.x size={15} /> Close</button>
          <button className="btn btn-primary" onClick={() => window.print()}><Icon.download size={15} /> Print / Save PDF</button>
        </div>
      </div>

      <div className="report-page" style={S.page}>
        <div className="report-summary">
        {/* Header band */}
        <div style={S.header}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em", color: "#fff" }}>PROGRAMME SUMMARY</div>
            <div className="body-2" style={{ color: "rgba(255,255,255,0.85)", marginTop: 3, fontSize: 13 }}>
              Report based on: <strong style={{ color: "#fff" }}>{fmtDate(r.period)}</strong> · {r.portfolio} Portfolio
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={S.ctrl}>
              <div style={S.ctrlLbl}>Lookahead (months)</div>
              <input type="number" min="1" max="24" value={months}
                onChange={(e) => setMonths(Math.max(1, Math.min(24, +e.target.value || 6)))}
                className="no-print" style={S.ctrlInput} />
              <span className="print-only" style={{ fontWeight: 700 }}>{months}</span>
            </div>
            <div style={S.ctrl}><div style={S.ctrlLbl}>Period</div><div style={S.ctrlVal}>{fmtDate(r.period)}</div></div>
            <div style={S.ctrl}><div style={S.ctrlLbl}>Portfolio</div><div style={S.ctrlVal}>{r.portfolio}</div></div>
            <img src={logoWhite} alt="Pyramid AI" style={{ height: 22, marginLeft: 6, opacity: 0.95 }} />
          </div>
        </div>

        {/* Three columns */}
        <div className="report-cols" style={S.cols}>
          {/* ── Column 1 — SPI & Progress ── */}
          <Section title="SPI & Actual Progress">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Stat big value={r.spiToDate.toFixed(2)} label="SPI To Date" valueColor={spiTone(r.spiToDate)} sub={`Last month  ${r.spiLastMonth.toFixed(2)}`} />
              <Stat big value={hasCost ? money(r.scheduleVar) : `${Math.round(r.scheduleVar)} d`} label="Schedule Var" valueColor={r.scheduleVar < 0 ? "var(--danger-ink)" : "var(--success-ink)"} sub={`Last month  ${hasCost ? money(r.scheduleVarLast) : Math.round(r.scheduleVarLast) + " d"}`} />
            </div>

            <MiniCard title="SPI">
              <SpiLine data={r.spiTrend} />
            </MiniCard>

            <MiniCard title={`Actual % Progress · ${pdelta >= 0 ? "on/above plan" : "below planned"}`}>
              <HalfGauge value={r.actualPct} plannedPct={r.plannedPct} />
            </MiniCard>

            <MiniCard title="Planned Completion Date">
              <table style={S.tbl}>
                <thead><tr style={S.thRow}><Th>Project</Th><Th>Planned Completion</Th><Th /></tr></thead>
                <tbody>
                  {r.ops.map((o) => (
                    <tr key={o.project} style={S.tr}>
                      <Td strong>{o.project}</Td>
                      <Td>{fmtDate(o.planned)}</Td>
                      <Td><span title={o.onTrack ? "On track" : "Behind plan"} style={{ width: 10, height: 10, borderRadius: 9999, display: "inline-block", background: o.onTrack ? "var(--success)" : "var(--danger)" }} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="body-2 muted" style={{ fontSize: 10, marginTop: 5, lineHeight: 1.4 }}>
                Planned (contract) completion from the current schedule. Status reflects schedule performance to date
                (SPI {r.ops[0] ? r.ops[0].spi.toFixed(2) : "—"}).
              </div>
            </MiniCard>
          </Section>

          {/* ── Column 2 — Completed Milestones ── */}
          <Section title="Completed Milestones">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Stat value={`${r.milestones.completedCount}/${r.milestones.total}`} label="Total Completed" />
              <Stat value={`${r.milestones.pctCompletion.toFixed(1)}%`} label="% Completion to Date" sub={`Planned  ${r.milestones.plannedPct.toFixed(1)}%`} />
              <Stat value={String(r.milestones.completedInMonth)} label="Completed in Month" />
            </div>
            <MiniCard title="Milestones completed by month">
              <BarMini data={r.completedBars} color="var(--success)" />
            </MiniCard>

            <div style={{ ...S.detailHdr }}>Completed Milestones Detail</div>
            <div style={{ overflow: "auto", maxHeight: 520 }}>
              <table style={S.tbl}>
                <thead><tr style={S.thRow}><Th>Status</Th><Th>Project</Th><Th>Scope</Th><Th>Activity</Th><Th>Baseline</Th><Th>Completed</Th><Th>Variance</Th></tr></thead>
                <tbody>
                  {r.completed.map((c) => (
                    <tr key={c.m.id} style={S.tr}>
                      <Td>{c.inPeriod ? <Pill tone="warning">IN PERIOD</Pill> : <span className="muted" style={{ fontSize: 11 }}>—</span>}</Td>
                      <Td>{c.m.wbs?.split(" ")[0] || r.portfolio}</Td>
                      <Td>{c.m.wbs}</Td>
                      <Td strong>{c.m.name}</Td>
                      <Td>{fmtDate(c.baseline)}</Td>
                      <Td>{fmtDate(c.done)}</Td>
                      <Td><Variance days={c.varDays} late="late" /></Td>
                    </tr>
                  ))}
                  {r.completed.length === 0 && <tr><Td colSpan={7} muted center>No milestones completed yet.</Td></tr>}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── Column 3 — Lookahead ── */}
          <Section title={`${months}-Month Milestone Lookahead (${fmtDate(r.period).slice(3)} →)`}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Stat value={String(r.milestones.upcomingCount)} label="Upcoming Milestones" />
              <Stat value={String(r.milestones.onTrack)} label="On-Track" valueColor="var(--info-ink)" />
              <Stat value={String(r.milestones.delayed)} label="Forecast Delayed" valueColor="var(--danger-ink)" />
            </div>
            <div className="body-2 muted" style={{ fontSize: 10.5, lineHeight: 1.45, marginTop: -2 }}>
              {r.milestones.remainingCount} of {r.milestones.total} milestones remaining —{" "}
              <strong style={{ color: "var(--fg-3)" }}>{r.milestones.upcomingCount}</strong> due within the {months}-month
              lookahead{r.milestones.beyondCount > 0 ? <>, <strong style={{ color: "var(--fg-3)" }}>{r.milestones.beyondCount}</strong> scheduled beyond it</> : ""}.
              ({r.milestones.completedCount} complete + {r.milestones.upcomingCount} upcoming + {r.milestones.beyondCount} beyond = {r.milestones.total}.)
            </div>
            <MiniCard title="Upcoming by month (on-track / delayed)">
              <StackMini data={r.lookaheadBars} />
            </MiniCard>

            <div style={{ ...S.detailHdr }}>Upcoming Milestones Detail</div>
            <div style={{ overflow: "auto", maxHeight: 520 }}>
              <table style={S.tbl}>
                <thead><tr style={S.thRow}><Th>Status</Th><Th>Project</Th><Th>Scope</Th><Th>Activity</Th><Th>Baseline</Th><Th>Forecast</Th><Th>Variance</Th></tr></thead>
                <tbody>
                  {r.upcoming.map((u) => (
                    <tr key={u.m.id} style={S.tr}>
                      <Td><Pill tone={u.status === "Delayed" ? "danger" : "info"}>{u.status === "Delayed" ? "DELAYED" : "ON-TRACK"}</Pill></Td>
                      <Td>{u.m.wbs?.split(" ")[0] || r.portfolio}</Td>
                      <Td>{u.m.wbs}</Td>
                      <Td strong>{u.m.name}</Td>
                      <Td>{fmtDate(u.baseline)}</Td>
                      <Td>{fmtDate(u.forecast)}</Td>
                      <Td><Variance days={u.varDays} late="delay" /></Td>
                    </tr>
                  ))}
                  {r.upcoming.length === 0 && <tr><Td colSpan={7} muted center>No milestones forecast in the next {months} months.</Td></tr>}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        {/* Current execution — in-progress & delayed activities (page 1) */}
        <div style={{ padding: "0 14px 16px" }}>
          <Section title="In-Progress & Delayed Activities">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              <Stat value={String(r.execution.inProgressCount)} label="In Progress" valueColor="var(--warning-ink)" />
              <Stat value={String(r.execution.delayedCount)} label="Delayed · negative float" valueColor={r.execution.delayedCount ? "var(--danger-ink)" : "var(--success-ink)"} />
              <Stat value={`${r.milestones.completedCount}/${r.milestones.total}`} label="Milestones complete" />
              <Stat value={String(r.milestones.upcomingCount)} label={`Upcoming milestones (${months}mo)`} />
            </div>
            <div style={S.detailHdr}>Activities currently in progress or behind (negative float)</div>
            <div style={{ overflow: "auto" }}>
              <table style={S.tbl}>
                <thead><tr style={S.thRow}><Th>Status</Th><Th>Act ID</Th><Th>Activity</Th><Th>Scope</Th><Th>% Compl</Th><Th>Total Float</Th></tr></thead>
                <tbody>
                  {r.execution.rows.map((t) => (
                    <tr key={t.id} style={S.tr}>
                      <Td><Pill tone={t.active ? "warning" : "danger"}>{t.active ? "IN PROGRESS" : "DELAYED"}</Pill></Td>
                      <Td strong>{t.code}</Td>
                      <Td>{t.name}</Td>
                      <Td>{t.wbs}</Td>
                      <Td>{t.pct}%</Td>
                      <Td><span style={{ color: t.delayed ? "var(--danger-ink)" : "var(--fg-3)", fontWeight: t.delayed ? 700 : 400 }}>{t.float.toFixed(1)}d</span></Td>
                    </tr>
                  ))}
                  {r.execution.rows.length === 0 && <tr><Td colSpan={6} muted center>No in-progress or delayed activities at the data date.</Td></tr>}
                </tbody>
              </table>
            </div>
            {r.execution.hiddenCount > 0 && (
              <div className="body-2 muted" style={{ fontSize: 11 }}>
                +{r.execution.hiddenCount} further activities with negative float — see the Float &amp; Critical Path page.
              </div>
            )}
          </Section>
        </div>
        </div>

        {/* ═══ Per-function pages ═══ */}

        {/* EVMS — cost figures only when cost-loaded; otherwise schedule/work basis in days */}
        <ReportPage title={hasCost ? "Earned Value (EVMS)" : "Earned Schedule (work-based)"} project={r.projectName} period={r.period}>
          {hasCost ? (
            <>
              <div style={G4}>
                <Stat big value={evms.SPI.toFixed(2)} label="SPI (Schedule)" valueColor={spiTone(evms.SPI)} sub={spiLabel(evms.SPI).text} />
                <Stat big value={evms.CPI.toFixed(2)} label="CPI (Cost)" valueColor={spiTone(evms.CPI)} sub={cpiLabel(evms.CPI).text} />
                <Stat big value={money(evms.BAC)} label="BAC" sub="budget at completion" />
                <Stat big value={money(evms.EAC)} label="EAC" sub="estimate at completion" valueColor={evms.VAC < 0 ? "var(--danger-ink)" : "var(--fg-1)"} />
              </div>
              <ReportTable head={["Metric", "Formula", "Value", "Meaning"]}
                rows={[
                  ["Planned Value (PV)", "BCWS", money(evms.PV), "Budgeted cost of work scheduled"],
                  ["Earned Value (EV)", "BCWP", money(evms.EV), "Budgeted cost of work performed"],
                  ["Actual Cost (AC)", "ACWP", money(evms.AC), "Actual cost of work performed"],
                  ["Schedule Variance", "SV = EV − PV", money(evms.SV), evms.SV < 0 ? "Behind schedule" : "Ahead of schedule"],
                  ["Cost Variance", "CV = EV − AC", money(evms.CV), evms.CV < 0 ? "Over budget" : "Under budget"],
                  ["Estimate to Complete", "ETC = EAC − AC", money(evms.ETC), "Forecast remaining cost"],
                  ["Variance at Completion", "VAC = BAC − EAC", money(evms.VAC), evms.VAC < 0 ? "Forecast over-run" : "Forecast saving"],
                  ["To-Complete Perf. Index", "TCPI", evms.TCPI.toFixed(2), "Efficiency required on remaining work"],
                  ["% Planned / Earned / Actual", "PV/EV/AC ÷ BAC", `${(evms.pctPlanned * 100).toFixed(1)}% / ${(evms.pctEarned * 100).toFixed(1)}% / ${(evms.pctActual * 100).toFixed(1)}%`, "Progress to date"],
                  ["Planned completion", "Contract / plan", fmtDate(model.project.planFinish), "Planned completion date from the schedule"],
                ]} />
            </>
          ) : (
            <>
              <div style={{ ...S.noteBox }}>
                <strong>Not cost-loaded.</strong> This schedule carries no cost or resource rates, so monetary earned-value
                metrics (BAC, EAC, CPI, CV, VAC) cannot be derived and are omitted. The figures below are schedule- and
                progress-based (duration-weighted), expressed in days.
              </div>
              <div style={G4}>
                <Stat big value={evms.SPI.toFixed(2)} label="SPI (Schedule)" valueColor={spiTone(evms.SPI)} sub={spiLabel(evms.SPI).text} />
                <Stat big value={`${(evms.pctPlanned * 100).toFixed(1)}%`} label="% Planned" sub="planned work to date" />
                <Stat big value={`${(evms.pctEarned * 100).toFixed(1)}%`} label="% Earned" sub="earned work to date" valueColor="var(--success-ink)" />
                <Stat big value={fmtDate(model.project.planFinish)} label="Planned completion" sub="contract / plan" />
              </div>
              <ReportTable head={["Metric", "Formula", "Value (work-days)", "Meaning"]}
                rows={[
                  ["Planned Work (PV)", "duration-weighted", `${Math.round(evms.PV)} d`, "Work scheduled to date"],
                  ["Earned Work (EV)", "duration-weighted", `${Math.round(evms.EV)} d`, "Work performed to date"],
                  ["Schedule Variance", "SV = EV − PV", `${Math.round(evms.SV)} d`, evms.SV < 0 ? "Behind schedule" : "Ahead of schedule"],
                  ["Total planned work (BAC-equiv.)", "duration-weighted", `${Math.round(evms.BAC)} d`, "Total scheduled work"],
                  ["Cost metrics (AC, CV, EAC, VAC, CPI)", "—", "Not available — no cost data", "Requires cost/rate loading in P6"],
                ]} />
            </>
          )}
        </ReportPage>

        {/* S-Curve — cost basis only when cost-loaded, otherwise a % progress curve */}
        <ReportPage title={hasCost ? "Cost S-Curve (PV / EV / AC)" : "Progress S-Curve (% complete)"} project={r.projectName} period={r.period}>
          {hasCost ? (
            <div style={G4}>
              <Stat value={money(scurveCost.plannedAtDD)} label="Planned to date (PV)" />
              <Stat value={money(scurveCost.earnedAtDD)} label="Earned to date (EV)" valueColor="var(--success-ink)" />
              <Stat value={money(evms.AC)} label="Actual to date (AC)" valueColor="var(--warning-ink)" />
              <Stat value={money(scurveCost.totalBasis)} label="Budget (BAC)" />
            </div>
          ) : (
            <div style={G4}>
              <Stat value={`${(evms.pctPlanned * 100).toFixed(1)}%`} label="% Planned to date" />
              <Stat value={`${(evms.pctEarned * 100).toFixed(1)}%`} label="% Earned to date" valueColor="var(--success-ink)" />
              <Stat value={evms.SPI.toFixed(2)} label="SPI" valueColor={spiTone(evms.SPI)} />
              <Stat value={`${Math.round(scurveCost.totalBasis)} d`} label="Total scope (work-days)" />
            </div>
          )}
          <ProgressSCurveChart data={scurveCost} metricLabel={hasCost ? "Cost" : "% complete"} height={300} />
          <p className="body-2 muted" style={{ marginTop: 8 }}>Dashed = Baseline plan · Solid = Current planned · Green = Actual earned · Red line = Data date.{!hasCost && " Curves are duration-weighted % complete — not cost."}</p>
        </ReportPage>

        {/* DCMA */}
        <ReportPage title="DCMA 14-Point Schedule Assessment" project={r.projectName} period={r.period}>
          <div style={G4}>
            <Stat big value={`${dcma.passed}/${dcma.total}`} label="DCMA Score" sub={dcma.rating} valueColor={dcma.passed >= 11 ? "var(--success-ink)" : dcma.passed >= 8 ? "var(--warning-ink)" : "var(--danger-ink)"} />
            <Stat big value={dcma.cpli.toFixed(2)} label="CPLI" sub="critical path length index" valueColor={dcma.cpli >= 0.95 ? "var(--success-ink)" : "var(--danger-ink)"} />
            <Stat big value={dcma.bei.toFixed(2)} label="BEI" sub="baseline execution index" valueColor={dcma.bei >= 0.95 ? "var(--success-ink)" : "var(--danger-ink)"} />
            <Stat big value={String(dcma.checks.filter((c) => c.applicable && !c.pass).length)} label="Checks failing" valueColor="var(--danger-ink)" />
          </div>
          <ReportTable head={["#", "Check", "Result", "Value", "Detail"]}
            rows={dcma.checks.map((c) => [
              String(c.id).padStart(2, "0"), c.name,
              c.pass === null ? <span className="muted">N/A</span> : <Pill tone={c.pass ? "success" : "danger"}>{c.pass ? "PASS" : "FAIL"}</Pill>,
              c.value, c.detail,
            ])} />
        </ReportPage>

        {/* Float & Critical Path */}
        <ReportPage title="Float & Critical Path" project={r.projectName} period={r.period}>
          <div style={G4}>
            <Stat big value={String(floatA.counts.critical)} label="Critical (TF ≤ 0)" valueColor="var(--warning-ink)" />
            <Stat big value={String(floatA.counts.negative)} label="Negative float" valueColor={floatA.counts.negative ? "var(--danger-ink)" : "var(--success-ink)"} />
            <Stat big value={String(floatA.counts.nearCritical)} label="Near-critical (1–10d)" />
            <Stat big value={`${floatA.criticalPct}%`} label="Critical %" valueColor={floatA.criticalPct > 25 ? "var(--danger-ink)" : "var(--fg-1)"} />
          </div>
          <div style={S.detailHdr}>Total float distribution</div>
          <ReportTable head={["Band", "Activities"]} rows={floatA.buckets.map((b) => [b.label, String(b.count)])} />
          <div style={{ ...S.detailHdr, marginTop: 10 }}>Negative-float exposure (worst 12)</div>
          <ReportTable head={["Act ID", "Activity", "WBS", "Finish", "Total float"]}
            rows={floatA.negative.slice(0, 12).map((t) => [t.code, t.name, t.wbs, fmtDate(t.finish), <span style={{ color: "var(--danger-ink)", fontWeight: 700 }}>{t.totalFloat.toFixed(1)}d</span>])}
            empty="No negative float — within constraints." />
          <FloatNarrative floatA={floatA} model={model} />
        </ReportPage>

        {/* Resource Histogram */}
        {!histMonthly.empty && (
          <ReportPage title="Resource Histogram (monthly man-hours)" project={r.projectName} period={r.period}>
            <div style={G4}>
              <Stat value={String(histMonthly.groups.length)} label="Resources" />
              <Stat value={Math.round(histMonthly.peak).toLocaleString()} label="Peak / month" valueColor="var(--warning-ink)" />
              <Stat value={Math.round(histMonthly.cumulativeMax).toLocaleString()} label="Total man-hours" />
              <Stat value={String(histMonthly.overPeriods || 0)} label="Over-allocated months" valueColor={histMonthly.overPeriods ? "var(--danger-ink)" : "var(--success-ink)"} />
            </div>
            <ResourceHistogramChart data={histMonthly} colorFor={histColor} unit="Hrs" height={280} />
            <div style={{ ...S.detailHdr, marginTop: 10 }}>Resource summary</div>
            <ReportTable head={["Resource", "Type", "Peak hrs", "Peak period", "Over-alloc", "Est. cost"]}
              rows={histMonthly.groups.map((g) => [
                g.name, g.type === "RT_Equip" ? "Equip" : g.type === "RT_Mtl" ? "Mat" : "Labour",
                g.peakHrs.toLocaleString(), g.peakDate ? g.peakDate.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) : "—",
                g.overPeriods ? <span style={{ color: "var(--danger-ink)", fontWeight: 700 }}>{g.overPeriods}</span> : "0",
                model.hasCost ? money(g.cost) : "—",
              ])} />
          </ReportPage>
        )}

        {/* Phase */}
        <ReportPage title="Phase Analysis" project={r.projectName} period={r.period}>
          <ReportTable head={["Phase", "Acts", "Done", "In prog", "Remaining", "% Compl", "SPI", "Float risk", "Fcst end"]}
            rows={phases.map((p) => [
              p.name, String(p.total), String(p.done), String(p.inProg), String(p.remaining), `${p.pctComplete}%`, p.spi.toFixed(2),
              <Pill tone={p.floatRisk === "High" ? "danger" : p.floatRisk === "Medium" ? "warning" : "success"}>{p.floatRisk}</Pill>, fmtDate(p.fcstEnd),
            ])} />
        </ReportPage>

        {/* Discipline */}
        <ReportPage title="Discipline Analysis" project={r.projectName} period={r.period}>
          <ReportTable head={["Discipline", "Acts", "Done", "In prog", "Remaining", "% Compl", "SPI", "Float risk", "Fcst end"]}
            rows={disciplines.map((p) => [
              shortDisc(p.name), String(p.total), String(p.done), String(p.inProg), String(p.remaining), `${p.pctComplete}%`, p.spi.toFixed(2),
              <Pill tone={p.floatRisk === "High" ? "danger" : p.floatRisk === "Medium" ? "warning" : "success"}>{p.floatRisk}</Pill>, fmtDate(p.fcstEnd),
            ])} />
          <DisciplineNarrative disciplines={disciplines} model={model} clashes={clashes} actsByDisc={actsByDisc} />
        </ReportPage>

        {/* Look-ahead */}
        <ReportPage title="6-Week Look-Ahead" project={r.projectName} period={r.period}>
          <ReportTable head={["Act ID", "Activity", "WBS", "Start", "Finish", "Rem", "TF", "Status"]}
            rows={a.lookAhead.map((t) => [
              t.code, t.name, t.wbs, fmtDate(t.start), fmtDate(t.finish), `${t.remainDur.toFixed(0)}d`,
              <span style={{ color: t.totalFloat < 0 ? "var(--danger-ink)" : "var(--fg-3)", fontWeight: t.totalFloat <= 0 ? 700 : 400 }}>{t.totalFloat.toFixed(1)}d</span>,
              <Pill tone={t.status === "TK_Active" ? "warning" : "info"}>{t.statusLabel}</Pill>,
            ])}
            empty="No activities in the look-ahead window." />
        </ReportPage>

        {/* Risk register */}
        <ReportPage title="Auto-Generated Risk Register" project={r.projectName} period={r.period}>
          <ReportTable head={["ID", "Category", "Risk", "L×I", "Severity", "Mitigation"]}
            rows={a.risks.map((rk) => [
              rk.id, rk.category, <span style={{ fontWeight: 600, color: "var(--fg-1)" }}>{rk.title}</span>, `${rk.likelihood}×${rk.impact}`,
              <Pill tone={rk.score >= 9 ? "danger" : rk.score >= 5 ? "warning" : "info"}>{rk.severity} · {rk.score}</Pill>,
              rk.mitigation,
            ])}
            empty="No material risks detected." />
        </ReportPage>

        <div style={S.foot}>
          Pyramid AI · Schedule Intelligence — generated {fmtDate(r.generatedAt)} · computed in-browser from the uploaded P6 XER.
          All figures reconcile with the on-screen analysis.
        </div>
      </div>
    </div>
  );
}

const G4 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 };

function ReportPage({ title, project, period, children }) {
  return (
    <div className="report-page-break" style={{ padding: "18px 16px 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: `2px solid var(--brand-primary)`, paddingBottom: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--brand-primary)" }}>{title}</div>
        <div className="body-2 muted" style={{ fontSize: 12 }}>{project} · {fmtDate(period)}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

function ReportTable({ head, rows, empty }) {
  return (
    <div style={{ overflow: "auto" }}>
      <table style={S.tbl}>
        <thead><tr>{head.map((h, i) => <Th key={i}>{h}</Th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={S.tr}>{row.map((c, j) => <Td key={j} strong={j === 0}>{c}</Td>)}</tr>
          ))}
          {rows.length === 0 && <tr><Td colSpan={head.length} muted center>{empty || "No data."}</Td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ── Building blocks ── */
function Section({ title, children }) {
  return (
    <div style={{ border: "1px solid var(--border-1)", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <div style={{ background: BRAND, color: "#fff", textAlign: "center", fontWeight: 700, fontSize: 13, padding: "7px 12px" }}>{title}</div>
      <div style={{ padding: 11, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}
function Stat({ value, label, sub, big, valueColor }) {
  return (
    <div style={{ border: "1px solid var(--border-1)", borderRadius: 10, padding: "12px 12px", background: "var(--bg-wash)" }}>
      <div style={{ fontSize: big ? 26 : 22, fontWeight: 800, letterSpacing: "-0.02em", color: valueColor || "var(--fg-1)", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div className="body-2" style={{ color: "var(--fg-3)", fontWeight: 600, marginTop: 3, fontSize: 12 }}>{label}</div>
      {sub && <div className="body-2 muted" style={{ fontSize: 11, marginTop: 4, borderTop: "1px solid var(--border-1)", paddingTop: 4 }}>{sub}</div>}
    </div>
  );
}
function MiniCard({ title, children }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}
function Pill({ tone, children }) {
  const t = { info: ["var(--info-bg)", "var(--info-ink)"], danger: ["var(--danger-bg)", "var(--danger-ink)"], warning: ["var(--warning-bg)", "var(--warning-ink)"], success: ["var(--success-bg)", "var(--success-ink)"] }[tone];
  return <span style={{ background: t[0], color: t[1], borderRadius: 9999, padding: "2px 8px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
}
// AI narrative for the report's Float page — same engine as the on-screen view.
function FloatNarrative({ floatA, model }) {
  const { verdict, findings, actions } = floatNarrative(floatA, model);
  const vInk = { danger: "var(--danger-ink)", warning: "var(--warning-ink)", success: "var(--success-ink)" }[verdict.tone];
  const vBg = { danger: "var(--danger-bg)", warning: "var(--warning-bg)", success: "var(--success-bg)" }[verdict.tone];
  return (
    <div style={{ breakInside: "avoid" }}>
      <div style={S.detailHdr}>AI Narrative — Findings &amp; Recommendations</div>
      <div style={{ background: vBg, border: "1px solid var(--border-1)", borderRadius: 8, padding: "8px 11px", margin: "8px 0 10px", fontSize: 12, color: "var(--fg-1)", fontWeight: 600 }}>
        <span style={{ color: vInk }}>Assessment: </span>{verdict.text}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <NarrList title="Key findings" dot={BRAND} ink={BRAND} items={findings} />
        <NarrList title="Recommended actions" dot="var(--success)" ink="var(--success-ink)" items={actions} />
      </div>
    </div>
  );
}
function NarrList({ title, dot, ink, items }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 10, color: ink, marginBottom: 6 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
        {items.map((t, i) => (
          <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ width: 5, height: 5, borderRadius: 9999, background: dot, marginTop: 6, flex: "0 0 5px" }} />
            <span style={{ fontSize: 11.5, color: "var(--fg-3)", lineHeight: 1.5 }}>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
// AI narrative for the report's Discipline page — same engine as the view.
function DisciplineNarrative({ disciplines, model, clashes, actsByDisc }) {
  const critical = disciplines.filter((p) => p.floatRisk === "High");
  return (
    <div>
      <div style={S.detailHdr}>Discipline AI Narrative — Critical Float Exposure</div>
      {critical.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 6 }}>
          No discipline carries critical float exposure — every system is running with positive float.
        </div>
      ) : (
        critical.map((p) => {
          const n = disciplineNarrative(p, actsByDisc[p.name] || [], model, clashes);
          return (
            <div key={p.name} style={{ breakInside: "avoid", marginTop: 10, borderTop: "1px solid var(--border-1)", paddingTop: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: "var(--fg-1)" }}>{shortDisc(p.name)}</span>
                <Pill tone="danger">Critical float exposure</Pill>
                <span style={{ fontSize: 11, color: "var(--fg-4)", fontVariantNumeric: "tabular-nums" }}>
                  {n.crit.length} critical{n.neg.length ? ` · ${n.neg.length} negative` : ""} · worst {n.crit[0] ? n.crit[0].totalFloat.toFixed(0) : "0"}d · SPI {p.spi.toFixed(2)} · fcst {fmtDate(p.fcstEnd)}
                </span>
              </div>
              {n.items.length > 0 && (
                <>
                  <div className="eyebrow" style={{ fontSize: 10, color: "var(--danger-ink)", marginBottom: 5 }}>Critical activities &amp; why</div>
                  <ul style={{ margin: "0 0 8px", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
                    {n.items.map((it) => (
                      <li key={it.code} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ width: 5, height: 5, borderRadius: 9999, background: "var(--danger)", marginTop: 6, flex: "0 0 5px" }} />
                        <span style={{ fontSize: 11.5, color: "var(--fg-3)", lineHeight: 1.5 }}>
                          <span style={{ color: BRAND, fontWeight: 700 }}>{it.code}</span>{" "}
                          <b style={{ color: "var(--fg-1)" }}>{it.name}</b>{" "}
                          <span style={{ color: "var(--danger-ink)", fontWeight: 700 }}>({it.float.toFixed(0)}d)</span> — {it.why}.
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <NarrList title="Impact & risk" dot="var(--warning)" ink="var(--warning-ink)" items={n.impact} />
                <NarrList title="Recommended actions" dot="var(--success)" ink="var(--success-ink)" items={n.actions} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
function Variance({ days, late }) {
  if (days > 0) return <span style={{ color: "var(--info-ink)", fontWeight: 600 }}>{days} day{days > 1 ? "s" : ""} early</span>;
  if (days < 0) return <span style={{ color: "var(--danger-ink)", fontWeight: 600 }}>{-days} day{-days > 1 ? "s" : ""} {late}</span>;
  return <span style={{ color: "var(--info-ink)" }}>on time</span>;
}
const Th = ({ children }) => <th style={{ background: NAVY, color: "#fff", fontSize: 10, fontWeight: 600, textAlign: "left", padding: "7px 8px", textTransform: "uppercase", letterSpacing: "0.03em", whiteSpace: "nowrap" }}>{children}</th>;
const Td = ({ children, strong, muted, center, colSpan }) => <td colSpan={colSpan} style={{ padding: "7px 8px", borderBottom: "1px solid var(--border-1)", fontSize: 12, color: strong ? "var(--fg-1)" : muted ? "var(--fg-4)" : "var(--fg-3)", fontWeight: strong ? 600 : 400, textAlign: center ? "center" : "left", verticalAlign: "top" }}>{children}</td>;

/* ── mini SVG charts ── */
function SpiLine({ data }) {
  const W = 320, H = 92, pad = { l: 30, r: 10, t: 8, b: 20 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const n = data.length || 1;
  const min = 0.9, max = 1.05;
  const x = (i) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;
  const pts = data.map((d, i) => `${x(i)},${y(Math.max(min, Math.min(max, d.spi)))}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "var(--bg-wash)", borderRadius: 8, border: "1px solid var(--border-1)" }}>
      {[0.9, 0.95, 1.0, 1.05].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0.95 ? "var(--danger)" : "#eef1fb"} strokeDasharray={v === 0.95 ? "3 3" : "0"} />
          <text x={pad.l - 4} y={y(v) + 3} textAnchor="end" style={{ fontSize: 8, fill: "var(--fg-4)" }}>{v.toFixed(2)}</text>
        </g>
      ))}
      <polyline points={pts} fill="none" stroke="var(--brand-primary)" strokeWidth="2" />
      {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(Math.max(min, Math.min(max, d.spi)))} r="2.5" fill="#fff" stroke="var(--brand-primary)" strokeWidth="1.5" />)}
      {data.map((d, i) => i % 2 === 0 ? <text key={"t" + i} x={x(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 8, fill: "var(--fg-4)" }}>{d.date.toLocaleDateString("en-GB", { month: "short" })}</text> : null)}
    </svg>
  );
}
function HalfGauge({ value, plannedPct }) {
  const R = 60, cx = 80, cy = 74, C = Math.PI * R;
  const frac = Math.max(0, Math.min(1, value / 100));
  const delta = value - plannedPct;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-wash)", borderRadius: 8, border: "1px solid var(--border-1)", padding: 8 }}>
      <svg viewBox="0 0 160 90" width="180">
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="var(--border-1)" strokeWidth="14" strokeLinecap="round" />
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="var(--brand-primary)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${C * frac} ${C}`} />
        <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontSize: 26, fontWeight: 800, fill: "var(--fg-1)" }}>{value.toFixed(1)}%</text>
        <text x={cx} y={cy + 8} textAnchor="middle" style={{ fontSize: 9, fontWeight: 700, fill: delta >= 0 ? "var(--success-ink)" : "var(--danger-ink)" }}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}% {delta >= 0 ? "above" : "below"} plan
        </text>
      </svg>
    </div>
  );
}
function BarMini({ data, color }) {
  const W = 320, H = 80, pad = { l: 6, r: 6, t: 8, b: 18 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => d.count));
  const bw = (iw / data.length) * 0.6;
  const x = (i) => pad.l + (i + 0.5) * (iw / data.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "var(--bg-wash)", borderRadius: 8, border: "1px solid var(--border-1)" }}>
      {data.map((d, i) => {
        const h = (d.count / max) * ih;
        return <g key={i}>
          <rect x={x(i) - bw / 2} y={pad.t + ih - h} width={bw} height={h} fill={d.count ? color : "var(--border-2)"} rx="1.5" />
          {i % 2 === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" style={{ fontSize: 8, fill: "var(--fg-4)" }}>{d.date.toLocaleDateString("en-GB", { month: "short" })}</text>}
        </g>;
      })}
    </svg>
  );
}
function StackMini({ data }) {
  const W = 320, H = 90, pad = { l: 6, r: 6, t: 14, b: 18 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => d.onTrack + d.delayed));
  const bw = Math.min(26, (iw / data.length) * 0.6);
  const x = (i) => pad.l + (i + 0.5) * (iw / data.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "var(--bg-wash)", borderRadius: 8, border: "1px solid var(--border-1)" }}>
      {data.map((d, i) => {
        const ho = (d.onTrack / max) * ih, hd = (d.delayed / max) * ih;
        const base = pad.t + ih;
        return <g key={i}>
          {d.onTrack > 0 && <><rect x={x(i) - bw / 2} y={base - ho} width={bw} height={ho} fill="var(--brand-300)" rx="1.5" /><text x={x(i)} y={base - ho - 2} textAnchor="middle" style={{ fontSize: 8, fontWeight: 700, fill: "var(--brand-primary)" }}>{d.onTrack}</text></>}
          {d.delayed > 0 && <><rect x={x(i) - bw / 2} y={base - ho - hd} width={bw} height={hd} fill="var(--danger)" rx="1.5" /><text x={x(i)} y={base - ho - hd - 2} textAnchor="middle" style={{ fontSize: 8, fontWeight: 700, fill: "var(--danger-ink)" }}>{d.delayed}</text></>}
          <text x={x(i)} y={H - 6} textAnchor="middle" style={{ fontSize: 8, fill: "var(--fg-4)" }}>{d.date.toLocaleDateString("en-GB", { month: "short" })}</text>
        </g>;
      })}
    </svg>
  );
}

const S = {
  root: { position: "fixed", inset: 0, zIndex: 1000, background: "#eef1f7", overflow: "auto" },
  actions: { position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "#fff", borderBottom: "1px solid var(--border-1)" },
  // pinned to A4-landscape usable width so screen == print (1:1, no scaling)
  page: { width: 1040, maxWidth: "100%", margin: "18px auto", background: "#fff", boxShadow: "var(--shadow-lg)", borderRadius: 12, overflow: "hidden" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, padding: "14px 24px", background: "var(--brand-gradient)" },
  ctrl: { textAlign: "left" },
  ctrlLbl: { fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.7)", fontWeight: 600 },
  ctrlVal: { color: "#fff", fontWeight: 700, fontSize: 14, marginTop: 2 },
  ctrlInput: { width: 56, marginTop: 2, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.12)", color: "#fff", borderRadius: 6, padding: "3px 8px", fontSize: 14, fontWeight: 700, outline: "none" },
  cols: { display: "grid", gridTemplateColumns: "0.9fr 1.15fr 1.15fr", gap: 12, padding: 14, alignItems: "start" },
  detailHdr: { fontWeight: 700, fontSize: 13, color: NAVY, margin: "2px 0 -2px" },
  tbl: { width: "100%", borderCollapse: "collapse" },
  thRow: {},
  tr: {},
  foot: { padding: "12px 20px", borderTop: "1px solid var(--border-1)", color: "var(--fg-4)", fontSize: 11, background: "var(--bg-wash)" },
  noteBox: { background: "var(--bg-wash)", border: "1px solid var(--border-1)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5 },
};
