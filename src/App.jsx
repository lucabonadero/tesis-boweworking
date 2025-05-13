import RegistroCliente from "./pages/public/registrocliente";
import Index from "./pages/public/index";
import Espacios from "./pages/public/espacios";
import ControlReservas from "./pages/admin/consultareservas";
import Login from "./pages/admin/login";
import GestionFinanciera from "./pages/admin/gestionfinanciera";
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
        <Route path="/gestionfinanciera" element={<GestionFinanciera />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
