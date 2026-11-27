import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export function LandingPage() {
  const { isAuthenticated, loading } = useAuth();
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-mark">UR</div>
        <div>
          <div className="brand-name">ULTIMATE ROUTER</div>
          <div className="brand-subtitle">ONE API. EVERY PROVIDER. SMARTER ROUTING.</div>
        </div>
        <nav className="topnav">
          {!loading && (isAuthenticated
            ? <Link to="/overview">Open workspace</Link>
            : <><Link to="/login">Sign in</Link><Link to="/register">Create account</Link></>)}
        </nav>
      </header>
      <section className="hero">
        <div className="eyebrow">AI GATEWAY PLATFORM</div>
        <h1>One intelligent gateway.<br /><span>Every model within reach.</span></h1>
        <p>Authentication is live. Provider routing, usage, and the full workspace will be built in verified milestones.</p>
      </section>
      <section className="status-grid">
        <article className="status-card"><span>Frontend</span><strong>Online</strong><small>Cloudflare Workers</small></article>
        <article className="status-card"><span>Backend API</span><strong>Railway</strong><small>HTTPS only</small></article>
        <article className="status-card"><span>Authentication</span><strong>Ready</strong><small>PostgreSQL sessions</small></article>
      </section>
      <footer>ULTIMATE ROUTER <span>•</span> MILESTONE 1 FOUNDATION</footer>
    </main>
  );
}

export function OverviewPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onLogout() {
    setBusy(true);
    setError("");
    try {
      await logout();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to sign out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-mark">UR</div>
        <div>
          <div className="brand-name">ULTIMATE ROUTER</div>
          <div className="brand-subtitle">WORKSPACE OVERVIEW</div>
        </div>
        <button className="ghost-btn" onClick={onLogout} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>
      </header>
      <section className="hero compact">
        <div className="eyebrow">AUTHENTICATED SESSION</div>
        <h1>Welcome, <span>{user?.displayName || user?.email?.split("@")[0]}</span></h1>
        <p>Your session was restored from a server-verified cookie. Identity below comes from the backend, not the browser.</p>
      </section>
      <section className="status-grid">
        <article className="status-card"><span>Email</span><strong className="small-value">{user?.email}</strong><small>{user?.emailVerified ? "Verified" : "Verification pending"}</small></article>
        <article className="status-card"><span>Role</span><strong>{user?.role}</strong><small>Assigned server-side</small></article>
        <article className="status-card"><span>Session</span><strong>Active</strong><small>HttpOnly · Secure · SameSite=None</small></article>
      </section>
      {error && <div className="auth-alert error" role="alert">{error}</div>}
      <footer>ULTIMATE ROUTER <span>•</span> MILESTONE 1 FOUNDATION</footer>
    </main>
  );
}

export function ComingSoonPage({ title }) {
  const { user } = useAuth();
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-mark">UR</div>
        <div>
          <div className="brand-name">ULTIMATE ROUTER</div>
          <div className="brand-subtitle">PROTECTED WORKSPACE</div>
        </div>
        <Link className="ghost-btn" to="/overview">Overview</Link>
      </header>
      <section className="hero compact">
        <div className="eyebrow">MILESTONE 2</div>
        <h1>{title}</h1>
        <p>This route is protected by the authentication session. Its product functionality is planned for Milestone 2.</p>
      </section>
      <footer>Signed in as <span>{user?.email}</span></footer>
    </main>
  );
}
