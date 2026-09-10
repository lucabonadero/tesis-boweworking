import { Suspense, lazy } from "react";
import RegistroCliente from "./pages/public/registrocliente.jsx";
import OlvideContrasena from "./pages/public/olvideContrasena.jsx";
import RestablecerContrasena from "./pages/public/restablecerContrasena.jsx";
import Index from "./pages/public/index.jsx";
import Espacios from "./pages/public/espacios.jsx";
import Perfil from "./pages/public/perfil.jsx";
import PagoConfirmacion from "./pages/public/pagoConfirmacion.jsx";
import AsistenteReservas from "./pages/public/asistenteReservas.jsx";
import ProtectedRoute from "./components/rutasprotegidas.jsx";
import AuthModal from "./components/AuthModal.jsx";
import AuthRedirectHandler from "./components/AuthRedirectHandler.jsx";
import AsistenteReservasFab from "./components/AsistenteReservasFab.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { usePrecargaPanel } from "./hooks/usePrecargaPanel.js";
import { RUTAS_ADMIN } from "./rutasAdmin.js";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Spin } from "antd";
import "antd/dist/reset.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

/**
 * El panel administrativo se carga aparte del bundle inicial.
 *
 * Las funciones de carga viven en rutasAdmin.js para que la precarga use
 * exactamente las mismas: React.lazy y el import dinámico comparten la promesa,
 * así que un chunk ya precargado se resuelve al instante y el Suspense de abajo
 * no llega a mostrarse.
 */
const [
  PanelAdmin,
  ControlReservas,
  AltaClientes,
  EspaciosDashboard,
  GestionFinanciera,
  GestionUsuarios,
  GestionEstructura,
  GestionCreditos,
  GestionDisponibilidad,
] = RUTAS_ADMIN.map((ruta) => lazy(ruta.cargar));

/** Mismo tratamiento visual que el estado de carga de ProtectedRoute. */
function CargandoSeccion() {
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
      <Spin size="large" tip="Cargando sección…" />
    </div>
  );
}

/**
 * Vive dentro de AuthProvider porque la precarga necesita saber el rol y los
 * permisos del usuario.
 */
function Rutas() {
  usePrecargaPanel();

  return (
    <Suspense fallback={<CargandoSeccion />}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/registro" element={<RegistroCliente />} />
        <Route path="/olvide-contrasena" element={<OlvideContrasena />} />
        <Route path="/restablecer-contrasena" element={<RestablecerContrasena />} />
        <Route path="/espacios" element={<Espacios />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/pago/confirmacion" element={<PagoConfirmacion />} />
        <Route path="/asistente" element={<AsistenteReservas />} />
        <Route path="/panel" element={
          <ProtectedRoute><PanelAdmin /></ProtectedRoute>
        } />
        <Route path="/control" element={
          <ProtectedRoute><ControlReservas /></ProtectedRoute>
        } />
        <Route path="/gestion" element={
          <ProtectedRoute permisoRequerido="ver_financiero"><GestionFinanciera /></ProtectedRoute>
        } />
        <Route path="/altas" element={
          <ProtectedRoute><AltaClientes /></ProtectedRoute>
        } />
        <Route path="/admin-espacios" element={
          <ProtectedRoute><EspaciosDashboard /></ProtectedRoute>
        } />
        <Route path="/admin-usuarios" element={
          <ProtectedRoute permisoRequerido="gestionar_usuarios"><GestionUsuarios /></ProtectedRoute>
        } />
        <Route path="/admin-estructura" element={
          <ProtectedRoute permisoRequerido="gestionar_estructura"><GestionEstructura /></ProtectedRoute>
        } />
        <Route path="/admin-creditos" element={
          <ProtectedRoute permisoRequerido="gestionar_creditos"><GestionCreditos /></ProtectedRoute>
        } />
        <Route path="/admin-disponibilidad" element={
          <ProtectedRoute permisoRequerido="gestionar_estructura"><GestionDisponibilidad /></ProtectedRoute>
        } />
        <Route path="*" element={<h1>404 - Página no encontrada</h1>} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <Rutas />
          <AuthRedirectHandler />
          <AuthModal />
          <AsistenteReservasFab />
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
