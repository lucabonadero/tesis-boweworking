import React, { useState } from "react";
import { Tooltip, Skeleton } from "antd";
import { WalletOutlined } from "@ant-design/icons";
import { useAuth } from "../context/AuthContext.jsx";
import { useSaldoCreditos } from "../hooks/useCreditos.js";
import ComprarCreditosModal from "./ComprarCreditosModal.jsx";
import { etiquetaCreditos } from "../utils/creditosFormato.js";

/** Saldo siempre a la vista, junto al perfil (RF10). Abre la compra al clic. */
export default function SaldoCreditosWidget() {
  const auth = useAuth();
  const [comprando, setComprando] = useState(false);
  const habilitado = auth.isAuthenticated && !auth.isStaff;

  const { data, isLoading, isError } = useSaldoCreditos(habilitado ? auth.token : null);

  if (!habilitado) return null;
  if (isLoading) return <Skeleton.Button active size="small" style={{ width: 104 }} />;

  // Un fallo de red no debe romper el header.
  if (isError || !data) return null;

  return (
    <>
      <Tooltip title="Comprar créditos">
        <button
          type="button"
          className="header__user-btn"
          onClick={() => setComprando(true)}
          aria-label={`Tenés ${etiquetaCreditos(data.saldo)}. Comprar más.`}
        >
          <WalletOutlined />
          <span className="header__user-name">{etiquetaCreditos(data.saldo)}</span>
        </button>
      </Tooltip>

      <ComprarCreditosModal abierto={comprando} onCerrar={() => setComprando(false)} />
    </>
  );
}
