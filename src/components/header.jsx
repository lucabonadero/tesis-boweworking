import React from "react";
import { useLocation } from "react-router-dom"; // Importamos para obtener la ruta actual

export default function Header({ isEmpleado = false }) {
  const location = useLocation();

  // Clase activa para destacar el enlace actual
  const getLinkClass = (path) => {
    return location.pathname === path ? "active" : "";
  };

  return (
    <header>
      <div className="header">
        {/* Logo y texto Bo WeWorking */}
        <a href="/">
          <img className="logo" src="./src/assets/logoblanco.png" alt="Logo" />
        </a>
        <div className="header__logo-text">
          <a href="/" className={getLinkClass("/")}>Bo WeWorking</a>
        </div>

        {/* Enlaces navegables */}
        <ul className="header__links">
          {isEmpleado ? (
            <>
              <li><a href="/control" className={getLinkClass("/control")}>Consultar Reservas</a></li>
              <li><a href="/altas" className={getLinkClass("/altas")}>Altas</a></li>
              <li><a href="/" className={getLinkClass("/")}>Espacios</a></li>
              <li><a href="/gestion" className={getLinkClass("/gestion")}>Gestion Financiera</a></li>
            </>
          ) : (
            <>
              <li><a href="/" className={getLinkClass("/")}>Home</a></li>
              <li><a href="/registro" className={getLinkClass("/registro")}>Reservar</a></li>
              <li><a href="/espacios" className={getLinkClass("/espacios")}>Espacios</a></li>
              <li><a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        const footer = document.getElementById("footer");
                        if (footer) {
                          footer.scrollIntoView({ behavior: "smooth" });
                        }
                      }}
                      className={getLinkClass("/acerca")}
                    >
                      Acerca de Nosotros
                   </a>
            </li>
            </>
          )}
        </ul>
      </div>
    </header>
  );
}