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

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isAdmin = auth.isAdmin;
  const isStaff = auth.isStaff;

  const getLinkClass = (path) => (location.pathname === path ? "active" : "");

  const handleLogout = () => {
    auth.logout();
    navigate("/");
  };

  const userMenu = {
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
        onClick: handleLogout,
      },
    ],
  };

  const adminMenu = {
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
        onClick: handleLogout,
      },
    ],
  };

  const publicLinks = [
    { path: "/", label: "Home", icon: <HomeOutlined /> },
    { path: "/registro", label: "Reservar", icon: <CalendarOutlined /> },
    { path: "/espacios", label: "Espacios", icon: <AppstoreOutlined /> },
  ];

  // Staff/Admin: solo se muestra acceso al panel. Los módulos viven dentro del dashboard.
  const navLinks = isStaff
    ? [{ path: "/panel", label: "Panel", icon: <DashboardOutlined /> }]
    : publicLinks;

  return (
    <header>
      <div className="header">
        <Link to="/">
          <img className="logo" src="/src/assets/logoblanco.png" alt="Logo" />
        </Link>
        <div className="header__logo-text">
          <Link to="/" className={getLinkClass("/")}>Bo WeWorking</Link>
        </div>

        <ul className="header__links">
          {navLinks
            .filter((link) => !(isStaff && link.path === "/panel"))
            .map((link) => (
              <li key={link.path}>
                <Link to={link.path} className={getLinkClass(link.path)}>
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
                  const footer = document.getElementById("footer");
                  if (footer) footer.scrollIntoView({ behavior: "smooth" });
                }}
                className={getLinkClass("/acerca")}
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
                className={`header__panel-chip ${getLinkClass("/panel")}`.trim()}
              >
                <DashboardOutlined />
                Panel
              </Link>
              <Dropdown menu={adminMenu} placement="bottomRight" trigger={["click"]}>
                <button type="button" className="header__user-btn">
                  <SettingOutlined />
                  <span className="header__user-name">
                    {isAdmin ? "Admin" : auth.user?.rol === "staff" ? "Staff" : "Personal"}
                  </span>
                </button>
              </Dropdown>
            </>
          ) : auth.isAuthenticated ? (
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

          <Button
            className="header__hamburger"
            type="text"
            icon={<MenuOutlined style={{ fontSize: 22 }} />}
            onClick={() => setDrawerOpen(true)}
          />
        </div>

        <Drawer
          title="Menú"
          placement="right"
          onClose={() => setDrawerOpen(false)}
          open={drawerOpen}
          width={280}
        >
          <nav className="header__drawer-nav">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`header__drawer-link ${getLinkClass(link.path)}`}
                onClick={() => setDrawerOpen(false)}
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
                  setDrawerOpen(false);
                  const footer = document.getElementById("footer");
                  if (footer) footer.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <span className="header__drawer-icon"><InfoCircleOutlined /></span>
                Acerca de Nosotros
              </a>
            )}
          </nav>

          <div className="header__drawer-footer">
            {isStaff ? (
              <Button block type="primary" danger onClick={() => { handleLogout(); setDrawerOpen(false); }}>
                Cerrar sesión
              </Button>
            ) : auth.isAuthenticated ? (
              <>
                <Button block onClick={() => { navigate("/perfil"); setDrawerOpen(false); }} style={{ marginBottom: 8 }}>
                  Mi Perfil
                </Button>
                <Button block type="primary" danger onClick={() => { handleLogout(); setDrawerOpen(false); }}>
                  Cerrar sesión
                </Button>
              </>
            ) : (
              <>
                <Button block onClick={() => { auth.openAuthModal("login"); setDrawerOpen(false); }} style={{ marginBottom: 8 }}>
                  Iniciar sesión
                </Button>
                <Button block type="primary" onClick={() => { auth.openAuthModal("register"); setDrawerOpen(false); }}>
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
