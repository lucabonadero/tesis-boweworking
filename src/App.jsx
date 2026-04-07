import RegistroCliente from "./pages/public/registrocliente";
import Index from "./pages/public/index";
import Espacios from "./pages/public/espacios";
import ControlReservas from "./pages/admin/consultareservas";
import Login from "./pages/admin/login";
import GestionFinanciera from "./pages/admin/gestionfinanciera";
import AltaClientes from "./pages/admin/altas";
import EspaciosDashboard from "./pages/admin/espaciosdashboard";
import ProtectedRoute from "./components/rutasprotegidas";
import AuthModal from "./components/AuthModal";
import { AuthProvider } from "./context/AuthContext";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./App.css";
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
            <Route path="/espacios" element={<Espacios />} />
            <Route path="/login" element={<Login />} />
            <Route path="/control" element={
              <ProtectedRoute><ControlReservas /></ProtectedRoute>
            } />
            <Route path="/gestion" element={
              <ProtectedRoute><GestionFinanciera /></ProtectedRoute>
            } />
            <Route path="/altas" element={
              <ProtectedRoute><AltaClientes /></ProtectedRoute>
            } />
            <Route path="/admin-espacios" element={
              <ProtectedRoute><EspaciosDashboard /></ProtectedRoute>
            } />
            <Route path="*" element={<h1>404 - Página no encontrada</h1>} />
          </Routes>
          <AuthModal />
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
