import React, { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import Header from "../../components/header";
import { adminFetch } from "../../utils/adminApi";
import { notifyReservasChanged } from "../../utils/boweSync.js";
import styles from "../../styles/admin/gestionfinanciera.module.css";
import "../../styles/global.css";

import {
  Layout,
  Input,
  Select,
  Button,
  Table,
  Spin,
  Popconfirm,
  DatePicker,
  message,
  Tag,
  Badge,
  Empty,
} from "antd";
import {
  SearchOutlined,
  DollarOutlined,
  SyncOutlined,
  WalletOutlined,
  CheckCircleOutlined,
  CreditCardOutlined,
  UndoOutlined,
  GlobalOutlined,
  ShopOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";

const { Content } = Layout;
const { Option } = Select;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const METODO_STYLES = {
  Efectivo: styles.metodoEfectivo,
  "Mercado Pago": styles.metodoMercadoPago,
  QR: styles.metodoQR,
  Tarjeta: styles.metodoTarjeta,
  Transferencia: styles.metodoOtro,
};

const METODOS_FILTRO = ["Efectivo", "Transferencia", "Mercado Pago", "QR", "Tarjeta"];

function estadoPagoCell(stylesCss, estadoRaw) {
  const estado = (estadoRaw || "").trim();
  const lower = estado.toLowerCase();
  if (lower === "pagado") {
    return (
      <span className={`${stylesCss.estadoBadge} ${stylesCss.estadoPagado}`} title="Cobro confirmado">
        <CheckCircleOutlined aria-hidden />
        Pagado
      </span>
    );
  }
  if (lower === "rechazado" || lower === "fallido" || lower === "cancelado") {
    return (
      <span className={`${stylesCss.estadoBadge} ${stylesCss.estadoRechazado}`} title="Pago no acreditado">
        <CloseCircleOutlined aria-hidden />
        {estado || "Rechazado"}
      </span>
    );
  }
  return (
    <span className={`${stylesCss.estadoBadge} ${stylesCss.estadoPendiente}`} title="Pendiente de cobro o confirmación">
      <ClockCircleOutlined aria-hidden />
      {estado || "Pendiente"}
    </span>
  );
}

export default function GestionFinanciera() {
  const queryClient = useQueryClient();
  const [transacciones, setTransacciones] = useState([]);
  const [transaccionesTotal, setTransaccionesTotal] = useState(0);
  const [tablePage, setTablePage] = useState(1);
  const pageSize = 10;
  const [resumen, setResumen] = useState(null);
  const [reservasPendientes, setReservasPendientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroMetodo, setFiltroMetodo] = useState("Todos");
  const [dateRange, setDateRange] = useState(null);

  const [formReserva, setFormReserva] = useState(null);
  const [formMetodo, setFormMetodo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  /** Una fila por serie o por lote multi-recurso (evita duplicar cobros/pendientes en UI). */
  const reservasPendientesVista = useMemo(() => {
    const list = reservasPendientes || [];
    const bySerie = new Map();
    const byGrupo = new Map();
    for (const r of list) {
      if (r.idSerie) {
        if (!bySerie.has(r.idSerie)) bySerie.set(r.idSerie, []);
        bySerie.get(r.idSerie).push(r);
      }
      if (r.idReservaGrupo) {
        if (!byGrupo.has(r.idReservaGrupo)) byGrupo.set(r.idReservaGrupo, []);
        byGrupo.get(r.idReservaGrupo).push(r);
      }
    }
    const doneS = new Set();
    const doneG = new Set();
    const out = [];
    for (const r of list) {
      if (r.idSerie) {
        if (doneS.has(r.idSerie)) continue;
        doneS.add(r.idSerie);
        const grp = bySerie.get(r.idSerie) || [];
        const sorted = [...grp].sort((a, b) => String(a.DiaReserva).localeCompare(String(b.DiaReserva)));
        const first = sorted[0];
        const monto = sorted.reduce((s, x) => s + (parseFloat(x.Monto) || 0), 0);
        const recs = [...new Set(sorted.map((x) => x.recurso_nombre).filter(Boolean))];
        out.push({
          ...first,
          key: `serie-pend-${r.idSerie}`,
          idReserva: Math.min(...sorted.map((x) => x.idReserva)),
          Monto: monto,
          recurso_nombre: recs.join(", "),
        });
        continue;
      }
      if (r.idReservaGrupo) {
        if (doneG.has(r.idReservaGrupo)) continue;
        doneG.add(r.idReservaGrupo);
        const grp = byGrupo.get(r.idReservaGrupo) || [];
        const sorted = [...grp].sort((a, b) => (a.idReserva || 0) - (b.idReserva || 0));
        const first = sorted[0];
        const monto = sorted.reduce((s, x) => s + (parseFloat(x.Monto) || 0), 0);
        out.push({
          ...first,
          key: `grupo-pend-${r.idReservaGrupo}`,
          idReserva: r.idReservaGrupo,
          Monto: monto,
          recurso_nombre: sorted.map((x) => x.recurso_nombre).filter(Boolean).join(", "),
        });
        continue;
      }
      out.push({ ...r, key: `pend-${r.idReserva}` });
    }
    return out;
  }, [reservasPendientes]);

  const fetchTransaccionesPage = async (page = 1) => {
    const limit = pageSize;
    const offset = (page - 1) * limit;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search.trim()) params.set("q", search.trim());
    if (filtroMetodo !== "Todos") params.set("metodo", filtroMetodo);
    if (dateRange?.[0] && dateRange?.[1]) {
      params.set("desde", dateRange[0].format("YYYY-MM-DD"));
      params.set("hasta", dateRange[1].format("YYYY-MM-DD"));
    }
    const resTrans = await adminFetch(`${API_URL}/api/pagos?${params}`);
    const data = await resTrans.json();
    const items = data.items ?? [];
    const total = data.total ?? items.length;
    setTransacciones(items.map((t) => ({ ...t, key: t.idTransaccion })));
    setTransaccionesTotal(total);
    setTablePage(page);
  };

  const fetchResumenYPendientes = async () => {
    const [resResumen, resReservas] = await Promise.all([
      adminFetch(`${API_URL}/api/pagos/resumen`),
      adminFetch(`${API_URL}/api/pagos/reservas-sin-pago?limit=500&offset=0`),
    ]);
    const sum = await resResumen.json();
    setResumen(sum);
    const pendData = await resReservas.json();
    const pendItems = pendData.items ?? pendData;
    setReservasPendientes(Array.isArray(pendItems) ? pendItems : []);
  };

  const fetchAll = async () => {
    try {
      await fetchResumenYPendientes();
    } catch {
      message.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const refreshAfterMutation = async () => {
    try {
      await fetchResumenYPendientes();
      await fetchTransaccionesPage(tablePage);
      queryClient.invalidateQueries({ queryKey: ["staff-reservas"] });
      notifyReservasChanged();
    } catch {
      message.error("Error al actualizar listados");
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    setTablePage(1);
  }, [search, filtroMetodo, dateRange]);

  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        await fetchTransaccionesPage(tablePage);
      } catch {
        message.error("Error al cargar transacciones");
      }
    })();
  }, [loading, tablePage, search, filtroMetodo, dateRange]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const pendN = reservasPendientesVista.length;
    if (resumen) {
      return {
        totalIngresos: resumen.totalIngresosPagados ?? 0,
        ingresosHoy: resumen.ingresosHoy ?? 0,
        totalTransacciones: resumen.totalTransacciones ?? 0,
        pendientesCobro: pendN,
        pagosPresencial: resumen.pagosPresencial ?? 0,
        pagosOnline: resumen.pagosOnline ?? 0,
      };
    }
    return {
      totalIngresos: 0,
      ingresosHoy: 0,
      totalTransacciones: transaccionesTotal,
      pendientesCobro: pendN,
      pagosPresencial: 0,
      pagosOnline: 0,
    };
  }, [resumen, reservasPendientesVista.length, transaccionesTotal]);

  const tableRangeStart = transacciones.length === 0 ? 0 : (tablePage - 1) * pageSize + 1;
  const tableRangeEnd = (tablePage - 1) * pageSize + transacciones.length;

  /* ── Revertir cobro: borra la transacción; el estado del turno no se modifica aquí ── */
  const revertirPago = async (id) => {
    try {
      const res = await adminFetch(`${API_URL}/api/pagos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      message.success("Cobro revertido — la reserva vuelve a aparecer como pendiente de pago");
      void refreshAfterMutation();
    } catch {
      message.error("Error al revertir transacción");
    }
  };

  /* ── Register payment (always as Pagado) ── */
  const onRegistrar = async () => {
    if (!formReserva || !formMetodo) {
      message.warning("Seleccioná una reserva y el método de pago");
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminFetch(`${API_URL}/api/pagos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idReserva: formReserva,
          MetodoPago: formMetodo,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Error al registrar pago");
      }
      message.success("Pago registrado correctamente");
      setFormReserva(null);
      setFormMetodo(null);
      void refreshAfterMutation();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Columns ── */
  const columns = [
    {
      title: "Cliente",
      key: "cliente",
      sorter: (a, b) => (a.reserva_nombre || "").localeCompare(b.reserva_nombre || ""),
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500, color: "#222" }}>{r.reserva_nombre || "-"}</div>
          {r.cliente_dni && <div style={{ fontSize: 11, color: "#999" }}>DNI: {r.cliente_dni}</div>}
        </div>
      ),
    },
    {
      title: "Espacio / Recurso",
      key: "espacio",
      render: (_, r) => (
        <div>
          <div style={{ fontSize: 13, color: "#333" }}>{r.espacio_nombre || "-"}</div>
          {r.recurso_nombre && <div style={{ fontSize: 11, color: "#999" }}>{r.recurso_nombre}</div>}
        </div>
      ),
    },
    {
      title: "Concepto",
      key: "clasificacion",
      width: 128,
      render: (_, r) => {
        const c = r.ClasificacionPago;
        if (c === "reserva_fija") {
          return (
            <Tag color="cyan" title="Monto paquete 4 semanas (incluye promoción)">
              Reserva fija
            </Tag>
          );
        }
        if (c === "multirecurso") {
          return (
            <Tag color="geekblue" title="Un pago por varios lugares el mismo turno">
              Varios lugares
            </Tag>
          );
        }
        return <span style={{ fontSize: 12, color: "#94a3b8" }}>Turno</span>;
      },
    },
    {
      title: "Fecha",
      dataIndex: "DiaReserva",
      key: "fecha",
      sorter: (a, b) => new Date(a.DiaReserva || 0) - new Date(b.DiaReserva || 0),
      render: (v, r) => (
        <div>
          <div style={{ fontSize: 13 }}>{v ? dayjs(v).format("DD/MM/YYYY") : "-"}</div>
          {r.HorarioReserva && (
            <div style={{ fontSize: 11, color: "#999" }}>
              {r.HorarioReserva}{r.HorarioFin ? ` – ${r.HorarioFin}` : ""}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Monto",
      dataIndex: "Monto",
      key: "monto",
      sorter: (a, b) => (parseFloat(a.Monto) || 0) - (parseFloat(b.Monto) || 0),
      render: (v) => (
        <span style={{ fontWeight: 600, color: "#1a1a2e" }}>
          ${parseFloat(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      title: "Método",
      dataIndex: "MetodoPago",
      key: "metodo",
      render: (v, r) => (
        <div>
          <span className={`${styles.metodoBadge} ${METODO_STYLES[v] || styles.metodoOtro}`}>
            <CreditCardOutlined /> {v || "-"}
          </span>
          <div style={{ marginTop: 4 }}>
            <Tag
              icon={r.TipoPago === "online" ? <GlobalOutlined /> : <ShopOutlined />}
              color={r.TipoPago === "online" ? "blue" : "default"}
              style={{ fontSize: 10 }}
            >
              {r.TipoPago === "online" ? "Online" : "Presencial"}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: "Estado de pago",
      dataIndex: "EstadoPago",
      key: "estado",
      render: (estado) => estadoPagoCell(styles, estado),
    },
    {
      title: "",
      key: "action",
      width: 120,
      render: (_, record) => (
        <Popconfirm
          title="Revertir esta transacción?"
          description="Solo se anula el registro de cobro; el estado del turno (activa, recepción, etc.) no cambia."
          onConfirm={() => revertirPago(record.idTransaccion)}
          okText="Revertir"
          cancelText="Cancelar"
          okButtonProps={{ danger: true }}
        >
          <button type="button" className={styles.revertBtn}>
            <UndoOutlined /> Revertir
          </button>
        </Popconfirm>
      ),
    },
  ];

  /* ── Render ── */
  if (loading) {
    return (
      <Layout className={styles.layout}>
        <Header />
        <Content className={styles.content}>
          <div style={{ textAlign: "center", padding: "4rem" }}><Spin size="large" /></div>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className={styles.layout}>
      <Header />
      <Content className={styles.content}>
        {/* Stats */}
        <div className={styles.statsRow}>
          <StatCard
            icon={<DollarOutlined />}
            label="Ingresos Hoy"
            value={`$${stats.ingresosHoy.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
            sub={dayjs().format("DD/MM/YYYY")}
            color={{ bg: "#e6f7f0", icon: "#27ae60" }}
          />
          <StatCard
            icon={<DollarOutlined />}
            label="Total Ingresos"
            value={`$${stats.totalIngresos.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
            sub="pagos confirmados"
            color={{ bg: "#eef0ff", icon: "#5b6abf" }}
          />
          <StatCard
            icon={<WalletOutlined />}
            label="Pendientes de Cobro"
            value={stats.pendientesCobro}
            sub="reservas sin pago"
            color={{ bg: "#fff5e6", icon: "#e67e22" }}
          />
          <StatCard
            icon={<SyncOutlined />}
            label="Transacciones"
            value={stats.totalTransacciones}
            sub="registradas"
            color={{ bg: "#fce4ec", icon: "#e74c3c" }}
          />
        </div>

        {/* Main grid */}
        <div className={styles.mainGrid}>
          {/* Table */}
          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h2 className={styles.tableTitle}>Transacciones</h2>
              <div className={styles.tableControls}>
                <Input
                  placeholder="Buscar cliente, DNI, espacio..."
                  prefix={<SearchOutlined />}
                  className={styles.searchInput}
                  allowClear
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Select value={filtroMetodo} className={styles.filterSelect} onChange={setFiltroMetodo}>
                  <Option value="Todos">Todos los métodos</Option>
                  {METODOS_FILTRO.map((m) => (
                    <Option key={m} value={m}>{m}</Option>
                  ))}
                </Select>
                <DatePicker.RangePicker
                  format="DD/MM/YYYY"
                  placeholder={["Desde", "Hasta"]}
                  value={dateRange}
                  onChange={setDateRange}
                  allowClear
                  className={styles.rangePicker}
                />
              </div>
            </div>

            <div className={styles.tableWrapper}>
              <Table
                columns={columns}
                dataSource={transacciones}
                pagination={{
                  current: tablePage,
                  pageSize,
                  total: transaccionesTotal,
                  showSizeChanger: false,
                  size: "small",
                  onChange: (p) => fetchTransaccionesPage(p),
                  responsive: true,
                }}
                className={styles.table}
                scroll={{ x: "max-content" }}
                size="middle"
              />
            </div>

            <div className={styles.tableFooter}>
              <span className={styles.tableInfo}>
                Mostrando {tableRangeStart}-{tableRangeEnd} de {transaccionesTotal} transacciones
              </span>
            </div>
          </div>

          {/* Right panel */}
          <div className={styles.rightPanel}>
            {/* Register payment */}
            <div className={`${styles.formCard} ${reservasPendientesVista.length > 0 ? styles.formCardPendientesHighlight : ""}`}>
              <div className={styles.formTitleRow}>
                <h3 className={styles.formTitle}>Registrar Cobro</h3>
                <Badge count={reservasPendientesVista.length} showZero overflowCount={99}
                  style={{ backgroundColor: reservasPendientesVista.length > 0 ? "#d97706" : "#94a3b8" }} />
              </div>

              {reservasPendientesVista.length === 0 ? (
                <Empty
                  description="No hay reservas pendientes de cobro"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  style={{ padding: "20px 0" }}
                />
              ) : (
                <>
                  <div className={styles.formField}>
                    <label className={styles.label}>Reserva pendiente</label>
                    <Select
                      className={styles.select}
                      placeholder="Seleccionar reserva"
                      value={formReserva}
                      onChange={setFormReserva}
                      showSearch
                      optionFilterProp="label"
                      filterOption={(input, option) =>
                        String(option?.label ?? "")
                          .toLowerCase()
                          .includes(input.toLowerCase())
                      }
                    >
                      {reservasPendientesVista.map((r) => {
                        const label = `${r.Nombre} — ${r.espacio_nombre || "?"} (${r.DiaReserva ? dayjs(r.DiaReserva).format("DD/MM") : "?"})`;
                        return (
                          <Option key={r.key || r.idReserva} value={r.idReserva} label={label}>
                            <div className={styles.pendienteOptionRow}>
                              <span className={styles.pendienteOptionText}>{label}</span>
                              <span className={styles.estadoMiniPendiente}>
                                <WarningOutlined aria-hidden /> Pendiente
                              </span>
                            </div>
                          </Option>
                        );
                      })}
                    </Select>
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.label}>Método de pago</label>
                    <Select
                      className={styles.select}
                      placeholder="¿Cómo paga el cliente?"
                      value={formMetodo}
                      onChange={setFormMetodo}
                    >
                      <Option value="Efectivo">Efectivo</Option>
                      <Option value="Transferencia">Transferencia</Option>
                      <Option value="Mercado Pago">Mercado Pago</Option>
                      <Option value="QR">QR</Option>
                      <Option value="Tarjeta">Tarjeta</Option>
                    </Select>
                  </div>

                  <Button
                    className={styles.btnRegistrar}
                    onClick={onRegistrar}
                    loading={submitting}
                    disabled={!formReserva || !formMetodo}
                    icon={<CheckCircleOutlined />}
                  >
                    Cobrar y Registrar
                  </Button>
                </>
              )}
            </div>

            {/* Quick info */}
            <div className={styles.quickInfo}>
              <h4 className={styles.quickInfoTitle}>Resumen de Caja</h4>
              <div className={styles.quickInfoRow}>
                <span className={styles.quickInfoLabel}>Cobrados hoy</span>
                <span className={styles.quickInfoValue} style={{ color: "#27ae60" }}>
                  ${stats.ingresosHoy.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className={styles.quickInfoRow}>
                <span className={styles.quickInfoLabel}>Reservas sin cobrar</span>
                <span className={styles.quickInfoValue} style={{ color: "#e67e22" }}>
                  {reservasPendientes.length}
                </span>
              </div>
              <div className={styles.quickInfoRow}>
                <span className={styles.quickInfoLabel}>Total acumulado</span>
                <span className={styles.quickInfoValue} style={{ color: "#5b6abf" }}>
                  ${stats.totalIngresos.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className={styles.quickInfoRow}>
                <span className={styles.quickInfoLabel}>Pagos presenciales</span>
                <span className={styles.quickInfoValue}>
                  {stats.pagosPresencial}
                </span>
              </div>
              <div className={styles.quickInfoRow}>
                <span className={styles.quickInfoLabel}>Pagos online</span>
                <span className={styles.quickInfoValue}>
                  {stats.pagosOnline}
                </span>
              </div>
            </div>
          </div>
        </div>
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
