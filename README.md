# Pyramid AI — Schedule Intelligence for Primavera P6

Drop a Primavera P6 `.XER` file and instantly get a full schedule-intelligence
report — EVMS, DCMA 14-Point quality, S-curves, resource histograms, float &
critical-path exposure, phase/discipline analysis and an auto-generated risk
register — plus an AI schedule assistant and a formal programme-review letter.
Everything is parsed and computed **100% in the browser** — no file is ever
uploaded to a server.

Styled end-to-end with the **Pyramid AI design system** (Vibrant Blue, Inter +
IBM Plex Mono, pill CTAs, gradient hero band).

## Run

```bash
npm install
npm run dev          # http://localhost:5178
```

Click **Load demo project** to explore the "GIZA-EPC Portfolio" sample,
or drag in any real P6 `.XER` export.

## Deploy (Vercel)

The app is a static Vite build, so hosting is zero-config. Import the repo in
the Vercel dashboard (**Add New → Project**): Vercel auto-detects **Vite** and
the included `vercel.json` sets the build (`npm run build`) and output (`dist`).
On a real domain the Google Fonts load and the optional live-AI calls work — the
only limitation of the in-browser artifact preview.

**AI is bring-your-own-key:** each user adds their own OpenAI key in
**Settings → AI Analyst**; it is stored only in that browser and never bundled
into the app. Without a key the assistant and letter use the built-in engine.

## What it computes (best-practice methods)

All calculations run on the **uploaded file's own data** — stored float, dates,
cost/resource loading and calendars.

### EVMS (Earned Value)
- **PV / EV / AC** — Planned Value (budget × baseline % complete to the data
  date), Earned Value (budget × physical % complete), Actual Cost (`act_reg_cost`
  + `act_ot_cost`).
- **SPI** = EV / PV · **CPI** = EV / AC
- **EAC** = BAC / CPI · **ETC** = EAC − AC · **VAC** = BAC − EAC · **TCPI** =
  (BAC − EV) / (BAC − AC)
- **SV / CV**, % planned / earned / actual, SPI-based forecast finish.
- If a schedule is not cost-loaded, EVMS falls back to a duration-weighted
  *work* basis (values shown in days) so every XER still yields a picture.

### DCMA 14-Point Assessment
All fourteen checks with standard thresholds: Logic, Leads, Lags, Relationship
Types, Hard Constraints, High Float (>44d), Negative Float, High Duration
(baseline >44d), Invalid Dates, Resources, Missed Tasks, Critical Path Test,
**CPLI** and **BEI**. The Resources test is marked N/A when the schedule is not
resource-loaded, and the score is rated Excellent / Good / Fair / Poor.

### Float, Critical Path & Negative Float
Uses P6's stored total/free float (calendar-aware hour→day conversion). Surfaces
the critical path (TF ≤ 0), near-critical band, negative-float exposure list, the
driving path and a float distribution histogram.

### S-Curves & Resource Histograms
Budget/quantity is time-phased across baseline and actual dates into monthly
buckets to produce cumulative PV/EV/AC S-curves and a stacked resource histogram
from `TASKRSRC` assignments.

### Risk Register & Monte Carlo
- **Auto risk register** — derives ranked risks (likelihood × impact, with
  mitigations) from schedule signals: negative float, CPI/SPI erosion, open
  logic, long durations, missed baselines, DCMA failures and hard constraints.
- **Monte Carlo** — a relationship-type-aware CPM forward pass over remaining
  durations, sampled with a triangular distribution plus a correlated systemic
  factor, over 2,000 iterations. Reports P50 / P80 / P90 finish dates, the
  probability of meeting the plan, and a finish-date histogram.

## Architecture

```
src/
  lib/
    xerParser.js     tab-delimited XER → tables
    model.js         normalize tasks / rels / WBS / resources (calendar-aware)
    evms.js          earned-value engine
    dcma.js          14-point assessment + CPLI + BEI
    float.js         float / critical path / negative float
    curves.js        S-curves, histograms, WBS/phase/discipline, look-ahead
    risk.js          risk register + Monte Carlo
    analyze.js       orchestrator
    demoProject.js   sample schedule (emitted as real XER text)
  components/        Sidebar, TopBar, Upload, Icons, ui, charts (SVG)
  views/             Overview, SCurves, Histogram, LookAhead, Rollup,
                     EVMS, Float, DCMA, Risk, Settings
  styles.css         Pyramid AI design tokens
```

Charts are dependency-free inline SVG; the only runtime dependencies are React
and React-DOM.
