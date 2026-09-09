import React, { useState } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Dropdown, Drawer, Button } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  MenuOutlined,
  HomeOutlined,
  CalendarOutlined,
  AppstoreOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  RobotOutlined,
  DashboardOutlined,
} from "@ant-design/icons";
import SaldoCreditosWidget from "./SaldoCreditosWidget.jsx";
import logoFundacion from "../assets/logo_lacasauni.png";
import logoBo from "../assets/logoblanco.png";

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const isAdmin = auth.isAdmin;
  const isStaff = auth.isStaff;

  const claseEnlace = (path) => (location.pathname === path ? "active" : "");

  const cerrarSesion = () => {
    auth.logout();
    navigate("/");
  };

  const menuUsuario = {
    items: [
      {
        key: "asistente",
        icon: <RobotOutlined />,
        label: "Asistente de reservas",
        onClick: () => navigate("/asistente"),
      },
      {
        key: "perfil",
        icon: <UserOutlined />,
        label: "Mi Perfil",
        onClick: () => navigate("/perfil"),
      },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "Cerrar sesión",
        onClick: cerrarSesion,
      },
    ],
  };

  const menuAdmin = {
    items: [
      {
        key: "panel",
        icon: <DashboardOutlined />,
        label: "Volver al panel",
        onClick: () => navigate("/panel"),
      },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "Cerrar sesión",
        onClick: cerrarSesion,
      },
    ],
  };

  const enlacesPublicos = [
    { path: "/", label: "Inicio", icon: <HomeOutlined /> },
    { path: "/registro", label: "Reservar", icon: <CalendarOutlined /> },
    { path: "/espacios", label: "Espacios", icon: <AppstoreOutlined /> },
  ];

  // Staff/Admin: solo se muestra acceso al panel. Los módulos viven dentro del dashboard.
  const enlacesNav = isStaff
    ? [{ path: "/panel", label: "Panel", icon: <DashboardOutlined /> }]
    : enlacesPublicos;

  return (
    <header>
      <div className="header">
        <Link to="/" className="header__brand">
          <img className="logo" src={logoBo} alt="Bo WeWorking" />
          <span className="header__brand-divider" aria-hidden="true" />
          <img
            className="header__fundacion-logo"
            src={logoFundacion}
            alt="Fundacion La Casa Uni"
          />
        </Link>
        <div className="header__logo-text">
          <Link to="/" className={claseEnlace("/")}>Bo WeWorking</Link>
          <span className="header__logo-sub">por Fundacion La Casa Uni</span>
        </div>

        <ul className="header__links">
          {enlacesNav
            .filter((link) => !(isStaff && link.path === "/panel"))
            .map((link) => (
              <li key={link.path}>
                <Link to={link.path} className={claseEnlace(link.path)}>
                  {link.label}
                </Link>
              </li>
            ))}
          {!isStaff && (
            <li>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  const destino =
                    document.getElementById("fundacion") ||
                    document.getElementById("footer");
                  if (destino) destino.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={claseEnlace("/acerca")}
              >
                Acerca de Nosotros
              </a>
            </li>
          )}
        </ul>

        <div className="header__auth">
          {isStaff ? (
            <>
              <Link
                to="/panel"
                className={`header__panel-chip ${claseEnlace("/panel")}`.trim()}
              >
                <DashboardOutlined />
                Panel
              </Link>
              <Dropdown menu={menuAdmin} placement="bottomRight" trigger={["click"]}>
                <button type="button" className="header__user-btn">
                  <SettingOutlined />
                  <span className="header__user-name">
                    {isAdmin ? "Admin" : auth.user?.rol === "staff" ? "Staff" : "Personal"}
                  </span>
                </button>
              </Dropdown>
            </>
          ) : auth.isAuthenticated ? (
            <>
              <SaldoCreditosWidget />
              <Dropdown menu={menuUsuario} placement="bottomRight" trigger={["click"]}>
                <button type="button" className="header__user-btn">
                  <UserOutlined />
                  <span className="header__user-name">{auth.user?.nombre}</span>
                </button>
              </Dropdown>
            </>
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

          <Button
            className="header__hamburger"
            type="text"
            icon={<MenuOutlined style={{ fontSize: 22 }} />}
            onClick={() => setMenuAbierto(true)}
          />
        </div>

        <Drawer
          title="Menú"
          placement="right"
          onClose={() => setMenuAbierto(false)}
          open={menuAbierto}
          width={280}
        >
          <nav className="header__drawer-nav">
            {enlacesNav.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`header__drawer-link ${claseEnlace(link.path)}`}
                onClick={() => setMenuAbierto(false)}
              >
                {link.icon && <span className="header__drawer-icon">{link.icon}</span>}
                {link.label}
              </Link>
            ))}
            {!isStaff && (
              <a
                href="#"
                className="header__drawer-link"
                onClick={(e) => {
                  e.preventDefault();
                  setMenuAbierto(false);
                  const destino =
                    document.getElementById("fundacion") ||
                    document.getElementById("footer");
                  if (destino) destino.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <span className="header__drawer-icon"><InfoCircleOutlined /></span>
                Acerca de Nosotros
              </a>
            )}
          </nav>

          <div className="header__drawer-footer">
            {isStaff ? (
              <Button block type="primary" danger onClick={() => { cerrarSesion(); setMenuAbierto(false); }}>
                Cerrar sesión
              </Button>
            ) : auth.isAuthenticated ? (
              <>
                <Button block onClick={() => { navigate("/perfil"); setMenuAbierto(false); }} style={{ marginBottom: 8 }}>
                  Mi Perfil
                </Button>
                <Button block type="primary" danger onClick={() => { cerrarSesion(); setMenuAbierto(false); }}>
                  Cerrar sesión
                </Button>
              </>
            ) : (
              <>
                <Button block onClick={() => { auth.openAuthModal("login"); setMenuAbierto(false); }} style={{ marginBottom: 8 }}>
                  Iniciar sesión
                </Button>
                <Button block type="primary" onClick={() => { auth.openAuthModal("register"); setMenuAbierto(false); }}>
                  Registrarse
                </Button>
              </>
            )}
          </div>
        </Drawer>
      </div>
    </header>
  );
}
