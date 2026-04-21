import React from "react";
import { Alert } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";

const WA_LINK =
  "https://api.whatsapp.com/send/?phone=5493518522482&text&type=phone_number&app_absent=0";

export default function ReservaModificacionAviso({ className, style }) {
  return (
    <Alert
      className={className}
      style={style}
      type="info"
      showIcon
      icon={<InfoCircleOutlined />}
      message="Cambios y cancelaciones"
      description={
        <span>
          Para <strong>modificar o cancelar</strong> una reserva (turno o pack), o consultas sobre reembolsos,
          escribinos por{" "}
          <a href={WA_LINK} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>{" "}
          o al <strong>+54 9 351 852-2482</strong>. Desde &quot;Mi perfil&quot; solo podés ver el detalle de tus
          reservas y, si corresponde, <strong>completar el pago</strong>. Recomendamos avisar con{" "}
          <strong>24 horas de anticipación</strong> cuando puedas.
        </span>
      }
    />
  );
}
