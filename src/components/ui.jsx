// Shared UI primitives built on the Pyramid design tokens.
import { Icon } from "./Icons.jsx";

const TONE = {
  success: { bg: "var(--success-bg)", ink: "var(--success-ink)", dot: "var(--success)" },
  warning: { bg: "var(--warning-bg)", ink: "var(--warning-ink)", dot: "var(--warning)" },
  danger: { bg: "var(--danger-bg)", ink: "var(--danger-ink)", dot: "var(--danger)" },
  info: { bg: "var(--info-bg)", ink: "var(--info-ink)", dot: "var(--info)" },
  neutral: { bg: "var(--bg-mute)", ink: "var(--fg-3)", dot: "var(--fg-4)" },
};

export function StatusPill({ tone = "info", children, dot = true }) {
  const t = TONE[tone] || TONE.info;
  return (
    <span className="status-pill" style={{ background: t.bg, color: t.ink }}>
      {dot && <span className="dot" style={{ background: t.dot }} />}
      {children}
    </span>
  );
}

const TAG_COLORS = [
  "var(--tag-safety-bg)",
  "var(--tag-technical-bg)",
  "var(--tag-pm-bg)",
  "var(--tag-construction-bg)",
  "var(--tag-commercial-bg)",
  "var(--tag-operations-bg)",
];
export function tagColor(key = "") {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
  return TAG_COLORS[h % TAG_COLORS.length];
}
export function TagPill({ children, color }) {
  return (
    <span className="tag-pill" style={{ background: color || tagColor(String(children)) }}>
      {children}
    </span>
  );
}

export function SectionTitle({ icon, children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {icon && <span style={{ color: "var(--brand-primary)", display: "inline-flex" }}>{icon}</span>}
        <h3 className="h3">{children}</h3>
      </div>
      {right}
    </div>
  );
}

export function KpiTile({ label, value, sub, tone, big }) {
  const t = tone ? TONE[tone] : null;
  return (
    <div
      className="card"
      style={{ padding: "16px 18px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}
    >
      <div className="eyebrow" style={{ fontSize: 10.5 }}>{label}</div>
      <div
        style={{
          fontSize: big ? 30 : 24,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: t ? t.ink : "var(--fg-1)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && <div className="body-2 muted" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

// Radial gauge (0..1 fraction of an arc)
export function Gauge({ value, max = 1, label, sub, tone = "info", format }) {
  const frac = Math.max(0, Math.min(1, value / max));
  const R = 52;
  const C = 2 * Math.PI * R;
  const start = 0.75; // 270° arc
  const dash = C * start;
  const t = TONE[tone] || TONE.info;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width="132" height="112" viewBox="0 0 132 112">
        <g transform="rotate(135 66 60)">
          <circle
            cx="66" cy="60" r={R} fill="none" stroke="var(--border-1)" strokeWidth="12"
            strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
          />
          <circle
            cx="66" cy="60" r={R} fill="none" stroke={t.dot} strokeWidth="12"
            strokeDasharray={`${dash * frac} ${C}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 800ms var(--ease-out)" }}
          />
        </g>
        <text x="66" y="60" textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: "var(--font-sans)", fontSize: 26, fontWeight: 700, fill: "var(--fg-1)" }}>
          {format ? format(value) : value}
        </text>
        <text x="66" y="82" textAnchor="middle"
          style={{ fontFamily: "var(--font-sans)", fontSize: 11, fill: "var(--fg-4)" }}>
          {sub}
        </text>
      </svg>
      <div className="body-2" style={{ fontWeight: 600, textAlign: "center" }}>{label}</div>
    </div>
  );
}

// Donut for activity-status breakdown
export function Donut({ segments, size = 160, thickness = 26, centerLabel, centerSub }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = (size - thickness) / 2;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((s, i) => {
            const len = (s.value / total) * C;
            const el = (
              <circle
                key={i} cx={size / 2} cy={size / 2} r={R} fill="none"
                stroke={s.color} strokeWidth={thickness}
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle"
          style={{ fontFamily: "var(--font-sans)", fontSize: 30, fontWeight: 700, fill: "var(--fg-1)" }}>
          {centerLabel}
        </text>
        <text x={size / 2} y={size / 2 + 18} textAnchor="middle"
          style={{ fontFamily: "var(--font-sans)", fontSize: 11, fill: "var(--fg-4)" }}>
          {centerSub}
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flex: "0 0 10px" }} />
            <span className="body-2" style={{ color: "var(--fg-3)" }}>{s.label}</span>
            <span className="body-2" style={{ fontWeight: 700, marginLeft: "auto" }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProgressBar({ value, tone = "info", height = 8 }) {
  const t = TONE[tone] || TONE.info;
  return (
    <div style={{ background: "var(--bg-mute)", borderRadius: 9999, height, overflow: "hidden", width: "100%" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", background: t.dot, borderRadius: 9999, transition: "width 600ms var(--ease-out)" }} />
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: "var(--bg-tint)", borderRadius: 9999, padding: 3, gap: 2 }}>
      {options.map(([v, label]) => {
        const active = v === value;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              border: 0, cursor: "pointer", borderRadius: 9999, padding: "7px 16px",
              font: "500 13px var(--font-sans)",
              background: active ? "var(--brand-primary)" : "transparent",
              color: active ? "#fff" : "var(--fg-3)",
              boxShadow: active ? "var(--shadow-sm)" : "none",
              transition: "all 150ms var(--ease-out)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function AiCallout({ children, title = "AI Schedule Intelligence" }) {
  return (
    <div
      className="card fade-up"
      style={{
        padding: 24,
        border: "1px solid var(--border-1)",
        background:
          "linear-gradient(135deg, var(--bg-tint) 0%, var(--bg-app) 55%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 9999, display: "grid", placeItems: "center",
          background: "var(--brand-gradient)", color: "#fff",
          boxShadow: "0 2px 8px -2px rgba(0,0,198,0.4)",
        }}>
          <Icon.sparkle size={16} fill="#fff" />
        </span>
        <span className="subheading" style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}
