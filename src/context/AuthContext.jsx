import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const TOKEN_KEY = "clienteToken";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalView, setAuthModalView] = useState("login");

  const saveAuth = useCallback((tok, usr) => {
    localStorage.setItem(TOKEN_KEY, tok);
    setToken(tok);
    setUser(usr);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const openAuthModal = useCallback((view = "login") => {
    setAuthModalView(view);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/api/auth/cliente/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => setUser(data))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const authFetch = useCallback(
    (url, options = {}) => {
      const headers = { ...options.headers };
      if (token) headers.Authorization = `Bearer ${token}`;
      return fetch(url, { ...options, headers });
    },
    [token]
  );

  const loginAction = async (email, password) => {
    const res = await fetch(`${API_URL}/api/auth/cliente/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Error al iniciar sesión");
    saveAuth(data.token, data.usuario);
    return data.usuario;
  };

  const registerAction = async (fields) => {
    const res = await fetch(`${API_URL}/api/auth/cliente/registro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Error al registrarse");
    saveAuth(data.token, data.usuario);
    return data.usuario;
  };

  const googleAuthAction = async (credential) => {
    const res = await fetch(`${API_URL}/api/auth/cliente/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Error con Google");
    saveAuth(data.token, data.usuario);
    return data.usuario;
  };

  const completarPerfilAction = async (dni, telefono) => {
    const res = await fetch(`${API_URL}/api/auth/cliente/completar-perfil`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ dni, telefono }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Error al completar perfil");
    saveAuth(data.token, data.usuario);
    return data.usuario;
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    perfilCompleto: !!user?.perfil_completo,
    authModalOpen,
    authModalView,
    openAuthModal,
    closeAuthModal,
    login: loginAction,
    register: registerAction,
    googleAuth: googleAuthAction,
    completarPerfil: completarPerfilAction,
    logout,
    authFetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
