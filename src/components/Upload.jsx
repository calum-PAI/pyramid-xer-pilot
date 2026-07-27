import { useState, useRef } from "react";
import { Icon } from "./Icons.jsx";
import logoWhite from "../assets/logo-white.svg";
import { setUploadPhaseMap, parseWbsMapping, mappingFromRows } from "../lib/curves.js";
import { readXlsxRows, isExcel } from "../lib/xlsx.js";
import { getKey, setKey, clearKey, hasKey, maskKey, testKey, getModel, setModel, MODEL_OPTIONS } from "../lib/llm.js";

export default function Upload({ onFile, onDemo, error }) {
  // Step 1 — the .XER file (selected, NOT processed until Step 4)
  const [drag, setDrag] = useState(false);
  const [xerFile, setXerFile] = useState(null);
  const [xerError, setXerError] = useState(null);
  const xerRef = useRef(null);

  // Step 2 — mapping method
  const [mapMethod, setMapMethod] = useState(null); // "upload" | "ai"
  const [wbsMap, setWbsMap] = useState(null);
  const [wbsName, setWbsName] = useState("");
  const [wbsError, setWbsError] = useState(null);
  const wbsRef = useRef(null);

  // Step 3 — AI API key
  const [keyDraft, setKeyDraft] = useState("");
  const [keySaved, setKeySaved] = useState(hasKey());
  const [aiSkipped, setAiSkipped] = useState(false);
  const [modelSel, setModelSel] = useState(getModel());
  const [conn, setConn] = useState(hasKey() ? { tone: "neutral", text: "Key saved — not yet tested" } : null);
  const [testing, setTesting] = useState(false);

  // Step 4
  const [processing, setProcessing] = useState(false);

  // ── Step 1 handlers ──
  const selectXer = (file) => {
    if (!file) return;
    if (!/\.xer$/i.test(file.name)) { setXerError("That doesn't look like a Primavera P6 .XER export."); return; }
    setXerFile(file); setXerError(null);
  };
  const removeXer = () => { setXerFile(null); setXerError(null); if (xerRef.current) xerRef.current.value = ""; };

  // ── Step 2 handlers ──
  const chooseMethod = (m) => { setMapMethod(m); if (m === "ai") clearWbs(); };
  const handleWbs = async (file) => {
    if (!file) return;
    try {
      const map = isExcel(file)
        ? mappingFromRows(await readXlsxRows(await file.arrayBuffer()))
        : parseWbsMapping(await file.text());
      if (!map.count) { setWbsError("No mappings found — expected two columns: Activity ID (or WBS keyword) and Phase."); setWbsMap(null); setWbsName(""); return; }
      setWbsMap(map); setWbsName(file.name); setWbsError(null);
    } catch (e) { setWbsError(e.message || "Could not read that file. Use a CSV or .xlsx with two columns."); }
  };
  const clearWbs = () => { setWbsMap(null); setWbsName(""); setWbsError(null); if (wbsRef.current) wbsRef.current.value = ""; };

  // ── Step 3 handlers ──
  const saveKey = () => {
    const k = keyDraft.trim();
    if (!/^sk-/.test(k)) { setConn({ tone: "danger", text: "That doesn't look like an OpenAI key (should start with “sk-”)." }); return; }
    setKey(k); setKeySaved(true); setAiSkipped(false); setKeyDraft("");
    setConn({ tone: "neutral", text: "Key saved — test the connection to confirm it works." });
  };
  const removeKey = () => { clearKey(); setKeySaved(false); setConn(null); };
  const runTest = async () => {
    setTesting(true);
    try { const ok = await testKey(); setConn(ok ? { tone: "success", text: "Connected to OpenAI." } : { tone: "warning", text: "Unexpected response from OpenAI." }); }
    catch (e) { setConn({ tone: "danger", text: `Could not reach OpenAI: ${e.message}` }); }
    finally { setTesting(false); }
  };
  const chooseModel = (m) => { setModelSel(m); setModel(m); };
  const skipAi = () => { setAiSkipped(true); };

  // ── Step 4 ──
  const step1done = !!xerFile;
  const step2done = mapMethod === "ai" || (mapMethod === "upload" && !!wbsMap);
  const step3done = keySaved || aiSkipped;
  const canProcess = step1done && step2done && step3done;

  const process = async () => {
    if (!canProcess || processing) return;
    setProcessing(true);
    const text = await xerFile.text();
    setUploadPhaseMap(mapMethod === "upload" && wbsMap ? wbsMap : null);
    setTimeout(() => { onFile(text, xerFile.name); setProcessing(false); }, 30);
  };

  const connColor = { success: "var(--success-ink)", danger: "var(--danger-ink)", warning: "var(--warning-ink)", neutral: "var(--fg-4)" };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", width: "100%" }}>
      {/* Hero */}
      <div style={S.hero} className="fade-up">
        <div style={{ position: "relative", zIndex: 2 }}>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,0.72)" }}>Pyramid AI · Construction Intelligence</div>
          <h1 className="h2" style={{ color: "#fff", marginTop: 10, fontSize: 30 }}>Schedule Intelligence for Primavera P6</h1>
          <p className="body-1" style={{ color: "rgba(255,255,255,0.86)", marginTop: 10, maxWidth: 520 }}>
            Set up your analysis in three quick steps below, then process your programme — EVMS, DCMA quality,
            S-curves, float, phase &amp; discipline analysis and more, computed entirely in your browser.
          </p>
          <button className="btn" onClick={onDemo} style={S.demoBtn}>
            <Icon.layers size={16} /> Load demo project
          </button>
          <span className="body-2" style={{ color: "rgba(255,255,255,0.7)", marginLeft: 12, fontSize: 12.5 }}>
            skips setup — opens sample data straight away
          </span>
        </div>
        <img src={logoWhite} alt="" style={S.heroMark} />
      </div>

      {error && <div style={S.err}><Icon.alert size={16} stroke="var(--danger-ink)" /> {error}</div>}

      {/* ── STEP 1 — Upload XER ── */}
      <Step n={1} done={step1done} title="Upload XER file"
        desc="Drag &amp; drop your Primavera P6 .XER export, or click to browse. It won't be processed until you finish the steps below.">
        {xerFile ? (
          <div style={S.loaded}>
            <Icon.file size={16} stroke="var(--success-ink)" />
            <span className="body-2" style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {xerFile.name} <span className="muted" style={{ fontWeight: 400 }}>· {(xerFile.size / 1024).toFixed(0)} KB</span>
            </span>
            <button onClick={removeXer} style={S.xBtn} title="Remove"><Icon.x size={14} stroke="var(--fg-4)" /></button>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); selectXer(e.dataTransfer.files?.[0]); }}
            onClick={() => xerRef.current?.click()}
            style={{ ...S.drop, borderColor: drag ? "var(--brand-primary)" : "var(--border-1)", background: drag ? "var(--brand-200)" : "var(--bg-wash)" }}
          >
            <input ref={xerRef} type="file" accept=".xer,.XER" hidden onChange={(e) => selectXer(e.target.files?.[0])} />
            <div style={S.dropIcon}><Icon.upload size={24} stroke="var(--brand-primary)" /></div>
            <div className="subheading" style={{ marginTop: 12 }}>Drag &amp; drop your .XER file</div>
            <div className="body-2 muted" style={{ marginTop: 6 }}>or click to browse · Supports P6 XER v6.0 – v23.x</div>
          </div>
        )}
        {xerError && <div className="body-2" style={{ color: "var(--danger-ink)", marginTop: 10 }}>{xerError}</div>}
      </Step>

      {/* ── STEP 2 — Mapping method ── */}
      <Step n={2} done={step2done} dim={!step1done} title="Select phase / WBS mapping method"
        desc="Choose how activities are grouped into phases.">
        <div style={S.optGrid}>
          <OptionTile
            active={mapMethod === "upload"} onClick={() => chooseMethod("upload")}
            icon={<Icon.upload size={17} />} title="Upload WBS mapping"
            desc="Provide a CSV/Excel file mapping Activity ID (or WBS keyword) → Phase." />
          <OptionTile
            active={mapMethod === "ai"} onClick={() => chooseMethod("ai")}
            icon={<Icon.sparkle size={17} />} title="Let AI determine phases"
            desc="Phases are inferred automatically from your WBS structure & activity names." />
        </div>

        {mapMethod === "upload" && (
          <div style={{ marginTop: 14 }}>
            {wbsName ? (
              <div style={S.loaded}>
                <Icon.file size={16} stroke="var(--success-ink)" />
                <span className="body-2" style={{ fontWeight: 600, flex: 1 }}>{wbsName} <span className="muted" style={{ fontWeight: 400 }}>· {wbsMap.count} mappings</span></span>
                <button onClick={clearWbs} style={S.xBtn} title="Remove"><Icon.x size={14} stroke="var(--fg-4)" /></button>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={() => wbsRef.current?.click()} style={{ height: 40 }}>
                <Icon.upload size={15} /> Upload WBS mapping (.csv / .xlsx)
              </button>
            )}
            <input ref={wbsRef} type="file" accept=".csv,.tsv,.txt,.xlsx" hidden onChange={(e) => handleWbs(e.target.files?.[0])} />
            {wbsError && <div className="body-2" style={{ color: "var(--danger-ink)", marginTop: 8 }}>{wbsError}</div>}
          </div>
        )}
      </Step>

      {/* ── STEP 3 — AI API key ── */}
      <Step n={3} done={step3done} dim={!step1done} title="Enter AI API key"
        desc="Add your own OpenAI key for live-AI answers, or skip it. The key is stored only in this browser.">
        {keySaved ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={S.keyChip}><Icon.check size={14} stroke="var(--success-ink)" /> Key set · <span className="mono">{maskKey()}</span></span>
            <button className="btn btn-secondary" onClick={runTest} disabled={testing} style={{ height: 38 }}>{testing ? "Testing…" : "Test connection"}</button>
            <button className="btn btn-ghost" onClick={removeKey} style={{ height: 38 }}>Remove key</button>
          </div>
        ) : aiSkipped ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ ...S.keyChip, background: "var(--bg-mute)", color: "var(--fg-3)" }}><Icon.check size={14} stroke="var(--fg-4)" /> Continuing without an AI key</span>
            <button className="btn btn-ghost" onClick={() => setAiSkipped(false)} style={{ height: 38 }}>Add a key instead</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveKey()} placeholder="sk-…  (your OpenAI API key)"
                style={{ ...S.input, flex: "1 1 300px", fontFamily: "var(--font-mono)" }} />
              <button className="btn btn-primary" onClick={saveKey} disabled={!keyDraft.trim()} style={{ height: 40 }}>Save key</button>
              <button className="btn btn-ghost" onClick={skipAi} style={{ height: 40 }}>Skip — no AI key</button>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
              <span className="eyebrow" style={{ fontSize: 10 }}>Model</span>
              <select value={modelSel} onChange={(e) => chooseModel(e.target.value)} style={{ ...S.input, height: 34, cursor: "pointer", background: "var(--bg-app)" }}>
                {MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </>
        )}

        {/* API connection status */}
        {conn && (
          <div className="body-2" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 7, color: connColor[conn.tone] || "var(--fg-3)", fontWeight: 500 }}>
            <span style={{ width: 7, height: 7, borderRadius: 9999, background: conn.tone === "success" ? "var(--success)" : conn.tone === "danger" ? "var(--danger)" : conn.tone === "warning" ? "var(--warning)" : "var(--fg-5)" }} />
            {conn.text}
          </div>
        )}

        <div style={S.aiNote}>
          <Icon.sparkle size={15} fill="var(--brand-primary)" />
          <span className="body-2" style={{ color: "var(--fg-3)", fontSize: 12.5, lineHeight: 1.5 }}>
            An API key is optional. Core analysis and many AI features — including the <strong>programme review letter</strong> and the on-screen narratives — are auto-generated by the built-in engine without a key. A key only adds free-form, live-model answers in the assistant and letter.
          </span>
        </div>
      </Step>

      {/* ── STEP 4 — Process ── */}
      <Step n={4} done={false} dim={!canProcess} title="Process schedule" last
        desc="When the steps above are complete, run the full analysis.">
        <button className="btn btn-primary" onClick={process} disabled={!canProcess || processing}
          style={{ height: 48, padding: "0 26px", fontSize: 15, opacity: canProcess && !processing ? 1 : 0.55 }}>
          {processing ? <><span style={S.spinner} /> Analysing…</> : <><Icon.activity size={17} /> Analyse schedule</>}
        </button>
        {!canProcess && (
          <div className="body-2 muted" style={{ marginTop: 10, fontSize: 12.5 }}>
            Complete{!step1done ? " Step 1 (upload a file)" : ""}{!step2done ? `${!step1done ? "," : ""} Step 2 (mapping method)` : ""}{!step3done ? `${!step1done || !step2done ? "," : ""} Step 3 (key or skip)` : ""} to enable processing.
          </div>
        )}
      </Step>
    </div>
  );
}

// ── Step wrapper ──
function Step({ n, title, desc, done, dim, last, children }) {
  return (
    <div style={{ ...S.step, opacity: dim ? 0.55 : 1, pointerEvents: dim ? "none" : "auto" }}>
      <div style={S.stepRail}>
        <div style={{ ...S.badge, ...(done ? S.badgeDone : null) }}>
          {done ? <Icon.check size={15} stroke="#fff" /> : n}
        </div>
        {!last && <div style={S.railLine} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 22 }}>
        <div className="subheading" style={{ fontSize: 15.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          {title}
          {done && <span style={S.donePill}>Done</span>}
        </div>
        <p className="body-2 muted" style={{ margin: "4px 0 12px", fontSize: 13 }} dangerouslySetInnerHTML={{ __html: desc }} />
        {children}
      </div>
    </div>
  );
}

function OptionTile({ active, onClick, icon, title, desc }) {
  return (
    <button onClick={onClick} style={{ ...S.optTile, borderColor: active ? "var(--brand-primary)" : "var(--border-1)", background: active ? "var(--brand-200)" : "var(--bg-app)", boxShadow: active ? "0 0 0 1px var(--brand-primary)" : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ color: active ? "var(--brand-primary)" : "var(--fg-3)" }}>{icon}</span>
        <span className="body-1" style={{ fontWeight: 700, fontSize: 14, color: active ? "var(--brand-primary)" : "var(--fg-1)" }}>{title}</span>
        <span style={{ ...S.radio, ...(active ? S.radioOn : null) }}>{active && <span style={S.radioDot} />}</span>
      </div>
      <div className="body-2 muted" style={{ marginTop: 7, fontSize: 12.5, lineHeight: 1.5, textAlign: "left" }}>{desc}</div>
    </button>
  );
}

const S = {
  hero: { position: "relative", overflow: "hidden", background: "var(--brand-banner-gradient)", borderRadius: 24, padding: "30px 32px", marginBottom: 24, boxShadow: "var(--shadow-lg)" },
  heroMark: { position: "absolute", right: -20, top: "50%", transform: "translateY(-50%)", height: 150, opacity: 0.16, zIndex: 1 },
  demoBtn: { marginTop: 18, height: 42, padding: "0 18px", background: "#fff", color: "var(--brand-primary)", fontWeight: 700 },
  err: { marginBottom: 16, display: "flex", alignItems: "center", gap: 8, background: "var(--danger-bg)", color: "var(--danger-ink)", padding: "12px 16px", borderRadius: 12, fontSize: 14, fontWeight: 500 },

  step: { display: "flex", gap: 16 },
  stepRail: { display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 34px" },
  badge: { width: 34, height: 34, borderRadius: 9999, border: "2px solid var(--brand-primary)", color: "var(--brand-primary)", display: "grid", placeItems: "center", font: "700 14px var(--font-sans)", flex: "0 0 34px", background: "var(--bg-app)" },
  badgeDone: { background: "var(--brand-primary)", borderColor: "var(--brand-primary)", color: "#fff" },
  railLine: { flex: 1, width: 2, background: "var(--border-1)", marginTop: 4, minHeight: 12 },
  donePill: { fontSize: 10.5, fontWeight: 700, color: "var(--success-ink)", background: "var(--success-bg)", borderRadius: 9999, padding: "2px 9px", textTransform: "uppercase", letterSpacing: "0.04em" },

  drop: { border: "2px dashed var(--border-1)", borderRadius: 16, padding: "34px 24px", textAlign: "center", cursor: "pointer", transition: "all 180ms var(--ease-out)" },
  dropIcon: { width: 54, height: 54, borderRadius: 9999, background: "var(--brand-200)", display: "grid", placeItems: "center", margin: "0 auto" },
  loaded: { display: "flex", alignItems: "center", gap: 10, background: "var(--success-bg)", borderRadius: 12, padding: "11px 14px" },
  xBtn: { border: 0, background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", padding: 2, flex: "0 0 auto" },

  optGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },
  optTile: { border: "1px solid var(--border-1)", borderRadius: 14, padding: "15px 16px", cursor: "pointer", textAlign: "left", transition: "all 140ms var(--ease-out)", display: "flex", flexDirection: "column" },
  radio: { marginLeft: "auto", width: 18, height: 18, borderRadius: 9999, border: "2px solid var(--border-2)", display: "grid", placeItems: "center", flex: "0 0 18px" },
  radioOn: { borderColor: "var(--brand-primary)" },
  radioDot: { width: 9, height: 9, borderRadius: 9999, background: "var(--brand-primary)" },

  input: { height: 40, border: "1px solid var(--border-1)", borderRadius: "var(--r-lg)", padding: "0 13px", font: "400 13.5px var(--font-sans)", color: "var(--fg-1)", outline: "none", background: "var(--bg-wash)" },
  keyChip: { display: "inline-flex", alignItems: "center", gap: 8, background: "var(--success-bg)", color: "var(--success-ink)", borderRadius: 10, padding: "9px 13px", fontWeight: 600, fontSize: 13 },
  aiNote: { marginTop: 14, display: "flex", gap: 9, alignItems: "flex-start", background: "var(--bg-tint)", border: "1px solid var(--border-1)", borderRadius: 12, padding: "11px 14px" },

  spinner: { width: 16, height: 16, borderRadius: 9999, border: "2.5px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", display: "inline-block", animation: "spin 700ms linear infinite", marginRight: 4, verticalAlign: "-2px" },
};
