import React, { useState, useEffect, useMemo } from "react";
import dayjs from "dayjs";
import Header from "../../components/header";
import AdminPageHeader from "../../components/AdminPageHeader.jsx";
import IngresosCreditosPanel from "../../components/admin/IngresosCreditosPanel.jsx";
import { adminFetch } from "../../utils/adminApi";
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
} from "antd";
import {
  SearchOutlined,
  DollarOutlined,
  SyncOutlined,
  WalletOutlined,
  CheckCircleOutlined,
  UndoOutlined,
  GlobalOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import { formatearPrecio, etiquetaCreditos } from "../../utils/creditosFormato.js";
import {
  useComprasCreditos,
  useResumenFinanciero,
  useRegistrarCompraPresencial,
  useAnularCompra,
  useBuscarClientes,
} from "../../hooks/useFinanzasCreditos.js";
import { usePaquetesCreditos } from "../../hooks/useCreditos.js";
import { getAdminToken } from "../../utils/adminApi";

const { Content } = Layout;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const METODO_STYLES = {
  Efectivo: styles.metodoEfectivo,
  "Mercado Pago": styles.metodoMercadoPago,
  QR: styles.metodoQR,
  Tarjeta: styles.metodoTarjeta,
  Transferencia: styles.metodoOtro,
};

/** Métodos que el staff puede cobrar en mostrador (Mercado Pago llega por la web). */
const METODOS_PRESENCIALES = ["Efectivo", "Transferencia", "QR", "Tarjeta"];

const COMPRA_ESTADO = {
  acreditada: { color: "green", label: "Acreditada" },
  pendiente: { color: "gold", label: "Pendiente" },
  rechazada: { color: "red", label: "Rechazada" },
  anulada: { color: "default", label: "Anulada" },
};


export default function GestionFinanciera() {
  const [tablePage, setTablePage] = useState(1);
  const pageSize = 10;
  const [resumen, setResumen] = useState(null);
  const [reservasPendientes, setReservasPendientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // La búsqueda pega contra el backend: se espera a que el usuario deje de tipear.
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [filtroEstado, setFiltroEstado] = useState(null);
  const [dateRange, setDateRange] = useState(null);

  // Venta presencial de un paquete.
  const [ventaCliente, setVentaCliente] = useState(null);
  const [ventaPaquete, setVentaPaquete] = useState(null);
  const [ventaMetodo, setVentaMetodo] = useState(null);
  const [ventaBusqueda, setVentaBusqueda] = useState("");
  const [ventaBusquedaAplicada, setVentaBusquedaAplicada] = useState("");

  const { data: resumenFin } = useResumenFinanciero();
  const puedeVerMontos = resumenFin?.puedeVerMontos === true;

  const { data: paquetesData } = usePaquetesCreditos(getAdminToken());
  const paquetes = paquetesData?.paquetes ?? [];

  const { data: comprasData, isFetching: cargandoCompras } = useComprasCreditos({
    limit: pageSize,
    offset: (tablePage - 1) * pageSize,
    q: busquedaAplicada || undefined,
    estado: filtroEstado || undefined,
    desde: dateRange?.[0]?.format("YYYY-MM-DD"),
    hasta: dateRange?.[1]?.format("YYYY-MM-DD"),
  });
  const compras = comprasData?.items ?? [];
  const comprasTotal = comprasData?.total ?? 0;

  const { data: clientesData, isFetching: buscandoClientes } =
    useBuscarClientes(ventaBusquedaAplicada);
  const clientesEncontrados = clientesData?.items ?? [];

  const registrarVenta = useRegistrarCompraPresencial();
  const anularCompraMut = useAnularCompra();


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
        const pairsMap = new Map();
        for (const x of sorted) {
          if (!x.recurso_nombre) continue;
          if (!pairsMap.has(x.recurso_nombre)) pairsMap.set(x.recurso_nombre, x.espacio_nombre || null);
        }
        const recursos_detalle = Array.from(pairsMap, ([recurso, espacio]) => ({ recurso, espacio }));
        out.push({
          ...first,
          key: `serie-pend-${r.idSerie}`,
          idReserva: Math.min(...sorted.map((x) => x.idReserva)),
          Monto: monto,
          recurso_nombre: recs.join(", "),
          recursos_detalle,
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
        const recursos_detalle = sorted
          .filter((x) => x.recurso_nombre)
          .map((x) => ({ recurso: x.recurso_nombre, espacio: x.espacio_nombre || null }));
        out.push({
          ...first,
          key: `grupo-pend-${r.idReservaGrupo}`,
          idReserva: r.idReservaGrupo,
          Monto: monto,
          recurso_nombre: sorted.map((x) => x.recurso_nombre).filter(Boolean).join(", "),
          recursos_detalle,
        });
        continue;
      }
      out.push({
        ...r,
        key: `pend-${r.idReserva}`,
        recursos_detalle: r.recurso_nombre
          ? [{ recurso: r.recurso_nombre, espacio: r.espacio_nombre || null }]
          : [],
      });
    }
    return out;
  }, [reservasPendientes]);

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

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setVentaBusquedaAplicada(ventaBusqueda.trim()), 300);
    return () => clearTimeout(id);
  }, [ventaBusqueda]);

  // Debounce de la búsqueda: cada cambio dispara una consulta al backend.
  useEffect(() => {
    const id = setTimeout(() => setBusquedaAplicada(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setTablePage(1);
  }, [busquedaAplicada, dateRange, filtroEstado]);

  /* ── Stats ──
   * Solo métricas operativas de reservas. El dinero del coworking se mide en
   * IngresosCreditosPanel a partir de las compras de paquetes: mezclar acá los
   * montos de reservas duplicaría el ingreso ya cobrado con el paquete.
   */
  const stats = useMemo(() => {
    const pendN = reservasPendientesVista.length;
    if (resumen) {
      return {
        totalTransacciones: resumen.totalTransacciones ?? 0,
        pendientesCobro: pendN,
        pagosPresencial: resumen.pagosPresencial ?? 0,
        pagosOnline: resumen.pagosOnline ?? 0,
      };
    }
    return {
      totalTransacciones: 0,
      pendientesCobro: pendN,
      pagosPresencial: 0,
      pagosOnline: 0,
    };
  }, [resumen, reservasPendientesVista.length]);

  const tableRangeStart = compras.length === 0 ? 0 : (tablePage - 1) * pageSize + 1;
  const tableRangeEnd = (tablePage - 1) * pageSize + compras.length;

  /* ── Revertir un cobro presencial: anula la compra y descuenta los créditos ── */
  const revertirCompra = async (id) => {
    try {
      await anularCompraMut.mutateAsync(id);
      message.success("Cobro revertido — se descontaron los créditos entregados");
    } catch (err) {
      message.error(err.message || "Error al revertir el cobro");
    }
  };

  /* ── Venta presencial de un paquete ── */
  const onRegistrarVenta = async () => {
    if (!ventaCliente || !ventaPaquete || !ventaMetodo) {
      message.warning("Elegí el usuario, el paquete y el método de pago");
      return;
    }
    try {
      const r = await registrarVenta.mutateAsync({
        clienteUsuarioId: ventaCliente,
        paqueteId: ventaPaquete,
        metodoPago: ventaMetodo,
      });
      message.success(`Compra registrada — el usuario quedó con ${r.saldoPosterior} créditos`);
      setVentaCliente(null);
      setVentaPaquete(null);
      setVentaMetodo(null);
    } catch (err) {
      message.error(err.message || "No se pudo registrar la compra");
    }
  };

  /* ── Columns ── */
  const columns = [
    {
      title: "Fecha",
      dataIndex: "acreditada_at",
      key: "fecha",
      render: (fecha, r) => {
        const d = dayjs(fecha || r.created_at);
        return (
          <div className={styles.celdaApilada}>
            <strong>{d.format("DD/MM/YYYY")}</strong>
            <span>{d.format("HH:mm")}</span>
          </div>
        );
      },
    },
    {
      title: "Usuario",
      dataIndex: "cliente_nombre",
      key: "usuario",
      render: (nombre, r) => (
        <div className={styles.celdaApilada}>
          <strong>{nombre || "Sin nombre"}</strong>
          <span>{r.cliente_dni ? `DNI ${r.cliente_dni}` : r.cliente_email}</span>
        </div>
      ),
    },
    {
      title: "Paquete",
      dataIndex: "paquete_nombre",
      key: "paquete",
      render: (nombre, r) => (
        <div className={styles.celdaApilada}>
          <strong>{nombre || "Paquete eliminado"}</strong>
          <span>{etiquetaCreditos(r.creditos)}</span>
        </div>
      ),
    },
    {
      title: "Método",
      key: "metodo",
      render: (_, r) => {
        if (r.origen === "presencial") {
          const metodo = r.metodo_pago || "Presencial";
          return (
            <span className={`${styles.metodoBadge} ${METODO_STYLES[metodo] || styles.metodoOtro}`}>
              <ShopOutlined /> {metodo}
            </span>
          );
        }
        return (
          <span className={`${styles.metodoBadge} ${styles.metodoMercadoPago}`}>
            <GlobalOutlined /> Mercado Pago
          </span>
        );
      },
    },
    {
      title: "Estado",
      dataIndex: "estado",
      key: "estado",
      render: (estado) => {
        const t = COMPRA_ESTADO[estado] ?? { color: "default", label: estado };
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    // El monto solo viaja al navegador si el backend habilitó puedeVerMontos.
    ...(puedeVerMontos
      ? [
          {
            title: "Monto",
            dataIndex: "precio",
            key: "monto",
            align: "right",
            render: (precio, r) => (
              <strong className={r.estado === "acreditada" ? styles.montoOk : styles.montoGris}>
                {formatearPrecio(precio)}
              </strong>
            ),
          },
        ]
      : []),
    {
      title: "",
      key: "action",
      width: 120,
      render: (_, r) => {
        // Una compra de Mercado Pago se reembolsa en la plataforma, no acá.
        if (r.origen !== "presencial" || r.estado !== "acreditada") return null;
        return (
          <Popconfirm
            title="Revertir este cobro?"
            description="Se anula la compra y se descuentan los créditos entregados al usuario."
            onConfirm={() => revertirCompra(r.id)}
            okText="Revertir"
            cancelText="Cancelar"
            okButtonProps={{ danger: true }}
          >
            <button type="button" className={styles.revertBtn}>
              <UndoOutlined /> Revertir
            </button>
          </Popconfirm>
        );
      },
    },
  ];

  /* ── Render ── */
  if (loading) {
    return (
      <Layout className={styles.layout}>
        <Header />
        <Content className={styles.content}>
          <AdminPageHeader
            eyebrow="Tesorería"
            icon={<DollarOutlined />}
            title="Gestión Financiera"
            description="Ingresos por venta de paquetes de créditos y cobros presenciales."
          />
          <div style={{ textAlign: "center", padding: "4rem" }}><Spin size="large" /></div>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className={styles.layout}>
      <Header />
      <Content className={styles.content}>
        <AdminPageHeader
          eyebrow="Tesorería"
          icon={<DollarOutlined />}
          title="Gestión Financiera"
          description="Ingresos por venta de paquetes de créditos y cobros presenciales."
        />

        {/* Ingresos reales: compras de paquetes de créditos */}
        <IngresosCreditosPanel />

        {/* Operación de reservas: no representa ingreso de dinero nuevo */}
        <h2 className={styles.seccionTitulo}>Cobros y transacciones de reservas</h2>
        <div className={styles.statsRow}>
          <StatCard
            icon={<WalletOutlined />}
            label="Pendientes de Cobro"
            value={stats.pendientesCobro}
            sub="reservas sin pago"
            color={{ bg: "var(--color-warning-soft)", icon: "var(--color-warning-text)" }}
          />
          <StatCard
            icon={<SyncOutlined />}
            label="Transacciones"
            value={stats.totalTransacciones}
            sub="registradas"
            color={{ bg: "var(--color-info-soft)", icon: "var(--color-info)" }}
          />
          <StatCard
            icon={<ShopOutlined />}
            label="Pagos presenciales"
            value={stats.pagosPresencial}
            sub="cobrados en el coworking"
            color={{ bg: "var(--color-neutral-100)", icon: "var(--color-text-secondary)" }}
          />
          <StatCard
            icon={<GlobalOutlined />}
            label="Pagos online"
            value={stats.pagosOnline}
            sub="cobrados por la web"
            color={{ bg: "var(--color-info-soft)", icon: "var(--color-info)" }}
          />
        </div>

        {/* Grilla principal */}
        <div className={styles.mainGrid}>
          {/* Tabla */}
          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h2 className={styles.tableTitle}>Compras de paquetes</h2>
              <div className={styles.tableControls}>
                <Input
                  placeholder="Buscar usuario, DNI, email, paquete..."
                  prefix={<SearchOutlined />}
                  className={styles.searchInput}
                  allowClear
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Select
                  className={styles.filterSelect}
                  placeholder="Todos los estados"
                  value={filtroEstado}
                  onChange={setFiltroEstado}
                  allowClear
                  options={Object.entries(COMPRA_ESTADO).map(([valor, t]) => ({
                    value: valor,
                    label: t.label,
                  }))}
                />
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
                dataSource={compras}
                rowKey="id"
                loading={cargandoCompras}
                pagination={{
                  current: tablePage,
                  pageSize,
                  total: comprasTotal,
                  showSizeChanger: false,
                  size: "small",
                  onChange: setTablePage,
                  responsive: true,
                }}
                className={styles.table}
                scroll={{ x: "max-content" }}
                size="middle"
              />
            </div>

            <div className={styles.tableFooter}>
              <span className={styles.tableInfo}>
                Mostrando {tableRangeStart}-{tableRangeEnd} de {comprasTotal} compras
              </span>
            </div>
          </div>

          {/* Panel derecho */}
          <div className={styles.rightPanel}>
            {/* Registrar pago */}
            <div className={styles.formCard}>
              <div className={styles.formTitleRow}>
                <h3 className={styles.formTitle}>Registrar Cobro</h3>
                <Tag color="green">Presencial</Tag>
              </div>

              <p className={styles.formHint}>
                Vendé un paquete cobrado en mostrador. Los créditos se acreditan al instante
                y la compra queda registrada como ingreso.
              </p>

              <div className={styles.formField}>
                <label className={styles.label}>Usuario</label>
                <Select
                  className={styles.select}
                  placeholder="Buscar por nombre, DNI o email..."
                  value={ventaCliente}
                  onChange={setVentaCliente}
                  showSearch
                  filterOption={false}
                  onSearch={setVentaBusqueda}
                  notFoundContent={
                    buscandoClientes
                      ? "Buscando..."
                      : ventaBusquedaAplicada.length < 2
                        ? "Escribí al menos 2 letras"
                        : "Sin resultados"
                  }
                  options={clientesEncontrados.map((c) => ({
                    value: c.id,
                    label: `${c.nombre || "Sin nombre"} · ${c.dni ? `DNI ${c.dni}` : c.email}`,
                  }))}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>Paquete</label>
                <Select
                  className={styles.select}
                  placeholder="Elegí el paquete"
                  value={ventaPaquete}
                  onChange={setVentaPaquete}
                  options={paquetes.map((p) => ({
                    value: p.id,
                    label: `${p.nombre} · ${etiquetaCreditos(p.creditos)} · ${formatearPrecio(p.precio)}`,
                  }))}
                  notFoundContent="No hay paquetes activos"
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>Método de pago</label>
                <Select
                  className={styles.select}
                  placeholder="Cómo pagó"
                  value={ventaMetodo}
                  onChange={setVentaMetodo}
                  options={METODOS_PRESENCIALES.map((m) => ({ value: m, label: m }))}
                />
              </div>

              <Button
                type="primary"
                block
                onClick={onRegistrarVenta}
                loading={registrarVenta.isPending}
                disabled={!ventaCliente || !ventaPaquete || !ventaMetodo}
                icon={<CheckCircleOutlined />}
              >
                Cobrar y Acreditar
              </Button>
            </div>

            {/* Info rápida */}
            <div className={styles.quickInfo}>
              <h4 className={styles.quickInfoTitle}>Operación de reservas</h4>
              <div className={styles.quickInfoRow}>
                <span className={styles.quickInfoLabel}>Reservas sin cobrar</span>
                <span className={styles.quickInfoValue} style={{ color: "#e67e22" }}>
                  {reservasPendientes.length}
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
