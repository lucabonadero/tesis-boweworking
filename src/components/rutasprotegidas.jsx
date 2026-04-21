import React from "react";
import { Navigate } from "react-router-dom";
import { Spin } from "antd";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * @param {{ children: React.ReactNode, adminOnly?: boolean }} props
 * adminOnly: solo rol admin (ej. gestión financiera). Por defecto: personal del coworking (admin o empleado).
 */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, isStaff, loading } = useAuth();

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        style={{
          minHeight: "50vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Spin size="large" tip="Verificando sesión…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ openAuthLogin: true }} />;
  }

  if (adminOnly) {
    if (!isAdmin) return <Navigate to="/control" replace />;
  } else if (!isStaff) {
    return <Navigate to="/" replace />;
  }

  return children;
}
