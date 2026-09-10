import React, { useState } from "react";
import { Alert, Tooltip, Select, Empty, Spin } from "antd";
import {
  DollarOutlined,
  ShoppingOutlined,
  TeamOutlined,
  InfoCircleOutlined,
  LockOutlined,
  ClockCircleOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  useResumenFinanciero,
  useIngresosPorDia,
} from "../../hooks/useFinanzasCreditos.js";
import { formatearPrecio, etiquetaCreditos } from "../../utils/creditosFormato.js";
import styles from "../../styles/admin/ingresosCreditos.module.css";

/**
 * Barras en CSS puro: el panel no carga librería de gráficos.
 *
 * La consulta solo devuelve los días con ventas, así que acá se rellenan los
 * huecos: sin eso un único día se dibujaba como una franja que ocupaba todo el
 * ancho y todo el alto, que es lo mismo que no tener gráfico.
 */
function GraficoIngresos({ serie, dias }) {
  const porFecha = new Map(
    (serie ?? []).map((d) => [dayjs(d.fecha).format("YYYY-MM-DD"), d])
  );

  const datos = Array.from({ length: dias }, (_, i) => {
    const fecha = dayjs().subtract(dias - 1 - i, "day");
    const clave = fecha.format("YYYY-MM-DD");
    const dia = porFecha.get(clave);
    return { clave, fecha, monto: dia?.monto ?? 0, ventas: dia?.ventas ?? 0 };
  });

  const max = Math.max(...datos.map((d) => d.monto), 0);

  if (max === 0) {
    return (
      <Empty description="Todavía no hay ingresos en el período" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    );
  }

  // Con pocos días las etiquetas entran todas; con muchas se saltean.
  const pasoEtiqueta = Math.ceil(dias / 12);

  return (
    <div className={styles.graficoWrap}>
      <div className={styles.graficoEjeY}>
        <span>{formatearPrecio(max)}</span>
        <span>{formatearPrecio(max / 2)}</span>
        <span>$0</span>
      </div>

      <div className={styles.grafico}>
        {datos.map((d, i) => (
          <Tooltip
            key={d.clave}
            title={
              d.ventas > 0
                ? `${d.fecha.format("DD/MM/YYYY")}: ${formatearPrecio(d.monto)} · ${d.ventas} venta(s)`
                : `${d.fecha.format("DD/MM/YYYY")}: sin ventas`
            }
          >
            <div className={styles.graficoCol}>
              <div className={styles.graficoPista}>
                <div
                  className={`${styles.graficoBarra} ${d.monto === 0 ? styles.graficoBarraVacia : ""}`}
                  style={{ height: d.monto > 0 ? `max(4px, ${(d.monto / max) * 100}%)` : "2px" }}
                />
              </div>
              <span className={styles.graficoFecha}>
                {i % pasoEtiqueta === 0 ? d.fecha.format("DD/MM") : ""}
              </span>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

/**
 * Ingresos reales del coworking: compras de paquetes de créditos.
 *
 * Los montos solo se piden y se muestran si el backend habilita `puedeVerMontos`
 * (socios propietarios). El resto del panel queda visible para el staff.
 */
export default function IngresosCreditosPanel() {
  const [dias, setDias] = useState(30);

  const { data: resumen } = useResumenFinanciero();
  const puedeVerMontos = resumen?.puedeVerMontos === true;

  const { data: grafico, isLoading: cargandoGrafico } = useIngresosPorDia(dias, {
    enabled: puedeVerMontos,
  });

  return (
    <section className={styles.panel}>
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        className={styles.aviso}
        message="El ingreso del coworking se registra en la compra de paquetes de créditos"
        description={
          <>
            Las reservas hechas de forma presencial mediante <strong>ajuste manual de saldo</strong> no
            son un ingreso de dinero nuevo: ese crédito ya fue pagado cuando el usuario compró el
            paquete. Sumarlas acá contaría dos veces la misma plata.
          </>
        }
      />

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.statIcono}>
            <ShoppingOutlined />
          </div>
          <div>
            <span className={styles.statLabel}>Paquetes vendidos</span>
            <strong className={styles.statValor}>{resumen?.paquetesVendidos ?? 0}</strong>
            <span className={styles.statSub}>{etiquetaCreditos(resumen?.creditosVendidos ?? 0)}</span>
          </div>
        </div>

        <div className={styles.stat}>
          <div className={styles.statIcono}>
            <TeamOutlined />
          </div>
          <div>
            <span className={styles.statLabel}>Compradores</span>
            <strong className={styles.statValor}>{resumen?.compradores ?? 0}</strong>
            <span className={styles.statSub}>usuarios distintos</span>
          </div>
        </div>

        <div className={styles.stat}>
          <div className={styles.statIcono}>
            <ClockCircleOutlined />
          </div>
          <div>
            <span className={styles.statLabel}>Compras sin completar</span>
            <strong className={styles.statValor}>{resumen?.comprasPendientes ?? 0}</strong>
            <span className={styles.statSub}>checkouts no finalizados</span>
          </div>
        </div>

        {/* Solo aparece si hubo reversos: en la operación normal no ocupa lugar. */}
        {(resumen?.comprasAnuladas ?? 0) > 0 && (
          <div className={`${styles.stat} ${styles.statAnulada}`}>
            <div className={styles.statIcono}>
              <UndoOutlined />
            </div>
            <div>
              <span className={styles.statLabel}>Cobros revertidos</span>
              <strong className={styles.statValor}>{resumen.comprasAnuladas}</strong>
              <span className={styles.statSub}>
                {puedeVerMontos
                  ? `${formatearPrecio(resumen.totalAnulado ?? 0)} fuera del total`
                  : `${etiquetaCreditos(resumen.creditosAnulados ?? 0)} descontados`}
              </span>
            </div>
          </div>
        )}

        {/* Los montos son solo para los socios propietarios. */}
        {puedeVerMontos ? (
          <>
            <div className={`${styles.stat} ${styles.statDestacada}`}>
              <div className={styles.statIcono}>
                <DollarOutlined />
              </div>
              <div>
                <span className={styles.statLabel}>Ingresos hoy</span>
                <strong className={styles.statValor}>{formatearPrecio(resumen?.ingresosHoy ?? 0)}</strong>
                <span className={styles.statSub}>{resumen?.ventasHoy ?? 0} venta(s)</span>
              </div>
            </div>
            <div className={`${styles.stat} ${styles.statDestacada}`}>
              <div className={styles.statIcono}>
                <DollarOutlined />
              </div>
              <div>
                <span className={styles.statLabel}>Ingresos totales</span>
                <strong className={styles.statValor}>
                  {formatearPrecio(resumen?.totalIngresos ?? 0)}
                </strong>
                <span className={styles.statSub}>compras acreditadas</span>
              </div>
            </div>
          </>
        ) : (
          <Tooltip title="Los ingresos del coworking son visibles solo para los socios propietarios.">
            <div className={`${styles.stat} ${styles.statBloqueada}`}>
              <div className={styles.statIcono}>
                <LockOutlined />
              </div>
              <div>
                <span className={styles.statLabel}>Ingresos</span>
                <strong className={styles.statValor}>—</strong>
                <span className={styles.statSub}>solo propietarios</span>
              </div>
            </div>
          </Tooltip>
        )}
      </div>

      {puedeVerMontos && (
        <div className={styles.bloque}>
          <div className={styles.bloqueHeader}>
            <h3>Ingresos por día</h3>
            <Select
              value={dias}
              onChange={setDias}
              className={styles.selectDias}
              options={[
                { value: 7, label: "Últimos 7 días" },
                { value: 30, label: "Últimos 30 días" },
                { value: 90, label: "Últimos 90 días" },
              ]}
            />
          </div>
          {cargandoGrafico ? <Spin /> : <GraficoIngresos serie={grafico?.serie} dias={dias} />}
        </div>
      )}

    </section>
  );
}
