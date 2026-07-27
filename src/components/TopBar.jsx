import { Icon } from "./Icons.jsx";
import { NAV, SETTINGS_ITEM } from "./Sidebar.jsx";

const TITLES = Object.fromEntries(
  [...NAV.flatMap((s) => s.items), SETTINGS_ITEM].map((i) => [i.id, i.label])
);

export default function TopBar({ view, model, onDemo, onExport, onReset, onLetter }) {
  return (
    <header className="topbar" style={S.bar}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, overflow: "hidden" }}>
        <span className="body-2 crumb-hide" style={{ fontWeight: 600, color: "var(--fg-1)" }}>
          Pyramid AI
        </span>
        <span className="crumb-hide" style={{ color: "var(--fg-5)" }}>/</span>
        <span className="body-2 muted crumb-hide">Schedule Intelligence</span>
        <span className="crumb-hide" style={{ color: "var(--fg-5)" }}>/</span>
        <span className="body-2" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{TITLES[view] || "Overview"}</span>
        {model && (
          <span className="code mono crumb-hide" style={{ marginLeft: 4 }}>{model.project.shortName}</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {model && (
          <button className="btn btn-ghost" onClick={onReset} style={{ padding: "8px 12px" }} title="New file">
            <Icon.refresh size={15} /> <span className="btn-label-hide">New file</span>
          </button>
        )}
        <button className="btn btn-secondary" onClick={onDemo} style={{ padding: "8px 14px" }} title="Load demo">
          <Icon.layers size={15} /> <span className="btn-label-hide">Load demo</span>
        </button>
        <button className="btn btn-secondary" onClick={onLetter} disabled={!model} style={{ padding: "8px 14px" }} title="AI programme review letter">
          <Icon.mail size={15} /> <span className="btn-label-hide">Response letter</span>
        </button>
        <button className="btn btn-primary" onClick={onExport} disabled={!model} style={{ padding: "8px 16px" }} title="Export report">
          <Icon.download size={15} /> <span className="btn-label-hide">Export report</span>
        </button>
      </div>
    </header>
  );
}

const S = {
  bar: {
    minHeight: 60, flex: "0 0 auto", display: "flex", alignItems: "center",
    justifyContent: "space-between", padding: "0 24px", gap: 12,
    borderBottom: "1px solid var(--border-1)", background: "var(--bg-app)",
  },
};
