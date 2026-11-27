const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.message || payload?.error || `Request failed (${status})`);
    this.status = status;
    this.payload = payload || {};
  }
}

export async function apiFetch(path, options = {}) {
  if (!base) throw new Error("API is not configured. Set VITE_API_URL at build time.");

  const headers = {
    "X-Requested-With": "XMLHttpRequest",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  let response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      headers,
      credentials: "include"
    });
  } catch {
    throw new Error("Network unavailable. Please try again.");
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) throw new ApiError(response.status, payload);
  return payload;
}

export function authApi() {
  return {
    me: () => apiFetch("/api/v1/auth/me"),
    login: (email, password) => apiFetch("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
    register: (email, password, displayName) => apiFetch("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName })
    }),
    logout: () => apiFetch("/api/v1/auth/logout", { method: "POST" }),
    verifyEmail: (token) => apiFetch("/api/v1/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token })
    })
  };
}
