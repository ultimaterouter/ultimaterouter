import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./style.css";
import { AuthProvider } from "./auth/AuthContext.jsx";
import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import { LoginPage, RegisterPage } from "./pages/AuthPages.jsx";
import { ComingSoonPage, LandingPage, OverviewPage } from "./pages/AppPages.jsx";

const protectedPages = [
  ["chat", "AI Chat"],
  ["projects", "Projects"],
  ["models", "Models"],
  ["api-keys", "API Keys"],
  ["usage", "Usage & Analytics"],
  ["providers", "Provider Status"],
  ["marketplace", "Marketplace"],
  ["billing", "Billing & Subscription"],
  ["settings", "Settings"],
  ["documentation", "Documentation"],
  ["help", "Help & Support"],
  ["profile", "Profile"]
];

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/overview" element={<ProtectedRoute><OverviewPage /></ProtectedRoute>} />
      {protectedPages.map(([slug, title]) => (
        <Route
          key={slug}
          path={`/${slug}`}
          element={<ProtectedRoute><ComingSoonPage title={title} /></ProtectedRoute>}
        />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
