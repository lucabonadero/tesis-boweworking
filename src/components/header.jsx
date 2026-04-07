import React from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Dropdown } from "antd";
import { UserOutlined, LogoutOutlined } from "@ant-design/icons";

export default function Header({ isEmpleado = false }) {
  const location = useLocation();
  const auth = useAuth();

  const getLinkClass = (path) => {
    return location.pathname === path ? "active" : "";
  };

  const userMenu = {
    items: [
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "Cerrar sesión",
        onClick: () => auth.logout(),
      },
    ],
  };

  return (
    <header>
      <div className="header">
        <a href="/">
          <img className="logo" src="./src/assets/logoblanco.png" alt="Logo" />
        </a>
        <div className="header__logo-text">
          <a href="/" className={getLinkClass("/")}>Bo WeWorking</a>
        </div>

        <ul className="header__links">
          {isEmpleado ? (
            <>
              <li><a href="/control" className={getLinkClass("/control")}>Consultar Reservas</a></li>
              <li><a href="/altas" className={getLinkClass("/altas")}>Altas</a></li>
              <li><a href="/admin-espacios" className={getLinkClass("/admin-espacios")}>Espacios</a></li>
              <li><a href="/gestion" className={getLinkClass("/gestion")}>Gestion Financiera</a></li>
            </>
          ) : (
            <>
              <li><a href="/" className={getLinkClass("/")}>Home</a></li>
              <li><a href="/registro" className={getLinkClass("/registro")}>Reservar</a></li>
              <li><a href="/espacios" className={getLinkClass("/espacios")}>Espacios</a></li>
              <li>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    const footer = document.getElementById("footer");
                    if (footer) footer.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={getLinkClass("/acerca")}
                >
                  Acerca de Nosotros
                </a>
              </li>
            </>
          )}
        </ul>

        {!isEmpleado && (
          <div className="header__auth">
            {auth.isAuthenticated ? (
              <Dropdown menu={userMenu} placement="bottomRight" trigger={["click"]}>
                <button type="button" className="header__user-btn">
                  <UserOutlined />
                  <span className="header__user-name">{auth.user?.nombre}</span>
                </button>
              </Dropdown>
            ) : (
              <div className="header__auth-buttons">
                <button
                  type="button"
                  className="header__login-btn"
                  onClick={() => auth.openAuthModal("login")}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  className="header__register-btn"
                  onClick={() => auth.openAuthModal("register")}
                >
                  Registrarse
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
