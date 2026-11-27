import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authApi().me()
      .then((data) => { if (active) setUser(data.user || null); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: Boolean(user),
    async login(email, password) {
      const data = await authApi().login(email, password);
      setUser(data.user || null);
      return data;
    },
    async register(email, password, displayName) {
      const data = await authApi().register(email, password, displayName);
      setUser(data.user || null);
      return data;
    },
    async logout() {
      await authApi().logout();
      setUser(null);
    },
    async verifyEmail(token) {
      const data = await authApi().verifyEmail(token);
      setUser((current) => current ? { ...current, emailVerified: true } : current);
      return data;
    }
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
