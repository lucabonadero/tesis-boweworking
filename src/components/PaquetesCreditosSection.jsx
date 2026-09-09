import React, { useState } from "react";
import { Skeleton, Alert } from "antd";
import { ArrowRightOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { useAuth } from "../context/AuthContext.jsx";
import { usePaquetesPublicos } from "../hooks/useCreditos.js";
import { formatearPrecio, etiquetaCreditos } from "../utils/creditosFormato.js";
import ComprarCreditosModal from "./ComprarCreditosModal.jsx";
import CoinIcon from "./CoinIcon.jsx";

/**
 * Vidriera pública de paquetes de créditos.
 *
 * El backend ya devuelve solo los activos, así que un paquete dado de baja
 * desaparece de acá sin tocar el front.
 */
export default function PaquetesCreditosSection({ styles }) {
  const { isAuthenticated, openAuthModal } = useAuth();
  const { data, isLoading, isError } = usePaquetesPublicos();
  const [modalCompra, setModalCompra] = useState(false);

  const paquetes = data?.paquetes ?? [];

  // Sin sesión no hay a quién acreditar: primero el modal de login/registro.
  const onComprar = () => {
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }
    setModalCompra(true);
  };

  if (!isLoading && !isError && paquetes.length === 0) return null;

  const masCreditos = paquetes.reduce((max, p) => Math.max(max, p.creditos), 0);

  return (
    <section className={`${styles.creditos} ${styles.animateOnScroll}`}>
      <h2 className={styles.sectionTitle}>Paquetes de creditos</h2>
      <p className={styles.sectionSub}>
        Los creditos son la moneda de Bo: los canjeas por turnos, escritorios y salas.
        Comprá una vez y reservá cuando quieras.
      </p>

      {isError && (
        <div className={styles.creditosEstado}>
          <Alert
            type="error"
            showIcon
            message="No pudimos cargar los paquetes"
            description="Volvé a intentarlo en unos minutos."
          />
        </div>
      )}

      {isLoading && (
        <div className={styles.creditosGrid}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.creditoCard}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </div>
          ))}
        </div>
      )}

      {!isLoading && paquetes.length > 0 && (
        <div className={styles.creditosGrid}>
          {paquetes.map((paquete) => (
            <article
              key={paquete.id}
              className={`${styles.creditoCard} ${
                paquete.creditos === masCreditos && paquetes.length > 1 ? styles.creditoCardDestacada : ""
              }`}
            >
              {paquete.creditos === masCreditos && paquetes.length > 1 && (
                <span className={styles.creditoBadge}>
                  <ThunderboltOutlined /> Mejor valor
                </span>
              )}

              <div className={styles.creditoIcono}>
                <CoinIcon size={28} />
              </div>

              <h3 className={styles.creditoNombre}>{paquete.nombre}</h3>

              <p className={styles.creditoCantidad}>{etiquetaCreditos(paquete.creditos)}</p>

              <p className={styles.creditoPrecio}>{formatearPrecio(paquete.precio)}</p>

              <p className={styles.creditoDesc}>
                {paquete.descripcion ||
                  "Usalos para reservar escritorios, oficinas o salas de reunion cuando los necesites."}
              </p>

              <button type="button" className={styles.creditoBtn} onClick={onComprar}>
                Comprar <ArrowRightOutlined />
              </button>
            </article>
          ))}
        </div>
      )}

      <ComprarCreditosModal abierto={modalCompra} onCerrar={() => setModalCompra(false)} />
    </section>
  );
}
