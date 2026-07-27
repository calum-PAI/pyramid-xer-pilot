import { useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import { disciplineOf, phaseOf } from "../lib/curves.js";

export const FILTER_DEFAULTS = {
  wbs: "all",
  phase: "all",
  discipline: "all",
  resourceType: "all",
  from: "",
  to: "",
};

const RES_TYPES = [
  ["all", "All Types"],
  ["RT_Labor", "Labour"],
  ["RT_Equip", "Equipment"],
  ["RT_Mtl", "Material"],
];

// Reusable Pyramid-branded filter bar. Manages a local draft; commits to the
// parent (`onApply`) only when Apply/Reset is pressed.
export default function FilterBar({ model, applied, onApply }) {
  const [draft, setDraft] = useState(applied || FILTER_DEFAULTS);

  const wbsOptions = useMemo(
    () => [...new Set(model.activities.map((x) => x.wbs))].sort(),
    [model]
  );
  const phaseOptions = useMemo(
    () => [...new Set(model.activities.map(phaseOf))].sort(),
    [model]
  );
  const discOptions = useMemo(
    () => [...new Set(model.activities.map(disciplineOf))].sort(),
    [model]
  );

  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const filtered = JSON.stringify(applied) !== JSON.stringify(FILTER_DEFAULTS);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Icon.sliders size={16} stroke="var(--brand-primary)" />
        <span className="subheading" style={{ fontSize: 15 }}>Filter dataset</span>
        {filtered && (
          <span className="status-pill" style={{ background: "var(--info-bg)", color: "var(--info-ink)", marginLeft: 4 }}>
            <span className="dot" style={{ background: "var(--info)" }} /> filtered
          </span>
        )}
      </div>
      <div style={S.grid}>
        <Field label="WBS">
          <Select value={draft.wbs} onChange={(v) => set("wbs", v)}
            options={[["all", "All WBS"], ...wbsOptions.map((o) => [o, o])]} />
        </Field>
        <Field label="Phase">
          <Select value={draft.phase} onChange={(v) => set("phase", v)}
            options={[["all", "All Phases"], ...phaseOptions.map((o) => [o, o])]} />
        </Field>
        <Field label="Discipline">
          <Select value={draft.discipline} onChange={(v) => set("discipline", v)}
            options={[["all", "All Disciplines"], ...discOptions.map((o) => [o, o])]} />
        </Field>
        <Field label="Resource type">
          <Select value={draft.resourceType} onChange={(v) => set("resourceType", v)}
            options={RES_TYPES} />
        </Field>
        <Field label="From">
          <DateInput value={draft.from} onChange={(v) => set("from", v)} />
        </Field>
        <Field label="To">
          <DateInput value={draft.to} onChange={(v) => set("to", v)} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button className="btn btn-primary" onClick={() => onApply(draft)} disabled={!dirty}
          style={{ padding: "9px 22px" }}>
          Apply
        </button>
        <button className="btn btn-ghost" onClick={() => { setDraft(FILTER_DEFAULTS); onApply(FILTER_DEFAULTS); }}>
          Reset
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span className="eyebrow" style={{ fontSize: 10 }}>{label}</span>
      {children}
    </div>
  );
}

const CHEV =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>`
  );

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={S.control(true)}>
      {options.map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}
function DateInput({ value, onChange }) {
  return (
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={S.control(false)} />
  );
}

const S = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
  },
  control: (isSelect) => ({
    appearance: "none",
    WebkitAppearance: "none",
    width: "100%",
    height: 40,
    border: "1px solid var(--border-1)",
    borderRadius: "var(--r-lg)",
    padding: isSelect ? "0 34px 0 12px" : "0 12px",
    font: "400 14px var(--font-sans)",
    color: "var(--fg-1)",
    background: isSelect
      ? `var(--bg-app) url("${CHEV}") no-repeat right 10px center`
      : "var(--bg-app)",
    cursor: "pointer",
    outline: "none",
  }),
};
