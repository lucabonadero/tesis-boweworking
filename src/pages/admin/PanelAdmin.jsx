import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarOutlined,
  UserAddOutlined,
  AppstoreOutlined,
  BuildOutlined,
  DollarOutlined,
  TeamOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../context/AuthContext.jsx";
import Header from "../../components/header.jsx";
import AdminPageHeader from "../../components/AdminPageHeader.jsx";
import CoinIcon from "../../components/CoinIcon.jsx";
import styles from "../../styles/admin/panelAdmin.module.css";

export default function PanelAdmin() {
  const { user, isAdmin, hasPermission } = useAuth();
  const navigate = useNavigate();

  const modulos = useMemo(() => {
    return [
      {
        key: "reservas",
        titulo: "Control de Reservas",
        desc: "Administrá reservas activas, historial y estados.",
        icon: <CalendarOutlined />,
        ruta: "/control",
        visible: hasPermission("ver_reservas"),
        accent: "#2563eb",
        accentSoft: "rgba(37, 99, 235, 0.10)",
      },
      {
        key: "altas",
        titulo: "Control de Asistencia",
        desc: "Recepcioná usuarios y controlá reservas en curso.",
        icon: <UserAddOutlined />,
        ruta: "/altas",
        visible: hasPermission("altas_clientes"),
        accent: "#f97316",
        accentSoft: "rgba(249, 115, 22, 0.10)",
      },
      {
        key: "espacios",
        titulo: "Panel de Espacios",
        desc: "Vista operativa de los espacios y su ocupación.",
        icon: <AppstoreOutlined />,
        ruta: "/admin-espacios",
        visible: hasPermission("ver_espacios"),
        accent: "#8b5cf6",
        accentSoft: "rgba(139, 92, 246, 0.10)",
      },
      {
        key: "estructura",
        titulo: "Gestion de Estructura",
        desc: "Administrá estructura, pisos y recursos del coworking.",
        icon: <BuildOutlined />,
        ruta: "/admin-estructura",
        visible: hasPermission("gestionar_estructura"),
        accent: "#0891b2",
        accentSoft: "rgba(8, 145, 178, 0.10)",
      },
      {
        key: "disponibilidad",
        titulo: "Gestión de Disponibilidad",
        desc: "Configurá horarios semanales y bloqueos de recursos.",
        icon: <ClockCircleOutlined />,
        ruta: "/admin-disponibilidad",
        visible: hasPermission("gestionar_estructura"),
        accent: "#0d9488",
        accentSoft: "rgba(13, 148, 136, 0.10)",
      },
      {
        key: "financiera",
        titulo: "Gestión Financiera",
        desc: "Revisá pagos, pendientes y transacciones.",
        icon: <DollarOutlined />,
        ruta: "/gestion",
        visible: hasPermission("ver_financiero"),
        accent: "#16a34a",
        accentSoft: "rgba(22, 163, 74, 0.10)",
      },
      {
        key: "usuarios",
        titulo: "Gestión de Usuarios",
        desc: "Roles, permisos y staff del sistema.",
        icon: <TeamOutlined />,
        ruta: "/admin-usuarios",
        visible: hasPermission("gestionar_usuarios"),
        accent: "#dc2626",
        accentSoft: "rgba(220, 38, 38, 0.10)",
      },
      {
        key: "creditos",
        titulo: "Gestión de Créditos",
        desc: "Paquetes de créditos y ajustes de saldo.",
        icon: <CoinIcon size={18} color="var(--color-warning)" />,
        ruta: "/admin-creditos",
        visible: hasPermission("gestionar_creditos"),
        accent: "#ca8a04",
        accentSoft: "rgba(202, 138, 4, 0.10)",
      },
    ].filter((m) => m.visible);
  }, [hasPermission]);

  const rolLabel = isAdmin
    ? "Administrador"
    : user?.rol === "staff"
      ? "Staff"
      : "Personal";

  const nombre = user?.nombre || "equipo";

  return (
    <div className={styles.layout}>
      <Header />
      <main className={styles.content}>
        <AdminPageHeader
          eyebrow="Panel administrativo"
          title={`Hola, ${nombre}`}
          description={
            <>
              Accesos rápidos a los módulos administrativos.{" "}
              Tu rol actual: <strong>{rolLabel}</strong>.
            </>
          }
          showBackButton={false}
        />

        <h2 className={styles.sectionHeading}>Módulos disponibles</h2>

        {modulos.length === 0 ? (
          <div className={styles.empty}>
            <p>No tenés módulos administrativos habilitados todavía.</p>
            <p>Comunicate con un administrador para que te asigne permisos.</p>
          </div>
        ) : (
          <section className={styles.grid}>
            {modulos.map((m) => (
              <button
                key={m.key}
                type="button"
                className={styles.card}
                onClick={() => navigate(m.ruta)}
                style={{
                  "--card-accent": m.accent,
                  "--card-accent-soft": m.accentSoft,
                }}
                aria-label={`Abrir ${m.titulo}`}
              >
                <span className={styles.cardIcon}>{m.icon}</span>
                <span className={styles.cardTitle}>{m.titulo}</span>
                <span className={styles.cardDesc}>{m.desc}</span>
                <span className={styles.cardArrow}>
                  Ingresar <ArrowRightOutlined />
                </span>
              </button>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
