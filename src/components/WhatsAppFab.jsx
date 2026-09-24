import React from "react";
import { Tooltip } from "antd";
import { WhatsAppOutlined } from "@ant-design/icons";
import styles from "../styles/components/whatsappFab.module.css";

const WHATSAPP_URL =
  "https://api.whatsapp.com/send/?phone=5493518522482&text&type=phone_number&app_absent=0";

/** Burbuja flotante que lleva al WhatsApp de la inmobiliaria. */
export default function WhatsAppFab() {
  return (
    <Tooltip title="Escribinos por WhatsApp" placement="left">
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.fab}
        aria-label="Escribinos por WhatsApp"
      >
        <WhatsAppOutlined className={styles.fabIcon} />
      </a>
    </Tooltip>
  );
}
