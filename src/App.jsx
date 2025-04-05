import RegistroCliente from "./pages/registrocliente";
import Index from "./pages/index";
import { BrowserRouter, Route, Routes } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/registro" element={<RegistroCliente />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
