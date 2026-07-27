// =============================================================
// Orchestrator — parse → model → run every analytic engine.
// =============================================================
import { parseXER } from "./xerParser.js";
import { buildModel } from "./model.js";
import { computeEVMS } from "./evms.js";
import { computeDCMA } from "./dcma.js";
import { computeFloat } from "./float.js";
import {
  computeSCurve,
  computeResourceHistogram,
  computeWBS,
  computeDiscipline,
  computeLookAhead,
} from "./curves.js";
import { buildRiskRegister } from "./risk.js";

export function analyzeXER(text) {
  const parsed = parseXER(text);
  const model = buildModel(parsed);
  if (model.activities.length === 0) {
    throw new Error(
      "No activities found. This file may not be a valid Primavera P6 XER export."
    );
  }
  const evms = computeEVMS(model);
  const dcma = computeDCMA(model);
  const floatA = computeFloat(model);
  const scurve = computeSCurve(model, evms);
  const histogram = computeResourceHistogram(model);
  const wbs = computeWBS(model);
  const discipline = computeDiscipline(model);
  const lookAhead = computeLookAhead(model);
  const risks = buildRiskRegister(model, evms, dcma, floatA);

  return {
    model,
    evms,
    dcma,
    floatA,
    scurve,
    histogram,
    wbs,
    discipline,
    lookAhead,
    risks,
  };
}
