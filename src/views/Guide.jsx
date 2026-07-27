import { GUIDE_HTML } from "../lib/guideHtml.js";

// The user guide, rendered inside the platform. It lives in its own iframe so
// the guide's stylesheet is fully isolated from the app's.
export default function Guide() {
  return (
    <iframe
      title="Pyramid AI — User Guide"
      srcDoc={GUIDE_HTML}
      style={{ width: "100%", height: "100%", border: 0, display: "block", background: "var(--bg-wash)" }}
    />
  );
}
