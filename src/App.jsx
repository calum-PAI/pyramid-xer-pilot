import { useState, useCallback } from "react";
import Sidebar from "./components/Sidebar.jsx";
import TopBar from "./components/TopBar.jsx";
import Upload from "./components/Upload.jsx";
import Overview from "./views/Overview.jsx";
import SCurves from "./views/SCurves.jsx";
import Histogram from "./views/Histogram.jsx";
import LookAhead from "./views/LookAhead.jsx";
import Rollup from "./views/Rollup.jsx";
import Phase from "./views/Phase.jsx";
import Discipline from "./views/Discipline.jsx";
import EVMS from "./views/EVMS.jsx";
import Float from "./views/Float.jsx";
import DCMA from "./views/DCMA.jsx";
import Risk from "./views/Risk.jsx";
import Settings from "./views/Settings.jsx";
import Guide from "./views/Guide.jsx";
import Report from "./components/Report.jsx";
import ReviewLetter from "./components/ReviewLetter.jsx";
import AssistantPanel from "./components/AssistantPanel.jsx";
import { analyzeXER } from "./lib/analyze.js";
import { demoXER } from "./lib/demoProject.js";
import { setUploadPhaseMap } from "./lib/curves.js";

export default function App() {
  const [analysis, setAnalysis] = useState(null);
  const [view, setView] = useState("upload");
  const [error, setError] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [showLetter, setShowLetter] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Opening the assistant auto-minimises the toolbar to free up room;
  // the user can still expand it again while the panel stays open.
  const openAssistant = useCallback(() => {
    setAssistantOpen(true);
    setSidebarCollapsed(true);
  }, []);
  const closeAssistant = useCallback(() => setAssistantOpen(false), []);

  const run = useCallback((text, fileName) => {
    try {
      const result = analyzeXER(text);
      result.fileName = fileName;
      setAnalysis(result);
      setError(null);
      setView("overview");
    } catch (e) {
      setError(e.message || "Could not parse this XER file.");
      setAnalysis(null);
    }
  }, []);

  const loadDemo = useCallback(() => {
    setUploadPhaseMap(null); // demo uses its own WBS + AI classifier
    run(demoXER(), "DEMO-GIZA-EPC.xer");
  }, [run]);
  const reset = useCallback(() => {
    setUploadPhaseMap(null);
    setAnalysis(null);
    setView("upload");
    setError(null);
  }, []);
  const exportReport = useCallback(() => setShowReport(true), []);
  const openLetter = useCallback(() => setShowLetter(true), []);

  const ready = !!analysis;

  const renderView = () => {
    if (view === "guide") return <Guide />;
    if (!ready || view === "upload")
      return <Upload onFile={run} onDemo={loadDemo} error={error} />;
    const a = analysis;
    switch (view) {
      case "overview": return <Overview a={a} />;
      case "scurves": return <SCurves a={a} />;
      case "histogram": return <Histogram a={a} />;
      case "lookahead": return <LookAhead a={a} />;
      case "phase": return <Phase a={a} />;
      case "discipline": return <Discipline a={a} />;
      case "evms": return <EVMS a={a} />;
      case "float": return <Float a={a} />;
      case "dcma": return <DCMA a={a} />;
      case "risk": return <Risk a={a} />;
      case "settings": return <Settings a={a} onExport={exportReport} />;
      default: return <Overview a={a} />;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        active={view}
        onNav={setView}
        ready={ready}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />
      <main className="app-main">
        <TopBar
          view={view}
          model={analysis?.model}
          onDemo={loadDemo}
          onExport={exportReport}
          onLetter={openLetter}
          onReset={reset}
        />
        <div key={view} className="fade-up view-scroll">
          {view === "guide" ? (
            renderView()
          ) : (
            <div className={view === "upload" ? "" : "view-pad"}>
              <div className="view-inner">{renderView()}</div>
            </div>
          )}
        </div>
      </main>
      {showReport && analysis && (
        <Report a={analysis} onClose={() => setShowReport(false)} />
      )}
      {showLetter && analysis && (
        <ReviewLetter a={analysis} onClose={() => setShowLetter(false)} />
      )}
      {/* Slide-out AI assistant — available in every data section */}
      {ready && view !== "upload" && (
        <AssistantPanel
          analysis={analysis}
          open={assistantOpen}
          onOpen={openAssistant}
          onClose={closeAssistant}
        />
      )}
    </div>
  );
}
