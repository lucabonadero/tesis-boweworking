import React, { useState, useMemo } from "react";
import Header from "../../components/header.jsx";
import { adminFetch } from "../../utils/adminApi";
import styles from "../../styles/admin/espaciosdashboard.module.css";
import "../../styles/global.css";

import { Layout, DatePicker, Button, Spin, message } from "antd";
import {
  CalendarOutlined,
  DollarOutlined,
  BarChartOutlined,
  AppstoreOutlined,
  FilePdfOutlined,
  FilterOutlined,
  SearchOutlined,
} from "@ant-design/icons";

const { Content } = Layout;
const { RangePicker } = DatePicker;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const STAT_COLORS = {
  reservas: { bg: "#eef0ff", icon: "#5b6abf" },
  ingresos: { bg: "#e6f7f0", icon: "#27ae60" },
  ocupacion: { bg: "#fff5e6", icon: "#f39c12" },
  recursos: { bg: "#fce4ec", icon: "#e74c3c" },
};

const BAR_COLORS = {
  uso: "#4e79a7",
  ingresos: "#59a14f",
};

function ocupColor(pct) {
  if (pct === 0) return "#27ae60";
  if (pct < 40) return "#2ecc71";
  if (pct < 70) return "#f39c12";
  return "#e74c3c";
}

export default function EspaciosDashboard() {
  const [rango, setRango] = useState(null);
  const [loading, setLoading] = useState(false);
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const fechas = useMemo(() => {
    if (!rango || !rango[0] || !rango[1]) return null;
    return {
      desde: rango[0].format("YYYY-MM-DD"),
      hasta: rango[1].format("YYYY-MM-DD"),
    };
  }, [rango]);

  const fetchData = async () => {
    if (!fechas) {
      message.warning("Seleccioná un rango de fechas");
      return;
    }
    setLoading(true);
    try {
      const qs = `fechaDesde=${fechas.desde}&fechaHasta=${fechas.hasta}`;

      const [resDisp, resMetr] = await Promise.all([
        adminFetch(`${API_URL}/api/dashboard/espacios/disponibilidad?${qs}`),
        adminFetch(`${API_URL}/api/dashboard/espacios/metricas?${qs}`),
      ]);

      if (!resDisp.ok || !resMetr.ok) throw new Error("Error al cargar datos");

      setDisponibilidad(await resDisp.json());
      setMetricas(await resMetr.json());
    } catch {
      message.error("Error al cargar datos del dashboard");
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!fechas) {
      message.warning("Seleccioná un rango de fechas");
      return;
    }
    setPdfLoading(true);
    try {
      const qs = `fechaDesde=${fechas.desde}&fechaHasta=${fechas.hasta}`;
      const res = await adminFetch(`${API_URL}/api/dashboard/espacios/reporte-pdf?${qs}`);
      if (!res.ok) throw new Error();

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-espacios-${fechas.desde}_${fechas.hasta}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success("PDF descargado");
    } catch {
      message.error("Error al generar el PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const groupedBySpace = useMemo(() => {
    if (!disponibilidad) return [];
    const map = {};
    disponibilidad.forEach((r) => {
      if (!map[r.espacio_nombre]) map[r.espacio_nombre] = [];
      map[r.espacio_nombre].push(r);
    });
    return Object.entries(map).map(([nombre, recursos]) => ({ nombre, recursos }));
  }, [disponibilidad]);

  const totalDias = metricas?.resumen?.totalDias || 1;

  return (
    <Layout className={styles.layout}>
      <Header isEmpleado={true} />
      <Content className={styles.content}>
        <div className={styles.controlsBar}>
          <h2>Espacios</h2>
          <RangePicker
            format="DD/MM/YYYY"
            placeholder={["Desde", "Hasta"]}
            value={rango}
            onChange={setRango}
            style={{ borderRadius: 8 }}
          />
          <Button
            icon={<FilterOutlined />}
            className={styles.btnFiltrar}
            onClick={fetchData}
            loading={loading}
          >
            Filtrar
          </Button>
          <Button
            icon={<FilePdfOutlined />}
            className={styles.btnPDF}
            onClick={downloadPDF}
            loading={pdfLoading}
            disabled={!metricas}
          >
            Descargar PDF
          </Button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "4rem" }}>
            <Spin size="large" />
          </div>
        )}

        {!loading && !metricas && (
          <div className={styles.emptyState}>
            <SearchOutlined className={styles.emptyIcon} />
            <p className={styles.emptyText}>
              Seleccioná un rango de fechas y hacé clic en <strong>Filtrar</strong> para
              ver la disponibilidad, métricas y estadísticas de los espacios.
            </p>
          </div>
        )}

        {!loading && metricas && (
          <>
            <div className={styles.statsRow}>
              <StatCard
                icon={<CalendarOutlined />}
                label="Total Reservas"
                value={metricas.resumen.totalReservas}
                sub={`en ${metricas.resumen.totalDias} días`}
                color={STAT_COLORS.reservas}
              />
              <StatCard
                icon={<DollarOutlined />}
                label="Ingresos Totales"
                value={`$${metricas.resumen.totalIngresos.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
                sub="monto acumulado"
                color={STAT_COLORS.ingresos}
              />
              <StatCard
                icon={<BarChartOutlined />}
                label="Ocupación Promedio"
                value={`${metricas.resumen.ocupacionPromedio}%`}
                sub="sobre todos los recursos"
                color={STAT_COLORS.ocupacion}
              />
              <StatCard
                icon={<AppstoreOutlined />}
                label="Recursos Activos"
                value={`${metricas.resumen.recursosActivos} / ${metricas.resumen.recursosTotal}`}
                sub="con reservas en el período"
                color={STAT_COLORS.recursos}
              />
            </div>

            <div className={styles.mainGrid}>
              <div className={styles.availCard}>
                <h3 className={styles.availTitle}>Disponibilidad de Recursos</h3>
                {groupedBySpace.map((space) => (
                  <SpaceGroup
                    key={space.nombre}
                    space={space}
                    totalDias={totalDias}
                    allResources={disponibilidad}
                  />
                ))}
              </div>

              <div className={styles.metricsCol}>
                <div className={styles.metricCard}>
                  <h4 className={styles.metricTitle}>Recursos Más Utilizados</h4>
                  {metricas.topUso.length === 0 && <p className={styles.noData}>Sin datos</p>}
                  <BarChart items={metricas.topUso.map((r) => ({
                    label: r.nombre,
                    value: r.reservas,
                    display: `${r.reservas} res.`,
                  }))} color={BAR_COLORS.uso} />
                </div>

                <div className={styles.metricCard}>
                  <h4 className={styles.metricTitle}>Mayor Ingreso</h4>
                  {metricas.topIngresos.length === 0 && <p className={styles.noData}>Sin datos</p>}
                  <BarChart items={metricas.topIngresos.map((r) => ({
                    label: r.nombre,
                    value: r.ingresos,
                    display: `$${r.ingresos.toFixed(0)}`,
                  }))} color={BAR_COLORS.ingresos} />
                </div>

                <div className={styles.espacioOcupCard}>
                  <h4 className={styles.metricTitle}>Ocupación por Espacio</h4>
                  {metricas.espacios.map((esp) => (
                    <div key={esp.id}>
                      <div className={styles.espacioOcupRow}>
                        <span className={styles.espacioOcupName}>{esp.nombre}</span>
                        <span className={styles.espacioOcupPct} style={{ color: ocupColor(esp.ocupacion) }}>
                          {esp.ocupacion}%
                        </span>
                      </div>
                      <div className={styles.espacioOcupBar}>
                        <div
                          className={styles.espacioOcupFill}
                          style={{
                            width: `${Math.min(esp.ocupacion, 100)}%`,
                            background: ocupColor(esp.ocupacion),
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </Content>
    </Layout>
  );
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon} style={{ background: color.bg, color: color.icon }}>
        {icon}
      </div>
      <div className={styles.statInfo}>
        <span className={styles.statLabel}>{label}</span>
        <span className={styles.statValue}>{value}</span>
        {sub && <span className={styles.statSub}>{sub}</span>}
      </div>
    </div>
  );
}

function SpaceGroup({ space, totalDias, allResources }) {
  const totalRes = space.recursos.reduce((s, r) => s + r.total_reservas, 0);

  return (
    <div className={styles.spaceGroup}>
      <div className={styles.spaceGroupHeader}>
        <span className={styles.spaceGroupName}>{space.nombre}</span>
        <span
          className={styles.spaceGroupBadge}
          style={{
            background: totalRes > 0 ? "#fff5e6" : "#e6f7f0",
            color: totalRes > 0 ? "#f39c12" : "#27ae60",
          }}
        >
          {totalRes} reserva{totalRes !== 1 ? "s" : ""}
        </span>
      </div>

      {space.recursos.map((r) => {
        const isGroup = allResources.some((c) => c.idRecursoPadre === r.idRecurso);
        if (isGroup) return null;

        const ocup = totalDias > 0 ? Math.round((r.dias_ocupados / totalDias) * 100) : 0;
        let statusClass, statusText;
        if (r.total_reservas === 0) {
          statusClass = styles.badgeDisponible;
          statusText = "Disponible";
        } else if (ocup >= 80) {
          statusClass = styles.badgeReservado;
          statusText = "Reservado";
        } else {
          statusClass = styles.badgeParcial;
          statusText = "Parcial";
        }

        return (
          <div
            key={r.idRecurso}
            className={`${styles.resourceRow} ${r.idRecursoPadre ? styles.resourceRowChild : ""}`}
          >
            <span className={`${styles.resourceName} ${r.esCompleto ? styles.resourceCompleto : ""}`}>
              {r.idRecursoPadre ? "└ " : ""}
              {r.recurso_nombre}
              {r.esCompleto ? " ★" : ""}
            </span>
            <span className={styles.resourceReservas}>
              {r.total_reservas} res.
            </span>
            <div className={styles.resourceOcup}>
              <div className={styles.ocupBar}>
                <div
                  className={styles.ocupFill}
                  style={{
                    width: `${Math.min(ocup, 100)}%`,
                    background: ocupColor(ocup),
                  }}
                />
              </div>
            </div>
            <div className={styles.resourceStatus}>
              <span className={`${styles.badge} ${statusClass}`}>{statusText}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BarChart({ items, color }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div>
      {items.map((item, idx) => (
        <div key={idx} className={styles.barRow}>
          <span className={styles.barLabel} title={item.label}>{item.label}</span>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{ width: `${(item.value / max) * 100}%`, background: color }}
            />
          </div>
          <span className={styles.barValue}>{item.display}</span>
        </div>
      ))}
    </div>
  );
}
