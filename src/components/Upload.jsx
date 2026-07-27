import { useState, useRef } from "react";
import { Icon } from "./Icons.jsx";
import logoWhite from "../assets/logo-white.svg";
import { setUploadPhaseMap, parseWbsMapping, mappingFromRows } from "../lib/curves.js";
import { readXlsxRows, isExcel } from "../lib/xlsx.js";

export default function Upload({ onFile, onDemo, error }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [wbsMap, setWbsMap] = useState(null);
  const [wbsName, setWbsName] = useState("");
  const [wbsError, setWbsError] = useState(null);
  const inputRef = useRef(null);
  const wbsRef = useRef(null);

  const handleWbs = async (file) => {
    if (!file) return;
    try {
      const map = isExcel(file)
        ? mappingFromRows(await readXlsxRows(await file.arrayBuffer()))
        : parseWbsMapping(await file.text());
      if (!map.count) {
        setWbsError("No mappings found — expected two columns: Activity ID (or WBS keyword) and Phase.");
        setWbsMap(null); setWbsName("");
        return;
      }
      setWbsMap(map); setWbsName(file.name); setWbsError(null);
    } catch (e) {
      setWbsError(e.message || "Could not read that file. Use a CSV or .xlsx with two columns.");
    }
  };
  const clearWbs = () => { setWbsMap(null); setWbsName(""); setWbsError(null); if (wbsRef.current) wbsRef.current.value = ""; };

  const handle = async (file) => {
    if (!file) return;
    setBusy(true);
    const text = await file.text();
    // apply the phase source: uploaded mapping, unless AI is chosen or none given
    setUploadPhaseMap(!useAI && wbsMap ? wbsMap : null);
    // let the paint flush before heavy parse
    setTimeout(() => {
      onFile(text, file.name);
      setBusy(false);
    }, 30);
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", width: "100%" }}>
      {/* Hero band — the signature Pyramid gradient */}
      <div style={S.hero} className="fade-up">
        <div style={{ position: "relative", zIndex: 2 }}>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,0.72)" }}>
            Pyramid AI · Construction Intelligence
          </div>
          <h1 className="h2" style={{ color: "#fff", marginTop: 10, fontSize: 30 }}>
            Schedule Intelligence for Primavera P6
          </h1>
          <p className="body-1" style={{ color: "rgba(255,255,255,0.86)", marginTop: 10, maxWidth: 520 }}>
            Drop a P6 <span className="mono">.XER</span> file and get EVMS, DCMA 14-Point quality,
            S-curves, resource histograms, float &amp; critical-path exposure and an auto-generated
            risk register — computed entirely in your browser.
          </p>
        </div>
        <img src={logoWhite} alt="" style={S.heroMark} />
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          handle(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          ...S.drop,
          borderColor: drag ? "var(--brand-primary)" : "var(--border-1)",
          background: drag ? "var(--brand-200)" : "var(--bg-wash)",
        }}
      >
        <input ref={inputRef} type="file" accept=".xer,.XER" hidden
          onChange={(e) => handle(e.target.files?.[0])} />
        <div style={S.dropIcon}>
          {busy ? (
            <span style={S.spinner} />
          ) : (
            <Icon.upload size={26} stroke="var(--brand-primary)" />
          )}
        </div>
        <div className="subheading" style={{ marginTop: 14 }}>
          {busy ? "Parsing schedule…" : "Drag & drop your .XER file"}
        </div>
        <div className="body-2 muted" style={{ marginTop: 6 }}>
          or click to browse · Supports Primavera P6 XER v6.0 – v23.x
        </div>
        <div style={{ marginTop: 20 }}>
          <button
            className="btn btn-primary"
            onClick={(e) => { e.stopPropagation(); onDemo(); }}
            style={{ padding: "10px 20px", height: 44 }}
          >
            <Icon.layers size={16} /> Load demo project
          </button>
        </div>
      </div>

      {error && (
        <div style={S.err}>
          <Icon.alert size={16} stroke="var(--danger-ink)" /> {error}
        </div>
      )}

      {/* Phase / WBS mapping */}
      <div style={S.wbsCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Icon.layers size={17} stroke="var(--brand-primary)" />
          <span className="subheading" style={{ fontSize: 15 }}>Phase / WBS mapping</span>
          <span className="body-2 muted" style={{ marginLeft: "auto", fontSize: 12 }}>optional</span>
        </div>
        <p className="body-2 muted" style={{ margin: "0 0 14px" }}>
          Upload a mapping so activities are grouped into the right phases — a CSV or Excel (.xlsx) file
          with two columns: <span className="mono">Activity ID</span> (or a WBS keyword) and <span className="mono">Phase</span>.
        </p>

        {/* AI bypass checkbox */}
        <label style={S.check} onClick={() => { const v = !useAI; setUseAI(v); if (v) clearWbs(); }}>
          <span style={{ ...S.box, ...(useAI ? S.boxOn : null) }}>
            {useAI && <Icon.check size={13} stroke="#fff" />}
          </span>
          <span>
            <span className="body-2" style={{ fontWeight: 600, color: "var(--fg-1)" }}>Let AI determine phases</span>
            <span className="body-2 muted" style={{ display: "block", fontSize: 12 }}>
              Skip the upload — phases are inferred from the WBS structure &amp; activity names.
            </span>
          </span>
        </label>

        {!useAI && (
          <div style={{ marginTop: 14 }}>
            {wbsName ? (
              <div style={S.wbsLoaded}>
                <Icon.file size={16} stroke="var(--success-ink)" />
                <span className="body-2" style={{ fontWeight: 600, flex: 1 }}>
                  {wbsName} <span className="muted" style={{ fontWeight: 400 }}>· {wbsMap.count} mappings</span>
                </span>
                <button onClick={clearWbs} style={S.wbsX} title="Remove"><Icon.x size={14} stroke="var(--fg-4)" /></button>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={() => wbsRef.current?.click()} style={{ height: 40 }}>
                <Icon.upload size={15} /> Upload WBS mapping (.csv / .xlsx)
              </button>
            )}
            <input ref={wbsRef} type="file" accept=".csv,.tsv,.txt,.xlsx" hidden
              onChange={(e) => handleWbs(e.target.files?.[0])} />
            {wbsError && (
              <div className="body-2" style={{ color: "var(--danger-ink)", marginTop: 8 }}>{wbsError}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  hero: {
    position: "relative", overflow: "hidden",
    background: "var(--brand-banner-gradient)", borderRadius: 24,
    padding: "30px 32px", marginBottom: 24, boxShadow: "var(--shadow-lg)",
  },
  heroMark: {
    position: "absolute", right: -20, top: "50%", transform: "translateY(-50%)",
    height: 150, opacity: 0.16, zIndex: 1,
  },
  drop: {
    border: "2px dashed var(--border-1)", borderRadius: 20, padding: "44px 24px",
    textAlign: "center", cursor: "pointer", transition: "all 180ms var(--ease-out)",
  },
  dropIcon: {
    width: 60, height: 60, borderRadius: 9999, background: "var(--brand-200)",
    display: "grid", placeItems: "center", margin: "0 auto",
  },
  spinner: {
    width: 24, height: 24, borderRadius: 9999,
    border: "3px solid var(--border-1)", borderTopColor: "var(--brand-primary)",
    display: "inline-block", animation: "spin 700ms linear infinite",
  },
  err: {
    marginTop: 16, display: "flex", alignItems: "center", gap: 8,
    background: "var(--danger-bg)", color: "var(--danger-ink)",
    padding: "12px 16px", borderRadius: 12, fontSize: 14, fontWeight: 500,
  },
  wbsCard: {
    marginTop: 16, border: "1px solid var(--border-1)", borderRadius: 16,
    padding: "18px 20px", background: "var(--bg-app)",
  },
  check: {
    display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", userSelect: "none",
  },
  box: {
    width: 20, height: 20, borderRadius: 6, border: "1.5px solid var(--border-2)",
    display: "grid", placeItems: "center", flex: "0 0 20px", marginTop: 1,
    transition: "all 120ms var(--ease-out)", background: "var(--bg-app)",
  },
  boxOn: { background: "var(--brand-primary)", borderColor: "var(--brand-primary)" },
  wbsLoaded: {
    display: "flex", alignItems: "center", gap: 10, background: "var(--success-bg)",
    borderRadius: 12, padding: "10px 14px",
  },
  wbsX: { border: 0, background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", padding: 2 },
  trust: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 28,
  },
  tick: {
    width: 24, height: 24, borderRadius: 9999, background: "var(--success-bg)",
    display: "grid", placeItems: "center", flex: "0 0 24px",
  },
};
