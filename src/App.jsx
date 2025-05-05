import RegistroCliente from "./pages/registrocliente";
import Index from "./pages/index";
import Espacios from "./pages/espacios";
import ControlReservas from "./pages/consultareservas";
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
