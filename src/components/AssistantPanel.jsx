import { useState, useRef, useEffect } from "react";
import { Icon } from "./Icons.jsx";
import { answerQuestion, SUGGESTED_QUESTIONS } from "../lib/assistant.js";
import { hasKey, getModel, chatComplete, buildScheduleContext, ASSISTANT_SYSTEM } from "../lib/llm.js";

// Turn a plain-text LLM reply into the { text, bullets } bubble shape.
function parseLLM(reply) {
  const clean = reply.replace(/\*\*/g, "");
  const text = [], bullets = [];
  clean.split("\n").map((l) => l.trim()).filter(Boolean).forEach((l) => {
    if (/^[-*\u2022]\s+/.test(l)) bullets.push(l.replace(/^[-*\u2022]\s+/, ""));
    else if (/^\d+[.)]\s+/.test(l)) bullets.push(l.replace(/^\d+[.)]\s+/, ""));
    else text.push(l);
  });
  return { text: text.length ? text : [clean], bullets, tone: "brand", ai: true };
}

// Replace the trailing "pending" placeholder with the real answer.
function replaceLastPending(messages, replacement) {
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].pending) { out[i] = replacement; break; }
  }
  return out;
}

// Prior turns → OpenAI message history (bounded, greeting skipped).
function toHistory(messages) {
  return messages
    .filter((m) => m.text || m.answer)
    .slice(-6)
    .map((m) =>
      m.role === "user"
        ? { role: "user", content: m.text }
        : { role: "assistant", content: [...(m.answer?.text || []), ...(m.answer?.bullets || []).map((b) => "- " + b)].join("\n") }
    );
}

const GREETING = {
  role: "assistant",
  answer: {
    text: ["Hi — I'm your Schedule Assistant. Ask me anything about the uploaded programme and I'll answer from the analysed data. Try one of these:"],
    tone: "brand",
  },
};

export default function AssistantPanel({ analysis, open, onOpen, onClose }) {
  const [messages, setMessages] = useState([GREETING]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const [busy, setBusy] = useState(false);

  const ask = async (q) => {
    const question = String(q ?? draft).trim();
    if (!question || busy) return;
    setDraft("");

    // Built-in engine (no key) — instant, offline.
    if (!hasKey()) {
      const answer = answerQuestion(analysis, question);
      setMessages((m) => [...m, { role: "user", text: question }, { role: "assistant", answer }]);
      return;
    }

    // AI mode — send grounded context + history to OpenAI.
    const history = toHistory(messages);
    setMessages((m) => [...m, { role: "user", text: question }, { role: "assistant", pending: true }]);
    setBusy(true);
    try {
      const reply = await chatComplete({
        system: ASSISTANT_SYSTEM + buildScheduleContext(analysis),
        messages: [...history, { role: "user", content: question }],
      });
      const answer = parseLLM(reply);
      setMessages((m) => replaceLastPending(m, { role: "assistant", answer }));
    } catch (e) {
      // graceful fallback to the built-in engine
      const answer = answerQuestion(analysis, question);
      answer.text = [`AI unavailable (${e.message}) — answered with the built-in engine:`, ...answer.text];
      answer.tone = "warning";
      setMessages((m) => replaceLastPending(m, { role: "assistant", answer }));
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
  };
  const aiMode = hasKey();

  const showChips = messages.length <= 1;

  return (
    <>
      {/* Floating trigger — hidden while the dock is open */}
      {!open && (
        <button
          className="assistant-fab"
          onClick={onOpen}
          title="Ask the Schedule Assistant"
          aria-label="Open Schedule Assistant"
        >
          <Icon.chat size={20} stroke="#fff" />
          <span className="assistant-fab-label">Ask AI</span>
        </button>
      )}

      {/* In-flow dock — the main content reflows beside it */}
      <aside className={"assistant-dock" + (open ? " open" : "")} aria-hidden={!open}>
       <div className="assistant-inner">
        <header style={S.header}>
          <span style={S.badge}><Icon.sparkle size={15} fill="#fff" /></span>
          <div style={{ minWidth: 0 }}>
            <div className="subheading" style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>Schedule Assistant</div>
            <div className="body-2 muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: 9999, background: aiMode ? "var(--success)" : "var(--fg-5)" }} />
              {aiMode ? `AI mode · ${getModel()}` : "Built-in engine"}
            </div>
          </div>
          <button onClick={onClose} title="Collapse" aria-label="Collapse assistant" style={S.iconBtn}>
            <Icon.chevronRight size={18} stroke="var(--fg-3)" />
          </button>
        </header>

        <div ref={scrollRef} style={S.scroll}>
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} style={S.userRow}>
                <div style={S.userBubble}>{m.text}</div>
              </div>
            ) : m.pending ? (
              <div key={i} style={S.aiRow}>
                <div style={{ ...S.aiBubble, borderLeft: "3px solid var(--brand-primary)", display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="assistant-typing"><i /><i /><i /></span>
                  <span className="body-2 muted" style={{ fontSize: 12.5 }}>Analysing the schedule…</span>
                </div>
              </div>
            ) : (
              <AnswerBubble key={i} answer={m.answer} />
            )
          )}

          {showChips && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 4 }}>
              {SUGGESTED_QUESTIONS.map((q) => (
                <button key={q} onClick={() => ask(q)} style={S.chip}>{q}</button>
              ))}
            </div>
          )}
        </div>

        <div style={S.composer}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask about progress, float, cost, risks…"
            style={S.input}
          />
          <button onClick={() => ask()} disabled={!draft.trim() || busy} title="Send" aria-label="Send" style={{ ...S.send, opacity: draft.trim() && !busy ? 1 : 0.5 }}>
            <Icon.send size={16} stroke="#fff" />
          </button>
        </div>
       </div>
      </aside>
    </>
  );
}

const TONE = {
  danger: "var(--danger)", warning: "var(--warning)", success: "var(--success)",
  brand: "var(--brand-primary)", neutral: "var(--border-2)",
};

function AnswerBubble({ answer }) {
  const bar = TONE[answer.tone] || "var(--brand-primary)";
  return (
    <div style={S.aiRow}>
      <div style={{ ...S.aiBubble, borderLeft: `3px solid ${bar}` }}>
        {answer.text.map((t, i) => (
          <p key={i} className="body-2" style={{ margin: i ? "8px 0 0" : 0, color: "var(--fg-2, var(--fg-1))", fontSize: 13, lineHeight: 1.55 }}>{t}</p>
        ))}
        {answer.bullets && answer.bullets.length > 0 && (
          <ul style={{ margin: "10px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {answer.bullets.map((b, i) => (
              <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ width: 5, height: 5, borderRadius: 9999, background: bar, marginTop: 6, flex: "0 0 5px" }} />
                <span className="body-2" style={{ color: "var(--fg-3)", fontSize: 12.5, lineHeight: 1.5 }}>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const S = {
  header: {
    display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
    borderBottom: "1px solid var(--border-1)", flex: "0 0 auto",
  },
  badge: {
    width: 30, height: 30, borderRadius: 9999, display: "grid", placeItems: "center",
    background: "var(--brand-gradient)", color: "#fff", flex: "0 0 30px",
    boxShadow: "0 2px 8px -2px rgba(0,0,198,0.4)",
  },
  iconBtn: {
    marginLeft: "auto", border: 0, background: "transparent", cursor: "pointer",
    display: "grid", placeItems: "center", padding: 6, borderRadius: 8, flex: "0 0 auto",
  },
  scroll: {
    flex: 1, overflowY: "auto", padding: "16px", display: "flex",
    flexDirection: "column", gap: 12,
  },
  userRow: { display: "flex", justifyContent: "flex-end" },
  userBubble: {
    background: "var(--brand-primary)", color: "#fff", borderRadius: "14px 14px 4px 14px",
    padding: "9px 13px", fontSize: 13, lineHeight: 1.5, maxWidth: "85%", fontWeight: 500,
  },
  aiRow: { display: "flex", justifyContent: "flex-start" },
  aiBubble: {
    background: "var(--bg-app)", border: "1px solid var(--border-1)",
    borderRadius: "14px 14px 14px 4px", padding: "12px 14px", maxWidth: "92%",
    boxShadow: "var(--shadow-sm)",
  },
  chip: {
    border: "1px solid var(--border-1)", background: "var(--bg-app)", color: "var(--fg-3)",
    borderRadius: 9999, padding: "7px 12px", cursor: "pointer",
    font: "500 12.5px var(--font-sans)", textAlign: "left", lineHeight: 1.3,
  },
  composer: {
    display: "flex", gap: 8, padding: "12px 14px", borderTop: "1px solid var(--border-1)",
    flex: "0 0 auto", background: "var(--bg-app)",
  },
  input: {
    flex: 1, height: 40, border: "1px solid var(--border-1)", borderRadius: 9999,
    padding: "0 15px", font: "400 13.5px var(--font-sans)", color: "var(--fg-1)",
    outline: "none", background: "var(--bg-wash)",
  },
  send: {
    width: 40, height: 40, flex: "0 0 40px", border: 0, borderRadius: 9999,
    background: "var(--brand-primary)", cursor: "pointer", display: "grid", placeItems: "center",
  },
};
