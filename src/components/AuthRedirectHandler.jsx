import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Abre el modal de login cuando una ruta protegida redirige al inicio con state.openAuthLogin.
export default function AuthRedirectHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const { openAuthModal } = useAuth();
  const claveManejada = useRef(null);

  useEffect(() => {
    if (!location.state?.openAuthLogin) return;
    if (claveManejada.current === location.key) return;
    claveManejada.current = location.key;
    openAuthModal("login");
    navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
  }, [location.state, location.key, location.pathname, location.search, navigate, openAuthModal]);

  return null;
}
