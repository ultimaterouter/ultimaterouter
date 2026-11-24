import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  const [apiStatus, setApiStatus] = React.useState("Checking...");
  const [dbStatus, setDbStatus] = React.useState("Checking...");

  React.useEffect(() => {
    // No localhost fallback in production; Cloudflare must provide VITE_API_URL at build time.
    const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
    if (!base) {
      setApiStatus("Not configured");
      setDbStatus("Not configured");
      return;
    }
    fetch(`${base}/health/live`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => setApiStatus("Online"))
      .catch(() => setApiStatus("Unavailable"));
    fetch(`${base}/health/ready`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => setDbStatus("Connected"))
      .catch(() => setDbStatus("Unavailable"));
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-mark">UR</div>
        <div>
          <div className="brand-name">ULTIMATE ROUTER</div>
          <div className="brand-subtitle">ONE API. EVERY PROVIDER. SMARTER ROUTING.</div>
        </div>
        <span className="environment">LOCAL FOUNDATION</span>
      </header>
      <section className="hero">
        <div className="eyebrow">AI GATEWAY PLATFORM</div>
        <h1>One intelligent gateway.<br/><span>Every model within reach.</span></h1>
        <p>The foundation is running. Authentication, model routing, provider integrations, and the full workspace will be built in verified milestones.</p>
      </section>
      <section className="status-grid">
        <article className="status-card"><span>Frontend</span><strong>Online</strong><small>React + Vite</small></article>
        <article className="status-card"><span>Backend API</span><strong>{apiStatus}</strong><small>Express</small></article>
        <article className="status-card"><span>PostgreSQL</span><strong>{dbStatus}</strong><small>Database readiness check</small></article>
      </section>
      <footer>ULTIMATE ROUTER <span>•</span> REBUILD FOUNDATION 0.1.0</footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
