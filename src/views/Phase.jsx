import { useMemo, useState } from "react";
import FilterBar, { FILTER_DEFAULTS } from "../components/FilterBar.jsx";
import { GroupedBarChart, SeriesLegend } from "../components/charts.jsx";
import { SectionTitle, StatusPill, AiCallout, KpiTile } from "../components/ui.jsx";
import { Icon } from "../components/Icons.jsx";
import { fmtMoneyShort, fmtDate, daysBetween, fmtPct } from "../lib/model.js";
import {
  computePhaseAnalysis, makeActivityFilter, setPhaseRules, STD_PHASES, phaseInfoOf,
} from "../lib/curves.js";

// Derive risks & opportunities for a phase from its activities, with justification.
function phaseNarrative(p, acts, hasCost, money) {
  const risks = [], opps = [];
  const inc = acts.filter((a) => a.status !== "TK_Complete");
  const neg = inc.filter((a) => a.totalFloat < 0).sort((a, b) => a.totalFloat - b.totalFloat);
  const crit = inc.filter((a) => a.totalFloat <= 0);
  const longRem = inc.filter((a) => !a.isMilestone && a.remainDur > 44);
  const minFloat = inc.length ? Math.min(...inc.map((a) => a.totalFloat)) : Infinity;
  const cpi = hasCost && p.actual > 0 ? p.earned / p.actual : null;
  const unresourced = hasCost ? acts.filter((a) => !a.isMilestone && a.budget <= 0).length : 0;
  const baseFin = acts.map((a) => a.targetEnd).filter(Boolean);
  const baseline = baseFin.length ? new Date(Math.max(...baseFin)) : null;
  const slip = baseline && p.fcstEnd ? daysBetween(baseline, p.fcstEnd) : 0; // +ve = later than baseline

  // ── Risks (with justification) ──
  if (neg.length) {
    risks.push(`${neg.length} ${neg.length === 1 ? "activity is" : "activities are"} in negative float (worst ${neg[0].totalFloat.toFixed(0)}d on “${neg[0].name}”) — the phase already breaches its target dates, so it can't recover without acceleration or re-sequencing.`);
  } else if (crit.length) {
    risks.push(`${crit.length} ${crit.length === 1 ? "activity sits" : "activities sit"} on the critical path with zero float — any slip here flows straight through to the project completion date.`);
  }
  if (p.spi < 0.95 && p.done < p.total) {
    risks.push(`Behind plan at SPI ${p.spi.toFixed(2)} — only ${fmtPct(p.pctComplete)} of the phase is complete, so it is earning value slower than the baseline scheduled.`);
  }
  if (cpi != null && cpi < 0.95) {
    risks.push(`Cost over-running: actuals of ${money(p.actual)} exceed the ${money(p.earned)} of value earned (CPI ${cpi.toFixed(2)}), pointing to productivity or scope pressure.`);
  }
  if (slip > 5) {
    risks.push(`Forecast finish (${fmtDate(p.fcstEnd)}) slips ${slip}d beyond the baseline — the delay threatens downstream phases and the handover milestone.`);
  }
  if (longRem.length) {
    risks.push(`${longRem.length} long activit${longRem.length === 1 ? "y has" : "ies have"} more than 44 days remaining — coarse tasks hide progress and mask emerging delay between updates.`);
  }
  if (unresourced) {
    risks.push(`${unresourced} ${unresourced === 1 ? "activity is" : "activities are"} unresourced — earned-value and man-hour figures for this phase are less reliable until they are loaded.`);
  }

  // ── Opportunities (with justification) ──
  if (p.spi > 1.05) {
    opps.push(`Running ahead at SPI ${p.spi.toFixed(2)} — the phase is earning value faster than planned, so successor work could be pulled forward to bank programme time.`);
  }
  if (isFinite(minFloat) && minFloat > 20 && !neg.length && p.done < p.total) {
    opps.push(`Comfortable float (minimum ${minFloat.toFixed(0)}d across open work) — crews or plant here could be re-deployed to critical phases with no risk to this one.`);
  }
  if (cpi != null && cpi > 1.05) {
    opps.push(`Cost under-running at CPI ${cpi.toFixed(2)} — a saving of ${money(p.earned - p.actual)} banked so far that could offset pressure elsewhere.`);
  }
  if (slip < -5) {
    opps.push(`Forecast finishing ${-slip}d early — genuine schedule contingency that de-risks the wider programme if protected.`);
  }
  if (p.total > 0 && p.done === p.total) {
    opps.push(`Phase delivered (${p.total}/${p.total} complete) — release its resources to live fronts and capture lessons learned for similar scope.`);
  } else if (p.pctComplete >= 80) {
    opps.push(`At ${fmtPct(p.pctComplete)} complete the phase is nearing handover — front-loading QA and close-out now locks in an on-time finish.`);
  }

  if (!risks.length) risks.push(p.done === p.total ? "No open risks — the phase is delivered." : "No material schedule, cost or logic risks are flagged for this phase.");
  if (!opps.length) opps.push("No specific upside beyond steady delivery — hold the current plan and resourcing.");
  return { risks: risks.slice(0, 4), opps: opps.slice(0, 3) };
}

const STOPWORDS = new Set("the a an and or of to for in on at by with from into no.  rev revision phase area unit sub package works work activity item detail general misc other".split(/\s+/));
// Frequent, meaningful tokens across a set of activities → rule suggestions
function suggestTerms(rows, limit = 10) {
  const freq = {};
  rows.forEach((r) => {
    (r.name + " " + r.wbs).toLowerCase().split(/[^a-z0-9&]+/).forEach((w) => {
      if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) return;
      freq[w] = (freq[w] || 0) + 1;
    });
  });
  return Object.entries(freq).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

const SERIES = [
  { key: "budget", label: "Planned (BAC)", color: "var(--capri-300)" },
  { key: "earned", label: "Earned (BCWP)", color: "var(--brand-primary)" },
  { key: "actual", label: "Actual (ACWP)", color: "var(--success)" },
];

const RULES_KEY = "pyramid.phaseRules";
const loadRules = () => {
  try { return JSON.parse(localStorage.getItem(RULES_KEY)) || []; } catch { return []; }
};

export default function Phase({ a }) {
  const { model } = a;
  const cur = model.project.currency;
  const [applied, setApplied] = useState(FILTER_DEFAULTS);
  const [rules, setRules] = useState(loadRules);
  const [draftTerm, setDraftTerm] = useState("");
  const [draftPhase, setDraftPhase] = useState("Construction");

  // keep the engine's rule set in sync before the memo recomputes
  setPhaseRules(rules);
  const saveRules = (next) => {
    setRules(next);
    setPhaseRules(next);
    try { localStorage.setItem(RULES_KEY, JSON.stringify(next)); } catch {}
  };
  const addRule = () => {
    const term = draftTerm.trim();
    if (!term) return;
    saveRules([...rules.filter((r) => r.term.toLowerCase() !== term.toLowerCase()), { term, phase: draftPhase }]);
    setDraftTerm("");
  };
  const removeRule = (term) => saveRules(rules.filter((r) => r.term !== term));

  const fmt = (v) => (model.hasCost ? fmtMoneyShort(v, cur) : Math.round(v) + "d");

  const phases = useMemo(
    () =>
      computePhaseAnalysis(model, {
        activityFilter: makeActivityFilter(applied),
        resourceType: applied.resourceType,
      }),
    [model, applied, rules]
  );

  const groups = phases.map((p) => ({ label: p.name, values: [p.budget, p.earned, p.actual] }));
  const highRisk = phases.filter((p) => p.floatRisk === "High").length;

  // full activity objects grouped by phase — feeds the risk/opportunity narrative
  const actsByPhase = useMemo(() => {
    const flt = makeActivityFilter(applied);
    const by = {};
    model.activities.forEach((a) => {
      if (!flt(a)) return;
      const ph = phaseInfoOf(a).phase;
      (by[ph] = by[ph] || []).push(a);
    });
    return by;
  }, [model, applied, rules]);
  const money = (v) => (model.hasCost ? fmtMoneyShort(v, cur) : Math.round(v) + "d");

  // source rollup across the visible phases
  const src = phases.reduce(
    (s, p) => ({
      wbs: s.wbs + p.src.wbs, name: s.name + p.src.name, custom: s.custom + p.src.custom,
      other: s.other + p.src.other, upload: s.upload + (p.src.upload || 0),
    }),
    { wbs: 0, name: 0, custom: 0, other: 0, upload: 0 }
  );
  const totalActs = src.wbs + src.name + src.custom + src.other + src.upload;

  const phaseOptions = [...new Set([...STD_PHASES, ...phases.map((p) => p.name)])];

  // ── Activity review — group the filtered activities by source/phase ──
  const [reviewKey, setReviewKey] = useState("other");
  const buckets = useMemo(() => {
    const flt = makeActivityFilter(applied);
    const rows = model.activities
      .filter((x) => flt(x))
      .map((x) => {
        const info = phaseInfoOf(x);
        return { code: x.code, name: x.name, wbs: x.wbsFull || x.wbs, phase: info.phase, source: info.source };
      });
    const by = { other: [], name: [], custom: [], wbs: [] };
    rows.forEach((r) => by[r.source] && by[r.source].push(r));
    const byPhase = {};
    rows.forEach((r) => (byPhase[r.phase] = byPhase[r.phase] || []).push(r));
    return { other: by.other, name: by.name, byPhase };
  }, [model, applied, rules]);

  // default the reviewer to whatever most needs attention
  const activeReview =
    reviewKey === "other" ? buckets.other
    : reviewKey === "name" ? buckets.name
    : buckets.byPhase[reviewKey] || [];
  const reviewChips = [
    ["other", `Uncategorised (${buckets.other.length})`, "danger"],
    ["name", `AI-inferred (${buckets.name.length})`, "warning"],
    ...phases.map((p) => [p.name, `${p.name} (${p.total})`, "neutral"]),
  ];
  const suggestions = (reviewKey === "other" || reviewKey === "name") ? suggestTerms(activeReview) : [];
  const distinctWbs = [...new Set(activeReview.map((r) => r.wbs).filter(Boolean))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <FilterBar model={model} applied={applied} onApply={setApplied} />

      {/* Categorisation note — flags AI-inferred / uncategorised phases */}
      {(src.name > 0 || src.other > 0) && (
        <div style={S.note}>
          <Icon.sparkle size={16} fill="var(--warning-ink)" />
          <span className="body-2" style={{ color: "var(--fg-3)" }}>
            {src.name > 0 && (
              <><strong>{src.name}</strong> activit{src.name === 1 ? "y" : "ies"} had no phase in the WBS and {src.name === 1 ? "was" : "were"} <strong>AI-categorised from {src.name === 1 ? "its" : "their"} name</strong>. </>
            )}
            {src.other > 0 && (
              <><strong>{src.other}</strong> could not be categorised (<em>Other</em>). </>
            )}
            {src.custom > 0 && (
              <><strong>{src.custom}</strong> set by your key-term rules. </>
            )}
            {src.upload > 0 && (
              <><strong>{src.upload}</strong> from your uploaded WBS mapping. </>
            )}
            Refine the mapping below.
          </span>
        </div>
      )}

      <div className="g-tiles">
        <KpiTile label="Phases" value={phases.length} sub="in selection" />
        <KpiTile label="AI-categorised" value={src.name} sub={`of ${totalActs} activities`} tone={src.name ? "warning" : "success"} />
        <KpiTile label="Uncategorised" value={src.other} sub="fell to “Other”" tone={src.other ? "danger" : "success"} />
      </div>

      {/* Grouped bar chart */}
      <div className="card card-pad">
        <SectionTitle icon={<Icon.bars size={18} />}>Planned vs Earned by Phase</SectionTitle>
        {groups.length === 0 ? <Empty /> : (
          <>
            <SeriesLegend items={SERIES} />
            <GroupedBarChart groups={groups} series={SERIES} fmt={fmt} valueAxisLabel={model.hasCost ? "Cost" : "Duration (days)"} />
          </>
        )}
      </div>

      {/* Phase summary table */}
      <div className="card">
        <div style={{ padding: "18px 20px 4px" }}>
          <SectionTitle icon={<Icon.grid size={18} />}>Phase Summary</SectionTitle>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Phase</th>
                <th>Source</th>
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
              {phases.map((p) => (
                <tr key={p.name}>
                  <td style={{ fontWeight: 600, color: "var(--fg-1)" }}>{p.name}</td>
                  <td><SourceBadge src={p.src} /></td>
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
              {phases.length === 0 && (
                <tr><td colSpan={10} className="muted" style={{ textAlign: "center", padding: 24 }}>No phases match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity review — inspect activities & their WBS to decide rules */}
      <div className="card card-pad">
        <SectionTitle icon={<Icon.search size={18} />} right={<span className="body-2 muted">{activeReview.length} activities · {distinctWbs.length} WBS paths</span>}>
          Activity Review
        </SectionTitle>
        <p className="body-2 muted" style={{ marginTop: -6, marginBottom: 14 }}>
          Inspect any bucket to see the underlying activities and their WBS — useful for spotting the key terms to map below. Start with <strong>Uncategorised</strong> and <strong>AI-inferred</strong>.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {reviewChips.map(([k, label, tone]) => {
            const active = k === reviewKey;
            const t = { danger: "var(--danger)", warning: "var(--warning)", neutral: "var(--fg-4)" }[tone];
            return (
              <button key={k} onClick={() => setReviewKey(k)}
                style={{
                  border: `1px solid ${active ? "var(--brand-primary)" : "var(--border-1)"}`,
                  background: active ? "var(--brand-200)" : "var(--bg-app)",
                  color: active ? "var(--brand-primary)" : "var(--fg-3)",
                  borderRadius: 9999, padding: "6px 13px", cursor: "pointer",
                  font: "500 13px var(--font-sans)", display: "inline-flex", alignItems: "center", gap: 7,
                }}>
                <span style={{ width: 7, height: 7, borderRadius: 9999, background: t }} />
                {label}
              </button>
            );
          })}
        </div>

        {suggestions.length > 0 && (
          <div style={{ background: "var(--bg-tint)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
            <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>Common terms — click to draft a rule</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {suggestions.map(([term, n]) => (
                <button key={term} onClick={() => setDraftTerm(term)}
                  style={{ border: "1px solid var(--border-1)", background: "var(--bg-app)", borderRadius: 9999, padding: "5px 11px", cursor: "pointer", font: "500 12.5px var(--font-sans)", color: "var(--fg-3)", display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <span className="mono">{term}</span>
                  <span className="muted" style={{ fontSize: 11 }}>×{n}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeReview.length === 0 ? (
          <div style={{ textAlign: "center", padding: 28, color: "var(--fg-4)" }}>
            <Icon.check size={22} stroke="var(--success-ink)" />
            <div className="body-2" style={{ marginTop: 8 }}>
              {reviewKey === "other" ? "Nothing uncategorised — every activity mapped to a phase." : "No activities in this bucket."}
            </div>
          </div>
        ) : (
          <div style={{ overflow: "auto", maxHeight: 340, border: "1px solid var(--border-1)", borderRadius: 12 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ position: "sticky", top: 0, background: "var(--bg-app)" }}>Act ID</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--bg-app)" }}>Activity</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--bg-app)" }}>WBS path</th>
                </tr>
              </thead>
              <tbody>
                {activeReview.slice(0, 200).map((r, i) => (
                  <tr key={r.code + i}>
                    <td className="mono" style={{ color: "var(--brand-primary)", fontWeight: 500, whiteSpace: "nowrap" }}>{r.code}</td>
                    <td style={{ fontWeight: 500, color: "var(--fg-1)" }}>{r.name}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{r.wbs || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {activeReview.length > 200 && (
              <div className="body-2 muted" style={{ padding: "10px 14px", borderTop: "1px solid var(--border-1)" }}>
                Showing first 200 of {activeReview.length}.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recategorise by key term */}
      <div className="card card-pad">
        <SectionTitle icon={<Icon.sliders size={18} />}>Recategorise by Key Term</SectionTitle>
        <p className="body-2 muted" style={{ marginTop: -6, marginBottom: 14 }}>
          Map any activity/WBS keyword to a phase. Rules take priority over the AI guess and the WBS, are matched case-insensitively, and are saved on this device.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 220px" }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>Key term</span>
            <input value={draftTerm} onChange={(e) => setDraftTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRule()}
              placeholder="e.g. procure, casting, IFC…" style={S.input} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>Assign to phase</span>
            <select value={draftPhase} onChange={(e) => setDraftPhase(e.target.value)} style={S.select}>
              {phaseOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={addRule} disabled={!draftTerm.trim()} style={{ height: 40 }}>
            <Icon.plus size={15} /> Add rule
          </button>
        </div>

        {rules.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {rules.map((r) => (
              <span key={r.term} style={S.ruleChip}>
                <span className="mono" style={{ fontSize: 12 }}>“{r.term}”</span>
                <Icon.route size={12} stroke="var(--fg-4)" />
                <span style={{ fontWeight: 600 }}>{r.phase}</span>
                <button onClick={() => removeRule(r.term)} style={S.ruleX} title="Remove rule">
                  <Icon.x size={12} stroke="var(--fg-4)" />
                </button>
              </span>
            ))}
            <button className="btn btn-ghost" onClick={() => saveRules([])} style={{ padding: "6px 12px", fontSize: 13 }}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* AI Phase Narrative — risks & opportunities per phase */}
      <AiCallout title="AI Phase Narrative">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {phases.map((p) => {
            const { risks, opps } = phaseNarrative(p, actsByPhase[p.name] || [], model.hasCost, money);
            const headTone = p.floatRisk === "High" ? "var(--danger-ink)" : p.spi < 0.95 ? "var(--warning-ink)" : "var(--success-ink)";
            return (
              <div key={p.name} style={{ borderTop: "1px solid var(--border-1)", paddingTop: 12 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <strong className="body-1" style={{ color: "var(--fg-1)" }}>{p.name}</strong>
                  <span className="body-2" style={{ color: headTone, fontWeight: 600 }}>
                    {fmtPct(p.pctComplete)} complete · {p.done}/{p.total} done · SPI {p.spi.toFixed(2)} · {p.floatRisk} float risk
                  </span>
                  {p.src.name > 0 && <em className="body-2 muted" style={{ fontSize: 12 }}>· {p.src.name} AI-categorised</em>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <NarrativeList title="Key risks" tone="danger" items={risks} icon={<Icon.alert size={13} stroke="var(--danger-ink)" />} />
                  <NarrativeList title="Opportunities" tone="success" items={opps} icon={<Icon.check size={13} stroke="var(--success-ink)" />} />
                </div>
              </div>
            );
          })}
          {phases.length === 0 && <div className="body-2 muted">No phases in the current selection.</div>}
        </div>
      </AiCallout>
    </div>
  );
}

function NarrativeList({ title, tone, items, icon }) {
  const dot = tone === "danger" ? "var(--danger)" : "var(--success)";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        {icon}
        <span className="eyebrow" style={{ fontSize: 10.5, color: tone === "danger" ? "var(--danger-ink)" : "var(--success-ink)" }}>{title}</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
        {items.map((t, i) => (
          <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ width: 6, height: 6, borderRadius: 9999, background: dot, marginTop: 6, flex: "0 0 6px" }} />
            <span className="body-2" style={{ color: "var(--fg-3)", fontSize: 12.5, lineHeight: 1.5 }}>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceBadge({ src }) {
  // dominant source decides the badge; mixed shows a breakdown title
  const entries = [
    ["upload", "Mapping", "info"],
    ["custom", "Rule", "info"],
    ["wbs", "WBS", "success"],
    ["name", "AI", "warning"],
    ["other", "Uncat.", "danger"],
  ];
  const dom = entries.map(([k]) => [k, src[k] || 0]).sort((a, b) => b[1] - a[1])[0];
  const meta = entries.find((e) => e[0] === dom[0]);
  const title = entries.filter(([k]) => src[k]).map(([k, l]) => `${l}: ${src[k]}`).join(" · ");
  const tones = { info: ["var(--info-bg)", "var(--info-ink)"], success: ["var(--success-bg)", "var(--success-ink)"], warning: ["var(--warning-bg)", "var(--warning-ink)"], danger: ["var(--danger-bg)", "var(--danger-ink)"] };
  const [bg, ink] = tones[meta[2]];
  const mixed = entries.filter(([k]) => src[k]).length > 1;
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: bg, color: ink, borderRadius: 9999, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>
      {meta[1]}{mixed ? " +" : ""}
    </span>
  );
}

function Empty() {
  return (
    <div style={{ textAlign: "center", padding: 48 }}>
      <Icon.bars size={26} stroke="var(--fg-5)" />
      <div className="subheading" style={{ marginTop: 12 }}>No data for this selection</div>
      <p className="body-2 muted" style={{ marginTop: 6 }}>Try widening the filters.</p>
    </div>
  );
}

const S = {
  note: {
    display: "flex", gap: 10, alignItems: "center",
    background: "var(--warning-bg)", border: "1px solid #FCE7C8",
    borderRadius: 12, padding: "12px 16px",
  },
  input: {
    height: 40, border: "1px solid var(--border-1)", borderRadius: "var(--r-lg)",
    padding: "0 12px", font: "400 14px var(--font-sans)", color: "var(--fg-1)", outline: "none",
  },
  select: {
    height: 40, border: "1px solid var(--border-1)", borderRadius: "var(--r-lg)",
    padding: "0 12px", font: "400 14px var(--font-sans)", color: "var(--fg-1)", outline: "none",
    background: "var(--bg-app)", cursor: "pointer",
  },
  ruleChip: {
    display: "inline-flex", alignItems: "center", gap: 7,
    background: "var(--bg-tint)", border: "1px solid var(--border-1)",
    borderRadius: 9999, padding: "6px 8px 6px 12px", fontSize: 13, color: "var(--fg-3)",
  },
  ruleX: {
    border: 0, background: "transparent", cursor: "pointer", display: "grid",
    placeItems: "center", padding: 2, borderRadius: 9999,
  },
};
