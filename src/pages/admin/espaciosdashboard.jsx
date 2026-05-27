import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Header from "../../components/header.jsx";
import AdminPageHeader from "../../components/AdminPageHeader.jsx";
import { adminFetch } from "../../utils/adminApi";
import { BOWE_RESERVAS_CHANGED } from "../../utils/boweSync.js";
import styles from "../../styles/admin/espaciosdashboard.module.css";
import "../../styles/global.css";

import { Layout, DatePicker, Button, Spin, message, Select, Input, Tooltip } from "antd";
import dayjs from "dayjs";
import {
  CalendarOutlined,
  DollarOutlined,
  WalletOutlined,
  BarChartOutlined,
  AppstoreOutlined,
  FilePdfOutlined,
  FilterOutlined,
  SearchOutlined,
  PieChartOutlined,
  RiseOutlined,
  ClearOutlined,
} from "@ant-design/icons";

const { Content } = Layout;
const { RangePicker } = DatePicker;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const STAT_COLORS = {
  reservas:  { bg: "var(--color-brand-primary-soft)", icon: "var(--color-brand-primary)",      border: "var(--color-brand-primary)" },
  ingresos:  { bg: "var(--color-success-soft)",       icon: "var(--color-success-text)",       border: "var(--color-success)" },
  ocupacion: { bg: "var(--color-warning-soft)",       icon: "var(--color-warning-text)",       border: "var(--color-warning)" },
  recursos:  { bg: "var(--color-info-soft)",          icon: "var(--color-info)",               border: "var(--color-info)" },
};

const BAR_COLORS = {
  uso: "#34c08f",
  ingresos: "#1a7a40",
};

// Paleta derivada del sistema (verde brand + peach brand secundario + semánticos).
const CHART_PALETTE = [
  "#34c08f", // brand primary (verde coworking)
  "#F9AC95", // brand secondary (peach coworking)
  "#1a7a40", // success text
  "#e8a830", // warning
  "#4a90d9", // info
  "#2aad7e", // brand dark
  "#e88a6f", // brand secondary dark
  "#1a1a2e", // neutral 900
];

const DATE_PRESETS = [
  { label: "Últimos 7 días", value: [dayjs().subtract(6, "day"), dayjs()] },
  { label: "Últimos 30 días", value: [dayjs().subtract(29, "day"), dayjs()] },
  { label: "Este mes", value: [dayjs().startOf("month"), dayjs().endOf("month")] },
  { label: "Mes anterior", value: [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] },
];

const MOBILE_DATE_BREAKPOINT = 768;

function useIsMobileDatePicker() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width: ${MOBILE_DATE_BREAKPOINT}px)`).matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_DATE_BREAKPOINT}px)`);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

function ocupColor(pct) {
  // Verde si está libre/poco usado, naranja si moderado, rojo si alta ocupación.
  if (pct === 0) return "#27ae60";
  if (pct < 40) return "#34c08f";
  if (pct < 70) return "#e8a830";
  return "#e05252";
}

function resourceStatus(r, totalDias) {
  const ocup = totalDias > 0 ? Math.round((r.dias_ocupados / totalDias) * 100) : 0;
  if (r.total_reservas === 0) return { key: "disponible", label: "Disponible", ocup };
  if (ocup >= 80) return { key: "reservado", label: "Alta ocupación", ocup };
  return { key: "parcial", label: "Uso parcial", ocup };
}

/** SVG donut slice path (degrees, clockwise from top). */
function donutSlicePath(cx, cy, rOuter, rInner, startDeg, endDeg) {
  const rad = Math.PI / 180;
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const x1 = cx + rOuter * Math.cos((startDeg - 90) * rad);
  const y1 = cy + rOuter * Math.sin((startDeg - 90) * rad);
  const x2 = cx + rOuter * Math.cos((endDeg - 90) * rad);
  const y2 = cy + rOuter * Math.sin((endDeg - 90) * rad);
  const x3 = cx + rInner * Math.cos((endDeg - 90) * rad);
  const y3 = cy + rInner * Math.sin((endDeg - 90) * rad);
  const x4 = cx + rInner * Math.cos((startDeg - 90) * rad);
  const y4 = cy + rInner * Math.sin((startDeg - 90) * rad);
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`;
}

export default function EspaciosDashboard() {
  const isMobileDate = useIsMobileDatePicker();
  const [rango, setRango] = useState(null);
  const [loading, setLoading] = useState(false);
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [filtroEspacioId, setFiltroEspacioId] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroTipoRecurso, setFiltroTipoRecurso] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [activeSlice, setActiveSlice] = useState(null);

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
    setFiltroEspacioId(null);
    setActiveSlice(null);
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

  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  useEffect(() => {
    const onSync = () => {
      if (!fechas) return;
      void fetchDataRef.current();
    };
    window.addEventListener(BOWE_RESERVAS_CHANGED, onSync);
    return () => window.removeEventListener(BOWE_RESERVAS_CHANGED, onSync);
  }, [fechas]);

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

  const totalMontosReservas = metricas?.resumen?.totalMontosReservas ?? metricas?.resumen?.totalIngresos ?? 0;
  const totalCobradoPagado = metricas?.resumen?.totalCobradoPagado ?? 0;

  const ticketPromedio = useMemo(() => {
    if (!metricas?.resumen?.totalReservas) return 0;
    const base = metricas.resumen.totalMontosReservas ?? metricas.resumen.totalIngresos ?? 0;
    return base / metricas.resumen.totalReservas;
  }, [metricas]);

  const espacioTopIngresos = useMemo(() => {
    if (!metricas?.espacios?.length) return null;
    return [...metricas.espacios].sort((a, b) => b.totalIngresos - a.totalIngresos)[0];
  }, [metricas]);

  const espacioTopCobrado = useMemo(() => {
    if (!metricas?.espacios?.length) return null;
    const sorted = [...metricas.espacios].sort(
      (a, b) => (b.totalCobradoPagado ?? 0) - (a.totalCobradoPagado ?? 0)
    );
    return sorted[0]?.totalCobradoPagado > 0 ? sorted[0] : null;
  }, [metricas]);

  const espacioTopUso = useMemo(() => {
    if (!metricas?.espacios?.length) return null;
    return [...metricas.espacios].sort((a, b) => b.totalReservas - a.totalReservas)[0];
  }, [metricas]);

  const donutData = useMemo(() => {
    if (!metricas?.espacios?.length) return [];
    const withIncome = metricas.espacios.filter((e) => e.totalIngresos > 0);
    const total = withIncome.reduce((s, e) => s + e.totalIngresos, 0);
    if (total <= 0) return [];
    return withIncome.map((e) => ({
      ...e,
      pct: (e.totalIngresos / total) * 100,
      value: e.totalIngresos / total,
    }));
  }, [metricas]);

  const donutSegments = useMemo(() => {
    if (!donutData.length) return [];
    let angle = 0;
    return donutData.map((d, i) => {
      const sweep = d.value * 360;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      return {
        ...d,
        start,
        end,
        color: CHART_PALETTE[i % CHART_PALETTE.length],
        index: i,
      };
    });
  }, [donutData]);

  const espaciosSortedIngresos = useMemo(() => {
    if (!metricas?.espacios) return [];
    return [...metricas.espacios].sort((a, b) => b.totalIngresos - a.totalIngresos);
  }, [metricas]);

  const maxIngresoEspacio = useMemo(() => {
    if (!espaciosSortedIngresos.length) return 1;
    return Math.max(...espaciosSortedIngresos.map((e) => e.totalIngresos), 1);
  }, [espaciosSortedIngresos]);

  const spacesToShow = useMemo(() => {
    if (!groupedBySpace.length) return [];
    if (filtroEspacioId == null) return groupedBySpace;
    return groupedBySpace.filter((space) => {
      const id = space.recursos[0]?.idEspacio;
      return Number(id) === Number(filtroEspacioId);
    });
  }, [groupedBySpace, filtroEspacioId]);

  const clearFiltros = useCallback(() => {
    setFiltroEspacioId(null);
    setFiltroEstado("todos");
    setFiltroTipoRecurso("todos");
    setBusqueda("");
    setActiveSlice(null);
  }, []);

  const selectEspacioFromChart = useCallback((id) => {
    setFiltroEspacioId((prev) => (Number(prev) === Number(id) ? null : id));
  }, []);

  const onMobileDesdeChange = useCallback((e) => {
    const v = e.target.value;
    if (!v) {
      if (!rango?.[1]) setRango(null);
      else {
        const h = rango[1];
        setRango([h, h]);
      }
      return;
    }
    const start = dayjs(v);
    const end = rango?.[1] != null ? (start.isAfter(rango[1], "day") ? start : rango[1]) : start;
    setRango([start, end]);
  }, [rango]);

  const onMobileHastaChange = useCallback((e) => {
    const v = e.target.value;
    if (!v) {
      if (!rango?.[0]) setRango(null);
      else {
        const d = rango[0];
        setRango([d, d]);
      }
      return;
    }
    const end = dayjs(v);
    const start = rango?.[0] != null ? (rango[0].isAfter(end, "day") ? end : rango[0]) : end;
    setRango([start, end]);
  }, [rango]);

  return (
    <Layout className={styles.layout}>
      <Header />
      <Content className={styles.content}>
        <AdminPageHeader
          eyebrow="Análisis operativo"
          icon={<AppstoreOutlined />}
          title="Panel de espacios"
          description="Uso, montos asociados a reservas y cobro confirmado (pagos acreditados) por período."
          meta={
            metricas && fechas ? (
              <>
                <CalendarOutlined /> Período: <strong>{fechas.desde}</strong> → <strong>{fechas.hasta}</strong>
                <span style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.4)", margin: "0 4px" }} />
                {metricas.resumen.totalDias} días analizados
              </>
            ) : null
          }
          actions={
            <>
            {isMobileDate ? (
              <div className={styles.dateRangeMobile}>
                <div className={styles.presetScroll} role="group" aria-label="Atajos de período">
                  {DATE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className={styles.presetChip}
                      onClick={() => setRango(p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className={styles.nativeDatesRow}>
                  <label className={styles.nativeDateField}>
                    <span className={styles.nativeDateCaption}>Desde</span>
                    <input
                      type="date"
                      className={styles.nativeDateInput}
                      value={rango?.[0] ? rango[0].format("YYYY-MM-DD") : ""}
                      onChange={onMobileDesdeChange}
                    />
                  </label>
                  <label className={styles.nativeDateField}>
                    <span className={styles.nativeDateCaption}>Hasta</span>
                    <input
                      type="date"
                      className={styles.nativeDateInput}
                      value={rango?.[1] ? rango[1].format("YYYY-MM-DD") : ""}
                      onChange={onMobileHastaChange}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <RangePicker
                format="DD/MM/YYYY"
                placeholder={["Desde", "Hasta"]}
                value={rango}
                onChange={setRango}
                presets={DATE_PRESETS}
                className={styles.rangePicker}
              />
            )}
            <Button
              type="primary"
              icon={<FilterOutlined />}
              className={styles.btnPrimary}
              onClick={fetchData}
              loading={loading}
              size="large"
            >
              Actualizar datos
            </Button>
            <Tooltip title="Exportá el mismo período en PDF">
              <Button
                icon={<FilePdfOutlined />}
                className={styles.btnSecondary}
                onClick={downloadPDF}
                loading={pdfLoading}
                disabled={!metricas}
                size="large"
              >
                PDF
              </Button>
            </Tooltip>
            </>
          }
        />

        {loading && (
          <div className={styles.loadingWrap}>
            <Spin size="large" />
            <p className={styles.loadingText}>Cargando métricas del período…</p>
          </div>
        )}

        {!loading && !metricas && (
          <div className={styles.emptyState}>
            <div className={styles.emptyCard}>
              <SearchOutlined className={styles.emptyIcon} />
              <h3 className={styles.emptyTitle}>Elegí fechas y actualizá</h3>
              <p className={styles.emptyText}>
                Usá los atajos (últimos 7 días, este mes…) o un rango personalizado y tocá{" "}
                <strong>Actualizar datos</strong> para ver gráficos, KPIs y el detalle de recursos.
              </p>
            </div>
          </div>
        )}

        {!loading && metricas && (
          <>
            <div className={styles.statsRow}>
              <StatCard
                icon={<CalendarOutlined />}
                label="Reservas"
                value={metricas.resumen.totalReservas}
                sub={`en ${metricas.resumen.totalDias} días`}
                color={STAT_COLORS.reservas}
              />
              <StatCard
                icon={<DollarOutlined />}
                label="Cobrado confirmado"
                value={`$${totalCobradoPagado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
                sub={`Montos en reservas: $${totalMontosReservas.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
                color={STAT_COLORS.ingresos}
              />
              <StatCard
                icon={<BarChartOutlined />}
                label="Ocupación media"
                value={`${metricas.resumen.ocupacionPromedio}%`}
                sub="sobre recursos hoja (puestos / salas)"
                color={STAT_COLORS.ocupacion}
              />
              <StatCard
                icon={<AppstoreOutlined />}
                label="Recursos con movimiento"
                value={`${metricas.resumen.recursosActivos} / ${metricas.resumen.recursosTotal}`}
                sub="activos vs totales"
                color={STAT_COLORS.recursos}
              />
            </div>

            <div className={styles.insightStrip}>
              <div className={styles.insightItem}>
                <RiseOutlined className={styles.insightIcon} />
                <span className={styles.insightLabel}>Ticket promedio</span>
                <strong className={styles.insightValue}>
                  ${ticketPromedio.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </strong>
                <span className={styles.insightHint}>monto de reserva / reserva</span>
              </div>
              {espacioTopIngresos && (
                <div className={styles.insightItem}>
                  <PieChartOutlined className={styles.insightIcon} />
                  <span className={styles.insightLabel}>Más monto en reservas</span>
                  <strong className={styles.insightValue}>{espacioTopIngresos.nombre}</strong>
                  <span className={styles.insightHint}>
                    ${espacioTopIngresos.totalIngresos.toLocaleString("es-AR", { minimumFractionDigits: 0 })}
                  </span>
                </div>
              )}
              {espacioTopCobrado && (
                <div className={styles.insightItem}>
                  <WalletOutlined className={styles.insightIcon} />
                  <span className={styles.insightLabel}>Más cobrado</span>
                  <strong className={styles.insightValue}>{espacioTopCobrado.nombre}</strong>
                  <span className={styles.insightHint}>
                    ${(espacioTopCobrado.totalCobradoPagado ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 0 })}
                  </span>
                </div>
              )}
              {espacioTopUso && (
                <div className={styles.insightItem}>
                  <BarChartOutlined className={styles.insightIcon} />
                  <span className={styles.insightLabel}>Más reservas</span>
                  <strong className={styles.insightValue}>{espacioTopUso.nombre}</strong>
                  <span className={styles.insightHint}>{espacioTopUso.totalReservas} reservas</span>
                </div>
              )}
            </div>

            <div className={styles.chartsGrid}>
              <div className={styles.chartCard}>
                <div className={styles.chartCardHead}>
                  <h3 className={styles.chartTitle}>Montos en reservas por espacio</h3>
                  <p className={styles.chartSubtitle}>
                    Suma de <strong>Monto</strong> de reservas (incluye pendientes de cobro) — leyenda interactiva
                  </p>
                </div>
                <div className={styles.donutRow}>
                  <RevenueDonut
                    segments={donutSegments}
                    activeIndex={activeSlice}
                    onHover={setActiveSlice}
                    onSliceClick={(id) => selectEspacioFromChart(id)}
                    filtroEspacioId={filtroEspacioId}
                  />
                  <ul className={styles.donutLegend}>
                    {donutSegments.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={`${styles.legendBtn} ${activeSlice === s.index ? styles.legendBtnActive : ""} ${
                            filtroEspacioId != null && Number(s.id) === Number(filtroEspacioId)
                              ? styles.legendBtnSelected
                              : ""
                          }`}
                          onMouseEnter={() => setActiveSlice(s.index)}
                          onMouseLeave={() => setActiveSlice(null)}
                          onClick={() => selectEspacioFromChart(s.id)}
                        >
                          <span className={styles.legendSwatch} style={{ background: s.color }} />
                          <span className={styles.legendName}>{s.nombre}</span>
                          <span className={styles.legendPct}>{s.pct.toFixed(1)}%</span>
                          <span className={styles.legendMoney}>
                            ${s.totalIngresos.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className={styles.chartCard}>
                <div className={styles.chartCardHead}>
                  <h3 className={styles.chartTitle}>Comparación de montos reservados</h3>
                  <p className={styles.chartSubtitle}>Barras relativas al espacio líder (monto de reserva, no cobro)</p>
                </div>
                <div className={styles.spaceBars}>
                  {espaciosSortedIngresos.map((esp, i) => {
                    const pct = (esp.totalIngresos / maxIngresoEspacio) * 100;
                    const selected = filtroEspacioId != null && Number(esp.id) === Number(filtroEspacioId);
                    return (
                      <button
                        key={esp.id}
                        type="button"
                        className={`${styles.spaceBarRow} ${selected ? styles.spaceBarRowSelected : ""}`}
                        onClick={() => selectEspacioFromChart(esp.id)}
                      >
                        <span className={styles.spaceBarName} title={esp.nombre}>
                          {esp.nombre}
                        </span>
                        <div className={styles.spaceBarTrack}>
                          <div
                            className={styles.spaceBarFill}
                            style={{
                              width: `${Math.max(pct, esp.totalIngresos > 0 ? 8 : 0)}%`,
                              background: CHART_PALETTE[i % CHART_PALETTE.length],
                            }}
                          />
                        </div>
                        <span className={styles.spaceBarValue}>
                          ${esp.totalIngresos.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={styles.spaceCardsSection}>
              <h3 className={styles.sectionTitle}>Resumen por espacio</h3>
              <p className={styles.sectionSubtitle}>Tocá una tarjeta para filtrar el listado de recursos debajo</p>
              <div className={styles.spaceCardsGrid}>
                {metricas.espacios.map((esp, i) => {
                  const selected = filtroEspacioId != null && Number(esp.id) === Number(filtroEspacioId);
                  return (
                    <button
                      key={esp.id}
                      type="button"
                      className={`${styles.spaceMiniCard} ${selected ? styles.spaceMiniCardSelected : ""}`}
                      onClick={() => selectEspacioFromChart(esp.id)}
                      style={{ "--accent": CHART_PALETTE[i % CHART_PALETTE.length] }}
                    >
                      <span className={styles.spaceMiniName}>{esp.nombre}</span>
                      <div className={styles.spaceMiniMetrics}>
                        <span>
                          <em>Ocupación</em> {esp.ocupacion}%
                        </span>
                        <span>
                          <em>Reservas</em> {esp.totalReservas}
                        </span>
                        <span>
                          <em>Monto reservas</em> ${esp.totalIngresos.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                        </span>
                        {(esp.totalCobradoPagado ?? 0) > 0 && (
                          <span>
                            <em>Cobrado</em> ${(esp.totalCobradoPagado ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                          </span>
                        )}
                      </div>
                      <div className={styles.spaceMiniBar}>
                        <div
                          className={styles.spaceMiniBarFill}
                          style={{
                            width: `${Math.min(esp.ocupacion, 100)}%`,
                            background: ocupColor(esp.ocupacion),
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.filtersBar}>
              <div className={styles.filtersLabel}>
                <FilterOutlined /> Filtros del listado
              </div>
              <Select
                allowClear
                placeholder="Espacio"
                className={styles.filterSelect}
                value={filtroEspacioId ?? undefined}
                onChange={(v) => setFiltroEspacioId(v ?? null)}
                options={metricas.espacios.map((e) => ({ value: e.id, label: e.nombre }))}
              />
              <Select
                className={styles.filterSelect}
                value={filtroEstado}
                onChange={setFiltroEstado}
                options={[
                  { value: "todos", label: "Ocupación: todos" },
                  { value: "disponible", label: "Disponible (sin reservas)" },
                  { value: "parcial", label: "Uso parcial" },
                  { value: "reservado", label: "Alta ocupación" },
                ]}
              />
              <Select
                className={styles.filterSelect}
                value={filtroTipoRecurso}
                onChange={setFiltroTipoRecurso}
                options={[
                  { value: "todos", label: "Tipo: todos" },
                  { value: "completo", label: "Sala / espacio completo (★)" },
                  { value: "puesto", label: "Puestos y unidades" },
                ]}
              />
              <Input
                allowClear
                prefix={<SearchOutlined className={styles.searchIcon} />}
                placeholder="Buscar recurso…"
                className={styles.filterSearch}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <Button icon={<ClearOutlined />} onClick={clearFiltros} className={styles.btnClear}>
                Limpiar
              </Button>
            </div>

            <div className={styles.mainGrid}>
              <div className={styles.availCard}>
                <div className={styles.availHead}>
                  <h3 className={styles.availTitle}>Disponibilidad y uso por recurso</h3>
                  <span className={styles.availHint}>
                    Filas con hover · Indicador de ocupación según reservas y % de días en el período
                  </span>
                </div>
                {spacesToShow.length === 0 && (
                  <p className={styles.noData}>No hay recursos que coincidan con los filtros.</p>
                )}
                {spacesToShow.map((space) => (
                  <SpaceGroup
                    key={space.nombre}
                    space={space}
                    totalDias={totalDias}
                    allResources={disponibilidad}
                    filtroEstado={filtroEstado}
                    filtroTipoRecurso={filtroTipoRecurso}
                    busqueda={busqueda}
                  />
                ))}
              </div>

              <div className={styles.metricsCol}>
                <div className={styles.metricCard}>
                  <h4 className={styles.metricTitle}>Recursos más utilizados</h4>
                  <p className={styles.metricHint}>Por cantidad de reservas en el período</p>
                  {metricas.topUso.length === 0 && <p className={styles.noData}>Sin datos en este período</p>}
                  <BarChart
                    items={metricas.topUso.map((r) => ({
                      label: r.nombre,
                      sub: r.espacio,
                      value: r.reservas,
                      display: `${r.reservas} res.`,
                    }))}
                    color={BAR_COLORS.uso}
                  />
                </div>

                <div className={styles.metricCard}>
                  <h4 className={styles.metricTitle}>Mayor monto en reservas</h4>
                  <p className={styles.metricHint}>Suma de Monto por recurso (todas las reservas del período)</p>
                  {metricas.topIngresos.length === 0 && <p className={styles.noData}>Sin datos en este período</p>}
                  <BarChart
                    items={metricas.topIngresos.map((r) => ({
                      label: r.nombre,
                      sub: r.espacio,
                      value: r.ingresos,
                      display: `$${r.ingresos.toFixed(0)}`,
                    }))}
                    color={BAR_COLORS.ingresos}
                  />
                </div>

                <div className={styles.metricCard}>
                  <h4 className={styles.metricTitle}>Mayor cobro confirmado</h4>
                  <p className={styles.metricHint}>Solo reservas con pago acreditado (Transacción Pagado)</p>
                  {!(metricas.topCobradoPagado?.length > 0) && <p className={styles.noData}>Sin cobros en este período</p>}
                  {metricas.topCobradoPagado?.length > 0 && (
                    <BarChart
                      items={metricas.topCobradoPagado.map((r) => ({
                        label: r.nombre,
                        sub: r.espacio,
                        value: r.cobrado,
                        display: `$${r.cobrado.toFixed(0)}`,
                      }))}
                      color="#16a085"
                    />
                  )}
                </div>

                <div className={styles.espacioOcupCard}>
                  <h4 className={styles.metricTitle}>Ocupación por espacio</h4>
                  <p className={styles.metricHint}>% de días ocupados sobre capacidad del área</p>
                  {metricas.espacios.map((esp) => (
                    <div key={esp.id}>
                      <button
                        type="button"
                        className={styles.espacioOcupRowBtn}
                        onClick={() => selectEspacioFromChart(esp.id)}
                      >
                        <span className={styles.espacioOcupName}>{esp.nombre}</span>
                        <span className={styles.espacioOcupPct} style={{ color: ocupColor(esp.ocupacion) }}>
                          {esp.ocupacion}%
                        </span>
                      </button>
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
    <div className={styles.statCard} style={{ borderLeftColor: color.border }}>
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

function RevenueDonut({ segments, activeIndex, onHover, onSliceClick, filtroEspacioId }) {
  const cx = 110;
  const cy = 110;
  const rO = 88;
  const rI = 56;

  if (!segments.length) {
    return (
      <div className={styles.donutEmpty}>
        <PieChartOutlined />
        <p>Sin montos de reserva en el período para graficar</p>
      </div>
    );
  }

  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 220 220" className={styles.donutSvg} aria-hidden>
        {segments.map((s) => {
          const isActive = activeIndex === s.index;
          const isSelected = filtroEspacioId != null && Number(s.id) === Number(filtroEspacioId);
          return (
            <path
              key={s.id}
              d={donutSlicePath(cx, cy, rO, rI, s.start, s.end)}
              fill={s.color}
              className={`${styles.donutSlice} ${isActive ? styles.donutSliceActive : ""} ${isSelected ? styles.donutSliceSelected : ""}`}
              onMouseEnter={() => onHover(s.index)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSliceClick(s.id)}
            />
          );
        })}
      </svg>
      <div className={styles.donutCenter}>
        <span className={styles.donutCenterLabel}>Total</span>
        <span className={styles.donutCenterSub}>Montos reserva</span>
        <span
          className={styles.donutCenterValue}
          title={`Total montos reserva: $${segments.reduce((sum, s) => sum + s.totalIngresos, 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
        >
          $
          {segments
            .reduce((sum, s) => sum + s.totalIngresos, 0)
            .toLocaleString("es-AR", { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}

function SpaceGroup({ space, totalDias, allResources, filtroEstado, filtroTipoRecurso, busqueda }) {
  const visibleRecursos = space.recursos.filter((r) => {
    const isGroup = allResources.some((c) => c.idRecursoPadre === r.idRecurso);
    if (isGroup) return false;

    const st = resourceStatus(r, totalDias);
    if (filtroEstado !== "todos" && st.key !== filtroEstado) return false;

    if (filtroTipoRecurso === "completo" && !r.esCompleto) return false;
    if (filtroTipoRecurso === "puesto" && r.esCompleto) return false;

    const q = (busqueda || "").trim().toLowerCase();
    if (q && !String(r.recurso_nombre || "").toLowerCase().includes(q)) return false;

    return true;
  });

  const totalRes = space.recursos.reduce((s, r) => {
    const isGroup = allResources.some((c) => c.idRecursoPadre === r.idRecurso);
    if (isGroup) return s;
    return s + r.total_reservas;
  }, 0);

  return (
    <div className={styles.spaceGroup}>
      <div className={styles.spaceGroupHeader}>
        <span className={styles.spaceGroupName}>{space.nombre}</span>
        <span
          className={styles.spaceGroupBadge}
          style={{
            background: totalRes > 0 ? "rgba(243, 156, 18, 0.15)" : "rgba(39, 174, 96, 0.12)",
            color: totalRes > 0 ? "#d35400" : "#27ae60",
          }}
        >
          {totalRes} reserva{totalRes !== 1 ? "s" : ""}
        </span>
      </div>

      {visibleRecursos.length === 0 ? (
        <p className={styles.spaceGroupEmpty}>Ningún recurso coincide con los filtros en este espacio.</p>
      ) : (
        visibleRecursos.map((r) => {
          const st = resourceStatus(r, totalDias);
          const ocup = st.ocup;
          let statusClass;
          if (st.key === "disponible") statusClass = styles.badgeDisponible;
          else if (st.key === "reservado") statusClass = styles.badgeReservado;
          else statusClass = styles.badgeParcial;

          return (
            <div
              key={r.idRecurso}
              className={`${styles.resourceRow} ${r.idRecursoPadre ? styles.resourceRowChild : ""}`}
            >
              <span className={`${styles.resourceName} ${r.esCompleto ? styles.resourceCompleto : ""}`}>
                <span
                  className={styles.statusDot}
                  style={{
                    background: st.key === "disponible" ? "#27ae60" : st.key === "reservado" ? "#e74c3c" : "#f39c12",
                  }}
                />
                {r.idRecursoPadre ? "└ " : ""}
                {r.recurso_nombre}
                {r.esCompleto ? " ★" : ""}
              </span>
              <span className={styles.resourceReservas}>{r.total_reservas} res.</span>
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
              <Tooltip title={`${st.label} · ${ocup}% de días con uso en el período`}>
                <div className={styles.resourceStatus}>
                  <span className={`${styles.badge} ${statusClass}`}>{st.label}</span>
                </div>
              </Tooltip>
            </div>
          );
        })
      )}
    </div>
  );
}

function BarChart({ items, color }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className={styles.barChart}>
      {items.map((item, idx) => (
        <div key={idx} className={styles.barRow}>
          <div className={styles.barLabelCol}>
            <span className={styles.barLabel} title={item.label}>
              {item.label}
            </span>
            {item.sub && <span className={styles.barSub}>{item.sub}</span>}
          </div>
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
