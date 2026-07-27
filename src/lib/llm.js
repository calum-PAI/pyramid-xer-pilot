// =============================================================
// OpenAI client — "bring your own key". The key is entered by the
// user in Settings and stored ONLY in this browser's localStorage.
// It is never bundled, committed, logged, or sent anywhere except
// directly to the OpenAI API over HTTPS from the user's own browser.
// =============================================================
import { fmtDate, fmtMoneyShort } from "./model.js";
import { spiLabel, cpiLabel } from "./evms.js";
import {
  computePhaseAnalysis, computeDisciplineAnalysis, computeClashDetection,
  computeLookAheadDetail, disciplineOf, shortDisc,
} from "./curves.js";

const KEY_LS = "pyramid.openai.key";
const MODEL_LS = "pyramid.openai.model";
export const DEFAULT_MODEL = "gpt-4o-mini";
export const MODEL_OPTIONS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"];

export function getKey() {
  try { return localStorage.getItem(KEY_LS) || ""; } catch { return ""; }
}
export function setKey(k) {
  try { k ? localStorage.setItem(KEY_LS, k.trim()) : localStorage.removeItem(KEY_LS); } catch {}
}
export function clearKey() { setKey(""); }
export function hasKey() { return !!getKey(); }
export function maskKey(k = getKey()) {
  if (!k) return "";
  return k.length <= 12 ? "•••••" : `${k.slice(0, 6)}…${k.slice(-4)}`;
}
export function getModel() {
  try { return localStorage.getItem(MODEL_LS) || DEFAULT_MODEL; } catch { return DEFAULT_MODEL; }
}
export function setModel(m) {
  try { localStorage.setItem(MODEL_LS, m || DEFAULT_MODEL); } catch {}
}

// Call the OpenAI Chat Completions API directly from the browser.
export async function chatComplete({ system, messages, temperature = 0.2, maxTokens = 700, signal }) {
  const key = getKey();
  if (!key) throw new Error("No OpenAI key set.");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: getModel(),
      temperature,
      max_tokens: maxTokens,
      messages: [system ? { role: "system", content: system } : null, ...messages].filter(Boolean),
    }),
    signal,
  });
  if (!res.ok) {
    let msg = `OpenAI request failed (${res.status})`;
    try { const e = await res.json(); if (e.error?.message) msg = e.error.message; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

// Quick credential check for the Settings "Test" button.
export async function testKey() {
  const reply = await chatComplete({
    system: "You are a connectivity test. Reply with exactly: OK",
    messages: [{ role: "user", content: "ping" }],
    maxTokens: 5,
  });
  return /ok/i.test(reply);
}

// ── Ground the model in the real data ────────────────────────
// Produces a compact factual digest so the LLM reasons over the
// actual schedule instead of hallucinating.
export function buildScheduleContext(a) {
  const { model, evms, dcma, floatA, histogram, risks } = a;
  const cur = evms.currency;
  const M = (v) => fmtMoneyShort(v, cur);
  const L = [];

  L.push(`PROJECT: ${model.project.name} (${model.project.shortName}). Data date ${fmtDate(model.project.dataDate)}. Plan ${fmtDate(model.project.planStart)} → ${fmtDate(model.project.planFinish)}. Currency ${cur}. Cost-loaded: ${model.hasCost ? "yes" : "no"}.`);
  const c = model.counts;
  L.push(`SCOPE: ${c.activities} activities, ${c.relationships} links, ${c.milestones} milestones, ${c.resources} resources. ${c.complete} complete / ${c.inProgress} in progress / ${c.notStarted} not started.`);
  L.push(`EVMS: SPI ${evms.SPI.toFixed(2)} (${spiLabel(evms.SPI).text}); CPI ${evms.CPI.toFixed(2)} (${cpiLabel(evms.CPI).text}). % planned ${(evms.pctPlanned * 100).toFixed(0)} / % earned ${(evms.pctEarned * 100).toFixed(0)} / % actual ${(evms.pctActual * 100).toFixed(0)}. BAC ${M(evms.BAC)}, EAC ${M(evms.EAC)}, ETC ${M(evms.ETC)}, VAC ${M(evms.VAC)}, SV ${M(evms.SV)}, CV ${M(evms.CV)}, TCPI ${evms.TCPI.toFixed(2)}. Forecast finish ${fmtDate(evms.forecastFinish)}.`);
  const fails = dcma.checks.filter((x) => x.applicable && !x.pass).map((x) => `#${x.id} ${x.name} ${x.value}`);
  L.push(`DCMA 14-POINT: ${dcma.passed}/${dcma.total} passed (${dcma.rating}); CPLI ${dcma.cpli.toFixed(2)}, BEI ${dcma.bei.toFixed(2)}. Failing: ${fails.length ? fails.join("; ") : "none"}.`);
  L.push(`FLOAT: ${floatA.counts.critical} critical (TF<=0), ${floatA.counts.negative} negative, ${floatA.counts.nearCritical} near-critical (1-10d); ${floatA.criticalPct}% of activities critical.`);
  if (floatA.negative.length) {
    L.push("NEGATIVE-FLOAT ACTIVITIES: " + floatA.negative.slice(0, 8).map((t) => `${t.code} ${t.name} (${t.totalFloat.toFixed(0)}d, finish ${fmtDate(t.finish)})`).join("; ") + ".");
  }
  L.push("DRIVING PATH (next critical): " + (floatA.drivingPath.slice(0, 8).map((t) => `${t.code} ${t.name} (${t.totalFloat.toFixed(0)}d)`).join("; ") || "none") + ".");

  const phases = computePhaseAnalysis(model, {});
  L.push("PHASES: " + phases.slice(0, 12).map((p) => `${p.name} ${p.pctComplete}% SPI ${p.spi.toFixed(2)} ${p.floatRisk}-risk fcst ${fmtDate(p.fcstEnd)}`).join("; ") + ".");

  const disc = computeDisciplineAnalysis(model, {});
  const clashes = computeClashDetection(model, {});
  L.push("DISCIPLINES: " + disc.slice(0, 12).map((p) => `${shortDisc(p.name)} ${p.pctComplete}% SPI ${p.spi.toFixed(2)} ${p.floatRisk}-risk`).join("; ") + ".");
  if (clashes.length) L.push("CLASH WINDOWS: " + clashes.slice(0, 5).map((cl) => `${cl.date.toLocaleDateString("en-GB", { month: "short", year: "numeric" })} ${cl.disciplines.map(shortDisc).join("+")} (${cl.risk})`).join("; ") + ".");

  const la = computeLookAheadDetail(model, 6);
  L.push(`LOOK-AHEAD (6wk ${fmtDate(la.window.from)}→${fmtDate(la.window.to)}): ${la.stats.total} activities, ${la.stats.starting} starting, ${la.stats.active} active, ${la.stats.critical} critical, ${la.stats.incompletePred} with incomplete predecessor.${la.nextMilestone ? ` Next milestone: ${la.nextMilestone.name} ${fmtDate(la.nextMilestone.date)}.` : ""}`);

  if (histogram && !histogram.empty) {
    const over = histogram.groups.filter((g) => g.overPeriods > 0).slice(0, 6);
    L.push(`RESOURCES: ${Math.round(histogram.cumulativeMax).toLocaleString()} total man-hours, peak ${Math.round(histogram.peak).toLocaleString()}/period, ${histogram.overPeriods} over-allocated periods.${over.length ? " Over-allocated: " + over.map((g) => `${g.name} (${g.overPeriods}p)`).join(", ") + "." : ""}`);
  }
  if (risks && risks.length) {
    L.push("RISK REGISTER: " + risks.slice(0, 6).map((r) => `[${r.severity}] ${r.category}: ${r.title}`).join("; ") + ".");
  }
  return L.join("\n");
}

export const ASSISTANT_SYSTEM = `You are the Pyramid AI Schedule Analyst, an expert Primavera P6 planner and project-controls advisor.
Answer the user's questions using ONLY the SCHEDULE DATA provided below. Do not invent activities, dates or figures that are not in the data; if something isn't in the data, say so plainly.
Be concise and practical for a construction project audience: lead with the direct answer, then a few supporting bullets. Use EVMS/DCMA best-practice framing (SPI, CPI, float, critical path, constraints) where relevant, and offer recommendations when the user asks what to do.
Keep answers under ~150 words unless asked for detail. Use short "- " bullets for lists.

SCHEDULE DATA:
`;
