import { useState, useEffect, useRef } from "react";
import { Icon } from "./Icons.jsx";
import {
  buildReviewLetter, letterToMarkdown, defaultMeta, STATUS_LABELS,
  LETTER_SYSTEM, buildLetterUserPrompt, REDRAFT_SYSTEM, buildRedraftPrompt,
  saveLetterDraft, loadLetterDraft, clearLetterDraft,
} from "../lib/reviewLetter.js";
import { hasKey, getModel, chatComplete, buildScheduleContext } from "../lib/llm.js";

export default function ReviewLetter({ a, onClose }) {
  // Restore a previously saved draft for this project, if any.
  const loadedRef = useRef();
  if (loadedRef.current === undefined) loadedRef.current = loadLetterDraft(a) || null;
  const loaded = loadedRef.current;
  const initMeta = loaded?.meta || defaultMeta(a);

  const [meta, setMeta] = useState(initMeta);
  const [letterMd, setLetterMd] = useState(() => loaded?.md || letterToMarkdown(buildReviewLetter(a, initMeta), initMeta));
  const [edited, setEdited] = useState(!!loaded); // a restored draft is treated as user-owned
  const [mode, setMode] = useState("preview");   // preview | edit
  const [sel, setSel] = useState(null);          // { start, end, text }
  const [instruction, setInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [redrafting, setRedrafting] = useState(false);
  const [note, setNote] = useState(loaded ? { tone: "neutral", text: "Restored your saved draft." } : null);
  const [savedAt, setSavedAt] = useState(loaded?.savedAt || null);
  const [savedSnap, setSavedSnap] = useState(loaded ? { md: loaded.md, meta: loaded.meta } : null);
  const taRef = useRef(null);
  const aiAvailable = hasKey();

  const dirty = !savedSnap || savedSnap.md !== letterMd || JSON.stringify(savedSnap.meta) !== JSON.stringify(meta);

  const save = () => {
    const ts = saveLetterDraft(a, { md: letterMd, meta });
    if (ts) { setSavedAt(ts); setSavedSnap({ md: letterMd, meta }); setNote({ tone: "success", text: "Letter saved to this browser." }); }
    else setNote({ tone: "danger", text: "Could not save — browser storage is unavailable." });
  };
  const clearSaved = () => {
    clearLetterDraft(a); setSavedAt(null); setSavedSnap(null);
    setNote({ tone: "neutral", text: "Saved draft cleared from this browser." });
  };

  // Auto-rebuild the built-in draft from the details form — but only while the
  // user hasn't started editing (or AI-drafted), so edits are never clobbered.
  useEffect(() => {
    if (edited) return;
    setLetterMd(letterToMarkdown(buildReviewLetter(a, meta), meta));
  }, [a, meta, edited]);

  // Ctrl/Cmd+S saves the letter.
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [letterMd, meta]);

  const requestClose = () => {
    if (edited && dirty && !window.confirm("You have unsaved changes to the letter. Close without saving?")) return;
    onClose();
  };

  const setField = (k) => (e) => setMeta((m) => ({ ...m, [k]: e.target.value }));

  const rebuild = () => { setEdited(false); setSel(null); setNote({ tone: "neutral", text: "Rebuilt the draft from the current details and data." }); };

  const draftAI = async () => {
    setAiBusy(true); setNote(null);
    try {
      const reply = await chatComplete({
        system: LETTER_SYSTEM,
        messages: [{ role: "user", content: buildLetterUserPrompt(meta, buildScheduleContext(a)) }],
        maxTokens: 1800,
      });
      setLetterMd(reply); setEdited(true); setSel(null);
      setNote({ tone: "success", text: `Full letter drafted by ${getModel()}.` });
    } catch (e) {
      setNote({ tone: "danger", text: `AI drafting failed (${e.message}). Built-in draft retained.` });
    } finally { setAiBusy(false); }
  };

  // ── selection capture ──
  const captureTextarea = () => {
    const ta = taRef.current; if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    if (e > s) setSel({ start: s, end: e, text: letterMd.slice(s, e) });
    else setSel(null);
  };
  const capturePreview = () => {
    const t = (window.getSelection && window.getSelection().toString()) || "";
    const trimmed = t.trim();
    if (!trimmed) { setSel(null); return; }
    const idx = letterMd.indexOf(trimmed);
    if (idx >= 0) setSel({ start: idx, end: idx + trimmed.length, text: trimmed });
    else setSel({ notFound: true, text: trimmed });
  };

  const redraft = async () => {
    if (!sel || sel.notFound || sel.start === sel.end) return;
    setRedrafting(true); setNote(null);
    try {
      const reply = await chatComplete({
        system: REDRAFT_SYSTEM,
        messages: [{ role: "user", content: buildRedraftPrompt(sel.text, instruction) }],
        maxTokens: 700,
      });
      const clean = reply.trim();
      const next = letterMd.slice(0, sel.start) + clean + letterMd.slice(sel.end);
      setLetterMd(next); setEdited(true);
      setSel(null); setInstruction("");
      setNote({ tone: "success", text: "Selection redrafted." });
    } catch (e) {
      setNote({ tone: "danger", text: `Redraft failed (${e.message}).` });
    } finally { setRedrafting(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(letterMd); setNote({ tone: "success", text: "Letter copied to clipboard." }); }
    catch { setNote({ tone: "danger", text: "Could not access the clipboard." }); }
  };
  const downloadMd = () => {
    const url = URL.createObjectURL(new Blob([letterMd], { type: "text/markdown" }));
    const el = document.createElement("a");
    el.href = url; el.download = `${a.model.project.shortName}-programme-review-letter.md`; el.click();
    URL.revokeObjectURL(url);
  };

  const noteColor = { success: "var(--success-ink)", danger: "var(--danger-ink)", warning: "var(--warning-ink)", neutral: "var(--fg-4)" };
  const hasSelection = sel && !sel.notFound && sel.start !== sel.end;

  return (
    <div className="report-root" style={S.root}>
      {/* Action bar */}
      <div className="no-print" style={S.actions}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Icon.mail size={17} stroke="var(--brand-primary)" />
          <span className="body-2" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Programme Review Letter</span>
          <span className="body-2 muted crumb-hide">· {meta.project}</span>
          <SaveStatus dirty={dirty} savedAt={savedAt} onClear={clearSaved} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={S.seg}>
            <button onClick={() => setMode("preview")} style={{ ...S.segBtn, ...(mode === "preview" ? S.segOn : null) }}>Preview</button>
            <button onClick={() => setMode("edit")} style={{ ...S.segBtn, ...(mode === "edit" ? S.segOn : null) }}>Edit</button>
          </div>
          {aiAvailable && (
            <button className="btn btn-secondary" onClick={draftAI} disabled={aiBusy} title="Draft the whole letter with OpenAI">
              <Icon.sparkle size={15} /> {aiBusy ? "Drafting…" : "Draft with AI"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={rebuild} title="Rebuild the draft from the data (discards edits)">Rebuild</button>
          <button className={"btn " + (dirty ? "btn-primary" : "btn-secondary")} onClick={save} title="Save this letter in your browser (Ctrl/Cmd+S)">
            <Icon.save size={15} /> {dirty ? "Save" : "Saved"}
          </button>
          <button className="btn btn-secondary" onClick={copy}><Icon.copy size={15} /> Copy</button>
          <button className="btn btn-secondary" onClick={downloadMd} title="Download as a Markdown file"><Icon.file size={15} /> Download</button>
          <button className="btn btn-secondary" onClick={() => window.print()} title="Print or save as PDF"><Icon.download size={15} /> Print / PDF</button>
          <button className="btn btn-ghost" onClick={requestClose}><Icon.x size={15} /> Close</button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "18px auto", padding: "0 16px 60px" }}>
        {/* Editable letter details */}
        <div className="no-print card card-pad" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Icon.sliders size={16} stroke="var(--brand-primary)" />
            <span className="subheading" style={{ fontSize: 14, fontWeight: 700 }}>Letter details</span>
            <span className="body-2 muted" style={{ marginLeft: "auto", fontSize: 12 }}>
              {edited ? "You've edited the letter — “Rebuild” to regenerate from these details." : "Changes here update the draft automatically."}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {[["contractor", "Contractor"], ["contractRef", "Contract reference"], ["programmeRef", "Programme reference"], ["dataDate", "Data date"], ["reviewer", "Reviewer name"], ["position", "Position"], ["org", "Organisation"], ["resubmitDays", "Resubmission (days)"]].map(([k, label]) => (
              <label key={k} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span className="eyebrow" style={{ fontSize: 10 }}>{label}</span>
                <input value={meta[k]} onChange={setField(k)} style={S.input} />
              </label>
            ))}
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span className="eyebrow" style={{ fontSize: 10 }}>Acceptance status</span>
              <select value={meta.acceptance} onChange={setField("acceptance")} style={{ ...S.input, cursor: "pointer" }}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* AI redraft bar — appears/activates when text is selected */}
        <div className="no-print" style={{ ...S.redraftBar, borderColor: hasSelection ? "var(--brand-primary)" : "var(--border-1)", background: hasSelection ? "var(--bg-tint)" : "var(--bg-app)" }}>
          <Icon.sparkle size={15} fill={hasSelection ? "var(--brand-primary)" : "var(--fg-5)"} />
          {!aiAvailable ? (
            <span className="body-2 muted" style={{ fontSize: 12.5 }}>Set an OpenAI key in Settings to redraft highlighted text with AI.</span>
          ) : sel && sel.notFound ? (
            <span className="body-2" style={{ fontSize: 12.5, color: "var(--warning-ink)" }}>Couldn't map that highlight to the source — switch to <strong>Edit</strong> and select there to redraft precisely.</span>
          ) : hasSelection ? (
            <>
              <span className="body-2" style={{ fontSize: 12.5, color: "var(--fg-2, var(--fg-1))", fontWeight: 600, whiteSpace: "nowrap" }}>{sel.text.length} chars selected</span>
              <input value={instruction} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => e.key === "Enter" && redraft()}
                placeholder="Optional: how should the AI redraft it? (e.g. firmer, more concise)"
                style={{ ...S.input, flex: 1, minWidth: 140 }} />
              <button className="btn btn-primary" onClick={redraft} disabled={redrafting} style={{ height: 38, whiteSpace: "nowrap" }}>
                <Icon.sparkle size={14} /> {redrafting ? "Redrafting…" : "Redraft selection"}
              </button>
            </>
          ) : (
            <span className="body-2 muted" style={{ fontSize: 12.5 }}>Highlight any text in the letter, then redraft just that part with AI.</span>
          )}
        </div>

        {note && <div className="no-print body-2" style={{ margin: "0 0 12px", color: noteColor[note.tone] || "var(--fg-3)", fontWeight: 500 }}>{note.text}</div>}

        {/* Letter */}
        <div style={S.letter}>
          {mode === "edit" ? (
            <textarea
              ref={taRef}
              value={letterMd}
              onChange={(e) => { setLetterMd(e.target.value); setEdited(true); }}
              onSelect={captureTextarea}
              onKeyUp={captureTextarea}
              onMouseUp={captureTextarea}
              spellCheck
              style={S.textarea}
            />
          ) : (
            <div onMouseUp={capturePreview}>
              <Markdown md={letterMd} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveStatus({ dirty, savedAt, onClear }) {
  const time = savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <span className="crumb-hide" style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", marginLeft: 4 }}>
      <span style={{ width: 7, height: 7, borderRadius: 9999, background: !savedAt ? "var(--fg-5)" : dirty ? "var(--warning)" : "var(--success)" }} />
      <span className="body-2" style={{ fontSize: 11.5, fontWeight: 600, color: !savedAt ? "var(--fg-4)" : dirty ? "var(--warning-ink)" : "var(--success-ink)" }}>
        {!savedAt ? "Not saved" : dirty ? "Unsaved changes" : `Saved · ${time}`}
      </span>
      {savedAt && (
        <button onClick={onClear} title="Remove the saved draft from this browser"
          style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--fg-4)", fontSize: 11, textDecoration: "underline", padding: 0 }}>
          clear
        </button>
      )}
    </span>
  );
}

function inline(text) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : p
  );
}

function Markdown({ md }) {
  const out = []; let bullets = []; let key = 0;
  const flush = () => {
    if (bullets.length) {
      out.push(<ul key={key++} style={{ margin: "6px 0 14px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
        {bullets.map((b, i) => <li key={i} style={{ lineHeight: 1.55 }}>{inline(b)}</li>)}
      </ul>);
      bullets = [];
    }
  };
  md.split("\n").forEach((raw) => {
    const l = raw.trimEnd();
    if (/^##\s+/.test(l)) { flush(); out.push(<h3 key={key++} style={{ fontSize: 15, fontWeight: 800, margin: "22px 0 6px", color: "var(--brand-primary)" }}>{inline(l.replace(/^##\s+/, ""))}</h3>); }
    else if (/^#\s+/.test(l)) { flush(); out.push(<h2 key={key++} style={{ fontSize: 18, fontWeight: 800, margin: "8px 0 10px" }}>{inline(l.replace(/^#\s+/, ""))}</h2>); }
    else if (/^[-*]\s+/.test(l)) { bullets.push(l.replace(/^[-*]\s+/, "")); }
    else if (l.trim() === "") { flush(); }
    else { flush(); out.push(<p key={key++} style={{ margin: "0 0 10px", lineHeight: 1.6 }}>{inline(l)}</p>); }
  });
  flush();
  return <div style={{ color: "var(--fg-1)", fontSize: 13.5 }}>{out}</div>;
}

const S = {
  root: { position: "fixed", inset: 0, zIndex: 1000, background: "#eef1f7", overflow: "auto" },
  actions: { position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 20px", background: "#fff", borderBottom: "1px solid var(--border-1)" },
  seg: { display: "inline-flex", border: "1px solid var(--border-1)", borderRadius: 9999, overflow: "hidden", background: "var(--bg-app)" },
  segBtn: { border: 0, background: "transparent", cursor: "pointer", padding: "7px 14px", font: "600 13px var(--font-sans)", color: "var(--fg-3)" },
  segOn: { background: "var(--brand-primary)", color: "#fff" },
  input: { height: 38, border: "1px solid var(--border-1)", borderRadius: "var(--r-lg)", padding: "0 11px", font: "400 13px var(--font-sans)", color: "var(--fg-1)", outline: "none", background: "var(--bg-app)" },
  redraftBar: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", border: "1px solid var(--border-1)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, transition: "background .15s, border-color .15s" },
  letter: { background: "#fff", borderRadius: 12, boxShadow: "var(--shadow-lg)", padding: "48px 56px", maxWidth: 820, margin: "0 auto" },
  textarea: { width: "100%", minHeight: "60vh", border: "1px solid var(--border-1)", borderRadius: 10, padding: "16px 18px", font: "400 13.5px/1.6 var(--font-sans)", color: "var(--fg-1)", outline: "none", resize: "vertical", background: "var(--bg-wash)" },
};
