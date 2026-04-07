import React from "react";
import { Navigate } from "react-router-dom";
import { isAdminTokenValid, clearAdminSession } from "../utils/adminApi";

export default function ProtectedRoute({ children }) {
  if (!isAdminTokenValid()) {
    clearAdminSession();
    return <Navigate to="/login" replace />;
  }
  return children;
}