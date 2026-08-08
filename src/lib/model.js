// =============================================================
// Model builder — normalizes parsed XER tables into a clean,
// analysis-ready object graph.
// =============================================================
import { num, xdate, HRS_PER_DAY } from "./xerParser.js";

const STATUS_LABEL = {
  TK_NotStart: "Not Started",
  TK_Active: "In Progress",
  TK_Complete: "Complete",
};

const TYPE_LABEL = {
  TT_Task: "Task",
  TT_Rsrc: "Resource Dependent",
  TT_Mile: "Start Milestone",
  TT_FinMile: "Finish Milestone",
  TT_LOE: "Level of Effort",
  TT_WBS: "WBS Summary",
  TT_Mtl: "Material",
};

const PRED_LABEL = {
  PR_FS: "FS",
  PR_SS: "SS",
  PR_FF: "FF",
  PR_SF: "SF",
};

export function buildModel(parsed) {
  const t = parsed.tables || {};
  const projects = t.PROJECT || [];
  const project = projects[0] || {};
  const projId = project.proj_id;

  // ── Calendars: hours-per-day for hour→day conversion ───────
  // P6 stores durations/float in hours; the number of hours in a
  // working day is per-calendar. Best practice is to convert with
  // each activity's own calendar rather than a fixed 8h assumption.
  const calHrs = {};
  (t.CALENDAR || []).forEach((c) => {
    let h = num(c.day_hr_cnt);
    if (!h && c.clndr_data) {
      // parse "DaysCount|N|..." style hour-per-day if present
      const m = String(c.clndr_data).match(/day_hr_cnt\)\(0\|\|(\d+(\.\d+)?)/);
      if (m) h = parseFloat(m[1]);
    }
    calHrs[c.clndr_id] = h && h > 0 ? h : HRS_PER_DAY;
  });
  const projCalHrs =
    calHrs[project.clndr_id] ||
    (Object.values(calHrs)[0] ?? HRS_PER_DAY);
  const hpd = (clndrId) => calHrs[clndrId] || projCalHrs || HRS_PER_DAY;

  const dataDate =
    xdate(project.last_recalc_date) ||
    xdate(project.sum_data_date) ||
    xdate(project.plan_start_date) ||
    new Date();

  // ── Resources ──────────────────────────────────────────────
  const rsrcById = {};
  (t.RSRC || []).forEach((r) => {
    rsrcById[r.rsrc_id] = {
      id: r.rsrc_id,
      name: r.rsrc_name || r.rsrc_short_name || "Resource",
      short: r.rsrc_short_name || "",
      type: r.rsrc_type || "RT_Labor",
      maxUnits: num(r.max_qty_per_hr), // concurrent availability (units)
    };
  });

  // ── Resource assignments (cost + qty) keyed by task ────────
  const assignByTask = {};
  (t.TASKRSRC || []).forEach((a) => {
    const tc = num(a.target_cost);
    const ac = num(a.act_reg_cost) + num(a.act_ot_cost);
    const rc = num(a.remain_cost) || Math.max(tc - ac, 0);
    const tq = num(a.target_qty);
    const aq = num(a.act_reg_qty) + num(a.act_ot_qty);
    const rq = num(a.remain_qty);
    const rec = {
      taskId: a.task_id,
      rsrcId: a.rsrc_id,
      targetCost: tc,
      actualCost: ac,
      remainCost: rc,
      targetQty: tq,
      actualQty: aq,
      remainQty: rq,
    };
    (assignByTask[a.task_id] = assignByTask[a.task_id] || []).push(rec);
  });

  // ── WBS nodes ──────────────────────────────────────────────
  const wbsById = {};
  (t.PROJWBS || []).forEach((w) => {
    wbsById[w.wbs_id] = {
      id: w.wbs_id,
      parent: w.parent_wbs_id,
      name: w.wbs_name || w.wbs_short_name || "WBS",
      short: w.wbs_short_name || "",
      isRoot: w.proj_node_flag === "Y",
      seq: num(w.seq_num),
    };
  });
  function wbsPath(id) {
    const parts = [];
    let cur = wbsById[id];
    let guard = 0;
    while (cur && !cur.isRoot && guard < 50) {
      parts.unshift(cur.name);
      cur = wbsById[cur.parent];
      guard++;
    }
    return parts;
  }

  // ── Activities ─────────────────────────────────────────────
  const rawTasks = (t.TASK || []).filter(
    (x) => !projId || x.proj_id === projId
  );

  const activities = rawTasks
    .filter((x) => x.task_type !== "TT_WBS" && x.task_type !== "TT_LOE")
    .map((x) => {
      const assigns = assignByTask[x.task_id] || [];
      const budget = assigns.reduce((s, a) => s + a.targetCost, 0);
      const actualCost = assigns.reduce((s, a) => s + a.actualCost, 0);
      const remainCost = assigns.reduce((s, a) => s + a.remainCost, 0);

      const isMile =
        x.task_type === "TT_Mile" || x.task_type === "TT_FinMile";
      const dh = hpd(x.clndr_id);
      const targetDur = num(x.target_drtn_hr_cnt) / dh;
      const remainDur = num(x.remain_drtn_hr_cnt) / dh;
      const totalFloat = num(x.total_float_hr_cnt) / dh;
      const freeFloat = num(x.free_float_hr_cnt) / dh;

      const status = x.status_code || "TK_NotStart";
      let pct = num(x.phys_complete_pct);
      if (status === "TK_Complete") pct = 100;
      else if (status === "TK_NotStart") pct = 0;
      else if (!pct && targetDur > 0)
        pct = Math.max(0, Math.min(100, (1 - remainDur / targetDur) * 100));
      pct = Math.round(pct * 10) / 10; // physical % complete to 1 dp

      const start =
        xdate(x.act_start_date) ||
        xdate(x.early_start_date) ||
        xdate(x.target_start_date) ||
        xdate(x.restart_date);
      const finish =
        xdate(x.act_end_date) ||
        xdate(x.early_end_date) ||
        xdate(x.reend_date) ||
        xdate(x.target_end_date);

      const wbsParts = wbsPath(x.wbs_id);

      return {
        id: x.task_id,
        code: x.task_code || x.task_id,
        name: x.task_name || "Activity",
        type: x.task_type,
        typeLabel: TYPE_LABEL[x.task_type] || "Task",
        isMilestone: isMile,
        status,
        statusLabel: STATUS_LABEL[status] || "Not Started",
        pctComplete: pct,
        targetDur,
        remainDur: status === "TK_Complete" ? 0 : remainDur || targetDur,
        totalFloat,
        freeFloat,
        critical: x.driving_path_flag === "Y" || totalFloat <= 0,
        driving: x.driving_path_flag === "Y",
        start,
        finish,
        targetStart: xdate(x.target_start_date),
        targetEnd: xdate(x.target_end_date),
        earlyStart: xdate(x.early_start_date),
        earlyEnd: xdate(x.early_end_date),
        lateStart: xdate(x.late_start_date),
        lateEnd: xdate(x.late_end_date),
        actStart: xdate(x.act_start_date),
        actEnd: xdate(x.act_end_date),
        cstrType: x.cstr_type || "",
        cstrDate: xdate(x.cstr_date),
        cstrType2: x.cstr_type2 || "",
        wbsId: x.wbs_id,
        wbs: wbsParts[0] || "Project",
        wbsFull: wbsParts.join(" · "),
        budget,
        actualCost,
        remainCost,
        assigns,
      };
    });

  const actById = {};
  activities.forEach((a) => (actById[a.id] = a));
  const taskCalHrs = {};
  rawTasks.forEach((x) => (taskCalHrs[x.task_id] = hpd(x.clndr_id)));

  // ── Relationships ──────────────────────────────────────────
  const relationships = (t.TASKPRED || [])
    .filter((r) => actById[r.task_id] && actById[r.pred_task_id])
    .map((r) => ({
      id: r.task_pred_id,
      succId: r.task_id,
      predId: r.pred_task_id,
      type: r.pred_type,
      typeLabel: PRED_LABEL[r.pred_type] || "FS",
      lag: num(r.lag_hr_cnt) / (taskCalHrs[r.task_id] || projCalHrs),
    }));

  // predecessor / successor adjacency
  const preds = {};
  const succs = {};
  activities.forEach((a) => {
    preds[a.id] = [];
    succs[a.id] = [];
  });
  relationships.forEach((r) => {
    preds[r.succId].push(r);
    succs[r.predId].push(r);
  });

  // ── Project window ─────────────────────────────────────────
  const starts = activities.map((a) => a.start).filter(Boolean);
  const finishes = activities.map((a) => a.finish).filter(Boolean);
  const planStart =
    xdate(project.plan_start_date) ||
    (starts.length ? new Date(Math.min(...starts)) : dataDate);
  const planFinish =
    xdate(project.scd_end_date) ||
    xdate(project.plan_end_date) ||
    (finishes.length ? new Date(Math.max(...finishes)) : dataDate);

  const hasBaseline = activities.some((a) => a.targetStart && a.targetEnd);
  const totalBudget = activities.reduce((s, a) => s + a.budget, 0);

  return {
    header: parsed.header,
    project: {
      id: projId,
      // full name = root WBS node name (P6 sets this to the project name);
      // fall back to the short code.
      name:
        Object.values(wbsById).find((w) => w.isRoot)?.name ||
        project.proj_short_name ||
        "Project",
      shortName: project.proj_short_name || "PROJECT",
      dataDate,
      planStart,
      planFinish,
      currency: parsed.header?.currency || "USD",
      version: parsed.header?.version || "",
    },
    activities,
    actById,
    relationships,
    preds,
    succs,
    resources: Object.values(rsrcById),
    rsrcById,
    wbsById,
    hasBaseline,
    hasCost: totalBudget > 0,
    totalBudget,
    counts: {
      activities: activities.length,
      relationships: relationships.length,
      resources: Object.keys(rsrcById).length,
      complete: activities.filter((a) => a.status === "TK_Complete").length,
      inProgress: activities.filter((a) => a.status === "TK_Active").length,
      notStarted: activities.filter((a) => a.status === "TK_NotStart").length,
      milestones: activities.filter((a) => a.isMilestone).length,
    },
  };
}

// ── Currency formatting (Indian/Western aware) ────────────────
const CUR_SYMBOL = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AUD: "A$" };
export function currencySymbol(cur) {
  return CUR_SYMBOL[cur] || (cur ? cur + " " : "$");
}
export function fmtMoney(v, cur = "USD") {
  const sym = currencySymbol(cur);
  const neg = v < 0;
  const abs = Math.abs(Math.round(v));
  const grouped =
    cur === "INR" ? indianGroup(abs) : abs.toLocaleString("en-US");
  return `${neg ? "-" : ""}${sym} ${grouped}`;
}
export function fmtMoneyShort(v, cur = "USD") {
  const sym = currencySymbol(cur);
  const abs = Math.abs(v);
  const neg = v < 0 ? "-" : "";
  if (cur === "INR") {
    if (abs >= 1e7) return `${neg}${sym}${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${neg}${sym}${(abs / 1e5).toFixed(2)} L`;
    return `${neg}${sym}${Math.round(abs).toLocaleString("en-IN")}`;
  }
  if (abs >= 1e9) return `${neg}${sym}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${neg}${sym}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${neg}${sym}${(abs / 1e3).toFixed(1)}K`;
  return `${neg}${sym}${Math.round(abs)}`;
}
function indianGroup(n) {
  const s = String(n);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

// Percentage → always one decimal place, e.g. 34.4% (v is 0–100).
export function fmtPct(v) {
  return (Number(v) || 0).toFixed(1) + "%";
}

export function fmtDate(d) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
export function fmtDateShort(d) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
export function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}
