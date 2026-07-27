// =============================================================
// Schedule Assistant — an in-browser Q&A engine over the analysed
// data. No network: it interprets the question by keyword/intent
// and answers straight from the model + analytic engines, so it
// works offline and never leaks the schedule.
// =============================================================
import { fmtDate, fmtMoneyShort } from "./model.js";
import { spiLabel, cpiLabel } from "./evms.js";
import { floatNarrative } from "./float.js";
import {
  computePhaseAnalysis, computeDisciplineAnalysis, disciplineNarrative,
  computeClashDetection, computeLookAheadDetail, disciplineOf, shortDisc,
} from "./curves.js";

// A canned set of starter prompts shown when the panel opens.
export const SUGGESTED_QUESTIONS = [
  "How is the project performing overall?",
  "Are we on schedule and on budget?",
  "What is driving the critical path?",
  "Which activities have negative float?",
  "How did we score on DCMA quality?",
  "Which phase is furthest behind?",
  "What's coming up in the next 6 weeks?",
  "Where are the resource over-allocations?",
];

// ── helpers ──────────────────────────────────────────────────
const pct = (v) => `${Math.round(v * 100)}%`;
const money = (v, cur) => fmtMoneyShort(v, cur);
const spiCpiWord = (v) => (v >= 1.05 ? "ahead" : v >= 0.98 ? "on plan" : v >= 0.9 ? "slightly behind" : "behind");

// Each answer is { text: [paragraphs], bullets?: [..], tone? }.
function A(text, extra = {}) {
  return { text: Array.isArray(text) ? text : [text], ...extra };
}

// ── intent matchers ──────────────────────────────────────────
// Ordered list; first match wins. Each has a test(q) and answer(a).
const INTENTS = [
  // ---- greeting / help ----
  {
    keys: [/^\s*(hi|hello|hey|help|what can you)/i],
    answer: () =>
      A("I can answer questions about this schedule — try asking about progress, cost, the critical path, float, DCMA quality, phases, disciplines, resources, risks or the look-ahead.", {
        bullets: SUGGESTED_QUESTIONS.slice(0, 5),
      }),
  },

  // ---- overall performance / summary ----
  {
    keys: [/overall|summary|how('| i)s.*(project|thing|it going)|performing|health|status|on track/i],
    answer: (a) => {
      const { evms, dcma, floatA, model } = a;
      const s = spiLabel(evms.SPI), c = cpiLabel(evms.CPI);
      const done = model.counts.complete, tot = model.counts.activities;
      return A(
        [
          `${model.project.name} is ${pct(evms.pctEarned)} complete (${done} of ${tot} activities done), as of the data date ${fmtDate(model.project.dataDate)}.`,
          `Schedule is ${s.text} (SPI ${evms.SPI.toFixed(2)}) and cost is ${c.text} (CPI ${evms.CPI.toFixed(2)}).`,
        ],
        {
          tone: s.tone === "danger" || c.tone === "danger" ? "danger" : s.tone === "warning" ? "warning" : "success",
          bullets: [
            `Forecast finish ${fmtDate(evms.forecastFinish)} (plan ${fmtDate(model.project.planFinish)})`,
            `DCMA schedule quality ${dcma.passed}/${dcma.total} (${dcma.rating})`,
            `${floatA.counts.critical} critical activities, ${floatA.counts.negative} in negative float`,
          ],
        }
      );
    },
  },

  // ---- schedule (SPI) ----
  {
    keys: [/\bspi\b|behind|ahead|on schedule|slippage|schedule performance|are we late/i],
    answer: (a) => {
      const { evms, model } = a;
      const s = spiLabel(evms.SPI);
      return A(
        [
          `Schedule Performance Index (SPI) is ${evms.SPI.toFixed(2)} — the project is ${s.text}.`,
          `That means ${pct(evms.pctEarned)} of the work is earned against ${pct(evms.pctPlanned)} planned by now. Schedule variance is ${money(evms.SV, evms.currency)}.`,
        ],
        { tone: s.tone, bullets: [`Forecast finish ${fmtDate(evms.forecastFinish)} vs plan ${fmtDate(model.project.planFinish)}`] }
      );
    },
  },

  // ---- cost (CPI / budget) ----
  {
    keys: [/\bcpi\b|budget|cost|over.?run|under.?run|eac|vac|money|spend|expensive/i],
    answer: (a) => {
      const { evms } = a;
      if (!evms.hasCost)
        return A("This schedule isn't cost-loaded, so cost figures are approximated from durations. Load resource costs in P6 for a true CPI/EAC picture.", { tone: "warning" });
      const c = cpiLabel(evms.CPI);
      return A(
        [
          `Cost Performance Index (CPI) is ${evms.CPI.toFixed(2)} — ${c.text}.`,
          `Budget at completion (BAC) is ${money(evms.BAC, evms.currency)}; forecast final cost (EAC) is ${money(evms.EAC, evms.currency)}.`,
        ],
        {
          tone: c.tone,
          bullets: [
            `Spent to date (AC) ${money(evms.AC, evms.currency)} · earned (EV) ${money(evms.EV, evms.currency)}`,
            `Variance at completion (VAC) ${money(evms.VAC, evms.currency)} — ${evms.VAC < 0 ? "forecast overspend" : "within budget"}`,
            `To-complete index (TCPI) ${evms.TCPI.toFixed(2)}`,
          ],
        }
      );
    },
  },

  // ---- critical path / driving path ----
  {
    keys: [/critical path|driving path|longest path|what.*driv/i],
    answer: (a) => {
      const { floatA } = a;
      const dp = floatA.drivingPath.slice(0, 6);
      if (!dp.length) return A("No incomplete critical activities — nothing is currently driving the finish date.", { tone: "success" });
      return A(
        `The critical path runs through ${floatA.drivingPath.length} incomplete activities (${floatA.criticalPct}% of the schedule is critical). The nearest drivers are:`,
        {
          tone: "warning",
          bullets: dp.map((t) => `${t.code} ${t.name} — ${t.totalFloat.toFixed(0)}d float, finish ${fmtDate(t.finish)}`),
        }
      );
    },
  },

  // ---- float / negative float ----
  {
    keys: [/negative float|float|slack|near.?critical/i],
    answer: (a) => {
      const { floatA, model } = a;
      const n = floatNarrative(floatA, model);
      const neg = floatA.negative.slice(0, 6);
      return A(
        [n.verdict.text],
        {
          tone: n.verdict.tone,
          bullets: neg.length
            ? neg.map((t) => `${t.code} ${t.name} — ${t.totalFloat.toFixed(0)}d`)
            : [`${floatA.counts.critical} critical (0-float), ${floatA.counts.nearCritical} near-critical (1–10d)`],
        }
      );
    },
  },

  // ---- DCMA / quality ----
  {
    keys: [/dcma|quality|14.?point|checks?|logic|constraints?|is.*schedule.*(good|sound|valid)/i],
    answer: (a) => {
      const { dcma } = a;
      const failed = dcma.checks.filter((c) => c.applicable && !c.pass);
      return A(
        [`The schedule scores ${dcma.passed}/${dcma.total} on the DCMA 14-Point assessment — rated ${dcma.rating}.`],
        {
          tone: dcma.passed >= 12 ? "success" : dcma.passed >= 8 ? "warning" : "danger",
          bullets: failed.length
            ? failed.map((c) => `Failing #${c.id} ${c.name}: ${c.value} (${c.detail})`)
            : ["All applicable checks pass."],
        }
      );
    },
  },

  // ---- phases ----
  {
    keys: [/phase/i],
    answer: (a) => {
      const { model } = a;
      const phases = computePhaseAnalysis(model, {});
      const behind = [...phases].filter((p) => p.done < p.total).sort((x, y) => x.spi - y.spi);
      const worst = behind[0];
      return A(
        worst
          ? [`Across ${phases.length} phases, "${worst.name}" is furthest behind at SPI ${worst.spi.toFixed(2)} (${worst.pctComplete}% complete, forecast ${fmtDate(worst.fcstEnd)}).`]
          : [`All ${phases.length} phases are complete.`],
        {
          tone: worst && worst.floatRisk === "High" ? "danger" : "warning",
          bullets: phases.slice(0, 6).map((p) => `${p.name}: ${p.pctComplete}% · SPI ${p.spi.toFixed(2)} · ${p.floatRisk} float risk`),
        }
      );
    },
  },

  // ---- disciplines / systems / clashes ----
  {
    keys: [/discipline|system|trade|clash|congestion/i],
    answer: (a) => {
      const { model } = a;
      const disc = computeDisciplineAnalysis(model, {});
      const clashes = computeClashDetection(model, {});
      const critical = disc.filter((p) => p.floatRisk === "High");
      if (/clash|congestion/i.test(a.__q || "")) {
        return clashes.length
          ? A(`${clashes.length} clash window${clashes.length > 1 ? "s" : ""} where 3+ disciplines peak together:`, {
              tone: "warning",
              bullets: clashes.slice(0, 5).map((c) => `${c.date.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}: ${c.disciplines.map(shortDisc).join(", ")} — ${c.risk} risk`),
            })
          : A("No clash windows — disciplines are well sequenced with no 3-way concurrent peaks.", { tone: "success" });
      }
      if (!critical.length) return A(`None of the ${disc.length} disciplines carry critical float exposure — all have positive float.`, { tone: "success" });
      const acts = groupByDiscipline(model);
      const p = critical[0];
      const n = disciplineNarrative(p, acts[p.name] || [], model, clashes);
      return A(
        [`${critical.length} discipline${critical.length > 1 ? "s" : ""} carry critical float exposure. ${shortDisc(p.name)} is the most exposed — ${n.crit.length} critical activit${n.crit.length === 1 ? "y" : "ies"}, worst ${n.crit[0] ? n.crit[0].totalFloat.toFixed(0) : 0}d.`],
        {
          tone: "danger",
          bullets: n.items.slice(0, 4).map((it) => `${it.code} ${it.name} (${it.float.toFixed(0)}d) — ${it.why}`),
        }
      );
    },
  },

  // ---- look-ahead ----
  {
    keys: [/look.?ahead|next \d|upcoming|coming up|this week|next week|weeks?/i],
    answer: (a) => {
      const { model } = a;
      const m = (a.__q || "").match(/(\d)\s*week/);
      const weeks = m ? Math.max(1, Math.min(12, +m[1])) : 6;
      const la = computeLookAheadDetail(model, weeks);
      return A(
        [`In the next ${weeks} weeks (${fmtDate(la.window.from)} – ${fmtDate(la.window.to)}) there are ${la.stats.total} activities in the window: ${la.stats.starting} starting, ${la.stats.active} in progress.`],
        {
          tone: la.stats.critical ? "warning" : "success",
          bullets: [
            `${la.stats.critical} critical, ${la.stats.nearCritical} near-critical in the window`,
            la.stats.incompletePred ? `${la.stats.incompletePred} due to start with an incomplete predecessor` : "No blocked starts",
            la.nextMilestone ? `Next milestone: ${la.nextMilestone.name} on ${fmtDate(la.nextMilestone.date)}` : "No upcoming milestone",
          ],
        }
      );
    },
  },

  // ---- resources / histogram ----
  {
    keys: [/resource|histogram|man.?hour|labour|labor|crew|over.?alloc|peak/i],
    answer: (a) => {
      const { histogram } = a;
      if (histogram.empty) return A("This schedule has no resource assignments to analyse.", { tone: "warning" });
      const over = histogram.groups.filter((g) => g.overPeriods > 0);
      return A(
        [`Total demand is ${Math.round(histogram.cumulativeMax).toLocaleString()} man-hours across ${histogram.groups.length} resources, peaking at ${Math.round(histogram.peak).toLocaleString()} hrs in a period.`],
        {
          tone: histogram.overPeriods ? "danger" : "success",
          bullets: over.length
            ? over.slice(0, 5).map((g) => `${g.name}: over-allocated in ${g.overPeriods} period${g.overPeriods > 1 ? "s" : ""} (peak ${g.peakHrs.toLocaleString()} hrs)`)
            : ["No resource over-allocation detected."],
        }
      );
    },
  },

  // ---- risks ----
  {
    keys: [/\brisks?\b|register|threats?|issues?|concerns?|worried/i],
    answer: (a) => {
      const { risks } = a;
      if (!risks || !risks.length) return A("No material risks flagged — the schedule is healthy across cost, schedule, logic and float.", { tone: "success" });
      return A(`${risks.length} risk${risks.length > 1 ? "s" : ""} are on the auto-generated register, highest first:`, {
        tone: risks[0].severity === "High" ? "danger" : "warning",
        bullets: risks.slice(0, 5).map((r) => `${r.severity} · ${r.category}: ${r.title}`),
      });
    },
  },

  // ---- milestones ----
  {
    keys: [/milestone|deliverable|handover|completion date|finish date|when.*(finish|done|complete)/i],
    answer: (a) => {
      const { model, evms } = a;
      const ms = model.activities
        .filter((x) => x.isMilestone && x.status !== "TK_Complete")
        .map((x) => ({ x, when: x.finish || x.targetEnd }))
        .filter((o) => o.when)
        .sort((p, q) => p.when - q.when);
      return A(
        [`Forecast project finish is ${fmtDate(evms.forecastFinish)} (plan ${fmtDate(model.project.planFinish)}).`],
        {
          bullets: ms.length
            ? ms.slice(0, 6).map((o) => `${o.x.name} — ${fmtDate(o.when)}`)
            : ["No incomplete milestones remaining."],
        }
      );
    },
  },

  // ---- counts / scope ----
  {
    keys: [/how many|number of|count|total activities|scope|size/i],
    answer: (a) => {
      const { model } = a;
      const c = model.counts;
      return A(`The schedule holds ${c.activities} activities and ${c.relationships} logic links.`, {
        bullets: [
          `${c.complete} complete · ${c.inProgress} in progress · ${c.notStarted} not started`,
          `${c.milestones} milestones · ${c.resources} resources`,
          `Data date ${fmtDate(model.project.dataDate)}`,
        ],
      });
    },
  },
];

function groupByDiscipline(model) {
  const by = {};
  model.activities.forEach((a) => { (by[disciplineOf(a)] = by[disciplineOf(a)] || []).push(a); });
  return by;
}

// ── public API ───────────────────────────────────────────────
export function answerQuestion(analysis, question) {
  const q = String(question || "").trim();
  if (!q) return A("Ask me anything about this schedule.");
  // stash the raw question so intents can read modifiers (weeks, clash, etc.)
  const ctx = { ...analysis, __q: q };
  for (const intent of INTENTS) {
    if (intent.keys.some((re) => re.test(q))) return intent.answer(ctx);
  }
  // fallback — no intent matched
  return A(
    [
      "I couldn't map that to the schedule data. I answer best on these topics:",
    ],
    {
      tone: "neutral",
      bullets: ["Progress & EVMS (SPI, CPI, EAC)", "Critical path & float", "DCMA quality", "Phases & disciplines", "Resources & look-ahead", "Risks & milestones"],
    }
  );
}
