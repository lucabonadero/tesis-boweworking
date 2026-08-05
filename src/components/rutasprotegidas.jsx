import React from "react";
import { Navigate } from "react-router-dom";
import { Spin } from "antd";
import { useAuth } from "../context/AuthContext.jsx";

// soloAdmin: restringe al rol admin (ej. gestión financiera, gestión de usuarios).
// permisoRequerido: clave de permiso específica que el usuario debe tener.
// Por defecto permite el acceso a cualquier personal del coworking (admin o staff).
export default function ProtectedRoute({ children, soloAdmin = false, permisoRequerido = null }) {
  const { isAuthenticated, isAdmin, isStaff, loading, hasPermission } = useAuth();

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

  if (soloAdmin) {
    if (!isAdmin) return <Navigate to="/panel" replace />;
  } else if (!isStaff) {
    return <Navigate to="/" replace />;
  }

  if (permisoRequerido && !hasPermission(permisoRequerido)) {
    return <Navigate to="/panel" replace />;
  }

  return children;
}
