import logo from "../assets/logo.svg";
import { Icon } from "./Icons.jsx";

// Pyramid mark (collapsed-sidebar logo) — inline SVG so it never 404s.
function BrandMark({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 220.583 129.894"
      fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pyramid AI">
      <path d="M0 95.133L107.465 5.57865C117.03 -2.39204 131.092 -1.753 139.897 7.04958L171.55 38.4718C171.55 38.4718 156.265 26.6956 139.307 42.8587L53.1753 114.601C43.5207 122.718 29.6173 124.842 18.4342 114.077L0 95.133Z" fill="#0135D2"/>
      <path d="M220.582 87.813C220.582 87.813 207.79 78.4031 189.765 93.1211L152.85 123.631C143.196 131.748 128.414 132.212 119.171 123.631L99.6777 104.163L157.942 55.7288C167.508 47.7581 181.569 48.3971 190.375 57.1997L220.579 87.8102L220.582 87.813Z" fill="#0135D2"/>
    </svg>
  );
}

export const NAV = [
  {
    group: "Project",
    items: [
      { id: "upload", label: "Upload XER", icon: Icon.upload },
      { id: "overview", label: "Overview", icon: Icon.grid },
    ],
  },
  {
    group: "Quality & Risk",
    items: [
      { id: "dcma", label: "DCMA Quality", icon: Icon.shield },
      { id: "risk", label: "Risk Register", icon: Icon.alert },
    ],
  },
  {
    group: "Progress & Resources",
    items: [
      { id: "scurves", label: "S-Curves", icon: Icon.trend },
      { id: "histogram", label: "Resource Histograms", icon: Icon.bars },
      { id: "lookahead", label: "Look-Ahead", icon: Icon.calendar },
    ],
  },
  {
    group: "Analysis",
    items: [
      { id: "phase", label: "Phase Analysis", icon: Icon.layers },
      { id: "discipline", label: "Discipline Analysis", icon: Icon.sliders },
      { id: "evms", label: "EVMS", icon: Icon.dollar },
      { id: "float", label: "Float & Critical Path", icon: Icon.activity },
    ],
  },
];

// Pinned separately at the bottom of the toolbar.
export const SETTINGS_ITEM = { id: "settings", label: "Settings / Export", icon: Icon.settings };

function NavItem({ it, active, ready, onNav }) {
  const isActive = it.id === active;
  const disabled = !ready && it.id !== "upload";
  return (
    <button
      className="sb-item"
      title={it.label}
      onClick={() => !disabled && onNav(it.id)}
      disabled={disabled}
      style={{
        ...S.item,
        background: isActive ? "var(--brand-200)" : "transparent",
        color: isActive ? "var(--brand-primary)" : disabled ? "var(--fg-5)" : "var(--fg-3)",
        fontWeight: isActive ? 600 : 400,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span style={{ display: "inline-flex", color: isActive ? "var(--brand-primary)" : "inherit" }}>
        <it.icon size={16} />
      </span>
      <span className="sb-label">{it.label}</span>
    </button>
  );
}

export default function Sidebar({ active, onNav, ready, collapsed = false, onToggleCollapse }) {
  return (
    <aside className={"app-sidebar" + (collapsed ? " is-collapsed" : "")} style={S.aside}>
      <div className="sb-brand">
        <img className="sb-logo" src={logo} alt="Pyramid AI" style={{ height: 15 }} />
        <BrandMark className="sb-mark" style={{ height: 22, width: "auto" }} />
        <button
          className="sb-toggle"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand toolbar" : "Minimize toolbar"}
          aria-label={collapsed ? "Expand toolbar" : "Minimize toolbar"}
          aria-pressed={collapsed}
        >
          <Icon.chevronRight size={17} stroke="var(--fg-3)"
            style={{ transform: collapsed ? "none" : "rotate(180deg)", transition: "transform .2s var(--ease-out)" }} />
        </button>
      </div>
      <div className="sb-group" style={{ padding: "0 16px 6px" }}>
        <div className="eyebrow" style={{ fontSize: 10, color: "var(--brand-primary)" }}>
          Schedule Intelligence
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px 12px" }}>
        {NAV.map((sec) => (
          <div key={sec.group} style={{ marginBottom: 10 }}>
            <div className="sb-group" style={S.section}>{sec.group}</div>
            {sec.items.map((it) => (
              <NavItem key={it.id} it={it} active={active} ready={ready} onNav={onNav} />
            ))}
          </div>
        ))}
      </div>

      {/* Settings / Export — its own section, pinned to the bottom */}
      <div className="sb-settings" style={{ padding: "8px 12px", borderTop: "1px solid var(--border-1)" }}>
        <NavItem it={SETTINGS_ITEM} active={active} ready={ready} onNav={onNav} />
      </div>

      <div className="sb-footer" style={S.footer}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={S.avatar}>E</span>
          <div className="sb-label" style={{ minWidth: 0 }}>
            <div className="body-2" style={{ fontWeight: 600, color: "var(--fg-1)" }}>Eva Ríos</div>
            <div className="body-2 muted" style={{ fontSize: 11 }}>Pyramid AI · Planning</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

const S = {
  aside: {
    width: 264, flex: "0 0 264px", background: "var(--bg-app)",
    borderRight: "1px solid var(--border-1)", display: "flex", flexDirection: "column", height: "100%",
  },
  section: {
    font: "600 10.5px var(--font-sans)", color: "var(--fg-4)",
    letterSpacing: "0.06em", textTransform: "uppercase", padding: "10px 12px 4px",
  },
  item: {
    display: "flex", alignItems: "center", gap: 12, width: "100%",
    padding: "8px 12px", borderRadius: 12, border: 0, background: "transparent",
    font: "400 13.5px var(--font-sans)", textAlign: "left",
    transition: "background 120ms ease-out",
  },
  footer: { padding: "12px 16px 16px", borderTop: "1px solid var(--border-1)" },
  avatar: {
    width: 30, height: 30, borderRadius: 9999, background: "var(--tag-construction-bg)",
    color: "#fff", display: "grid", placeItems: "center", font: "600 12px var(--font-sans)", flex: "0 0 30px",
  },
};
