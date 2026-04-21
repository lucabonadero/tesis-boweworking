import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Drawer, Tooltip } from "antd";
import { RobotOutlined, CloseOutlined } from "@ant-design/icons";
import { useAuth } from "../context/AuthContext.jsx";
import AsistenteReservasPanel from "./AsistenteReservasPanel.jsx";
import styles from "../styles/components/asistenteReservasFab.module.css";

export default function AsistenteReservasFab() {
  const { pathname } = useLocation();
  const { isAuthenticated, isStaff, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);

  if (authLoading || !isAuthenticated || isStaff || pathname === "/asistente") {
    return null;
  }

  return (
    <>
      <Tooltip title="Asistente de reservas" placement="left">
        <button
          type="button"
          className={`${styles.fab} ${open ? styles.fabHidden : ""}`}
          aria-label="Abrir asistente de reservas"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <RobotOutlined className={styles.fabIcon} />
        </button>
      </Tooltip>

      <Drawer
        title="Asistente de reservas"
        placement="right"
        width="min(440px, calc(100vw - 24px))"
        onClose={() => setOpen(false)}
        open={open}
        destroyOnClose={false}
        className={styles.drawer}
        closeIcon={<CloseOutlined />}
        styles={{
          body: { paddingTop: 8, paddingBottom: 24 },
        }}
      >
        <AsistenteReservasPanel autoPromptLogin={false} showPageHeading={false} />
        <p className={styles.drawerHint}>
          También podés abrirlo en{" "}
          <Link to="/asistente" onClick={() => setOpen(false)}>
            pantalla completa
          </Link>
          .
        </p>
      </Drawer>
    </>
  );
}
