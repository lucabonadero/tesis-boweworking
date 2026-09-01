import RegistroCliente from "./pages/public/registrocliente.jsx";
import OlvideContrasena from "./pages/public/olvideContrasena.jsx";
import RestablecerContrasena from "./pages/public/restablecerContrasena.jsx";
import Index from "./pages/public/index.jsx";
import Espacios from "./pages/public/espacios.jsx";
import Perfil from "./pages/public/perfil.jsx";
import PagoConfirmacion from "./pages/public/pagoConfirmacion.jsx";
import AsistenteReservas from "./pages/public/asistenteReservas.jsx";
import ControlReservas from "./pages/admin/consultareservas.jsx";
import GestionFinanciera from "./pages/admin/Gestionfinanciera.jsx";
import AltaClientes from "./pages/admin/altas.jsx";
import EspaciosDashboard from "./pages/admin/espaciosdashboard.jsx";
import GestionUsuarios from "./pages/admin/GestionUsuarios.jsx";
import GestionEstructura from "./pages/admin/GestionEstructura.jsx";
import GestionCreditos from "./pages/admin/GestionCreditos.jsx";
import PanelAdmin from "./pages/admin/PanelAdmin.jsx";
import ProtectedRoute from "./components/rutasprotegidas.jsx";
import AuthModal from "./components/AuthModal.jsx";
import AuthRedirectHandler from "./components/AuthRedirectHandler.jsx";
import AsistenteReservasFab from "./components/AsistenteReservasFab.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "antd/dist/reset.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
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
            <Route path="*" element={<h1>404 - Página no encontrada</h1>} />
          </Routes>
          <AuthRedirectHandler />
          <AuthModal />
          <AsistenteReservasFab />
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
