import "../../styles/global.css";
import styles from "../../styles/admin/altas.module.css";
import Header from "../../components/header";
import AdminPageHeader from "../../components/AdminPageHeader.jsx";
import React, { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Button, Input, Tag, message, Spin, Tooltip, Popconfirm, Modal, Radio, InputNumber } from "antd";
import {
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
  FieldTimeOutlined,
  InfoCircleOutlined,
  EnvironmentOutlined,
  CoffeeOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import CoinIcon from "../../components/CoinIcon.jsx";
import { adminFetch } from "../../utils/adminApi";
import { validarRecepcionNoAnticipadaLocal } from "../../utils/coworkingHours.js";
import { notifyReservasChanged } from "../../utils/boweSync.js";
import {
  RESERVA_ESTADO_LABEL,
  RESERVA_ESTADO_COLOR,
  estadoReservaEfectivo,
} from "../../utils/reservaEstados.js";

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

// Los precios de los recursos se cargan en pesos y se cobran en créditos.
// Redondeo hacia arriba, igual que creditosParaMonto() en el backend: la
// previsualización nunca debe mostrar menos de lo que se va a descontar.
const creditosDeMonto = (monto, pesosPorCredito) => {
  const tasa = Number(pesosPorCredito) > 0 ? Number(pesosPorCredito) : 1;
  const m = Number(monto);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.ceil(m / tasa);
};

// Los horarios llegan como "HH:mm:ss"; en las tarjetas alcanza con "HH:mm".
const soloHora = (hhmm) => (hhmm ? String(hhmm).slice(0, 5) : null);

function mensajeRecepcionAnticipada(r) {
  const tipo = r.TipoReserva || "turno";
  if (tipo !== "turno" || !r.HorarioReserva) return null;
  const dia = dayjs(r.DiaReserva).format("YYYY-MM-DD");
  return validarRecepcionNoAnticipadaLocal(dia, String(r.HorarioReserva).slice(0, 5));
}

const nombreCliente = (r) =>
  r.Nombre || `${r.cliente_nombre || ""} ${r.cliente_apellido || ""}`.trim() || "Sin nombre";

export default function AltaClientes() {
  const queryClient = useQueryClient();
  const [reservas, setReservas] = useState([]);
  const [pesosPorCredito, setPesosPorCredito] = useState(null);
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
      if (Number(data.pesosPorCredito) > 0) setPesosPorCredito(Number(data.pesosPorCredito));
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

    // El cargo se cobra en créditos: misma regla que el backend
    // (ceil(monto / pesos_por_credito)). Lo ya descontado en extensiones
    // previas se resta, porque el cobro es incremental.
    const creditosTotales = creditosDeMonto(monto, pesosPorCredito);
    const yaDescontados = extendTarget.extensionCreditos || 0;
    const creditos = Math.max(0, creditosTotales - yaDescontados);

    const nuevoFin = minutosExtension > 0 ? minAHhmm(nuevoFinMin) : extendTarget.HorarioFin;
    const cierreMin = hhmmAMin(COWORKING_CIERRE);
    let error = null;
    if (minutosExtension <= 0) error = "Indicá los minutos de extensión.";
    else if (nuevoFinMin > cierreMin) error = `La extensión supera el cierre (${COWORKING_CIERRE}).`;
    else if (proximoInicioMin != null && nuevoFinMin > proximoInicioMin)
      error = `Hay otra reserva a las ${minAHhmm(proximoInicioMin)}. Máximo hasta ese horario.`;
    return { precioHora, fracciones, creditos, nuevoFin, error };
  }, [extendTarget, minutosExtension, proximoInicioMin, pesosPorCredito]);

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
      const descontados = data.creditos?.descontados ?? ext.creditos ?? 0;
      message.success(
        `Reserva extendida hasta ${ext.horarioFinActual} — se descontaron ${descontados} crédito(s) del titular`
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

  const pageHeader = (
    <AdminPageHeader
      eyebrow="Recepción del día"
      icon={<CalendarOutlined />}
      title="Control de Asistencia"
      description="Recepcioná clientes y controlá reservas en curso."
      meta={<span style={{ textTransform: "capitalize" }}>{dayjs().format("dddd DD/MM/YYYY")}</span>}
    />
  );

  if (loading) {
    return (
      <div className={styles.layout}>
        <Header />
        <div className={styles.contentWrap}>
          {pageHeader}
          <div className={styles.loadingWrap}><Spin size="large" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.contentWrap}>
        {pageHeader}

        <div className={styles.toolbar}>
          <div className={styles.counters}>
            <Contador
              icon={<ClockCircleOutlined />}
              value={pendientes.length}
              label="Por recepcionar"
              soft="var(--color-warning-soft)"
              strong="var(--color-warning-text)"
            />
            <Contador
              icon={<CheckCircleOutlined />}
              value={procesadas.length}
              label="Recepcionadas"
              soft="var(--color-brand-primary-soft)"
              strong="var(--color-brand-primary-text)"
            />
          </div>

          <Input
            className={styles.searchBox}
            prefix={<SearchOutlined style={{ color: "var(--color-text-tertiary)" }} />}
            placeholder="Buscar por nombre, DNI o espacio…"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.board}>
          <Columna
            titulo="Por recepcionar"
            accent="var(--color-warning)"
            count={pendientes.length}
            vacio={{
              icon: <CoffeeOutlined />,
              texto: search
                ? "Ninguna reserva coincide con la búsqueda."
                : "No hay reservas por recepcionar hoy.",
            }}
          >
            {pendientes.map((r) => (
              <TarjetaPendiente
                key={r.idReserva}
                reserva={r}
                procesando={procesando === r.idReserva}
                onMarcar={marcarEstado}
              />
            ))}
          </Columna>

          <Columna
            titulo="Recepcionadas hoy"
            accent="var(--color-brand-primary)"
            count={procesadas.length}
            vacio={{
              icon: <TeamOutlined />,
              texto: "Todavía no recepcionaste a nadie hoy.",
            }}
          >
            {procesadas.map((r) => (
              <TarjetaProcesada
                key={r.idReserva}
                reserva={r}
                procesando={procesando === r.idReserva}
                onMarcar={marcarEstado}
                onExtender={abrirExtender}
              />
            ))}
          </Columna>
        </div>

        <Modal
          title={
            <span className={styles.modalTitle}>
              <FieldTimeOutlined style={{ color: "var(--color-brand-primary)" }} />
              Extender reserva
            </span>
          }
          open={Boolean(extendTarget)}
          onCancel={() => (extendSubmitting ? null : setExtendTarget(null))}
          onOk={confirmarExtension}
          okText={
            extPreview && !extPreview.error
              ? `Extender · ${extPreview.creditos} créditos`
              : "Extender"
          }
          cancelText="Cancelar"
          confirmLoading={extendSubmitting}
          okButtonProps={{ disabled: Boolean(extPreview?.error) }}
          width={480}
          destroyOnClose
        >
          {extendTarget && (
            <div className={styles.modalBody}>
              <div className={styles.modalTarget}>
                <span className={styles.modalTargetName}>{nombreCliente(extendTarget)}</span>
                <span className={styles.modalTargetMeta}>
                  <span className={styles.recursoCell}>
                    <EnvironmentOutlined />
                    {extendTarget.recurso_nombre || "-"}
                  </span>
                  <span>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {soloHora(extendTarget.HorarioReserva)} – {soloHora(extendTarget.HorarioFin)}
                  </span>
                  {proximoInicioMin != null && (
                    <span className={styles.modalNextHint}>
                      próxima reserva {minAHhmm(proximoInicioMin)}
                    </span>
                  )}
                </span>
              </div>

              <div>
                <span className={styles.fieldLabel}>Tiempo adicional</span>
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
                <div className={styles.preview}>
                  <Fila label="Nuevo horario de fin" value={extPreview.error ? "—" : soloHora(extPreview.nuevoFin)} />
                  <Fila label="Fracciones de 30 min" value={extPreview.fracciones} />
                  <Fila
                    label="Costo de la extensión"
                    value={
                      <span className={styles.creditosValor}>
                        <CoinIcon size={16} />
                        {extPreview.creditos} créditos
                      </span>
                    }
                    strong
                  />
                  <p className={styles.previewNote}>
                    Se descuentan de los <strong>créditos del titular</strong> al confirmar.
                    Si el cliente se retira antes, al finalizar el turno se recalcula por el tiempo
                    realmente usado y se le reintegra la diferencia.
                  </p>
                  {extPreview.precioHora <= 0 && (
                    <div className={styles.previewWarning}>
                      <InfoCircleOutlined />
                      <span>El recurso no tiene precio cargado; la extensión costará 0 créditos.</span>
                    </div>
                  )}
                  {extPreview.error && (
                    <div className={styles.previewError}>
                      <CloseCircleOutlined />
                      <span>{extPreview.error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}

/* ── Piezas de presentación ─────────────────────────────── */

function Contador({ icon, value, label, soft, strong }) {
  return (
    <div
      className={styles.counterCard}
      style={{ "--counter-soft": soft, "--counter-strong": strong }}
    >
      <span className={styles.counterIcon}>{icon}</span>
      <span className={styles.counterBody}>
        <span className={styles.counterValue}>{value}</span>
        <span className={styles.counterLabel}>{label}</span>
      </span>
    </div>
  );
}

function Columna({ titulo, accent, count, vacio, children }) {
  const vacia = React.Children.count(children) === 0;
  return (
    <section className={styles.column} style={{ "--column-accent": accent }}>
      <header className={styles.columnHeader}>
        <span className={styles.columnDot} />
        <h2 className={styles.columnTitle}>{titulo}</h2>
        <span className={styles.columnCount}>{count}</span>
      </header>
      <div className={styles.columnBody}>
        {vacia ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>{vacio.icon}</span>
            <p className={styles.emptyText}>{vacio.texto}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

// Franja horaria a la izquierda de cada tarjeta.
function TimeRail({ reserva }) {
  const inicio = soloHora(reserva.HorarioReserva);
  if (!inicio) {
    return (
      <div className={styles.timeRail}>
        <span className={styles.timeAllDay}>Todo el día</span>
      </div>
    );
  }
  const fin = soloHora(reserva.HorarioFin);
  return (
    <div className={styles.timeRail}>
      <span className={styles.timeStart}>{inicio}</span>
      {fin && <span className={styles.timeEnd}>{fin}</span>}
    </div>
  );
}

function RecursoChip({ reserva }) {
  const recurso = reserva.recurso_nombre || "-";
  const espacio = reserva.espacio_nombre || "-";
  return (
    <Tooltip title={espacio !== "-" ? espacio : null} placement="top">
      <span className={styles.recursoCell}>
        <EnvironmentOutlined />
        {recurso}
      </span>
    </Tooltip>
  );
}

function TarjetaPendiente({ reserva, procesando, onMarcar }) {
  const bloqueo = mensajeRecepcionAnticipada(reserva);
  return (
    <article
      className={`${styles.reservaCard} ${bloqueo ? styles.blocked : ""}`}
      style={{ "--card-accent": "var(--color-warning)" }}
    >
      <TimeRail reserva={reserva} />
      <div className={styles.cardMain}>
        <div className={styles.cardTop}>
          <div className={styles.cardIdentity}>
            <span className={styles.clienteNombre}>{nombreCliente(reserva)}</span>
            <span className={styles.clienteDni}>DNI {reserva.DNI || "-"}</span>
          </div>
          <div className={styles.cardTags}>
            <RecursoChip reserva={reserva} />
          </div>
        </div>

        {bloqueo && (
          <div className={styles.blockedNote}>
            <InfoCircleOutlined />
            <span>{bloqueo}</span>
          </div>
        )}

        <div className={styles.cardActions}>
          <Tooltip title={bloqueo || undefined}>
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              loading={procesando}
              disabled={Boolean(bloqueo)}
              onClick={() => onMarcar(reserva.idReserva, "completada")}
            >
              Asistió
            </Button>
          </Tooltip>
          <Tooltip title={bloqueo || undefined}>
            <Button
              danger
              size="small"
              icon={<CloseCircleOutlined />}
              loading={procesando}
              disabled={Boolean(bloqueo)}
              onClick={() => onMarcar(reserva.idReserva, "no_asistio")}
            >
              No asistió
            </Button>
          </Tooltip>
        </div>
      </div>
    </article>
  );
}

function TarjetaProcesada({ reserva, procesando, onMarcar, onExtender }) {
  const ef = estadoReservaEfectivo(reserva);
  const icon =
    ef === "en_curso" ? <PlayCircleOutlined />
    : ef === "completada" ? <CheckCircleOutlined />
    : <CloseCircleOutlined />;
  const extC = reserva.extensionesCount || 0;
  const accent =
    ef === "en_curso" ? "var(--color-info)"
    : ef === "completada" ? "var(--color-brand-primary)"
    : "var(--color-danger)";

  return (
    <article className={styles.reservaCard} style={{ "--card-accent": accent }}>
      <TimeRail reserva={reserva} />
      <div className={styles.cardMain}>
        <div className={styles.cardTop}>
          <div className={styles.cardIdentity}>
            <span className={styles.clienteNombre}>{nombreCliente(reserva)}</span>
            <span className={styles.clienteDni}>DNI {reserva.DNI || "-"}</span>
          </div>
          <div className={styles.cardTags}>
            <Tag color={RESERVA_ESTADO_COLOR[ef] || "default"} icon={icon} style={{ margin: 0 }}>
              {RESERVA_ESTADO_LABEL[ef] || reserva.Estado}
            </Tag>
          </div>
        </div>

        <div className={styles.cardTop}>
          <RecursoChip reserva={reserva} />
          {extC > 0 && (
            <Tooltip
              title={`Fin original ${soloHora(reserva.HorarioFinOriginal) || "-"} → actual ${soloHora(reserva.HorarioFin) || "-"} · ${extC} extensión(es), +${reserva.extensionesMinutos || 0} min · ${reserva.extensionCreditos || 0} crédito(s) descontados`}
            >
              <Tag color="gold" icon={<FieldTimeOutlined />} style={{ margin: 0 }}>
                +{reserva.extensionesMinutos || 0}m · {reserva.extensionCreditos || 0} cr
              </Tag>
            </Tooltip>
          )}
        </div>

        {ef === "en_curso" && (
          <div className={styles.cardActions}>
            <Button
              type="primary"
              ghost
              size="small"
              icon={<FieldTimeOutlined />}
              onClick={() => onExtender(reserva)}
            >
              Extender
            </Button>
            <Popconfirm
              title="¿Finalizar este turno?"
              description="La reserva pasará a 'Asistió' ahora mismo."
              onConfirm={() => onMarcar(reserva.idReserva, "completada", true)}
              okText="Finalizar"
              cancelText="Cancelar"
              okButtonProps={{ danger: false }}
            >
              <Button
                danger
                size="small"
                icon={<StopOutlined />}
                loading={procesando}
              >
                Finalizar
              </Button>
            </Popconfirm>
          </div>
        )}
      </div>
    </article>
  );
}

function Fila({ label, value, strong }) {
  return (
    <div className={`${styles.previewRow} ${strong ? styles.previewRowStrong : ""}`}>
      <span className={styles.previewLabel}>{label}</span>
      <span className={`${styles.previewValue} ${strong ? styles.previewValueStrong : ""}`}>{value}</span>
    </div>
  );
}
