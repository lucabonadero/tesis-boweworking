import RegistroCliente from "./pages/registrocliente";
import Index from "./pages/index";
import Espacios from "./pages/espacios";
import { BrowserRouter, Route, Routes } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/registro" element={<RegistroCliente />} />
        <Route path="/espacios" element={<Espacios />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
