import "../../styles/global.css";
import styles from "../../styles/admin/altas.module.css";
import Header from "../../components/header";
import AdminPageHeader from "../../components/AdminPageHeader.jsx";
import React, { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Layout, Card, Button, Input, Table, Tag, message, Spin, Empty, Badge, Tooltip, Popconfirm, Modal, Radio, InputNumber } from "antd";
import {
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  PlayCircleOutlined,
  StopOutlined,
  FieldTimeOutlined,
} from "@ant-design/icons";
import { adminFetch } from "../../utils/adminApi";
import { validarRecepcionNoAnticipadaLocal } from "../../utils/coworkingHours.js";
import { notifyReservasChanged } from "../../utils/boweSync.js";
import {
  RESERVA_ESTADO_LABEL,
  RESERVA_ESTADO_COLOR,
  estadoReservaEfectivo,
} from "../../utils/reservaEstados.js";

const { Content } = Layout;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const COWORKING_CIERRE = "21:00";
const EXTENSIONES_PRESET = [
  { label: "30 min", value: 30 },
  { label: "1 h", value: 60 },
  { label: "1 h 30", value: 90 },
  { label: "2 h", value: 120 },
  { label: "Otro", value: -1 },
];

const hhmmAMin = (hhmm) => {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : NaN;
};
const minAHhmm = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const fraccionesDe = (min) => (min > 0 ? Math.ceil(min / 30) : 0);

function mensajeRecepcionAnticipada(r) {
  const tipo = r.TipoReserva || "turno";
  if (tipo !== "turno" || !r.HorarioReserva) return null;
  const dia = dayjs(r.DiaReserva).format("YYYY-MM-DD");
  return validarRecepcionNoAnticipadaLocal(dia, String(r.HorarioReserva).slice(0, 5));
}

export default function AltaClientes() {
  const queryClient = useQueryClient();
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [procesando, setProcesando] = useState(null);
  const [, setTick] = useState(0);

  // Modal de extensión de reserva en curso.
  const [extendTarget, setExtendTarget] = useState(null);
  const [extendPreset, setExtendPreset] = useState(30);
  const [extendCustom, setExtendCustom] = useState(45);
  const [extendSubmitting, setExtendSubmitting] = useState(false);

  const hoy = dayjs().format("YYYY-MM-DD");

  // Tick local cada 30s para que las reservas en_curso pasen visualmente a
  // "Asistió / Finalizada" cuando cruzan HorarioFin, aún antes de que el sweep
  // del backend persista el cambio.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const obtenerReservas = async () => {
    try {
      const params = new URLSearchParams({
        afectaDia: dayjs().format("YYYY-MM-DD"),
        limit: "500",
        offset: "0",
      });
      const res = await adminFetch(`${API_URL}/api/reservas?${params}`);
      const data = await res.json();
      const items = data.items ?? data;
      setReservas(Array.isArray(items) ? items : []);
    } catch {
      message.error("Error al cargar reservas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    obtenerReservas();
  }, []);

  const pendientes = useMemo(() => {
    return reservas
      .filter((r) => {
        const dia = r.DiaReserva ? dayjs(r.DiaReserva).format("YYYY-MM-DD") : null;
        const estado = r.Estado || "activa";
        return dia === hoy && estado === "activa";
      })
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (r.Nombre || "").toLowerCase().includes(q) ||
          (r.DNI || "").includes(q) ||
          (r.espacio_nombre || "").toLowerCase().includes(q)
        );
      });
  }, [reservas, hoy, search]);

  const procesadas = useMemo(() => {
    return reservas.filter((r) => {
      const dia = r.DiaReserva ? dayjs(r.DiaReserva).format("YYYY-MM-DD") : null;
      const estado = r.Estado || "activa";
      return dia === hoy && (estado === "en_curso" || estado === "completada" || estado === "no_asistio");
    });
  }, [reservas, hoy]);

  const marcarEstado = async (idReserva, estado, esFinalizacionManual = false) => {
    setProcesando(idReserva);
    try {
      const res = await adminFetch(`${API_URL}/api/reservas/${idReserva}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado, esFinalizacionManual }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Error al actualizar estado");
      }

      // El backend devuelve el estado que realmente guardó.
      const estadoPersistido = data.estado || estado;

      setReservas((prev) =>
        prev.map((r) => r.idReserva === idReserva ? { ...r, Estado: estadoPersistido } : r)
      );
      void obtenerReservas();
      queryClient.invalidateQueries({ queryKey: ["staff-reservas"] });
      notifyReservasChanged();

      if (estado === "no_asistio") {
        message.success("No asistencia registrada");
      } else if (esFinalizacionManual || estadoPersistido === "completada") {
        message.success("Turno finalizado");
      } else if (estadoPersistido === "en_curso") {
        message.success("Cliente recepcionado — turno en curso");
      } else {
        message.success("Asistencia registrada");
      }
    } catch (e) {
      message.error(e.message || "Error al actualizar estado");
    } finally {
      setProcesando(null);
    }
  };

  const minutosExtension = extendPreset === -1 ? Number(extendCustom) || 0 : extendPreset;

  // Próxima reserva del mismo recurso ese día (límite superior de la extensión).
  const proximoInicioMin = useMemo(() => {
    if (!extendTarget) return null;
    const dia = extendTarget.DiaReserva ? dayjs(extendTarget.DiaReserva).format("YYYY-MM-DD") : null;
    const finActual = hhmmAMin(extendTarget.HorarioFin);
    let limite = Infinity;
    for (const r of reservas) {
      if (r.idReserva === extendTarget.idReserva) continue;
      if ((r.TipoReserva || "turno") !== "turno") continue;
      if ((r.Estado || "activa") === "cancelada") continue;
      if (r.idRecurso !== extendTarget.idRecurso) continue;
      const rdia = r.DiaReserva ? dayjs(r.DiaReserva).format("YYYY-MM-DD") : null;
      if (rdia !== dia) continue;
      const ini = hhmmAMin(r.HorarioReserva);
      if (!Number.isNaN(ini) && ini >= finActual && ini < limite) limite = ini;
    }
    return limite === Infinity ? null : limite;
  }, [extendTarget, reservas]);

  const extPreview = useMemo(() => {
    if (!extendTarget) return null;
    const precioHora = parseFloat(extendTarget.recurso_precio_hora) || 0;
    const finActualMin = hhmmAMin(extendTarget.HorarioFin);
    // El cobro se factura sobre el total extendido respecto del fin ORIGINAL.
    const finOriginalMin = hhmmAMin(extendTarget.HorarioFinOriginal || extendTarget.HorarioFin);
    const nuevoFinMin = finActualMin + minutosExtension;
    const totalMin = nuevoFinMin - finOriginalMin;
    const fracciones = fraccionesDe(totalMin);
    const monto = precioHora > 0 ? (precioHora / 2) * fracciones : 0;
    const nuevoFin = minutosExtension > 0 ? minAHhmm(nuevoFinMin) : extendTarget.HorarioFin;
    const cierreMin = hhmmAMin(COWORKING_CIERRE);
    let error = null;
    if (minutosExtension <= 0) error = "Indicá los minutos de extensión.";
    else if (nuevoFinMin > cierreMin) error = `La extensión supera el cierre (${COWORKING_CIERRE}).`;
    else if (proximoInicioMin != null && nuevoFinMin > proximoInicioMin)
      error = `Hay otra reserva a las ${minAHhmm(proximoInicioMin)}. Máximo hasta ese horario.`;
    return { precioHora, fracciones, monto, nuevoFin, error };
  }, [extendTarget, minutosExtension, proximoInicioMin]);

  const abrirExtender = (r) => {
    setExtendTarget(r);
    setExtendPreset(30);
    setExtendCustom(45);
  };

  const confirmarExtension = async () => {
    if (!extendTarget || !extPreview) return;
    if (extPreview.error) {
      message.warning(extPreview.error);
      return;
    }
    setExtendSubmitting(true);
    try {
      const res = await adminFetch(`${API_URL}/api/reservas/${extendTarget.idReserva}/extender`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutos: minutosExtension }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "No se pudo extender la reserva");
      const ext = data.extension || {};
      message.success(
        `Reserva extendida hasta ${ext.horarioFinActual} — cargo pendiente de $${Number(
          ext.monto || 0
        ).toLocaleString("es-AR", { minimumFractionDigits: 2 })} (se cobra en Gestión Financiera)`
      );
      setExtendTarget(null);
      void obtenerReservas();
      queryClient.invalidateQueries({ queryKey: ["staff-reservas"] });
      notifyReservasChanged();
    } catch (e) {
      message.error(e.message || "Error al extender la reserva");
    } finally {
      setExtendSubmitting(false);
    }
  };

  const pendienteCols = [
    {
      title: "Cliente",
      key: "cliente",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
            <UserOutlined style={{ marginRight: 6 }} />
            {r.Nombre || `${r.cliente_nombre || ""} ${r.cliente_apellido || ""}`}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>DNI: {r.DNI || "-"}</div>
        </div>
      ),
    },
    {
      title: "Recurso",
      key: "espacio",
      render: (_, r) => {
        const recurso = r.recurso_nombre || "-";
        const espacio = r.espacio_nombre || "-";
        return (
          <Tooltip title={espacio !== "-" ? espacio : null} placement="top">
            <span className={styles.recursoCell}>{recurso}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "Horario",
      key: "horario",
      render: (_, r) => (
        <span>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {r.HorarioReserva || "Todo el dia"}
          {r.HorarioFin ? ` - ${r.HorarioFin}` : ""}
        </span>
      ),
    },
    {
      title: "Acciones",
      key: "acciones",
      width: 220,
      render: (_, r) => {
        const bloqueo = mensajeRecepcionAnticipada(r);
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Tooltip title={bloqueo || undefined}>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={procesando === r.idReserva}
                disabled={Boolean(bloqueo)}
                onClick={() => marcarEstado(r.idReserva, "completada")}
              >
                Asistió
              </Button>
            </Tooltip>
            <Tooltip title={bloqueo || undefined}>
              <Button
                danger
                icon={<CloseCircleOutlined />}
                loading={procesando === r.idReserva}
                disabled={Boolean(bloqueo)}
                onClick={() => marcarEstado(r.idReserva, "no_asistio")}
              >
                No asistió
              </Button>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  const procesadaCols = [
    {
      title: "Cliente",
      key: "cliente",
      render: (_, r) => (
        <span style={{ fontWeight: 500 }}>
          {r.Nombre || `${r.cliente_nombre || ""} ${r.cliente_apellido || ""}`}
        </span>
      ),
    },
    { title: "DNI", dataIndex: "DNI", key: "dni" },
    {
      title: "Recurso",
      key: "espacio",
      render: (_, r) => {
        const recurso = r.recurso_nombre || "-";
        const espacio = r.espacio_nombre || "-";
        return (
          <Tooltip title={espacio !== "-" ? espacio : null} placement="top">
            <span className={styles.recursoCell}>{recurso}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "Horario",
      key: "horario",
      render: (_, r) =>
        r.HorarioReserva
          ? `${r.HorarioReserva}${r.HorarioFin ? ` - ${r.HorarioFin}` : ""}`
          : "Todo el dia",
    },
    {
      title: "Estado del turno",
      key: "estado",
      render: (_, r) => {
        const ef = estadoReservaEfectivo(r);
        const icon =
          ef === "en_curso" ? <PlayCircleOutlined />
          : ef === "completada" ? <CheckCircleOutlined />
          : <CloseCircleOutlined />;
        const extC = r.extensionesCount || 0;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
            <Tag color={RESERVA_ESTADO_COLOR[ef] || "default"} icon={icon}>
              {RESERVA_ESTADO_LABEL[ef] || r.Estado}
            </Tag>
            {extC > 0 && (
              <Tooltip
                title={`Fin original ${r.HorarioFinOriginal || "-"} → actual ${r.HorarioFin || "-"} · ${extC} extensión(es), +${r.extensionesMinutos || 0} min · ${
                  r.extensionPendiente
                    ? `cargo pendiente $${Number(r.extensionMonto || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                    : "cargo cobrado"
                }`}
              >
                <Tag
                  color={r.extensionPendiente ? "orange" : "gold"}
                  icon={<FieldTimeOutlined />}
                  style={{ margin: 0 }}
                >
                  Extendida +{r.extensionesMinutos || 0}m{r.extensionPendiente ? " · pago pendiente" : ""}
                </Tag>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: "Acciones",
      key: "acciones",
      width: 230,
      render: (_, r) => {
        const ef = estadoReservaEfectivo(r);
        if (ef !== "en_curso") return null;
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              type="primary"
              ghost
              size="small"
              icon={<FieldTimeOutlined />}
              onClick={() => abrirExtender(r)}
            >
              Extender
            </Button>
            <Popconfirm
              title="¿Finalizar este turno?"
              description="La reserva pasará a 'Asistió' ahora mismo."
              onConfirm={() => marcarEstado(r.idReserva, "completada", true)}
              okText="Finalizar"
              cancelText="Cancelar"
              okButtonProps={{ danger: false }}
            >
              <Button
                danger
                size="small"
                icon={<StopOutlined />}
                loading={procesando === r.idReserva}
              >
                Finalizar
              </Button>
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  if (loading) {
    return (
      <Layout className={styles.layout}>
        <Header />
        <Content className={styles.contentWrap}>
          <AdminPageHeader
            eyebrow="Recepción del día"
            icon={<CalendarOutlined />}
            title="Control de Asistencia"
            description="Recepcioná clientes y controlá reservas en curso."
            meta={<span style={{ textTransform: "capitalize" }}>{dayjs().format("dddd DD/MM/YYYY")}</span>}
          />
          <div style={{ textAlign: "center", padding: "4rem" }}><Spin size="large" /></div>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className={styles.layout}>
      <Header />
      <Content className={styles.contentWrap}>
        <AdminPageHeader
          eyebrow="Recepción del día"
          icon={<CalendarOutlined />}
          title="Control de Asistencia"
          description="Recepcioná clientes y controlá reservas en curso."
          meta={<span style={{ textTransform: "capitalize" }}>{dayjs().format("dddd DD/MM/YYYY")}</span>}
        />

        <div className={styles.counters}>
          <Badge count={pendientes.length} showZero overflowCount={99}>
            <Card size="small" className={styles.counterCard}>
              <ClockCircleOutlined style={{ color: "var(--color-warning)", fontSize: 20 }} />
              <span>Por recepcionar</span>
            </Card>
          </Badge>
          <Badge count={procesadas.length} showZero overflowCount={99} color="#34c08f">
            <Card size="small" className={styles.counterCard}>
              <CheckCircleOutlined style={{ color: "var(--color-brand-primary)", fontSize: 20 }} />
              <span>Recepcionadas</span>
            </Card>
          </Badge>
        </div>

        <Card bordered={false} className={styles.mainCard}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Reservas confirmadas de hoy</h2>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Buscar por nombre, DNI..."
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 300 }}
            />
          </div>

          {pendientes.length === 0 ? (
            <Empty description="No hay reservas por recepcionar hoy" />
          ) : (
            <Table
              columns={pendienteCols}
              dataSource={pendientes.map((r) => ({ ...r, key: r.idReserva }))}
              pagination={false}
              size="middle"
            />
          )}
        </Card>

        {procesadas.length > 0 && (
          <Card bordered={false} className={styles.mainCard} style={{ marginTop: 24 }}>
            <h2 className={styles.sectionTitle}>Recepcionadas hoy</h2>
            <Table
              columns={procesadaCols}
              dataSource={procesadas.map((r) => ({ ...r, key: r.idReserva }))}
              pagination={false}
              size="middle"
            />
          </Card>
        )}

        <Modal
          title={
            <span>
              <FieldTimeOutlined style={{ marginRight: 8, color: "var(--color-brand-primary)" }} />
              Extender reserva
            </span>
          }
          open={Boolean(extendTarget)}
          onCancel={() => (extendSubmitting ? null : setExtendTarget(null))}
          onOk={confirmarExtension}
          okText="Extender (cargo pendiente)"
          cancelText="Cancelar"
          confirmLoading={extendSubmitting}
          okButtonProps={{ disabled: Boolean(extPreview?.error) }}
          destroyOnClose
        >
          {extendTarget && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                <div><strong>{extendTarget.Nombre || "-"}</strong> · {extendTarget.recurso_nombre || "-"}</div>
                <div>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  Horario actual: {extendTarget.HorarioReserva} - {extendTarget.HorarioFin}
                  {proximoInicioMin != null && (
                    <span style={{ marginLeft: 8, color: "var(--color-warning-text, #b26a00)" }}>
                      (próxima reserva {minAHhmm(proximoInicioMin)})
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Tiempo adicional</div>
                <Radio.Group
                  value={extendPreset}
                  onChange={(e) => setExtendPreset(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                >
                  {EXTENSIONES_PRESET.map((o) => (
                    <Radio.Button key={o.value} value={o.value}>{o.label}</Radio.Button>
                  ))}
                </Radio.Group>
                {extendPreset === -1 && (
                  <div style={{ marginTop: 12 }}>
                    <InputNumber
                      min={5}
                      max={720}
                      step={5}
                      value={extendCustom}
                      onChange={(v) => setExtendCustom(v)}
                      addonAfter="min"
                      style={{ width: 160 }}
                    />
                  </div>
                )}
              </div>

              {extPreview && (
                <div
                  style={{
                    background: "var(--color-surface-2)",
                    borderRadius: 8,
                    padding: "12px 14px",
                    fontSize: 13,
                  }}
                >
                  <Fila label="Nuevo horario de fin" value={extPreview.error ? "—" : extPreview.nuevoFin} />
                  <Fila label="Fracciones de 30 min" value={extPreview.fracciones} />
                  <Fila
                    label="Importe estimado"
                    value={`$${Number(extPreview.monto).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
                    strong
                  />
                  <div style={{ color: "var(--color-text-tertiary)", marginTop: 8, fontSize: 12 }}>
                    El cargo queda <strong>pendiente de pago</strong> y se registra en Gestión Financiera.
                    Si el cliente se retira antes, al finalizar el turno se recalcula por el tiempo realmente usado.
                  </div>
                  {extPreview.precioHora <= 0 && (
                    <div style={{ color: "var(--color-warning-text, #b26a00)", marginTop: 6 }}>
                      El recurso no tiene precio por hora cargado; el importe será $0.
                    </div>
                  )}
                  {extPreview.error && (
                    <div style={{ color: "var(--color-danger, #cf1322)", marginTop: 6 }}>
                      <CloseCircleOutlined style={{ marginRight: 4 }} />
                      {extPreview.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Modal>
      </Content>
    </Layout>
  );
}

function Fila({ label, value, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span style={{ color: "var(--color-text-tertiary)" }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
