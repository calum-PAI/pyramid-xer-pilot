// SVG chart primitives — brand-styled, dependency-free.
import { useState } from "react";

const AXIS = "var(--border-1)";
const GRID = "#eef1fb";
const LABEL = "var(--fg-4)";

function niceMonthLabel(d) {
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

// ── Progress S-curve: Baseline (dashed) / Current (solid) / Actual (green) ──
export function ProgressSCurveChart({ data, metricLabel, height = 360 }) {
  const [hover, setHover] = useState(null); // { i, x, y }
  const rows = data.rows;
  const W = 900, H = height, pad = { l: 58, r: 24, t: 20, b: 58 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const maxY = 105;
  const n = rows.length;
  const x = (i) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v) => pad.t + ih - (v / maxY) * ih;

  const line = (key) =>
    rows.map((r, i) => (r[key] == null ? null : `${x(i)},${y(r[key])}`)).filter(Boolean).join(" ");

  // actual area fill up to the data date
  const actPts = rows.map((r, i) => ({ i, v: r.actual })).filter((p) => p.v != null);
  let actualArea = "";
  if (actPts.length) {
    const first = actPts[0], lastP = actPts[actPts.length - 1];
    actualArea =
      `${x(first.i)},${y(0)} ` +
      actPts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ") +
      ` ${x(lastP.i)},${y(0)}`;
  }

  // the exact data-date anchor (added by computeSCurves) drives the red line;
  // fall back to the isPast transition if it isn't present.
  const ddAnchor = rows.findIndex((r) => r.dd);
  const ddIndex = rows.findIndex((r) => !r.isPast);
  const ddXpos =
    ddAnchor >= 0 ? x(ddAnchor)
      : ddIndex < 0 ? x(n - 1) : ddIndex === 0 ? x(0) : (x(ddIndex) + x(ddIndex - 1)) / 2;

  const step = Math.max(1, Math.round(n / 24));
  const slot = n > 1 ? iw / (n - 1) : iw;
  const hr = hover != null ? rows[hover.i] : null;
  const SERIES = [
    { key: "baseline", label: "Baseline Plan", color: "var(--brand-300)" },
    { key: "current", label: "Current Plan", color: "var(--brand-primary)" },
    { key: "actual", label: "Actual", color: "var(--success)" },
  ];

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}
        onMouseLeave={() => setHover(null)}>
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={pad.l - 9} y={y(v) + 4} textAnchor="end" style={{ fontSize: 10, fill: LABEL, fontFamily: "var(--font-sans)" }}>{v}</text>
          </g>
        ))}
        <text x={15} y={pad.t + ih / 2} textAnchor="middle" transform={`rotate(-90 15 ${pad.t + ih / 2})`}
          style={{ fontSize: 11, fill: LABEL, fontFamily: "var(--font-sans)" }}>
          Cumulative % ({metricLabel})
        </text>

        {/* actual earned area */}
        {actualArea && <polygon points={actualArea} fill="var(--success)" opacity="0.16" />}

        {/* baseline plan — dashed blue */}
        <polyline points={line("baseline")} fill="none" stroke="var(--brand-300)" strokeWidth="2" strokeDasharray="6 4" />
        {/* current plan — solid blue */}
        <polyline points={line("current")} fill="none" stroke="var(--brand-primary)" strokeWidth="2.5" />
        {/* actual — green */}
        <polyline points={line("actual")} fill="none" stroke="var(--success)" strokeWidth="3" />

        {/* data date — red line */}
        <line x1={ddXpos} x2={ddXpos} y1={pad.t} y2={pad.t + ih} stroke="var(--danger)" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x={ddXpos} y={pad.t - 6} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: "var(--danger)", fontFamily: "var(--font-sans)" }}>Data Date</text>

        {rows.map((r, i) =>
          i % step === 0 ? (
            <text key={i} x={x(i)} y={H - 32} textAnchor="end" transform={`rotate(-45 ${x(i)} ${H - 32})`}
              style={{ fontSize: 9, fill: LABEL, fontFamily: "var(--font-sans)" }}>
              {r.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
            </text>
          ) : null
        )}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke={AXIS} />

        {/* hover guide + markers */}
        {hr && (
          <g>
            <line x1={x(hover.i)} x2={x(hover.i)} y1={pad.t} y2={pad.t + ih}
              stroke="var(--brand-300)" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
            {SERIES.map((s) =>
              hr[s.key] == null ? null : (
                <circle key={s.key} cx={x(hover.i)} cy={y(hr[s.key])} r="4.5"
                  fill="#fff" stroke={s.color} strokeWidth="2.5" />
              )
            )}
          </g>
        )}
        {/* hover capture */}
        {rows.map((r, i) => (
          <rect key={"h" + i} x={x(i) - slot / 2} y={pad.t} width={slot} height={ih}
            fill="transparent"
            onMouseMove={(e) => setHover({ i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
            onMouseEnter={(e) => setHover({ i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })} />
        ))}
      </svg>

      {hr && (
        <div style={{
          position: "absolute", left: hover.x, top: hover.y,
          transform: `translate(${hover.x > 470 ? "-100%" : "0"}, -50%)`,
          marginLeft: hover.x > 470 ? -14 : 14, pointerEvents: "none", zIndex: 20,
          background: "var(--bg-app)", border: "1px solid var(--border-1)", borderRadius: 12,
          boxShadow: "var(--shadow-lg)", padding: "12px 14px", minWidth: 190,
        }}>
          <div className="body-2" style={{ fontWeight: 700, marginBottom: 8 }}>
            {hr.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {SERIES.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: s.color, flex: "0 0 11px" }} />
                <span className="body-2" style={{ color: "var(--fg-3)", flex: 1 }}>{s.label}</span>
                <span className="body-2 mono" style={{ fontWeight: 700 }}>
                  {hr[s.key] == null ? "—" : hr[s.key].toFixed(1) + "%"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 16, height: 3, borderRadius: 2, background: it.color, display: "inline-block" }} />
          <span className="body-2 muted">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Stacked resource histogram (monthly) ─────────────────────
export function HistogramChart({ data, colorFor, height = 300 }) {
  const rows = data.rows;
  const W = 860, H = height, pad = { l: 52, r: 20, t: 16, b: 40 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const maxY = data.peak * 1.05 || 1;
  const n = rows.length;
  const bw = Math.min(38, (iw / n) * 0.7);
  const x = (i) => pad.l + (i + 0.5) * (iw / n);
  const y = (v) => pad.t + ih - (v / maxY) * ih;
  const step = Math.max(1, Math.floor(n / 10));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {Array.from({ length: 5 }, (_, i) => {
        const v = (maxY / 4) * i;
        return (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" style={{ fontSize: 10, fill: LABEL, fontFamily: "var(--font-sans)" }}>
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      {rows.map((r, i) => {
        let acc = 0;
        const ids = Object.keys(r.byRsrc);
        return (
          <g key={i}>
            {ids.map((rid, k) => {
              const val = r.byRsrc[rid];
              const h = (val / maxY) * ih;
              const yy = pad.t + ih - acc - h;
              acc += h;
              return (
                <rect key={k} x={x(i) - bw / 2} y={yy} width={bw} height={Math.max(h, 0)}
                  fill={colorFor(rid)} rx="1.5" />
              );
            })}
            {i % step === 0 && (
              <text x={x(i)} y={H - 14} textAnchor="middle" style={{ fontSize: 9.5, fill: LABEL, fontFamily: "var(--font-sans)" }}>
                {niceMonthLabel(r.date)}
              </text>
            )}
          </g>
        );
      })}
      <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke={AXIS} />
    </svg>
  );
}

// ── Simple categorical bar chart ─────────────────────────────
export function BarChart({ items, height = 220, colorFor }) {
  const W = 620, H = height, pad = { l: 40, r: 16, t: 12, b: 52 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const maxY = Math.max(...items.map((i) => i.value), 1);
  const n = items.length;
  const bw = Math.min(64, (iw / n) * 0.6);
  const x = (i) => pad.l + (i + 0.5) * (iw / n);
  const y = (v) => pad.t + ih - (v / maxY) * ih;

  const TONE = { danger: "var(--danger)", warning: "var(--warning)", info: "var(--brand-300)", success: "var(--success)" };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {items.map((it, i) => {
        const c = colorFor ? colorFor(it) : TONE[it.tone] || "var(--brand-300)";
        const h = (it.value / maxY) * ih;
        return (
          <g key={i}>
            <rect x={x(i) - bw / 2} y={pad.t + ih - h} width={bw} height={Math.max(h, 0)} fill={c} rx="4" />
            <text x={x(i)} y={pad.t + ih - h - 6} textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, fill: "var(--fg-1)", fontFamily: "var(--font-sans)" }}>
              {it.value}
            </text>
            <text x={x(i)} y={H - 30} textAnchor="middle" style={{ fontSize: 10, fill: LABEL, fontFamily: "var(--font-sans)" }}>
              {it.label.split(" ").slice(0, 2).join(" ")}
            </text>
            {it.label.split(" ").length > 2 && (
              <text x={x(i)} y={H - 18} textAnchor="middle" style={{ fontSize: 10, fill: LABEL, fontFamily: "var(--font-sans)" }}>
                {it.label.split(" ").slice(2).join(" ")}
              </text>
            )}
          </g>
        );
      })}
      <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke={AXIS} />
    </svg>
  );
}

// ── Grouped bar chart (e.g. Planned / Earned / Actual by phase) ──
export function GroupedBarChart({ groups, series, fmt, height = 360, valueAxisLabel = "Cost" }) {
  const n = groups.length || 1;
  // Rotate labels once they'd collide; give every group a fixed minimum slot so
  // long phase names stay legible and the chart scrolls sideways when crowded.
  const longest = Math.max(0, ...groups.map((g) => String(g.label).length));
  const rotate = n > 6 || longest > 9;
  const slotMin = rotate ? Math.max(64, Math.min(96, longest * 6.4)) : 96;
  const labelH = rotate ? 96 : 40;
  const pad = { l: 88, r: 20, t: 16, b: labelH };
  const W = Math.max(880, pad.l + pad.r + n * slotMin);
  const H = height + (rotate ? 44 : 0);
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const maxY = Math.max(1, ...groups.flatMap((g) => g.values)) * 1.08 || 1;
  const slot = iw / n;
  const groupW = Math.min(slot * 0.62, 150);
  const bw = groupW / series.length;
  const y = (v) => pad.t + ih - (v / maxY) * ih;
  const gx = (i) => pad.l + slot * i + slot / 2;
  const axisY = pad.t + ih;

  const truncate = (s, max) => (String(s).length > max ? String(s).slice(0, max - 1) + "…" : String(s));
  const yticks = 6;
  return (
    <div style={{ overflowX: "auto", overflowY: "hidden", width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W > 880 ? W : "100%"}
        style={{ display: "block", maxWidth: W > 880 ? "none" : "100%" }}>
        {Array.from({ length: yticks + 1 }, (_, i) => {
          const v = (maxY / yticks) * i;
          return (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={GRID} />
              <text x={pad.l - 10} y={y(v) + 4} textAnchor="end"
                style={{ fontSize: 10, fill: LABEL, fontFamily: "var(--font-sans)" }}>
                {fmt ? fmt(v) : Math.round(v)}
              </text>
            </g>
          );
        })}
        <text x={16} y={pad.t + ih / 2} textAnchor="middle"
          transform={`rotate(-90 16 ${pad.t + ih / 2})`}
          style={{ fontSize: 11, fill: LABEL, fontFamily: "var(--font-sans)" }}>
          {valueAxisLabel}
        </text>
        {groups.map((g, i) => (
          <g key={i}>
            {series.map((s, k) => {
              const v = g.values[k] || 0;
              const h = (v / maxY) * ih;
              const x = gx(i) - groupW / 2 + k * bw;
              return (
                <rect key={k} x={x + 1} y={pad.t + ih - h} width={bw - 2}
                  height={Math.max(h, 0)} fill={s.color} rx="2" />
              );
            })}
            {rotate ? (
              <text x={gx(i)} y={axisY + 12} textAnchor="end"
                transform={`rotate(-38 ${gx(i)} ${axisY + 12})`}
                style={{ fontSize: 11.5, fill: "var(--fg-3)", fontFamily: "var(--font-sans)" }}>
                <title>{g.label}</title>
                {truncate(g.label, 16)}
              </text>
            ) : (
              <text x={gx(i)} y={axisY + 20} textAnchor="middle"
                style={{ fontSize: 12, fill: "var(--fg-3)", fontFamily: "var(--font-sans)" }}>
                <title>{g.label}</title>
                {truncate(g.label, 14)}
              </text>
            )}
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={axisY} y2={axisY} stroke={AXIS} />
      </svg>
    </div>
  );
}

// ── Resource histogram: stacked hours/period + cumulative line ──
function periodLabel(date, period) {
  if (period === "month")
    return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function periodLabelLong(date, period) {
  if (period === "month")
    return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  if (period === "week")
    return "Week of " + date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

export function ResourceHistogramChart({ data, colorFor, unit = "Hrs", height = 400 }) {
  const [hover, setHover] = useState(null); // { i, x, y }
  const rows = data.rows;
  const groups = data.groups;
  const W = 940, H = height, pad = { l: 62, r: 70, t: 20, b: 74 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const n = rows.length || 1;
  const slot = iw / n;
  const bw = Math.min(slot * 0.82, 42);
  const maxL = (data.peak || 1) * 1.12;
  const maxR = (data.cumulativeMax || 1) * 1.04;
  const yL = (v) => pad.t + ih - (v / maxL) * ih;
  const yR = (v) => pad.t + ih - (v / maxR) * ih;
  const cx = (i) => pad.l + slot * i + slot / 2;
  const xStep = Math.max(1, Math.round(n / 22));

  const niceL = niceTicks(maxL, 7);
  const niceR = niceTicks(maxR, 7);

  const cumPts = rows.map((r, i) => `${cx(i)},${yR(r.cumulative)}`).join(" ");
  const hoveredRow = hover != null ? rows[hover.i] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}
        onMouseLeave={() => setHover(null)}>
        {/* left gridlines + hours axis */}
        {niceL.map((v, i) => (
          <g key={"l" + i}>
            <line x1={pad.l} x2={W - pad.r} y1={yL(v)} y2={yL(v)} stroke={GRID} />
            <text x={pad.l - 9} y={yL(v) + 4} textAnchor="end"
              style={{ fontSize: 10, fill: LABEL, fontFamily: "var(--font-sans)" }}>
              {Math.round(v)}
            </text>
          </g>
        ))}
        {/* right cumulative axis */}
        {niceR.map((v, i) => (
          <text key={"r" + i} x={W - pad.r + 9} y={yR(v) + 4} textAnchor="start"
            style={{ fontSize: 10, fill: LABEL, fontFamily: "var(--font-sans)" }}>
            {abbr(v)}
          </text>
        ))}
        <text x={16} y={pad.t + ih / 2} textAnchor="middle" transform={`rotate(-90 16 ${pad.t + ih / 2})`}
          style={{ fontSize: 11, fill: LABEL, fontFamily: "var(--font-sans)" }}>
          {unit} / Period
        </text>
        <text x={W - 12} y={pad.t + ih / 2} textAnchor="middle" transform={`rotate(90 ${W - 12} ${pad.t + ih / 2})`}
          style={{ fontSize: 11, fill: LABEL, fontFamily: "var(--font-sans)" }}>
          Cumulative {unit}
        </text>

        {/* stacked bars */}
        {rows.map((r, i) => {
          let acc = 0;
          return (
            <g key={i}>
              {groups.map((g) => {
                const v = r.byGroup[g.id] || 0;
                if (v <= 0) return null;
                const h = (v / maxL) * ih;
                const yTop = pad.t + ih - acc - h;
                acc += h;
                const over = r.byOver ? r.byOver[g.id] || 0 : 0;
                const overH = over > 0 ? (over / maxL) * ih : 0;
                return (
                  <g key={g.id}>
                    <rect x={cx(i) - bw / 2} y={yTop} width={bw} height={Math.max(h, 0)}
                      fill={colorFor(g.id)} rx="1" opacity={hover && hover.i !== i ? 0.5 : 1} />
                    {overH > 0 && (
                      <rect x={cx(i) - bw / 2} y={yTop} width={bw} height={overH}
                        fill="var(--danger)" opacity={0.9} rx="1" />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* cumulative line */}
        <polyline points={cumPts} fill="none" stroke="var(--brand-primary)" strokeWidth="2.5" />

        {/* x labels */}
        {rows.map((r, i) =>
          i % xStep === 0 ? (
            <text key={i} x={cx(i)} y={H - 44} textAnchor="end"
              transform={`rotate(-45 ${cx(i)} ${H - 44})`}
              style={{ fontSize: 9.5, fill: LABEL, fontFamily: "var(--font-sans)" }}>
              {periodLabel(r.date, data.period)}
            </text>
          ) : null
        )}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke={AXIS} />

        {/* hover capture + guide */}
        {hoveredRow && (
          <line x1={cx(hover.i)} x2={cx(hover.i)} y1={pad.t} y2={pad.t + ih}
            stroke="var(--brand-300)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
        )}
        {rows.map((r, i) => (
          <rect key={"h" + i} x={pad.l + slot * i} y={pad.t} width={slot} height={ih}
            fill="transparent"
            onMouseMove={(e) =>
              setHover({ i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })
            }
            onMouseEnter={(e) =>
              setHover({ i, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })
            } />
        ))}
      </svg>

      {hoveredRow && (
        <HistTooltip row={hoveredRow} groups={groups} colorFor={colorFor}
          x={hover.x} y={hover.y} data={data} unit={unit} />
      )}
    </div>
  );
}

function HistTooltip({ row, groups, colorFor, x, y, data, unit }) {
  const items = groups
    .map((g) => ({ ...g, v: row.byGroup[g.id] || 0, over: row.byOver ? row.byOver[g.id] || 0 : 0 }))
    .filter((g) => g.v > 0)
    .sort((a, b) => b.v - a.v);
  const flip = x > 480;
  return (
    <div style={{
      position: "absolute", left: x, top: y, transform: `translate(${flip ? "-100%" : "0"}, -50%)`,
      marginLeft: flip ? -14 : 14, pointerEvents: "none", zIndex: 20,
      background: "var(--bg-app)", border: "1px solid var(--border-1)", borderRadius: 12,
      boxShadow: "var(--shadow-lg)", padding: "12px 14px", minWidth: 210, maxWidth: 260,
    }}>
      <div className="body-2" style={{ fontWeight: 700, marginBottom: 8 }}>
        {periodLabelLong(row.date, data.period)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {items.map((g) => (
          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: colorFor(g.id), flex: "0 0 9px" }} />
            <span className="body-2" style={{ color: "var(--fg-3)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
            <span className="body-2 mono" style={{ fontWeight: 600 }}>{Math.round(g.v)}</span>
            {g.over > 0 && (
              <span className="mono" style={{ fontSize: 10, color: "var(--danger-ink)", fontWeight: 700 }}>+{Math.round(g.over)}</span>
            )}
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid var(--border-1)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
        <span className="body-2 muted">Total this period</span>
        <span className="body-2 mono" style={{ fontWeight: 700 }}>{Math.round(row.total)} {unit.toLowerCase()}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span className="body-2 muted">Cumulative</span>
        <span className="body-2 mono" style={{ fontWeight: 700, color: "var(--brand-primary)" }}>{Math.round(row.cumulative)} {unit.toLowerCase()}</span>
      </div>
      {row.over > 0 && (
        <div style={{ marginTop: 8, background: "var(--danger-bg)", color: "var(--danger-ink)", borderRadius: 8, padding: "6px 8px", fontSize: 11.5, fontWeight: 600 }}>
          Over-allocated by {Math.round(row.over)} {unit.toLowerCase()} vs capacity
        </div>
      )}
    </div>
  );
}

function niceTicks(max, count) {
  const step = max / count;
  const out = [];
  for (let i = 0; i <= count; i++) out.push(step * i);
  return out;
}
function abbr(v) {
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k";
  return String(Math.round(v));
}

export function SeriesLegend({ items }) {
  return (
    <div style={{ display: "flex", gap: 22, flexWrap: "wrap", justifyContent: "center", marginBottom: 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 16, height: 12, borderRadius: 3, background: it.color, display: "inline-block" }} />
          <span className="body-2" style={{ color: "var(--fg-3)" }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
