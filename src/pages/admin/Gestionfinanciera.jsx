import React, { useState, useEffect, useMemo } from "react";
import dayjs from "dayjs";
import Header from "../../components/header";
import { adminFetch } from "../../utils/adminApi";
import styles from "../../styles/admin/gestionfinanciera.module.css";
import "../../styles/global.css";

import {
  Layout,
  Input,
  Select,
  Button,
  Table,
  Radio,
  Spin,
  Popconfirm,
  message,
} from "antd";
import {
  SearchOutlined,
  DollarOutlined,
  SyncOutlined,
  WalletOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
} from "@ant-design/icons";

const { Content } = Layout;
const { Option } = Select;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const METODO_STYLES = {
  Efectivo: styles.metodoEfectivo,
  "Mercado Pago": styles.metodoMercadoPago,
  QR: styles.metodoQR,
  Tarjeta: styles.metodoTarjeta,
};

export default function GestionFinanciera() {
  const [transacciones, setTransacciones] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [filtroMetodo, setFiltroMetodo] = useState("Todos");

  const [formReserva, setFormReserva] = useState(null);
  const [formMetodo, setFormMetodo] = useState(null);
  const [formEstado, setFormEstado] = useState("Pendiente");
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = async () => {
    try {
      const [resTrans, resReservas] = await Promise.all([
        adminFetch(`${API_URL}/api/pagos`),
        adminFetch(`${API_URL}/api/reservas`),
      ]);
      setTransacciones((await resTrans.json()).map((t) => ({ ...t, key: t.idTransaccion })));
      setReservas(await resReservas.json());
    } catch {
      message.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const pagados = transacciones.filter((t) => t.EstadoPago === "Pagado");
    const pendientes = transacciones.filter((t) => t.EstadoPago === "Pendiente");
    const totalIngresos = pagados.reduce((s, t) => s + (parseFloat(t.Monto) || 0), 0);
    const totalPendiente = pendientes.reduce((s, t) => s + (parseFloat(t.Monto) || 0), 0);

    const hoy = dayjs().format("YYYY-MM-DD");
    const ingresosHoy = pagados
      .filter((t) => t.DiaReserva && dayjs(t.DiaReserva).format("YYYY-MM-DD") === hoy)
      .reduce((s, t) => s + (parseFloat(t.Monto) || 0), 0);

    return {
      totalIngresos,
      totalPendiente,
      ingresosHoy,
      totalTransacciones: transacciones.length,
      pendientes: pendientes.length,
    };
  }, [transacciones]);

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    return transacciones.filter((t) => {
      if (filtroEstado !== "Todos" && t.EstadoPago !== filtroEstado) return false;
      if (filtroMetodo !== "Todos" && t.MetodoPago !== filtroMetodo) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          t.reserva_nombre,
          t.cliente_dni,
          t.espacio_nombre,
          t.recurso_nombre,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [transacciones, filtroEstado, filtroMetodo, search]);

  /* ── Toggle estado ── */
  const toggleEstado = async (record) => {
    const nuevoEstado = record.EstadoPago === "Pagado" ? "Pendiente" : "Pagado";
    try {
      const res = await adminFetch(`${API_URL}/api/pagos/${record.idTransaccion}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ EstadoPago: nuevoEstado }),
      });
      if (!res.ok) throw new Error();
      setTransacciones((prev) =>
        prev.map((t) =>
          t.idTransaccion === record.idTransaccion ? { ...t, EstadoPago: nuevoEstado } : t
        )
      );
      message.success(nuevoEstado === "Pagado" ? "Pago confirmado" : "Marcado como pendiente");
    } catch {
      message.error("Error al actualizar estado");
    }
  };

  /* ── Register payment ── */
  const onRegistrar = async () => {
    if (!formReserva || !formMetodo) {
      message.warning("Completá reserva y método de pago");
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
          EstadoPago: formEstado,
        }),
      });
      if (!res.ok) throw new Error();
      message.success("Pago registrado");
      setFormReserva(null);
      setFormMetodo(null);
      setFormEstado("Pendiente");
      fetchAll();
    } catch {
      message.error("Error al registrar pago");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Metodos únicos for filter ── */
  const metodos = useMemo(
    () => [...new Set(transacciones.map((t) => t.MetodoPago).filter(Boolean))],
    [transacciones]
  );

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
          {r.recurso_nombre && (
            <div style={{ fontSize: 11, color: "#999" }}>{r.recurso_nombre}</div>
          )}
        </div>
      ),
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
      render: (v) => (
        <span className={`${styles.metodoBadge} ${METODO_STYLES[v] || styles.metodoOtro}`}>
          <CreditCardOutlined /> {v || "-"}
        </span>
      ),
    },
    {
      title: "Estado",
      dataIndex: "EstadoPago",
      key: "estado",
      render: (estado, record) => (
        <Popconfirm
          title={estado === "Pagado" ? "¿Revertir a pendiente?" : "¿Confirmar pago?"}
          onConfirm={() => toggleEstado(record)}
          okText="Sí"
          cancelText="No"
        >
          <button
            type="button"
            className={`${styles.badge} ${estado === "Pagado" ? styles.badgePagado : styles.badgePendiente}`}
          >
            {estado === "Pagado" ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
            {estado}
          </button>
        </Popconfirm>
      ),
    },
    {
      title: "",
      key: "action",
      width: 110,
      render: (_, record) =>
        record.EstadoPago === "Pendiente" ? (
          <Popconfirm
            title="¿Confirmar pago presencial?"
            onConfirm={() => toggleEstado(record)}
            okText="Confirmar"
            cancelText="Cancelar"
          >
            <button type="button" className={styles.confirmBtn}>
              <CheckCircleOutlined /> Cobrar
            </button>
          </Popconfirm>
        ) : (
          <Popconfirm
            title="¿Revertir a pendiente?"
            onConfirm={() => toggleEstado(record)}
            okText="Sí"
            cancelText="No"
          >
            <button type="button" className={styles.revertBtn}>
              <ClockCircleOutlined /> Revertir
            </button>
          </Popconfirm>
        ),
    },
  ];

  /* ── Render ── */
  if (loading) {
    return (
      <Layout className={styles.layout}>
        <Header isEmpleado={true} />
        <Content className={styles.content}>
          <div style={{ textAlign: "center", padding: "4rem" }}><Spin size="large" /></div>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className={styles.layout}>
      <Header isEmpleado={true} />
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
            label="Pendientes"
            value={stats.pendientes}
            sub={`$${stats.totalPendiente.toLocaleString("es-AR", { minimumFractionDigits: 2 })} por cobrar`}
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
                <Select
                  value={filtroEstado}
                  className={styles.filterSelect}
                  onChange={setFiltroEstado}
                >
                  <Option value="Todos">Todos los estados</Option>
                  <Option value="Pagado">Pagado</Option>
                  <Option value="Pendiente">Pendiente</Option>
                </Select>
                <Select
                  value={filtroMetodo}
                  className={styles.filterSelect}
                  onChange={setFiltroMetodo}
                >
                  <Option value="Todos">Todos los métodos</Option>
                  {metodos.map((m) => (
                    <Option key={m} value={m}>{m}</Option>
                  ))}
                </Select>
              </div>
            </div>

            <div className={styles.tableWrapper}>
              <Table
                columns={columns}
                dataSource={filtered}
                pagination={{ pageSize: 10, showSizeChanger: false, size: "small" }}
                className={styles.table}
                tableLayout="auto"
                size="middle"
              />
            </div>

            <div className={styles.tableFooter}>
              <span className={styles.tableInfo}>
                Mostrando {filtered.length} de {transacciones.length} transacciones
              </span>
            </div>
          </div>

          {/* Right panel */}
          <div className={styles.rightPanel}>
            {/* Register payment */}
            <div className={styles.formCard}>
              <h3 className={styles.formTitle}>Registrar Pago</h3>

              <div className={styles.formField}>
                <label className={styles.label}>Reserva</label>
                <Select
                  className={styles.select}
                  placeholder="Seleccionar reserva"
                  value={formReserva}
                  onChange={setFormReserva}
                  showSearch
                  filterOption={(input, option) =>
                    (option?.children || "").toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {reservas.map((r) => (
                    <Option key={r.idReserva} value={r.idReserva}>
                      {r.Nombre} — {r.espacio_nombre || "?"} ({r.DiaReserva ? dayjs(r.DiaReserva).format("DD/MM") : "?"})
                    </Option>
                  ))}
                </Select>
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>Método de pago</label>
                <Select
                  className={styles.select}
                  placeholder="Seleccionar método"
                  value={formMetodo}
                  onChange={setFormMetodo}
                >
                  <Option value="Efectivo">Efectivo</Option>
                  <Option value="Mercado Pago">Mercado Pago</Option>
                  <Option value="QR">QR</Option>
                  <Option value="Tarjeta">Tarjeta</Option>
                </Select>
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>Estado</label>
                <Radio.Group
                  value={formEstado}
                  onChange={(e) => setFormEstado(e.target.value)}
                  className={styles.radioGroup}
                >
                  <Radio value="Pagado">Pagado</Radio>
                  <Radio value="Pendiente">Pendiente</Radio>
                </Radio.Group>
              </div>

              <Button
                className={styles.btnRegistrar}
                onClick={onRegistrar}
                loading={submitting}
              >
                Registrar Pago
              </Button>
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
                <span className={styles.quickInfoLabel}>Pendientes por cobrar</span>
                <span className={styles.quickInfoValue} style={{ color: "#e67e22" }}>
                  ${stats.totalPendiente.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
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
                  {transacciones.filter((t) => t.MetodoPago === "Efectivo").length}
                </span>
              </div>
              <div className={styles.quickInfoRow}>
                <span className={styles.quickInfoLabel}>Pagos online</span>
                <span className={styles.quickInfoValue}>
                  {transacciones.filter((t) => t.MetodoPago === "Mercado Pago").length}
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
