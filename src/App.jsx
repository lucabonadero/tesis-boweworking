import RegistroCliente from "./pages/public/registrocliente";
import Index from "./pages/public/index";
import Espacios from "./pages/public/espacios";
import ControlReservas from "./pages/admin/consultareservas";
import Login from "./pages/admin/login";
import GestionFinanciera from "./pages/admin/gestionfinanciera";
import AltaClientes from "./pages/admin/altas";
import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/registro" element={<RegistroCliente />} />
        <Route path="/espacios" element={<Espacios />} />
        <Route path="/login" element={<Login />} />
        <Route path="/control" element={<ControlReservas />} />
        <Route path="/gestion" element={<GestionFinanciera />} />
        <Route path="/altas" element={<AltaClientes />} />
        <Route path="*" element={<h1>404 - Página no encontrada</h1>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
