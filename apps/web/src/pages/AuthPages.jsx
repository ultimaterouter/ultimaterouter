import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <main className="auth-page">
      <section className="glass-card auth-card">
        <div className="auth-brand">ULTIMATE ROUTER</div>
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
    </main>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password);
      setSuccess("Signed in. Redirecting…");
      const target = location.state?.from?.pathname || "/overview";
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue to your Ultimate Router workspace."
      footer={<>New here? <Link to="/register">Create an account</Link></>}
    >
      <form onSubmit={onSubmit} className="auth-form" noValidate>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div className="auth-alert error" role="alert">{error}</div>}
        {success && <div className="auth-alert success" role="status">{success}</div>}
        <button className="primary-btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password must be at least 10 characters and include a letter and a number.");
      return;
    }
    setBusy(true);
    try {
      await register(email.trim(), password, displayName.trim() || undefined);
      setSuccess("Account created. Redirecting…");
      navigate("/overview", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to create account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start with the Ultimate Router foundation."
      footer={<>Already registered? <Link to="/login">Sign in</Link></>}
    >
      <form onSubmit={onSubmit} className="auth-form" noValidate>
        <label>Display name<input type="text" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {error && <div className="auth-alert error" role="alert">{error}</div>}
        {success && <div className="auth-alert success" role="status">{success}</div>}
        <button className="primary-btn" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
    </AuthShell>
  );
}
