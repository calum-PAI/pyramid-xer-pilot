import { useState } from "react";
import { SectionTitle } from "../components/ui.jsx";
import { Icon } from "../components/Icons.jsx";
import { fmtDate } from "../lib/model.js";
import { getKey, setKey, clearKey, hasKey, maskKey, getModel, setModel, testKey, MODEL_OPTIONS } from "../lib/llm.js";

export default function Settings({ a, onExport }) {
  const { model, evms, dcma, floatA } = a;

  const downloadActivitiesCSV = () => {
    // Cost columns are only included when the schedule is actually cost-loaded.
    const head = ["Act ID", "Name", "WBS", "Status", "% Complete", "Start", "Finish", "Total Float (d)", "Critical",
      ...(model.hasCost ? ["Budget", "Actual Cost"] : [])];
    const rows = model.activities.map((t) => [
      t.code, t.name, t.wbs, t.statusLabel, t.pctComplete,
      t.start ? fmtDate(t.start) : "", t.finish ? fmtDate(t.finish) : "",
      t.totalFloat.toFixed(1), t.critical ? "Y" : "N",
      ...(model.hasCost ? [Math.round(t.budget), Math.round(t.actualCost)] : []),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    download(`${model.project.shortName}-activities.csv`, csv, "text/csv");
  };

  const downloadSummaryJSON = () => {
    const summary = {
      project: model.project.name,
      dataDate: fmtDate(model.project.dataDate),
      costLoaded: model.hasCost,
      counts: model.counts,
      // EVM: cost indices only when cost-loaded; otherwise schedule metrics only
      evms: model.hasCost
        ? { SPI: +evms.SPI.toFixed(3), CPI: +evms.CPI.toFixed(3), BAC: Math.round(evms.BAC), EAC: Math.round(evms.EAC), VAC: Math.round(evms.VAC) }
        : { SPI: +evms.SPI.toFixed(3), pctPlanned: +(evms.pctPlanned * 100).toFixed(1), pctComplete: +((model.counts.complete / model.counts.activities) * 100).toFixed(1), note: "Not cost-loaded — earned value (EV) omitted; cost metrics require cost/rate loading" },
      dcma: { score: `${dcma.passed}/${dcma.total}`, rating: dcma.rating, cpli: +dcma.cpli.toFixed(2), bei: +dcma.bei.toFixed(2) },
      float: floatA.counts,
      risks: a.risks.map((r) => ({ id: r.id, title: r.title, severity: r.severity, score: r.score })),
    };
    download(`${model.project.shortName}-summary.json`, JSON.stringify(summary, null, 2), "application/json");
  };

  const cards = [
    { icon: Icon.download, title: "Export PDF report", desc: "Print-ready intelligence report with every section.", action: onExport, label: "Print / Save PDF", primary: true },
    { icon: Icon.file, title: "Activities (CSV)", desc: "Full activity list with float, status and cost for Excel.", action: downloadActivitiesCSV, label: "Download CSV" },
    { icon: Icon.grid, title: "Summary (JSON)", desc: "Machine-readable KPI + risk digest for integrations.", action: downloadSummaryJSON, label: "Download JSON" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card card-pad">
        <SectionTitle icon={<Icon.download size={18} />}>Export</SectionTitle>
        <div className="g-tiles">
          {cards.map((c) => (
            <div key={c.title} style={{ border: "1px solid var(--border-1)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--brand-200)", display: "grid", placeItems: "center" }}>
                <c.icon size={19} stroke="var(--brand-primary)" />
              </span>
              <div className="body-1" style={{ fontWeight: 600 }}>{c.title}</div>
              <div className="body-2 muted" style={{ flex: 1 }}>{c.desc}</div>
              <button className={`btn ${c.primary ? "btn-primary" : "btn-secondary"}`} onClick={c.action}>
                <c.icon size={15} /> {c.label}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <SectionTitle icon={<Icon.settings size={18} />}>Schedule Metadata</SectionTitle>
        <div className="g-tiles">
          {[
            ["Project", model.project.name],
            ["Schedule version", model.project.shortName],
            ["XER version", model.project.version || "—"],
            ["Currency", model.project.currency],
            ["Data date", fmtDate(model.project.dataDate)],
            ["Plan start", fmtDate(model.project.planStart)],
            ["Planned finish", fmtDate(model.project.planFinish)],
            ["Activities", model.counts.activities],
            ["Relationships", model.counts.relationships],
            ["Resources", model.counts.resources],
            ["Milestones", model.counts.milestones],
            ["Cost loaded", model.hasCost ? "Yes" : "No"],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="eyebrow" style={{ fontSize: 10 }}>{k}</div>
              <div className="body-1" style={{ fontWeight: 600, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <AiSettings />

      <div className="card card-pad" style={{ background: "var(--bg-tint)", border: "none" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Icon.shield size={18} stroke="var(--brand-primary)" />
          <span className="body-2" style={{ color: "var(--fg-3)" }}>
            <strong>100% private.</strong> Your XER is parsed and analysed entirely in your browser — no file is ever uploaded to a server.
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Bring-your-own-key AI settings ───────────────────────────
function AiSettings() {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(hasKey());
  const [modelSel, setModelSel] = useState(getModel());
  const [status, setStatus] = useState(null); // { tone, text }
  const [testing, setTesting] = useState(false);

  const save = () => {
    const k = draft.trim();
    if (!/^sk-/.test(k)) { setStatus({ tone: "danger", text: "That doesn't look like an OpenAI key (should start with “sk-”)." }); return; }
    setKey(k);
    setSaved(true);
    setDraft("");
    setStatus({ tone: "success", text: "Key saved to this browser. The assistant is now in AI mode." });
  };
  const remove = () => { clearKey(); setSaved(false); setStatus({ tone: "neutral", text: "Key removed. The assistant is back to the built-in engine." }); };
  const chooseModel = (m) => { setModelSel(m); setModel(m); };
  const runTest = async () => {
    setTesting(true); setStatus(null);
    try {
      const ok = await testKey();
      setStatus(ok ? { tone: "success", text: "Connected to OpenAI successfully." } : { tone: "warning", text: "Unexpected response from OpenAI." });
    } catch (e) {
      setStatus({ tone: "danger", text: `Could not reach OpenAI: ${e.message}` });
    } finally { setTesting(false); }
  };

  const tone = { success: "var(--success-ink)", danger: "var(--danger-ink)", warning: "var(--warning-ink)", neutral: "var(--fg-4)" };

  return (
    <div className="card card-pad">
      <SectionTitle icon={<Icon.sparkle size={18} />} right={
        <span className="body-2" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: saved ? "var(--success-ink)" : "var(--fg-4)" }}>
          <span style={{ width: 7, height: 7, borderRadius: 9999, background: saved ? "var(--success)" : "var(--fg-5)" }} />
          {saved ? "AI mode active" : "Built-in engine"}
        </span>
      }>
        AI Analyst (OpenAI)
      </SectionTitle>
      <p className="body-2 muted" style={{ marginTop: -6, marginBottom: 14 }}>
        Add your own OpenAI API key to have the assistant and narratives answered by a live model. The key is stored <strong>only in this browser</strong> and sent directly to OpenAI — it is never bundled into the app, shared, or seen by anyone else.
      </p>

      {saved ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--success-bg)", color: "var(--success-ink)", borderRadius: 10, padding: "9px 13px", fontWeight: 600, fontSize: 13 }}>
            <Icon.check size={15} stroke="var(--success-ink)" /> Key set · <span className="mono">{maskKey()}</span>
          </span>
          <button className="btn btn-secondary" onClick={runTest} disabled={testing} style={{ height: 40 }}>
            {testing ? "Testing…" : "Test connection"}
          </button>
          <button className="btn btn-ghost" onClick={remove} style={{ height: 40 }}>Remove key</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="password" autoComplete="off" value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="sk-…  (your OpenAI API key)"
            style={{ flex: "1 1 320px", height: 40, border: "1px solid var(--border-1)", borderRadius: "var(--r-lg)", padding: "0 13px", font: "400 13.5px var(--font-mono)", color: "var(--fg-1)", outline: "none", background: "var(--bg-wash)" }}
          />
          <button className="btn btn-primary" onClick={save} disabled={!draft.trim()} style={{ height: 40 }}>Save key</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
        <span className="eyebrow" style={{ fontSize: 10 }}>Model</span>
        <select value={modelSel} onChange={(e) => chooseModel(e.target.value)}
          style={{ height: 36, border: "1px solid var(--border-1)", borderRadius: "var(--r-lg)", padding: "0 10px", font: "400 13px var(--font-sans)", color: "var(--fg-1)", background: "var(--bg-app)", cursor: "pointer" }}>
          {MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {status && (
        <div className="body-2" style={{ marginTop: 12, color: tone[status.tone] || "var(--fg-3)", fontWeight: 500 }}>{status.text}</div>
      )}

      <div style={{ marginTop: 14, display: "flex", gap: 9, alignItems: "flex-start", background: "var(--warning-bg)", border: "1px solid #FCE7C8", borderRadius: 12, padding: "11px 14px" }}>
        <Icon.alert size={16} stroke="var(--warning-ink)" />
        <span className="body-2" style={{ color: "var(--fg-3)", fontSize: 12.5, lineHeight: 1.5 }}>
          Your browser calls OpenAI directly, so anyone with access to this device/browser could read the stored key — only use a key you control, and remove it on shared machines. Calls are blocked inside the claude.ai preview (its sandbox forbids external requests); AI mode works when the app is run locally or self-hosted, and falls back to the built-in engine otherwise.
        </span>
      </div>
    </div>
  );
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
