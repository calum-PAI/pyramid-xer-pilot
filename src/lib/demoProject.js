// =============================================================
// Demo project — "GIZA-EPC Portfolio".
// Dates & float are derived from a genuine forward/backward CPM
// pass so the schedule is internally consistent (plan finish,
// negative float and the Monte Carlo forecast all agree), then
// emitted as a real .XER text string the production parser reads.
// =============================================================

const PROJ_START = new Date(2024, 7, 1); // 01 Aug 2024

// wbsId, name
const WBS = [
  ["W1", "Civil & Foundation"],
  ["W2", "Structural Steel"],
  ["W3", "Equipment Erection"],
  ["W4", "Piping"],
  ["W5", "Electrical"],
  ["W6", "Instrumentation"],
  ["W7", "Commissioning"],
];

// rsrcId, name, short, type, maxUnits (concurrent crew size / availability)
const RSRC = [
  ["RL1", "Civil Crew", "CIV", "RT_Labor", 3],
  ["RL2", "Structural Fitters", "STL", "RT_Labor", 3],
  ["RL3", "Mechanical Erectors", "MEC", "RT_Labor", 3],
  ["RL4", "Piping Crew", "PIP", "RT_Labor", 4],
  ["RL5", "E&I Technicians", "ENI", "RT_Labor", 4],
  ["RL6", "Commissioning Team", "COM", "RT_Labor", 3],
  ["RE1", "Crawler Crane 250T", "CRN", "RT_Equip", 1],
  ["RE2", "Welding Sets", "WLD", "RT_Equip", 2],
];

// code, name, wbs, durDays, cost(₹), rsrc, milestone?
const A = [
  ["A1000", "Mobilization & Site Setup", "W1", 20, 850000, "RL1"],
  ["A1001", "Site Grading & Earthworks", "W1", 25, 1250000, "RL1"],
  ["A1002", "Piling Works", "W1", 35, 2100000, "RL1"],
  ["A1003", "Pile Cap & Raft", "W1", 22, 1450000, "RL1"],
  ["A1004", "Underground Piping & Ducts", "W1", 20, 980000, "RL1"],
  ["A1005", "Reactor Foundation Concrete", "W1", 30, 1780000, "RL1"],
  ["A1006", "Compressor House Foundation", "W1", 24, 1320000, "RL1"],
  ["A1007", "Paving & Roads Phase 1", "W1", 20, 890000, "RL1"],
  ["A1008", "Steel Delivery & Inspection", "W2", 30, 1650000, "RL2"],
  ["A1009", "Steel Erection - Pipe Rack", "W2", 45, 2450000, "RL2"],
  ["A1010", "Steel Erection - Reactor Struct", "W2", 40, 2200000, "RL2"],
  ["A1011", "Steel Erection - Compressor House", "W2", 40, 1980000, "RL2"],
  ["A1012", "Reactor Vessel Delivery", "W3", 20, 3200000, "RL3"],
  ["A1013", "Reactor Vessel Erection", "W3", 24, 2650000, "RL3"],
  ["A1014", "Heat Exchanger Installation", "W3", 25, 1450000, "RL3"],
  ["A1015", "Compressor - Installation", "W3", 22, 2850000, "RL3"],
  ["A1016", "Pumps & Package Units", "W3", 24, 1250000, "RL3"],
  ["A1017", "Equipment Alignment & Grouting", "W3", 20, 680000, "RL3"],
  ["A1018", "Large Bore Piping - Prefab", "W4", 30, 1980000, "RL4"],
  ["A1019", "Large Bore Piping - Erection", "W4", 35, 2250000, "RL4"],
  ["A1020", "Small Bore Piping", "W4", 45, 1650000, "RL4"],
  ["A1021", "Piping Supports & Insulation", "W4", 25, 920000, "RL4"],
  ["A1022", "Hydrotesting - Piping", "W4", 30, 780000, "RL4"],
  ["A1023", "Cable Tray & Conduit", "W5", 30, 1120000, "RL5"],
  ["A1024", "Power Cable Pulling", "W5", 35, 1350000, "RL5"],
  ["A1025", "Transformer & Switchgear", "W5", 30, 1680000, "RL5"],
  ["A1026", "Earthing & Lightning Protection", "W5", 18, 640000, "RL5"],
  ["A1027", "Instrument Installation", "W6", 40, 1240000, "RL5"],
  ["A1028", "Cable Termination & Glanding", "W6", 30, 780000, "RL5"],
  ["A1029", "DCS Configuration", "W6", 45, 1450000, "RL5"],
  ["A1030", "Loop Checking", "W6", 30, 890000, "RL6"],
  ["A1031", "Pre-Commissioning", "W7", 35, 1350000, "RL6"],
  ["A1032", "Mechanical Completion MS", "W7", 0, 0, "RL6", true, -10],
  ["A1033", "Nitrogen Purging & Leak Test", "W7", 20, 620000, "RL6"],
  ["A1034", "Commissioning & Startup", "W7", 30, 980000, "RL6"],
  ["A1035", "Performance Test Run", "W7", 20, 540000, "RL6"],
  ["A1036", "Handover & Final Acceptance", "W7", 0, 0, "RL6", true, 0],
  // ── Programme milestones (finish milestones). 8th col = baseline days early(+)/late(-) ──
  ["MS10", "Enabling Works Complete", "W1", 0, 0, "RL1", true, 2],
  ["MS20", "Foundations Complete", "W1", 0, 0, "RL1", true, 0],
  ["MS30", "Structural Steel Erection Complete", "W2", 0, 0, "RL2", true, 5],
  ["MS40", "Mechanical Erection Complete", "W3", 0, 0, "RL3", true, -12],
  ["MS50", "Piping & Hydrotest Complete", "W4", 0, 0, "RL4", true, 7],
  ["MS60", "E&I & Loop Checks Complete", "W6", 0, 0, "RL6", true, -6],
];

// predecessor chains: [pred, succ, type, lagDays]
const PRED = [
  ["A1000", "A1001", "PR_FS", 0], ["A1001", "A1002", "PR_FS", 0],
  ["A1002", "A1003", "PR_FS", 0], ["A1003", "A1004", "PR_SS", 5],
  ["A1003", "A1005", "PR_FS", 0], ["A1005", "A1006", "PR_FS", 0],
  ["A1002", "A1007", "PR_FS", 10], ["A1004", "A1008", "PR_FS", 0],
  ["A1008", "A1009", "PR_FS", 0], ["A1009", "A1010", "PR_SS", 10],
  ["A1006", "A1011", "PR_FS", 0], ["A1010", "A1012", "PR_FS", -5],
  ["A1012", "A1013", "PR_FS", 0], ["A1013", "A1014", "PR_FS", 0],
  ["A1011", "A1015", "PR_FS", 0], ["A1015", "A1016", "PR_FS", 0],
  ["A1016", "A1017", "PR_FS", 0], ["A1010", "A1018", "PR_FS", 5],
  ["A1018", "A1019", "PR_FS", 0], ["A1019", "A1020", "PR_SS", 8],
  ["A1020", "A1021", "PR_FS", 0], ["A1021", "A1022", "PR_FS", 0],
  ["A1017", "A1022", "PR_FS", 5], ["A1019", "A1023", "PR_FS", 0],
  ["A1023", "A1024", "PR_FS", 0], ["A1024", "A1025", "PR_FS", 0],
  ["A1024", "A1026", "PR_SS", 5], ["A1025", "A1027", "PR_FS", 0],
  ["A1027", "A1028", "PR_FS", 0], ["A1028", "A1029", "PR_FS", 0],
  ["A1029", "A1030", "PR_FS", 0], ["A1022", "A1030", "PR_FS", 3],
  ["A1030", "A1031", "PR_FS", 0], ["A1031", "A1032", "PR_FS", 0],
  ["A1032", "A1033", "PR_FS", 0], ["A1033", "A1034", "PR_FS", 0],
  ["A1034", "A1035", "PR_FS", 0], ["A1035", "A1036", "PR_FS", 0],
  // milestone links
  ["A1004", "MS10", "PR_FS", 0], ["A1006", "MS20", "PR_FS", 0],
  ["A1011", "MS30", "PR_FS", 0], ["A1017", "MS40", "PR_FS", 0],
  ["A1022", "MS50", "PR_FS", 0], ["A1030", "MS60", "PR_FS", 0],
];

// ── CPM forward + backward pass to derive ES/EF/LS/LF/TF ──────
function computeCPM() {
  const dur = {}, mile = {};
  A.forEach((r) => { dur[r[0]] = r[3]; mile[r[0]] = !!r[6]; });

  const preds = {}, succs = {};
  A.forEach((r) => { preds[r[0]] = []; succs[r[0]] = []; });
  PRED.forEach(([p, s, t, l]) => {
    preds[s].push({ p, t, l });
    succs[p].push({ s, t, l });
  });

  // topological order
  const indeg = {};
  A.forEach((r) => (indeg[r[0]] = preds[r[0]].length));
  const q = A.filter((r) => indeg[r[0]] === 0).map((r) => r[0]);
  const order = [];
  while (q.length) {
    const id = q.shift();
    order.push(id);
    succs[id].forEach(({ s }) => { if (--indeg[s] === 0) q.push(s); });
  }

  // forward pass
  const ES = {}, EF = {};
  order.forEach((id) => {
    let es = 0;
    preds[id].forEach(({ p, t, l }) => {
      if (t === "PR_SS") es = Math.max(es, ES[p] + l);
      else if (t === "PR_FF") es = Math.max(es, EF[p] + l - dur[id]);
      else es = Math.max(es, EF[p] + l); // FS
    });
    ES[id] = Math.max(0, es);
    EF[id] = ES[id] + dur[id];
  });

  const F = Math.max(...Object.values(EF)); // natural finish
  const DEADLINE = F - 6; // contractual finish slightly inside longest path

  // backward pass
  const LF = {}, LS = {};
  [...order].reverse().forEach((id) => {
    let lf = succs[id].length ? Infinity : DEADLINE;
    succs[id].forEach(({ s, t, l }) => {
      if (t === "PR_SS") lf = Math.min(lf, LS[s] - l + dur[id]);
      else if (t === "PR_FF") lf = Math.min(lf, LF[s] - l);
      else lf = Math.min(lf, LS[s] - l); // FS
    });
    LF[id] = lf;
    LS[id] = lf - dur[id];
  });

  const TF = {};
  A.forEach((r) => (TF[r[0]] = Math.round((LF[r[0]] - EF[r[0]]) * 10) / 10));

  // data date = finish of the 12th task to complete (~1/3 done).
  // Exclude milestones so the DD anchor is stable regardless of milestone count.
  const sortedEF = A.filter((r) => !r[6]).map((r) => EF[r[0]]).sort((a, b) => a - b);
  const DD = Math.round(sortedEF[11]) + 2;

  return { ES, EF, TF, F, DEADLINE, DD, mile };
}

function dayToXer(day) {
  const d = new Date(PROJ_START.getTime() + day * 86400000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 08:00`;
}

export function demoXER() {
  const cpm = computeCPM();
  const { ES, EF, TF, DEADLINE, DD } = cpm;
  const T = "\t";
  const L = [];

  L.push(["ERMHDR", "20.12", dayToXer(DD), "Project", "admin", "Adapt", "dbxProject", "Pyramid", "USD"].join(T));

  L.push("%T" + T + "PROJECT");
  L.push("%F" + T + ["proj_id", "proj_short_name", "plan_start_date", "plan_end_date", "scd_end_date", "last_recalc_date", "clndr_id"].join(T));
  L.push("%R" + T + ["1", "GIZA-EPC", dayToXer(0), dayToXer(DEADLINE), dayToXer(DEADLINE), dayToXer(DD), "C1"].join(T));

  L.push("%T" + T + "CALENDAR");
  L.push("%F" + T + ["clndr_id", "clndr_name", "day_hr_cnt", "week_hr_cnt"].join(T));
  L.push("%R" + T + ["C1", "Standard 6-Day", "8", "48"].join(T));

  L.push("%T" + T + "PROJWBS");
  L.push("%F" + T + ["wbs_id", "proj_id", "parent_wbs_id", "seq_num", "proj_node_flag", "wbs_name", "wbs_short_name"].join(T));
  L.push("%R" + T + ["W0", "1", "", "0", "Y", "GIZA-EPC Portfolio", "GIZA"].join(T));
  WBS.forEach(([id, name], i) => {
    L.push("%R" + T + [id, "1", "W0", String(i + 1), "N", name, name.split(" ")[0]].join(T));
  });

  L.push("%T" + T + "RSRC");
  L.push("%F" + T + ["rsrc_id", "rsrc_name", "rsrc_short_name", "rsrc_type", "max_qty_per_hr"].join(T));
  RSRC.forEach(([id, name, short, type, maxU]) => L.push("%R" + T + [id, name, short, type, String(maxU)].join(T)));

  L.push("%T" + T + "TASK");
  L.push("%F" + T + [
    "task_id", "proj_id", "wbs_id", "clndr_id", "task_code", "task_name", "task_type",
    "status_code", "target_drtn_hr_cnt", "remain_drtn_hr_cnt", "total_float_hr_cnt",
    "free_float_hr_cnt", "phys_complete_pct", "driving_path_flag",
    "target_start_date", "target_end_date", "early_start_date", "early_end_date",
    "act_start_date", "act_end_date", "cstr_type", "cstr_date",
  ].join(T));

  A.forEach(([code, name, wbs, dur, cost, rsrc, milestone, blOffset]) => {
    const es = ES[code], ef = EF[code], tf = TF[code];
    let status, pct, remain;
    if (ef <= DD) { status = "TK_Complete"; pct = 100; remain = 0; }
    else if (es < DD) {
      status = "TK_Active";
      pct = Math.max(5, Math.min(95, Math.round(((DD - es) / Math.max(dur, 1)) * 100)));
      remain = Math.round(dur * 8 * (1 - pct / 100));
    } else { status = "TK_NotStart"; pct = 0; remain = dur * 8; }

    const type = milestone ? "TT_Mile" : "TT_Task";
    // baseline (target) offset — for milestones, baseline sits blOffset days
    // from the forecast/actual, so the report shows early(+)/late(-) variance.
    const off = milestone ? blOffset || 0 : 0;
    const tS = dayToXer(es + off), tE = dayToXer(ef + off);
    const actS = status !== "TK_NotStart" ? dayToXer(es) : "";
    const actE = status === "TK_Complete" ? dayToXer(ef) : "";
    const cstr = code === "A1036" ? "CS_MEO" : "";
    const cstrDate = code === "A1036" ? dayToXer(DEADLINE) : "";

    L.push("%R" + T + [
      code, "1", wbs, "C1", code, name, type, status,
      String(dur * 8), String(remain), String(Math.round(tf * 8)), "0",
      String(pct), tf <= 0 ? "Y" : "N",
      tS, tE, dayToXer(es), dayToXer(ef), actS, actE, cstr, cstrDate,
    ].join(T));
  });

  L.push("%T" + T + "TASKPRED");
  L.push("%F" + T + ["task_pred_id", "task_id", "pred_task_id", "proj_id", "pred_proj_id", "pred_type", "lag_hr_cnt"].join(T));
  PRED.forEach(([pred, succ, type, lag], i) => {
    L.push("%R" + T + [String(i + 1), succ, pred, "1", "1", type, String(lag * 8)].join(T));
  });

  L.push("%T" + T + "TASKRSRC");
  L.push("%F" + T + [
    "taskrsrc_id", "task_id", "rsrc_id", "proj_id", "target_cost", "act_reg_cost",
    "remain_cost", "target_qty", "act_reg_qty", "remain_qty",
  ].join(T));
  let ti = 1;
  A.forEach(([code, name, wbs, dur, cost, rsrc]) => {
    if (!cost) return;
    const es = ES[code], ef = EF[code];
    const pct = ef <= DD ? 1 : es < DD ? Math.max(0.05, Math.min(0.95, (DD - es) / Math.max(dur, 1))) : 0;
    const actCost = Math.round(cost * pct * 1.05); // ~CPI 0.95
    const remCost = Math.max(cost - actCost, 0);
    const qty = Math.round(dur * 8 * 3);
    L.push("%R" + T + [
      String(ti++), code, rsrc, "1", String(cost), String(actCost),
      String(remCost), String(qty), String(Math.round(qty * pct)), String(Math.round(qty * (1 - pct))),
    ].join(T));
  });

  L.push("%E");
  return L.join("\n");
}
