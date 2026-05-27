import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftOutlined } from "@ant-design/icons";
import styles from "../styles/components/botonVolverPanel.module.css";

export default function BotonVolverPanel({ label = "Volver al panel" }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => navigate("/panel")}
      aria-label={label}
    >
      <ArrowLeftOutlined className={styles.icon} />
      <span>{label}</span>
    </button>
  );
}
