import RegistroCliente from "./pages/public/registrocliente";
import Index from "./pages/public/index";
import Espacios from "./pages/public/espacios";
import ControlReservas from "./pages/admin/consultareservas";
import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/registro" element={<RegistroCliente />} />
        <Route path="/espacios" element={<Espacios />} />
        <Route path="/control" element={<ControlReservas />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
