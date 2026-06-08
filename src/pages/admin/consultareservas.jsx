import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import Header from "../../components/header.jsx";
import AdminPageHeader from "../../components/AdminPageHeader.jsx";
import styles from "../../styles/admin/consultareservas.module.css";
import "../../styles/global.css";
import { adminFetch } from "../../utils/adminApi";
import {
  validarVentanaOperativaTurno,
  validarDiaReservaNoEnElPasadoLocal,
  validarInicioTurnoNoEnElPasadoLocal,
  iniciosDisponiblesParaDuracion,
  duracionesValidasParaCalendario,
  etiquetaDuracion,
} from "../../utils/coworkingHours.js";
import { recursoExcluidoFlujoTurnoHora } from "../../utils/reservaRecursoRules.js";
import { notifyReservasChanged } from "../../utils/boweSync.js";
import {
  RESERVA_ESTADO_LABEL,
  RESERVA_ESTADO_COLOR,
  RESERVA_ESTADO_DESCRIPCION,
} from "../../utils/reservaEstados.js";

dayjs.extend(isBetween);

import {
  Layout,
  Card,
  Table,
  Input,
  Select,
  Button,
  DatePicker,
  Popconfirm,
  Tag,
  message,
  Spin,
  Drawer,
  Tooltip,
  Steps,
  Empty,
} from "antd";
import {
  SearchOutlined,
  ExpandAltOutlined,
  AppstoreOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  IdcardOutlined,
  FieldTimeOutlined,
  ScheduleOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  MailOutlined,
} from "@ant-design/icons";

const { Content } = Layout;
const { Option } = Select;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const COWORKING_OPEN = 9;
const COWORKING_CLOSE = 21;

/** Etiqueta legible del tipo de reserva a partir de una fila/booking. */
function getTipoReservaLabel(bk) {
  if (!bk) return "Individual";
  if (bk.idSerie) return "Fija (4 sem.)";
  if (bk.TipoReserva === "semanal") return "Semanal";
  if (bk.TipoReserva === "mensual") return "Mensual pack";
  if (bk.idReservaGrupo) return "Múltiple (varios lugares)";
  return "Individual";
}

/** Clave de fila usada en la tabla (debe coincidir con reservasVista). */
function getRowKeyForBooking(bk) {
  if (!bk) return null;
  if (bk.idSerie) return `serie-${bk.idSerie}`;
  if (bk.idReservaGrupo) return `grupo-${bk.idReservaGrupo}`;
  return bk.idReserva;
}

export default function ControlReservas() {
  const queryClient = useQueryClient();
  const [tablePage, setTablePage] = useState(1);
  const pageSize = 10;
  const [occupancyReservas, setOccupancyReservas] = useState([]);
  const [espacios, setEspacios] = useState([]);
  const [recursos, setRecursos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filtroEspacio, setFiltroEspacio] = useState("Todos");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [dateRange, setDateRange] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingRecursoId, setEditingRecursoId] = useState(null);
  const [drawerStep, setDrawerStep] = useState(0);
  const [formData, setFormData] = useState({
    DNI: "", Nombre: "", Apellido: "", Email: "",
    idRecurso: null,
    fecha: null, hora: null, duracion: 60,
  });
  const [disponibilidad, setDisponibilidad] = useState([]);
  const [loadingDispo, setLoadingDispo] = useState(false);
  const [dispoLoaded, setDispoLoaded] = useState(false);
  const [lookupClienteLoading, setLookupClienteLoading] = useState(false);
  const [clienteExistente, setClienteExistente] = useState(false);
  const dispoDebounceRef = useRef(null);
  const dniDebounceRef = useRef(null);

  // Estado de la vista de ocupación
  const [occupancyDate, setOccupancyDate] = useState(dayjs());
  const [showOccupancy, setShowOccupancy] = useState(false);
  const [occupancyRefresh, setOccupancyRefresh] = useState(0);
  // Fila a resaltar en la tabla tras hacer clic en un bloque de ocupación
  const [highlightKey, setHighlightKey] = useState(null);
  const highlightTimerRef = useRef(null);

  const dateDesde = dateRange?.[0]?.format("YYYY-MM-DD") ?? "";
  const dateHasta = dateRange?.[1]?.format("YYYY-MM-DD") ?? "";

  const {
    data: reservasQueryData,
    isFetching: reservasFetching,
    isError: reservasError,
  } = useQuery({
    queryKey: [
      "staff-reservas",
      tablePage,
      pageSize,
      search,
      filtroEspacio,
      filtroEstado,
      dateDesde,
      dateHasta,
    ],
    queryFn: async () => {
      const limit = pageSize;
      const offset = (tablePage - 1) * limit;
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (search.trim()) params.set("q", search.trim());
      if (filtroEspacio !== "Todos") params.set("espacio", filtroEspacio);
      if (filtroEstado !== "Todos") params.set("estado", filtroEstado);
      if (dateDesde && dateHasta) {
        params.set("desde", dateDesde);
        params.set("hasta", dateHasta);
      }
      const res = await adminFetch(`${API_URL}/api/reservas?${params}`);
      if (!res.ok) throw new Error("fetch reservas");
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.items ?? [];
      const total = Array.isArray(data) ? items.length : data.total ?? items.length;
      return {
        items: items.map((r) => ({ ...r, key: r.idReserva })),
        total,
      };
    },
    enabled: !loading,
    retry: 2,
  });

  const reservas = reservasQueryData?.items ?? [];
  const reservasTotal = reservasQueryData?.total ?? 0;

  /** Una fila por serie fija o por lote multi-recurso; el resto sin agrupar. */
  const reservasVista = useMemo(() => {
    const list = reservas || [];
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
    const doneSerie = new Set();
    const doneGrupo = new Set();
    const out = [];
    for (const r of list) {
      if (r.idSerie) {
        if (doneSerie.has(r.idSerie)) continue;
        doneSerie.add(r.idSerie);
        const grp = bySerie.get(r.idSerie) || [];
        const sorted = [...grp].sort((a, b) => String(a.DiaReserva).localeCompare(String(b.DiaReserva)));
        const first = sorted[0];
        const total =
          first.serie_precioFinalTotal != null
            ? parseFloat(first.serie_precioFinalTotal)
            : sorted.reduce((s, x) => s + (parseFloat(x.Monto) || 0), 0);
        const pairsMap = new Map();
        for (const x of sorted) {
          if (!x.recurso_nombre) continue;
          if (!pairsMap.has(x.recurso_nombre)) pairsMap.set(x.recurso_nombre, x.espacio_nombre || null);
        }
        const recursos_detalle = Array.from(pairsMap, ([recurso, espacio]) => ({ recurso, espacio }));
        out.push({
          ...first,
          key: `serie-${r.idSerie}`,
          _serieN: sorted.length,
          Monto: total,
          DiaReserva: first.DiaReserva,
          recursos_detalle,
        });
        continue;
      }
      if (r.idReservaGrupo) {
        if (doneGrupo.has(r.idReservaGrupo)) continue;
        doneGrupo.add(r.idReservaGrupo);
        const grp = byGrupo.get(r.idReservaGrupo) || [];
        const sorted = [...grp].sort((a, b) => (a.idReserva || 0) - (b.idReserva || 0));
        const first = sorted[0];
        const total = sorted.reduce((s, x) => s + (parseFloat(x.Monto) || 0), 0);
        const nombres = sorted.map((x) => x.recurso_nombre).filter(Boolean);
        const recursos_detalle = sorted
          .filter((x) => x.recurso_nombre)
          .map((x) => ({ recurso: x.recurso_nombre, espacio: x.espacio_nombre || null }));
        out.push({
          ...first,
          key: `grupo-${r.idReservaGrupo}`,
          idReserva: first.idReserva,
          _grupoN: sorted.length,
          Monto: total,
          recurso_nombre: nombres.join(", "),
          recursos_detalle,
        });
        continue;
      }
      out.push({
        ...r,
        key: r.idReserva,
        recursos_detalle: r.recurso_nombre
          ? [{ recurso: r.recurso_nombre, espacio: r.espacio_nombre || null }]
          : [],
      });
    }
    return out;
  }, [reservas]);

  const fetchEspacios = async () => {
    try {
      const res = await fetch(`${API_URL}/api/espacios`);
      setEspacios(await res.json());
    } catch {
      message.error("Error al cargar espacios");
    }
  };

  const fetchRecursos = async () => {
    try {
      const res = await fetch(`${API_URL}/api/recursos`);
      setRecursos(await res.json());
    } catch {
      message.error("Error al cargar recursos");
    }
  };

  useEffect(() => {
    Promise.all([fetchEspacios(), fetchRecursos()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setTablePage(1);
  }, [search, filtroEspacio, filtroEstado, dateRange]);

  useEffect(() => {
    if (reservasError) message.error("Error al cargar reservas");
  }, [reservasError]);

  // Recursos por espacio, organizados en secciones, usando disponibilidad cuando esta cargada.
  const recursoGroupsByEspacio = useMemo(() => {
    if (!disponibilidad || disponibilidad.length === 0) return [];
    const espacioIds = [...new Set(disponibilidad.map((r) => r.idEspacio))];
    return espacioIds.map((espId) => {
      const espNombre = espacios.find((e) => e.Espacio === espId)?.Nombre || `Espacio ${espId}`;
      const recs = disponibilidad.filter((r) => r.idEspacio === espId);

      const grupoIds = new Set(recs.filter((r) => r.idRecursoPadre).map((r) => r.idRecursoPadre));
      const topLevel = recs.filter((r) => !r.idRecursoPadre);
      const dbGroups = topLevel.filter((r) => grupoIds.has(r.idRecurso));
      const standalones = topLevel.filter((r) => !grupoIds.has(r.idRecurso));

      const sections = [];
      const completoItems = standalones.filter((r) => r.esCompleto);
      const individualItems = standalones.filter((r) => !r.esCompleto);

      const prefixes = {};
      individualItems.forEach((r) => {
        const prefix = r.Nombre.replace(/\s*\d+$/, "");
        if (!prefixes[prefix]) prefixes[prefix] = [];
        prefixes[prefix].push(r);
      });
      Object.entries(prefixes).forEach(([label, items]) => {
        if (items.length > 1) sections.push({ type: "visual-group", label: label + "s", items });
        else sections.push({ type: "standalone", item: items[0] });
      });
      dbGroups.forEach((g) => {
        const children = recs.filter(
          (r) => r.idRecursoPadre === g.idRecurso && !recursoExcluidoFlujoTurnoHora(r, recursos)
        );
        if (children.length > 0) sections.push({ type: "db-group", label: g.Nombre, items: children });
      });
      if (completoItems.length > 0) sections.push({ type: "completo", items: completoItems });

      return { idEspacio: espId, espacioNombre: espNombre, sections };
    });
  }, [disponibilidad, espacios, recursos]);

  const availableCount = useMemo(
    () => disponibilidad.filter((r) => r.disponible === true).length,
    [disponibilidad]
  );

  // Busca disponibilidad automáticamente cuando fecha, duración y hora están listas.
  useEffect(() => {
    if (!drawerOpen) return;
    if (!formData.fecha || !formData.hora || !formData.duracion) {
      setDisponibilidad([]);
      setDispoLoaded(false);
      return;
    }
    if (dispoDebounceRef.current) clearTimeout(dispoDebounceRef.current);
    dispoDebounceRef.current = setTimeout(async () => {
      setLoadingDispo(true);
      try {
        const horaIni = formData.hora.format("HH:mm");
        const horaFin = formData.hora.clone().add(formData.duracion, "minute").format("HH:mm");
        const fecha = formData.fecha.format("YYYY-MM-DD");
        const url = `${API_URL}/api/recursos/disponibilidad?fecha=${fecha}&horaInicio=${horaIni}&horaFin=${horaFin}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("dispo");
        const data = await res.json();
        setDisponibilidad(Array.isArray(data) ? data : []);
        setDispoLoaded(true);
      } catch {
        setDisponibilidad([]);
        setDispoLoaded(true);
        message.error("Error al consultar disponibilidad");
      } finally {
        setLoadingDispo(false);
      }
    }, 350);
    return () => dispoDebounceRef.current && clearTimeout(dispoDebounceRef.current);
  }, [formData.fecha, formData.hora, formData.duracion, drawerOpen]);

  // Cuando cambian fecha o duracion, descarto la hora elegida si dejo de ser valida.
  useEffect(() => {
    if (!formData.fecha || !formData.duracion) return;
    const slots = iniciosDisponiblesParaDuracion(formData.fecha, formData.duracion);
    if (formData.hora && !slots.some((s) => s.isSame(formData.hora, "minute"))) {
      setFormData((fd) => ({ ...fd, hora: null }));
    }
  }, [formData.fecha, formData.duracion]);

  // Cuando cambia la disponibilidad, si el recurso elegido dejo de estar disponible, lo limpio.
  useEffect(() => {
    if (!dispoLoaded || !formData.idRecurso) return;
    if (editingId && formData.idRecurso === editingRecursoId) return;
    const rec = disponibilidad.find((r) => r.idRecurso === formData.idRecurso);
    if (!rec || rec.disponible !== true) {
      setFormData((fd) => ({ ...fd, idRecurso: null }));
    }
  }, [disponibilidad, dispoLoaded, editingId, editingRecursoId, formData.idRecurso]);

  // DNI autocompletado: busca un cliente existente y rellena nombre/apellido/email.
  const lookupClienteByDni = async (dni) => {
    const clean = String(dni || "").trim();
    if (!clean || clean.length < 7) return;
    setLookupClienteLoading(true);
    try {
      const res = await adminFetch(`${API_URL}/api/clientes/${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.DNI) {
          setFormData((fd) => ({
            ...fd,
            Nombre: data.Nombre ?? fd.Nombre,
            Apellido: data.Apellido ?? fd.Apellido,
            Email: data.Email ?? fd.Email,
          }));
          setClienteExistente(true);
        }
      } else {
        setClienteExistente(false);
      }
    } catch {
      setClienteExistente(false);
    } finally {
      setLookupClienteLoading(false);
    }
  };

  const handleDniChange = (value) => {
    setFormData((fd) => ({ ...fd, DNI: value }));
    setClienteExistente(false);
    if (dniDebounceRef.current) clearTimeout(dniDebounceRef.current);
    if (!value || String(value).trim().length < 7) return;
    dniDebounceRef.current = setTimeout(() => lookupClienteByDni(value), 500);
  };

  // Datos de ocupación
  useEffect(() => {
    if (!showOccupancy || loading) return;
    (async () => {
      try {
        const fecha = occupancyDate.format("YYYY-MM-DD");
        const res = await adminFetch(
          `${API_URL}/api/reservas/ocupacion-dia?fecha=${encodeURIComponent(fecha)}`
        );
        const data = await res.json();
        setOccupancyReservas(data.items ?? []);
      } catch {
        message.error("Error al cargar ocupación del día");
      }
    })();
  }, [showOccupancy, occupancyDate, loading, occupancyRefresh]);

  /** Recursos hoja (sin hijos) con sus bookings, agrupados por espacio. */
  const occupancyGroups = useMemo(() => {
    const dayReservas = occupancyReservas;

    const leafRecursos = recursos.filter((r) => {
      return !recursos.some((child) => child.idRecursoPadre === r.idRecurso);
    });

    const enriched = leafRecursos.map((rec) => {
      const bookings = dayReservas.filter((rv) => rv.idRecurso === rec.idRecurso);
      const espName = espacios.find((e) => e.Espacio === rec.idEspacio)?.Nombre || "—";
      return { ...rec, espacio_nombre: espName, bookings };
    }).filter((r) => r.bookings.length > 0 || !r.esCompleto);

    const byEspacio = new Map();
    for (const r of enriched) {
      const key = r.idEspacio ?? "sin-espacio";
      if (!byEspacio.has(key)) {
        byEspacio.set(key, { idEspacio: r.idEspacio, nombre: r.espacio_nombre, recursos: [] });
      }
      byEspacio.get(key).recursos.push(r);
    }
    return Array.from(byEspacio.values());
  }, [occupancyReservas, recursos, espacios]);

  const occupancyTotalRecursos = occupancyGroups.reduce((s, g) => s + g.recursos.length, 0);

  /** Click en un bloque de ocupación: lleva a la reserva en la tabla y la resalta. */
  const handleOccupancyBlockClick = (bk) => {
    const targetKey = getRowKeyForBooking(bk);
    if (targetKey == null) return;
    // Encuadrar la tabla en el día de la reserva y limpiar filtros que la oculten.
    const dia = bk.DiaReserva ? dayjs(bk.DiaReserva) : occupancyDate;
    setSearch("");
    setFiltroEspacio("Todos");
    setFiltroEstado("Todos");
    setDateRange([dia.startOf("day"), dia.startOf("day")]);
    setTablePage(1);
    setShowOccupancy(false);
    setHighlightKey(targetKey);
  };

  /** Una vez visible la tabla con la reserva, hacer scroll y resaltar temporalmente. */
  useEffect(() => {
    if (highlightKey == null || showOccupancy || reservasFetching) return;
    const exists = reservasVista.some((r) => String(r.key) === String(highlightKey));
    if (!exists) return;
    const id = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-row-key="${highlightKey}"]`);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightKey(null), 2800);
    return () => cancelAnimationFrame(id);
  }, [highlightKey, showOccupancy, reservasFetching, reservasVista]);

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  /** Contenido compacto del tooltip al pasar el cursor sobre un bloque. */
  const renderBookingTooltip = (bk) => {
    const cliente =
      `${bk.cliente_nombre || ""} ${bk.cliente_apellido || ""}`.trim() || bk.Nombre || "—";
    const estado = (bk.Estado || "activa").toLowerCase();
    const horario = bk.HorarioReserva
      ? `${bk.HorarioReserva}${bk.HorarioFin ? ` - ${bk.HorarioFin}` : ""}`
      : "Todo el día";
    const rows = [
      { label: "Cliente", value: cliente },
      { label: "Fecha", value: bk.DiaReserva ? dayjs(bk.DiaReserva).format("DD/MM/YYYY") : "—" },
      { label: "Horario", value: horario },
      { label: "Espacio", value: bk.espacio_nombre || "—" },
      { label: "Recurso", value: bk.recurso_nombre || "—" },
      { label: "Tipo", value: getTipoReservaLabel(bk) },
    ];
    return (
      <div className={styles.occBlockTooltip}>
        {rows.map((r) => (
          <div key={r.label} className={styles.occBlockTooltipRow}>
            <span className={styles.occBlockTooltipLabel}>{r.label}</span>
            <span className={styles.occBlockTooltipValue}>{r.value}</span>
          </div>
        ))}
        <div className={styles.occBlockTooltipRow}>
          <span className={styles.occBlockTooltipLabel}>Estado</span>
          <Tag color={RESERVA_ESTADO_COLOR[estado] || "default"} style={{ margin: 0 }}>
            {RESERVA_ESTADO_LABEL[estado] || estado}
          </Tag>
        </div>
        <div className={styles.occBlockTooltipHint}>Clic para ver en la tabla →</div>
      </div>
    );
  };

  // Acciones
  const handleGuardar = async () => {
    if (!formData.fecha || !formData.hora) {
      message.warning("Selecciona fecha y hora de la reserva.");
      return;
    }
    if (!formData.idRecurso) {
      message.warning("Selecciona un recurso a reservar.");
      return;
    }
    try {
      const horaInicio = formData.hora.format("HH:mm");
      const horaFin = formData.hora.clone().add(formData.duracion, "minute").format("HH:mm");
      const ventana = validarVentanaOperativaTurno(horaInicio, horaFin);
      if (ventana) {
        message.warning(ventana);
        return;
      }
      const errDia = validarDiaReservaNoEnElPasadoLocal(formData.fecha);
      if (errDia) {
        message.warning(errDia);
        return;
      }
      const errPasado = validarInicioTurnoNoEnElPasadoLocal(formData.fecha, horaInicio);
      if (errPasado) {
        message.warning(errPasado);
        return;
      }
      const body = {
        DNI: formData.DNI,
        Nombre: `${formData.Nombre} ${formData.Apellido}`.trim(),
        idRecurso: formData.idRecurso,
        HorarioReserva: horaInicio,
        HorarioFin: horaFin,
        DiaReserva: formData.fecha.format("YYYY-MM-DD"),
      };

      if (editingId) {
        const res = await adminFetch(`${API_URL}/api/reservas/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { message.error(data.message || "Error al actualizar"); return; }
        message.success("Reserva actualizada");
      } else {
        if (!clienteExistente) {
          const creaCli = await adminFetch(`${API_URL}/api/clientes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ DNI: formData.DNI, Nombre: formData.Nombre, Apellido: formData.Apellido, Email: formData.Email }),
          });
          if (!creaCli.ok) {
            const d = await creaCli.json().catch(() => ({}));
            message.error(d.message || "Error al registrar el cliente");
            return;
          }
        }
        const res = await adminFetch(`${API_URL}/api/reservas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { message.error(data.message || "Error al crear"); return; }
        message.success("Reserva creada");
      }
      handleLimpiar();
      queryClient.invalidateQueries({ queryKey: ["staff-reservas"] });
      notifyReservasChanged();
      if (showOccupancy) setOccupancyRefresh((x) => x + 1);
    } catch {
      message.error("Error al guardar reserva");
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await adminFetch(`${API_URL}/api/reservas/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(data.message || "Error al eliminar");
        return;
      }
      message.success("Reserva eliminada");
      if (editingId === id) handleLimpiar();
      queryClient.invalidateQueries({ queryKey: ["staff-reservas"] });
      notifyReservasChanged();
      if (showOccupancy) setOccupancyRefresh((x) => x + 1);
    } catch {
      message.error("Error al eliminar");
    }
  };

  const handleModificar = (record) => {
    setEditingId(record.idReserva);
    const [nombre, ...rest] = (record.Nombre || "").split(" ");
    let fecha = record.DiaReserva ? dayjs(record.DiaReserva) : null;
    let hora = null;
    let duracion = 60;
    if (record.HorarioReserva) {
      const [hh, mm] = record.HorarioReserva.split(":");
      const baseDate = fecha || dayjs();
      hora = baseDate.hour(parseInt(hh) || 0).minute(parseInt(mm) || 0).second(0).millisecond(0);
    }
    if (record.HorarioReserva && record.HorarioFin) {
      const [h1, m1] = record.HorarioReserva.split(":").map(Number);
      const [h2, m2] = record.HorarioFin.split(":").map(Number);
      duracion = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (duracion <= 0) duracion = 60;
    }
    setFormData({
      DNI: record.DNI || "", Nombre: nombre || "", Apellido: rest.join(" ") || "", Email: "",
      idRecurso: record.idRecurso || null,
      fecha, hora, duracion,
    });
    setClienteExistente(true);
    setEditingRecursoId(record.idRecurso || null);
    setDisponibilidad([]);
    setDispoLoaded(false);
    setDrawerStep(0);
    setDrawerOpen(true);
  };

  const handleLimpiar = () => {
    setEditingId(null);
    setEditingRecursoId(null);
    setFormData({ DNI: "", Nombre: "", Apellido: "", Email: "", idRecurso: null, fecha: null, hora: null, duracion: 60 });
    setClienteExistente(false);
    setDisponibilidad([]);
    setDispoLoaded(false);
    setDrawerStep(0);
    setDrawerOpen(false);
  };

  const tableRangeStart = reservasVista.length === 0 ? 0 : (tablePage - 1) * pageSize + 1;
  const tableRangeEnd = (tablePage - 1) * pageSize + reservasVista.length;

  const columns = [
    {
      title: "Cliente", key: "cliente",
      sorter: (a, b) => (a.Nombre || "").localeCompare(b.Nombre || ""),
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.Nombre || "-"}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>DNI: {r.DNI || "-"}</div>
        </div>
      ),
    },
    {
      title: "Recurso", key: "espacio",
      render: (_, r) => {
        const detalle = Array.isArray(r.recursos_detalle) && r.recursos_detalle.length
          ? r.recursos_detalle
          : r.recurso_nombre
            ? [{ recurso: r.recurso_nombre, espacio: r.espacio_nombre || null }]
            : [];
        const tooltipContent = detalle.length ? (
          <div className={styles.recursoTooltip}>
            {detalle.map((d, i) => (
              <div key={`${d.recurso}-${i}`} className={styles.recursoTooltipRow}>
                <strong>{d.recurso}</strong>
                <span>{d.espacio || "Sin espacio"}</span>
              </div>
            ))}
          </div>
        ) : null;
        const label = detalle.length
          ? detalle.map((d) => d.recurso).join(", ")
          : r.recurso_nombre || "-";
        return (
          <Tooltip title={tooltipContent} placement="top">
            <span className={styles.recursoCell}>{label}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "Fecha", dataIndex: "DiaReserva", key: "fecha",
      sorter: (a, b) => new Date(a.DiaReserva || 0) - new Date(b.DiaReserva || 0),
      render: (v) => (v ? dayjs(v).format("DD/MM/YYYY") : "-"),
    },
    {
      title: "Horario", key: "horario",
      render: (_, r) => {
        if (r.TipoReserva === "semanal") return <Tag color="blue">Semanal</Tag>;
        if (r.TipoReserva === "mensual") return <Tag color="purple">Mensual pack</Tag>;
        if (r.idSerie) {
          const horaTxt = r.HorarioReserva ? `${r.HorarioReserva} - ${r.HorarioFin || ""}` : "-";
          return (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "space-between",
                flexWrap: "wrap",
                width: "100%",
              }}
            >
              <span>{horaTxt}</span>
              <Tag color="cyan">Fijo 4 sem.</Tag>
            </span>
          );
        }
        if (r._grupoN > 1) {
          const horaGrupo = r.HorarioReserva ? `${r.HorarioReserva} - ${r.HorarioFin || ""}` : "-";
          return (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "space-between",
                flexWrap: "wrap",
                width: "100%",
              }}
            >
              <span>{horaGrupo}</span>
              <Tag color="geekblue">Varios lugares</Tag>
            </span>
          );
        }
        return r.HorarioReserva ? `${r.HorarioReserva} - ${r.HorarioFin || ""}` : "-";
      },
    },
    {
      title: "Estado del turno",
      key: "estado",
      render: (_, r) => {
        const estado = (r.Estado || "activa").toLowerCase();
        return (
          <Tooltip title={RESERVA_ESTADO_DESCRIPCION[estado] || ""}>
            <Tag color={RESERVA_ESTADO_COLOR[estado] || "default"}>
              {RESERVA_ESTADO_LABEL[estado] || estado}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "Monto", dataIndex: "Monto", key: "monto",
      align: "right",
      className: "col-money",
      sorter: (a, b) => (parseFloat(a.Monto) || 0) - (parseFloat(b.Monto) || 0),
      render: (v) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          ${parseFloat(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      title: "Acciones", key: "acciones", width: 160,
      render: (_, record) => {
        const bloquearEdicionGrupo = (record._grupoN > 1 || record._serieN > 1);
        const puedeEditar = record.puedeEditar === true && !bloquearEdicionGrupo;
        const puedeEliminar = record.puedeEliminar === true;
        const motivo = record.mensajeMutacion || "No se puede modificar esta reserva.";
        const motivoEliminar = record.mensajeNoEliminar || record.mensajeMutacion || "No se puede eliminar esta reserva.";
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Tooltip title={!puedeEditar ? motivo : null}>
              <Button
                size="small"
                icon={<EditOutlined />}
                disabled={!puedeEditar}
                onClick={() => puedeEditar && handleModificar(record)}
              />
            </Tooltip>
            {puedeEliminar ? (
              <Popconfirm
                title="¿Eliminar esta reserva? Se borrará también el registro de pago asociado si existe."
                onConfirm={() => handleDelete(record.idReserva)}
                okText="Eliminar"
                cancelText="Cancelar"
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ) : (
              <Tooltip title={motivoEliminar}>
                <span>
                  <Button size="small" danger icon={<DeleteOutlined />} disabled />
                </span>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  const renderResourceChip = (r) => {
    const isCurrentOwn = editingId && r.idRecurso === editingRecursoId;
    const isGroup = r.esGrupo === true || r.disponible === null;
    const isAvailable = isCurrentOwn || r.disponible === true;
    const disabled = isGroup || !isAvailable;
    const selected = formData.idRecurso === r.idRecurso;
    return (
      <button
        key={r.idRecurso}
        type="button"
        disabled={disabled}
        className={[
          styles.resourceChip,
          r.esCompleto ? styles.resourceChipCompleto : "",
          selected ? styles.resourceChipActive : "",
          disabled ? styles.resourceChipDisabled : "",
        ].filter(Boolean).join(" ")}
        onClick={() => !disabled && setFormData({ ...formData, idRecurso: r.idRecurso })}
        title={r.Nombre + (disabled && !isGroup ? " (ocupado)" : "")}
      >
        <span className={styles.resourceChipIcon}>
          {r.esCompleto ? <ExpandAltOutlined /> : <AppstoreOutlined />}
        </span>
        <span className={styles.resourceChipName}>{r.Nombre}</span>
        {!isGroup && (
          <span
            className={[
              styles.resourceChipBadge,
              isAvailable ? styles.resourceChipBadgeOk : styles.resourceChipBadgeBusy,
            ].join(" ")}
          >
            {isAvailable ? "Libre" : "Ocupado"}
          </span>
        )}
      </button>
    );
  };

  const renderResourceSections = (sections) =>
    sections.map((s, idx) => {
      const items = s.items || (s.item ? [s.item] : []);
      if (items.length === 0) return null;
      const sectionLabel =
        s.type === "visual-group" || s.type === "db-group" ? s.label :
        s.type === "completo" ? "Espacio completo" : null;
      return (
        <div key={`${s.type}-${idx}`} className={styles.resourceSubgroup}>
          {sectionLabel && (
            <span className={styles.resourceSubgroupLabel}>{sectionLabel}</span>
          )}
          <div className={styles.resourceChipGrid}>{items.map(renderResourceChip)}</div>
        </div>
      );
    });

  // Validacion por paso del wizard.
  const stepClienteValido = useMemo(() => {
    const dniOk = String(formData.DNI || "").trim().length >= 7;
    const nombreOk = String(formData.Nombre || "").trim().length > 0;
    const apellidoOk = String(formData.Apellido || "").trim().length > 0;
    return dniOk && nombreOk && apellidoOk;
  }, [formData.DNI, formData.Nombre, formData.Apellido]);

  const stepFechaEspacioValido = useMemo(() => {
    return !!formData.fecha && !!formData.duracion && !!formData.hora && !!formData.idRecurso;
  }, [formData.fecha, formData.duracion, formData.hora, formData.idRecurso]);

  const canAdvanceStep = (step) => {
    if (step === 0) return stepClienteValido;
    if (step === 1) return stepFechaEspacioValido;
    return false;
  };

  const goNextStep = () => {
    if (!canAdvanceStep(drawerStep)) return;
    setDrawerStep((s) => Math.min(s + 1, 2));
  };

  const goPrevStep = () => setDrawerStep((s) => Math.max(s - 1, 0));

  if (loading) {
    return (
      <Layout className={styles.layout}>
        <Header />
        <Content className={styles.content}>
          <div className={styles.container}>
            <AdminPageHeader
              eyebrow="Operaciones"
              icon={<AppstoreOutlined />}
              title="Control de Reservas"
              description="Administrá reservas activas, su ocupación y el historial completo."
            />
          </div>
          <div style={{ textAlign: "center", padding: "4rem" }}><Spin size="large" /></div>
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className={styles.layout}>
      <Header />
      <Content className={styles.content}>
        <div className={styles.container}>
          <AdminPageHeader
            eyebrow="Operaciones"
            icon={<AppstoreOutlined />}
            title="Control de Reservas"
            description="Administrá reservas activas, su ocupación y el historial completo."
            actions={
              <>
                <Button
                  type={showOccupancy ? "primary" : "default"}
                  icon={<ClockCircleOutlined />}
                  onClick={() => setShowOccupancy(!showOccupancy)}
                  size="large"
                >
                  {showOccupancy ? "Ver tabla" : "Ver ocupación"}
                </Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    handleLimpiar();
                    setDrawerOpen(true);
                    setDrawerStep(0);
                  }}
                  size="large"
                >
                  Nueva reserva
                </Button>
              </>
            }
          />

          {/* Filtros */}
          <div className={styles.filtersRow}>
            <Input placeholder="Buscar cliente, DNI..." prefix={<SearchOutlined />} allowClear value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 250 }} />
            <Select value={filtroEspacio} onChange={setFiltroEspacio} style={{ minWidth: 150 }}>
              <Option value="Todos">Todos los espacios</Option>
              {espacios.map((e) => <Option key={e.Espacio} value={e.Nombre}>{e.Nombre}</Option>)}
            </Select>
            <Select
              value={filtroEstado}
              onChange={setFiltroEstado}
              style={{ minWidth: 220 }}
              placeholder="Estado del turno"
            >
              <Option value="Todos">Turno: todos</Option>
              <Option value="activa">Confirmada</Option>
              <Option value="en_curso">En curso</Option>
              <Option value="completada">Asistió / Finalizada</Option>
              <Option value="no_asistio">No asistió</Option>
              <Option value="cancelada">Cancelada</Option>
            </Select>
            <DatePicker.RangePicker format="DD/MM/YYYY" value={dateRange} onChange={setDateRange}
              placeholder={["Desde", "Hasta"]} allowClear />
          </div>

          {!showOccupancy ? (
            <Card bordered={false} className={styles.tableCard}>
              <Table
                columns={columns}
                dataSource={reservasVista}
                loading={reservasFetching}
                rowClassName={(record) =>
                  highlightKey != null && String(record.key) === String(highlightKey)
                    ? styles.occupancyHighlightRow
                    : ""
                }
                pagination={{
                  current: tablePage,
                  pageSize,
                  total: reservasTotal,
                  showSizeChanger: false,
                  size: "small",
                  onChange: (p) => setTablePage(p),
                }}
                size="middle"
                scroll={{ x: 900 }}
              />
              <div className={styles.tableFooter}>
                Mostrando {tableRangeStart}-{tableRangeEnd} de {reservasTotal} reservas
              </div>
            </Card>
          ) : (
            <Card bordered={false} className={styles.tableCard}>
              <div className={styles.occupancyHeader}>
                <div>
                  <h3>Ocupación del día</h3>
                  <span className={styles.occupancyHeaderSub}>
                    {dayjs(occupancyDate).format("dddd DD/MM/YYYY")} · {occupancyTotalRecursos} recursos
                  </span>
                </div>
                <DatePicker value={occupancyDate} onChange={(v) => v && setOccupancyDate(v)} format="DD/MM/YYYY" />
              </div>

              <div className={styles.occupancyLegend}>
                <span className={styles.occupancyLegendItem}>
                  <span className={styles.occupancyLegendDot} style={{ background: "var(--color-brand-primary)" }} /> Reservado
                </span>
                <span className={styles.occupancyLegendItem}>
                  <span className={styles.occupancyLegendDot} style={{ background: "var(--color-warning)" }} /> Todo el día
                </span>
              </div>

              <div className={styles.occupancyGrid}>
                <div className={styles.occupancyTimeHeader}>
                  <div className={styles.occupancyLabel}>Recurso</div>
                  {Array.from({ length: COWORKING_CLOSE - COWORKING_OPEN }, (_, i) => (
                    <div key={i} className={styles.occupancyHour}>{COWORKING_OPEN + i}:00</div>
                  ))}
                </div>

                {occupancyGroups.map((grp) => (
                  <div key={grp.idEspacio || "sin-espacio"} className={styles.occupancyGroup}>
                    <div className={styles.occupancyGroupHeader}>
                      <AppstoreOutlined className={styles.occupancyGroupIcon} />
                      <span className={styles.occupancyGroupName}>{grp.nombre}</span>
                      <span className={styles.occupancyGroupCount}>{grp.recursos.length}</span>
                    </div>
                    {grp.recursos.map((rec) => (
                      <div key={rec.idRecurso} className={styles.occupancyRow}>
                        <div className={styles.occupancyLabel} title={`${rec.espacio_nombre} / ${rec.Nombre}`}>
                          <div className={styles.occupancyResName}>{rec.Nombre}</div>
                          {rec.bookings.length > 0 && (
                            <div className={styles.occupancyResMeta}>{rec.bookings.length} reserva{rec.bookings.length !== 1 ? "s" : ""}</div>
                          )}
                        </div>
                        <div className={styles.occupancyTimeline}>
                          {rec.bookings.map((bk) => {
                            if (!bk.HorarioReserva) {
                              return (
                                <Tooltip key={bk.idReserva} title={renderBookingTooltip(bk)} placement="top">
                                  <div className={styles.occupancyBlock}
                                    role="button" tabIndex={0}
                                    onClick={() => handleOccupancyBlockClick(bk)}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOccupancyBlockClick(bk); } }}
                                    style={{ left: "0%", width: "100%", background: "var(--color-warning)" }}>
                                    <span>{bk.Nombre}</span>
                                  </div>
                                </Tooltip>
                              );
                            }
                            const [h1, m1] = bk.HorarioReserva.split(":").map(Number);
                            const [h2, m2] = (bk.HorarioFin || bk.HorarioReserva).split(":").map(Number);
                            const totalMins = (COWORKING_CLOSE - COWORKING_OPEN) * 60;
                            const startMin = (h1 - COWORKING_OPEN) * 60 + m1;
                            const endMin = (h2 - COWORKING_OPEN) * 60 + m2;
                            const left = Math.max(0, (startMin / totalMins) * 100);
                            const width = Math.max(2, ((endMin - startMin) / totalMins) * 100);
                            return (
                              <Tooltip key={bk.idReserva} title={renderBookingTooltip(bk)} placement="top">
                                <div className={styles.occupancyBlock}
                                  role="button" tabIndex={0}
                                  onClick={() => handleOccupancyBlockClick(bk)}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOccupancyBlockClick(bk); } }}
                                  style={{ left: `${left}%`, width: `${width}%` }}>
                                  <span>{bk.HorarioReserva}</span>
                                </div>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                {occupancyGroups.length === 0 && (
                  <div className={styles.occupancyEmpty}>
                    <CalendarOutlined style={{ fontSize: 32 }} />
                    <p>No hay recursos para mostrar en este día</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Panel lateral para crear/editar */}
        <Drawer
          title={editingId ? "Modificar Reserva" : "Nueva Reserva"}
          placement="right"
          width={520}
          onClose={handleLimpiar}
          open={drawerOpen}
          className={styles.reservaDrawer}
          footer={
            <div className={styles.drawerFooter}>
              <Button onClick={handleLimpiar}>Cancelar</Button>
              <div className={styles.drawerFooterRight}>
                {drawerStep > 0 && (
                  <Button icon={<ArrowLeftOutlined />} onClick={goPrevStep}>
                    Volver
                  </Button>
                )}
                {drawerStep < 2 && (
                  <Button
                    type="primary"
                    onClick={goNextStep}
                    disabled={!canAdvanceStep(drawerStep)}
                  >
                    Continuar
                    <ArrowRightOutlined />
                  </Button>
                )}
                {drawerStep === 2 && (
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={handleGuardar}
                    disabled={!stepClienteValido || !stepFechaEspacioValido}
                  >
                    {editingId ? "Actualizar reserva" : "Confirmar reserva"}
                  </Button>
                )}
              </div>
            </div>
          }
        >
          <Steps
            current={drawerStep}
            size="small"
            className={styles.drawerSteps}
            items={[
              { title: "Cliente", icon: <UserOutlined /> },
              { title: "Fecha y espacio", icon: <CalendarOutlined /> },
              { title: "Confirmar", icon: <CheckCircleOutlined /> },
            ]}
          />

          {/* Paso 0: Cliente */}
          {drawerStep === 0 && (
            <div className={styles.drawerStepBody}>
              <div className={styles.stepIntro}>
                <h3 className={styles.stepTitle}>¿Para quién es la reserva?</h3>
                <p className={styles.stepSub}>
                  Ingresá el DNI del cliente. Si ya está registrado, sus datos se completan automáticamente.
                </p>
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>
                  <IdcardOutlined /> DNI
                </label>
                <Input
                  value={formData.DNI}
                  placeholder="Ej: 30123456"
                  onChange={(e) => handleDniChange(e.target.value)}
                  disabled={!!editingId}
                  suffix={
                    lookupClienteLoading ? (
                      <LoadingOutlined style={{ color: "var(--color-brand-primary)" }} />
                    ) : clienteExistente ? (
                      <Tooltip title="Cliente ya registrado">
                        <CheckCircleOutlined style={{ color: "var(--color-brand-primary)" }} />
                      </Tooltip>
                    ) : null
                  }
                />
                {clienteExistente && !editingId && (
                  <span className={styles.fieldHintOk}>
                    <CheckCircleOutlined /> Cliente existente — datos completados.
                  </span>
                )}
                {!clienteExistente && !editingId && String(formData.DNI || "").trim().length >= 7 && (
                  <span className={styles.fieldHint}>
                    Cliente nuevo — se creará al confirmar la reserva.
                  </span>
                )}
              </div>

              <div className={styles.formRow2}>
                <div className={styles.formField}>
                  <label className={styles.label}>
                    <UserOutlined /> Nombre
                  </label>
                  <Input
                    value={formData.Nombre}
                    onChange={(e) => setFormData({ ...formData, Nombre: e.target.value })}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.label}>Apellido</label>
                  <Input
                    value={formData.Apellido}
                    onChange={(e) => setFormData({ ...formData, Apellido: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>
                  <MailOutlined /> Email
                </label>
                <Input
                  type="email"
                  value={formData.Email}
                  placeholder="opcional"
                  onChange={(e) => setFormData({ ...formData, Email: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Paso 1: Fecha + Hora + Recurso */}
          {drawerStep === 1 && (
            <div className={styles.drawerStepBody}>
              <div className={styles.stepIntro}>
                <h3 className={styles.stepTitle}>¿Cuándo y dónde?</h3>
                <p className={styles.stepSub}>
                  Elegí fecha, duración y horario. Vas a ver solo los recursos libres en ese turno.
                </p>
                <span className={styles.hoursBadge}>
                  <ClockCircleOutlined /> 09:00 – 21:00 hs
                </span>
              </div>

              <div className={styles.formField}>
                <div className={styles.fieldLabelRow}>
                  <CalendarOutlined className={styles.fieldLabelIcon} />
                  <label className={styles.label}>Fecha</label>
                </div>
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: "100%" }}
                  value={formData.fecha}
                  placeholder="Seleccioná el día"
                  onChange={(v) => setFormData({ ...formData, fecha: v })}
                  disabledDate={(d) => d && d.isBefore(dayjs().startOf("day"))}
                />
              </div>

              <div className={styles.formField}>
                <div className={styles.fieldLabelRow}>
                  <FieldTimeOutlined className={styles.fieldLabelIcon} />
                  <label className={styles.label}>Duración</label>
                </div>
                <div className={styles.durationChips}>
                  {duracionesValidasParaCalendario().map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={[
                        styles.durationChip,
                        formData.duracion === d ? styles.durationChipActive : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => setFormData({ ...formData, duracion: d })}
                    >
                      {etiquetaDuracion(d)}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formField}>
                <div className={styles.fieldLabelRow}>
                  <ScheduleOutlined className={styles.fieldLabelIcon} />
                  <label className={styles.label}>Hora de inicio</label>
                </div>
                {(() => {
                  if (!formData.fecha) {
                    return <p className={styles.fieldHint}>Elegí primero la fecha.</p>;
                  }
                  if (!formData.duracion) {
                    return <p className={styles.fieldHint}>Elegí la duración para ver los horarios.</p>;
                  }
                  const slots = iniciosDisponiblesParaDuracion(formData.fecha, formData.duracion);
                  if (slots.length === 0) {
                    return (
                      <p className={styles.fieldHintWarn}>
                        No hay inicios posibles para esta duración sin pasar las 21:00. Probá otra duración o fecha.
                      </p>
                    );
                  }
                  const slotsManana = slots.filter((s) => s.hour() < 14);
                  const slotsTarde = slots.filter((s) => s.hour() >= 14);
                  const renderSlot = (slot) => {
                    const active = formData.hora && slot.isSame(formData.hora, "minute");
                    return (
                      <button
                        key={slot.format("YYYY-MM-DD-HH-mm")}
                        type="button"
                        className={[
                          styles.timeSlot,
                          active ? styles.timeSlotActive : "",
                        ].filter(Boolean).join(" ")}
                        onClick={() => setFormData({ ...formData, hora: slot })}
                      >
                        {slot.format("HH:mm")}
                      </button>
                    );
                  };
                  return (
                    <>
                      {slotsManana.length > 0 && (
                        <div className={styles.timeSlotBlock}>
                          <span className={styles.timeSlotBlockTitle}>Mañana y mediodía</span>
                          <div className={styles.timeSlotGrid}>{slotsManana.map(renderSlot)}</div>
                        </div>
                      )}
                      {slotsTarde.length > 0 && (
                        <div className={styles.timeSlotBlock}>
                          <span className={styles.timeSlotBlockTitle}>Tarde</span>
                          <div className={styles.timeSlotGrid}>{slotsTarde.map(renderSlot)}</div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Disponibilidad de recursos */}
              <div className={styles.availabilityWrap}>
                {loadingDispo && (
                  <div className={styles.availabilityLoading}>
                    <Spin size="small" />
                    <span>Buscando disponibilidad…</span>
                  </div>
                )}
                {!loadingDispo && !dispoLoaded && (
                  <div className={styles.availabilityIdle}>
                    <AppstoreOutlined />
                    <span>Completá fecha, duración y horario para ver los recursos disponibles.</span>
                  </div>
                )}
                {!loadingDispo && dispoLoaded && disponibilidad.length === 0 && (
                  <Empty
                    description="No hay recursos disponibles para esos criterios"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                )}
                {!loadingDispo && dispoLoaded && disponibilidad.length > 0 && (
                  <>
                    <div className={styles.availabilityHeader}>
                      <span className={styles.availabilityTitle}>
                        <AppstoreOutlined /> Recursos
                      </span>
                      <span className={styles.availabilityCount}>
                        {availableCount} libre{availableCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {recursoGroupsByEspacio.map((grp) => (
                      <div key={grp.idEspacio} className={styles.espacioBlock}>
                        <span className={styles.espacioBlockTitle}>{grp.espacioNombre}</span>
                        <div className={styles.resourceSubgroups}>
                          {renderResourceSections(grp.sections)}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Paso 2: Confirmar */}
          {drawerStep === 2 && (
            <div className={styles.drawerStepBody}>
              <div className={styles.stepIntro}>
                <h3 className={styles.stepTitle}>Revisá los datos</h3>
                <p className={styles.stepSub}>
                  Si todo está bien, confirmá la reserva. Podés volver atrás para corregir cualquier campo.
                </p>
              </div>

              <div className={styles.summaryCard}>
                <div className={styles.summarySection}>
                  <span className={styles.summarySectionTitle}>
                    <UserOutlined /> Cliente
                  </span>
                  <div className={styles.summaryGrid}>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>DNI</span>
                      <span className={styles.summaryValue}>{formData.DNI || "-"}</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Nombre</span>
                      <span className={styles.summaryValue}>
                        {`${formData.Nombre || ""} ${formData.Apellido || ""}`.trim() || "-"}
                      </span>
                    </div>
                    {formData.Email && (
                      <div className={styles.summaryItem} style={{ gridColumn: "1 / -1" }}>
                        <span className={styles.summaryLabel}>Email</span>
                        <span className={styles.summaryValue}>{formData.Email}</span>
                      </div>
                    )}
                    {!editingId && (
                      <div className={styles.summaryItem} style={{ gridColumn: "1 / -1" }}>
                        <span className={styles.summaryLabel}>Estado</span>
                        <span className={styles.summaryValue}>
                          {clienteExistente ? (
                            <Tag color="green">Cliente existente</Tag>
                          ) : (
                            <Tag color="blue">Cliente nuevo (se creará)</Tag>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.summarySection}>
                  <span className={styles.summarySectionTitle}>
                    <CalendarOutlined /> Turno
                  </span>
                  <div className={styles.summaryGrid}>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Fecha</span>
                      <span className={styles.summaryValue}>
                        {formData.fecha ? formData.fecha.format("DD/MM/YYYY") : "-"}
                      </span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Horario</span>
                      <span className={styles.summaryValue}>
                        {formData.hora
                          ? `${formData.hora.format("HH:mm")} - ${formData.hora
                              .clone()
                              .add(formData.duracion, "minute")
                              .format("HH:mm")}`
                          : "-"}
                      </span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Duración</span>
                      <span className={styles.summaryValue}>
                        {formData.duracion ? etiquetaDuracion(formData.duracion) : "-"}
                      </span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Recurso</span>
                      <span className={styles.summaryValue}>
                        {(() => {
                          const r =
                            disponibilidad.find((x) => x.idRecurso === formData.idRecurso) ||
                            recursos.find((x) => x.idRecurso === formData.idRecurso);
                          return r ? r.Nombre : "-";
                        })()}
                      </span>
                    </div>
                    <div className={styles.summaryItem} style={{ gridColumn: "1 / -1" }}>
                      <span className={styles.summaryLabel}>Espacio</span>
                      <span className={styles.summaryValue}>
                        {(() => {
                          const r =
                            disponibilidad.find((x) => x.idRecurso === formData.idRecurso) ||
                            recursos.find((x) => x.idRecurso === formData.idRecurso);
                          if (!r) return "-";
                          return espacios.find((e) => e.Espacio === r.idEspacio)?.Nombre || "-";
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Drawer>
      </Content>
    </Layout>
  );
}
