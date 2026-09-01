import styles from "../../styles/public/registrocliente.module.css";
import Header from "../../components/header.jsx";
import Footer from "../../components/footer.jsx";
import "../../styles/global.css";
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  Steps,
  Button,
  DatePicker,
  Modal,
  message,
  Result,
  Empty,
  Spin,
} from "antd";
import ReservaModificacionAviso from "../../components/ReservaModificacionAviso.jsx";
import {
  duracionesValidasParaCalendario,
  etiquetaDuracion,
  iniciosDisponiblesParaDuracion,
  validarVentanaOperativaTurno,
  validarDiaReservaNoEnElPasadoLocal,
  validarInicioTurnoNoEnElPasadoLocal,
} from "../../utils/coworkingHours.js";
import { notifyReservasChanged } from "../../utils/boweSync.js";
import ComprarCreditosModal from "../../components/ComprarCreditosModal.jsx";
import { useCotizarReserva, useSaldoCreditos, useInvalidarCreditos } from "../../hooks/useCreditos.js";
import { etiquetaCreditos } from "../../utils/creditosFormato.js";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ExpandAltOutlined,
  CheckCircleOutlined,
  UserOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  ScheduleOutlined,
  FieldTimeOutlined,
  AppstoreOutlined,
  LockOutlined,
  DesktopOutlined,
  CoffeeOutlined,
  TeamOutlined,
  CloudOutlined,
  HomeOutlined,
} from "@ant-design/icons";

const { Step } = Steps;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const DIAS_SEMANA_ISO = [
  { v: 1, label: "Lunes" },
  { v: 2, label: "Martes" },
  { v: 3, label: "Miércoles" },
  { v: 4, label: "Jueves" },
  { v: 5, label: "Viernes" },
  { v: 6, label: "Sábado" },
  { v: 7, label: "Domingo" },
];

import img1 from "../../assets/espacios_sillas.png";
import img2 from "../../assets/espacios_sillones.png";
import img3 from "../../assets/oficina_individual.png";
import img4 from "../../assets/salareuniones.png";
import img5 from "../../assets/terrazarda.png";
import img6 from "../../assets/espacios_plantabaja.png";

const espacioImageMap = {
  "Planta Baja": img6,
  "Primer Piso": img3,
  Terraza: img5,
};
const fallbackImages = [img1, img2, img3, img4, img5, img6];

const RESOURCE_ICONS = {
  silla: <DesktopOutlined />,
  banco: <DesktopOutlined />,
  sillon: <CoffeeOutlined />,
  sillón: <CoffeeOutlined />,
  escritorio: <DesktopOutlined />,
  oficina: <HomeOutlined />,
  mesa: <CoffeeOutlined />,
  sala: <TeamOutlined />,
  terraza: <CloudOutlined />,
  planta: <AppstoreOutlined />,
};

function getResourceIcon(name) {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(RESOURCE_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return <AppstoreOutlined />;
}

const RESOURCE_COLORS = {
  silla: { bg: "#e8f4fd", border: "#91caff", text: "#0958d9" },
  banco: { bg: "#e8f4fd", border: "#91caff", text: "#0958d9" },
  sillon: { bg: "#fff7e6", border: "#ffd591", text: "#d46b08" },
  sillón: { bg: "#fff7e6", border: "#ffd591", text: "#d46b08" },
  escritorio: { bg: "#f6ffed", border: "#b7eb8f", text: "#389e0d" },
  oficina: { bg: "#f6ffed", border: "#b7eb8f", text: "#389e0d" },
  mesa: { bg: "#fff0f6", border: "#ffadd2", text: "#c41d7f" },
  sala: { bg: "#f9f0ff", border: "#d3adf7", text: "#722ed1" },
};

function getResourceColor(name) {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(RESOURCE_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return { bg: "#f5f7f9", border: "#e2e6ea", text: "#444" };
}

function formatPrecio(n) {
  if (!n || n <= 0) return null;
  return `$ ${Math.round(n).toLocaleString("es-AR")}`;
}

function getPrecioUnitario(recurso, tab, packTipo) {
  if (!recurso) return { valor: 0, etiqueta: "" };
  if (tab === "turno" || tab === "fijo") {
    const v = parseFloat(recurso.PrecioHora) || 0;
    return { valor: v, etiqueta: v > 0 ? `${formatPrecio(v)}/h` : "" };
  }
  if (packTipo === "semanal") {
    const v = parseFloat(recurso.PrecioSemanal) || 0;
    return { valor: v, etiqueta: v > 0 ? `${formatPrecio(v)}/sem` : "" };
  }
  if (packTipo === "mensual") {
    const v = parseFloat(recurso.PrecioMensual) || 0;
    return { valor: v, etiqueta: v > 0 ? `${formatPrecio(v)}/mes` : "" };
  }
  return { valor: 0, etiqueta: "" };
}

export default function RegistroCliente() {
  const { isAuthenticated, perfilCompleto, user, token, openAuthModal, loading: authLoading, authFetch } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("turno");
  const [step, setStep] = useState(0);

  const [disponibilidad, setDisponibilidad] = useState([]);
  const [espacios, setEspacios] = useState([]);
  const [loadingDispo, setLoadingDispo] = useState(false);
  const [selectedRecursosTurno, setSelectedRecursosTurno] = useState([]);
  const [selectedRecursoPack, setSelectedRecursoPack] = useState(null);
  const [fijoFechaInicio, setFijoFechaInicio] = useState(null);
  const [selectedRecursoFijo, setSelectedRecursoFijo] = useState(null);
  const [fijoCotizacion, setFijoCotizacion] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [reservaCreada, setReservaCreada] = useState(null);
  const [dispoLoaded, setDispoLoaded] = useState(false);

  const [turnoFecha, setTurnoFecha] = useState(null);
  const [turnoHora, setTurnoHora] = useState(null);
  const [turnoDuracion, setTurnoDuracion] = useState(null);

  const [packTipo, setPackTipo] = useState(null);
  const [packFechaInicio, setPackFechaInicio] = useState(null);

  const debounceRef = useRef(null);
  const topRef = useRef(null);

  const fijoDiaSemanaIso = useMemo(() => {
    if (!fijoFechaInicio) return null;
    const d = fijoFechaInicio.startOf("day");
    const dow = d.day();
    return dow === 0 ? 7 : dow;
  }, [fijoFechaInicio]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      openAuthModal("login");
    } else if (!perfilCompleto) {
      openAuthModal("completar-perfil");
    }
  }, [authLoading, isAuthenticated, perfilCompleto, openAuthModal]);

  // UX: cada vez que el usuario avanza/retrocede de paso o cambia el tipo de
  // reserva, llevamos la vista a la parte superior del contenido a interactuar
  // (descontando el header sticky). Evita quedar en una zona vacía y mejora la
  // experiencia, sobre todo en mobile. Respeta prefers-reduced-motion.
  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const behavior = prefersReduced ? "auto" : "smooth";
    const el = topRef.current;
    if (!el) {
      window.scrollTo({ top: 0, behavior });
      return;
    }
    const headerH = document.querySelector(".header")?.offsetHeight ?? 0;
    const top = el.getBoundingClientRect().top + window.scrollY - headerH - 12;
    window.scrollTo({ top: Math.max(top, 0), behavior });
  }, [step, activeTab]);

  const resetAll = useCallback(() => {
    setStep(0);
    setDisponibilidad([]);
    setEspacios([]);
    setSelectedRecursosTurno([]);
    setSelectedRecursoPack(null);
    setReservaCreada(null);
    setTurnoFecha(null);
    setTurnoHora(null);
    setTurnoDuracion(null);
    setPackTipo(null);
    setPackFechaInicio(null);
    setFijoFechaInicio(null);
    setSelectedRecursoFijo(null);
    setFijoCotizacion(null);
    setDispoLoaded(false);
  }, []);

  const switchTab = (tab) => {
    resetAll();
    setActiveTab(tab);
  };

  // Busca disponibilidad automáticamente cuando se completan los campos del turno
  useEffect(() => {
    if (activeTab !== "turno" || !turnoFecha || !turnoHora || !turnoDuracion) {
      if (activeTab === "turno") {
        setDisponibilidad([]);
        setDispoLoaded(false);
        setSelectedRecursosTurno([]);
      }
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchDispoTurno(), 400);
    return () => clearTimeout(debounceRef.current);
  }, [turnoFecha, turnoHora, turnoDuracion, activeTab]);

  // Busca disponibilidad automáticamente cuando se completan los campos del pack
  useEffect(() => {
    if (activeTab !== "pack" || !packTipo || !packFechaInicio) {
      if (activeTab === "pack") {
        setDisponibilidad([]);
        setDispoLoaded(false);
        setSelectedRecursoPack(null);
      }
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchDispoPack(), 400);
    return () => clearTimeout(debounceRef.current);
  }, [packTipo, packFechaInicio, activeTab]);

  const slotAnchorFijo = useMemo(() => {
    if (activeTab !== "fijo" || !fijoFechaInicio) return null;
    return fijoFechaInicio.startOf("day");
  }, [activeTab, fijoFechaInicio]);

  useEffect(() => {
    if (activeTab !== "fijo" || !fijoFechaInicio || !fijoDiaSemanaIso || !turnoHora || !turnoDuracion) {
      if (activeTab === "fijo") {
        setDisponibilidad([]);
        setDispoLoaded(false);
        setSelectedRecursoFijo(null);
      }
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchDispoFijo(), 400);
    return () => clearTimeout(debounceRef.current);
  }, [fijoFechaInicio, fijoDiaSemanaIso, turnoHora, turnoDuracion, activeTab]);

  useEffect(() => {
    if (activeTab !== "fijo" || !fijoFechaInicio || !fijoDiaSemanaIso || !selectedRecursoFijo || !turnoHora || !turnoDuracion) {
      if (activeTab === "fijo") setFijoCotizacion(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const horaIni = turnoHora.format("HH:mm");
        const horaFin = turnoHora.clone().add(turnoDuracion, "minute").format("HH:mm");
        const params = new URLSearchParams({
          fechaInicio: fijoFechaInicio.format("YYYY-MM-DD"),
          diaSemana: String(fijoDiaSemanaIso),
          idRecurso: String(selectedRecursoFijo.idRecurso),
          HorarioReserva: horaIni,
          HorarioFin: horaFin,
        });
        const res = await fetch(`${API_URL}/api/reservas/serie-mensual/cotizar?${params}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok) setFijoCotizacion(data);
        else setFijoCotizacion(null);
      } catch {
        setFijoCotizacion(null);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [activeTab, fijoFechaInicio, fijoDiaSemanaIso, selectedRecursoFijo, turnoHora, turnoDuracion]);

  useEffect(() => {
    const dateForSlots = activeTab === "fijo" ? slotAnchorFijo : turnoFecha;
    if ((activeTab !== "turno" && activeTab !== "fijo") || !dateForSlots || !turnoDuracion) return;
    const slots = iniciosDisponiblesParaDuracion(dateForSlots, turnoDuracion);
    setTurnoHora((prev) => {
      if (!prev) return prev;
      if (slots.some((s) => s.isSame(prev, "minute"))) return prev;
      return null;
    });
  }, [turnoFecha, turnoDuracion, activeTab, slotAnchorFijo]);

  const fetchDispoTurno = async () => {
    if (!turnoFecha || !turnoHora || !turnoDuracion) return;
    setLoadingDispo(true);
    setSelectedRecursosTurno([]);
    try {
      const horaIni = turnoHora.format("HH:mm");
      const horaFin = turnoHora.clone().add(turnoDuracion, "minute").format("HH:mm");
      const fecha = turnoFecha.format("YYYY-MM-DD");
      const url = `${API_URL}/api/recursos/disponibilidad?fecha=${fecha}&horaInicio=${horaIni}&horaFin=${horaFin}`;
      const res = await fetch(url);
      const data = await res.json();
      setDisponibilidad(data);
      setDispoLoaded(true);

      if (espacios.length === 0) {
        const espRes = await fetch(`${API_URL}/api/espacios`);
        const espData = await espRes.json();
        setEspacios(
          espData.map((e, i) => ({
            ...e,
            imagen: espacioImageMap[e.Nombre] || fallbackImages[i % fallbackImages.length],
          }))
        );
      }
    } catch {
      message.error("Error al consultar disponibilidad.");
    } finally {
      setLoadingDispo(false);
    }
  };

  const fetchDispoPack = async () => {
    if (!packTipo || !packFechaInicio) return;
    setLoadingDispo(true);
    setSelectedRecursoPack(null);
    try {
      const fecha = packFechaInicio.format("YYYY-MM-DD");
      const url = `${API_URL}/api/recursos/disponibilidad?tipo=${packTipo}&fechaInicio=${fecha}`;
      const res = await fetch(url);
      const data = await res.json();
      setDisponibilidad(data);
      setDispoLoaded(true);
    } catch {
      message.error("Error al consultar disponibilidad.");
    } finally {
      setLoadingDispo(false);
    }
  };

  const fetchDispoFijo = async () => {
    if (!fijoFechaInicio || !fijoDiaSemanaIso || !turnoHora || !turnoDuracion) return;
    const sample = fijoFechaInicio.startOf("day");
    setLoadingDispo(true);
    setSelectedRecursoFijo(null);
    try {
      const horaIni = turnoHora.format("HH:mm");
      const horaFin = turnoHora.clone().add(turnoDuracion, "minute").format("HH:mm");
      const fecha = sample.format("YYYY-MM-DD");
      const url = `${API_URL}/api/recursos/disponibilidad?fecha=${fecha}&horaInicio=${horaIni}&horaFin=${horaFin}`;
      const res = await fetch(url);
      const data = await res.json();
      setDisponibilidad(data);
      setDispoLoaded(true);
      if (espacios.length === 0) {
        const espRes = await fetch(`${API_URL}/api/espacios`);
        const espData = await espRes.json();
        setEspacios(
          espData.map((e, i) => ({
            ...e,
            imagen: espacioImageMap[e.Nombre] || fallbackImages[i % fallbackImages.length],
          }))
        );
      }
    } catch {
      message.error("Error al consultar disponibilidad.");
    } finally {
      setLoadingDispo(false);
    }
  };

  // Agrupa los recursos por espacio
  const recursoGroupsByEspacio = useMemo(() => {
    if (disponibilidad.length === 0) return [];

    const espacioIds = [...new Set(disponibilidad.map((r) => r.idEspacio))];

    return espacioIds.map((espId) => {
      const espData = espacios.find((e) => e.Espacio === espId);
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
        if (items.length > 1) {
          sections.push({ type: "visual-group", label: label + "s", items });
        } else {
          sections.push({ type: "standalone", item: items[0] });
        }
      });

      dbGroups.forEach((g) => {
        const children = recs.filter((r) => r.idRecursoPadre === g.idRecurso);
        sections.push({ type: "db-group", label: g.Nombre, items: children });
      });

      if (completoItems.length > 0) {
        sections.push({ type: "completo", items: completoItems });
      }

      return { espId, espData, sections };
    });
  }, [disponibilidad, espacios]);

  const availableCount = useMemo(
    () => disponibilidad.filter((r) => r.disponible === true).length,
    [disponibilidad]
  );

  const montoTotal = useMemo(() => {
    if (activeTab === "turno") {
      if (!turnoDuracion || selectedRecursosTurno.length === 0) return 0;
      return selectedRecursosTurno.reduce((acc, r) => {
        const ph = parseFloat(r.PrecioHora) || 0;
        return acc + ph * (turnoDuracion / 60);
      }, 0);
    }
    if (activeTab === "fijo") {
      return fijoCotizacion?.precioFinalTotal != null ? parseFloat(fijoCotizacion.precioFinalTotal) || 0 : 0;
    }
    if (!selectedRecursoPack) return 0;
    if (packTipo === "semanal") return parseFloat(selectedRecursoPack.PrecioSemanal) || 0;
    if (packTipo === "mensual") return parseFloat(selectedRecursoPack.PrecioMensual) || 0;
    return 0;
  }, [selectedRecursosTurno, selectedRecursoPack, activeTab, turnoDuracion, packTipo, fijoCotizacion]);

  useSaldoCreditos(token);
  const cotizar = useCotizarReserva(token);
  const invalidarCreditos = useInvalidarCreditos();

  const [cotizacion, setCotizacion] = useState(null);
  const [compraAbierta, setCompraAbierta] = useState(false);
  const [creditosFaltantes, setCreditosFaltantes] = useState(0);

  // El total en créditos se recalcula en cada cambio de selección: el cliente
  // ve qué le va a costar antes de confirmar. Solo turno y pack cotizan en vivo;
  // fijo tiene su propio endpoint de cotización de serie mensual.
  useEffect(() => {
    const items =
      activeTab === "turno"
        ? selectedRecursosTurno.map((r) => ({ idRecurso: r.idRecurso }))
        : activeTab === "pack" && selectedRecursoPack
          ? [{ idRecurso: selectedRecursoPack.idRecurso }]
          : [];

    const fechaBase = activeTab === "turno" ? turnoFecha : activeTab === "pack" ? packFechaInicio : null;

    if (!token || activeTab === "fijo" || items.length === 0 || !fechaBase) {
      setCotizacion(null);
      return;
    }

    let cancelado = false;
    cotizar
      .mutateAsync({
        items,
        DiaReserva: fechaBase.format("YYYY-MM-DD"),
        HorarioReserva: activeTab === "turno" && turnoHora ? turnoHora.format("HH:mm") : null,
        HorarioFin:
          activeTab === "turno" && turnoHora && turnoDuracion
            ? turnoHora.clone().add(turnoDuracion, "minute").format("HH:mm")
            : null,
        TipoReserva: activeTab === "turno" ? "turno" : packTipo,
      })
      .then((r) => {
        if (!cancelado) setCotizacion(r);
      })
      .catch(() => {
        if (!cancelado) setCotizacion(null);
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    token,
    activeTab,
    selectedRecursosTurno,
    selectedRecursoPack,
    packTipo,
    turnoFecha,
    packFechaInicio,
    turnoHora,
    turnoDuracion,
  ]);

  const submitReserva = async () => {
    if (!user || !perfilCompleto) return false;
    if (activeTab === "turno" && selectedRecursosTurno.length === 0) return false;
    if (activeTab === "pack" && !selectedRecursoPack) return false;
    if (activeTab === "fijo" && !selectedRecursoFijo) return false;

    const isTurno = activeTab === "turno";

    setSubmitting(true);
    try {
      if (activeTab === "fijo") {
        const horaIni = turnoHora.format("HH:mm");
        const horaFin = turnoHora.clone().add(turnoDuracion, "minute").format("HH:mm");
        const ventanaErr = validarVentanaOperativaTurno(horaIni, horaFin);
        if (ventanaErr) {
          message.error(ventanaErr);
          return false;
        }
        if (!slotAnchorFijo || !fijoFechaInicio || fijoDiaSemanaIso == null) {
          message.error("Elegí la fecha (día hábil) y el horario para los 4 turnos semanales.");
          return false;
        }

        const reservaRes = await authFetch(`${API_URL}/api/reservas/serie-mensual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fechaInicio: fijoFechaInicio.format("YYYY-MM-DD"),
            diaSemana: fijoDiaSemanaIso,
            idRecurso: selectedRecursoFijo.idRecurso,
            HorarioReserva: horaIni,
            HorarioFin: horaFin,
          }),
        });
        const data = await reservaRes.json().catch(() => ({}));
        if (!reservaRes.ok) {
          if (reservaRes.status === 409 && data?.codigo === "SALDO_INSUFICIENTE") {
            setCreditosFaltantes(data.creditosFaltantes ?? 0);
            setCompraAbierta(true);
            message.warning(data.message);
            return false;
          }
          message.error(data.fechaConflictiva ? `${data.message} (${data.fechaConflictiva})` : data.message || "Error al crear la reserva fija");
          return false;
        }
        const espNombre =
          espacios.find((e) => e.Espacio === selectedRecursoFijo.idEspacio)?.Nombre ||
          selectedRecursoFijo.espacio_nombre ||
          "";
        const diaLabel = DIAS_SEMANA_ISO.find((d) => d.v === fijoDiaSemanaIso)?.label || "";
        setReservaCreada({
          serie: true,
          idSerie: data.idSerie,
          id: data.idReservaPago,
          monto: parseFloat(data.precioFinalTotal) || 0,
          nOcurrencias: data.nOcurrencias,
          creditos: data.creditos,
          tipo: "fijo_mensual",
          espacio: espNombre,
          recurso: selectedRecursoFijo.Nombre,
          cliente: `${user.nombre} ${user.apellido}`,
          email: user.email,
          periodoLabel: `${data.fechaInicio || fijoFechaInicio.format("YYYY-MM-DD")} → ${data.periodoHasta || ""}`,
          diaLabel,
          horaInicio: horaIni,
          horaFin: horaFin,
        });
        invalidarCreditos();
        setStep(2);
        notifyReservasChanged();
        return true;
      }

      if (isTurno) {
        const horaIni = turnoHora.format("HH:mm");
        const horaFin = turnoHora.clone().add(turnoDuracion, "minute").format("HH:mm");
        const ventanaErr = validarVentanaOperativaTurno(horaIni, horaFin);
        if (ventanaErr) {
          message.error(ventanaErr);
          return false;
        }
        const errDia = validarDiaReservaNoEnElPasadoLocal(turnoFecha);
        if (errDia) {
          message.error(errDia);
          return false;
        }
        const errPasado = validarInicioTurnoNoEnElPasadoLocal(turnoFecha, horaIni);
        if (errPasado) {
          message.error(errPasado);
          return false;
        }
      } else if (activeTab === "pack") {
        const errPack = validarDiaReservaNoEnElPasadoLocal(packFechaInicio);
        if (errPack) {
          message.error(errPack);
          return false;
        }
      }

      if (isTurno && selectedRecursosTurno.length > 1) {
        const horaIni = turnoHora.format("HH:mm");
        const horaFin = turnoHora.clone().add(turnoDuracion, "minute").format("HH:mm");
        const reservaRes = await authFetch(`${API_URL}/api/reservas/multiples`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            DNI: user.dni,
            Nombre: `${user.nombre} ${user.apellido}`,
            DiaReserva: turnoFecha.format("YYYY-MM-DD"),
            HorarioReserva: horaIni,
            HorarioFin: horaFin,
            items: selectedRecursosTurno.map((r) => ({ idRecurso: r.idRecurso })),
          }),
        });
        const data = await reservaRes.json().catch(() => ({}));
        if (!reservaRes.ok) {
          if (reservaRes.status === 409 && data?.codigo === "SALDO_INSUFICIENTE") {
            setCreditosFaltantes(data.creditosFaltantes ?? 0);
            setCompraAbierta(true);
            message.warning(data.message);
            return false;
          }
          message.error(data.message || "Error al crear reservas");
          return false;
        }
        const rows = data.reservas || [];
        const montoSum = rows.reduce((a, r) => a + (parseFloat(r.Monto) || 0), 0);
        const espNombre =
          espacios.find((e) => e.Espacio === selectedRecursosTurno[0].idEspacio)?.Nombre ||
          selectedRecursosTurno[0].espacio_nombre ||
          "";
        const idReservaGrupo = Math.min(...rows.map((r) => Number(r.idReserva)));
        setReservaCreada({
          multiple: true,
          ids: rows.map((r) => r.idReserva),
          idReservaGrupo,
          monto: montoSum,
          creditos: data.creditos,
          tipo: "turno",
          espacio: espNombre,
          recursos: selectedRecursosTurno.map((r) => r.Nombre),
          cliente: `${user.nombre} ${user.apellido}`,
          email: user.email,
          fecha: turnoFecha.format("DD/MM/YYYY"),
          horaInicio: turnoHora.format("HH:mm"),
          horaFin: turnoHora.clone().add(turnoDuracion, "minute").format("HH:mm"),
        });
        invalidarCreditos();
        setStep(2);
        notifyReservasChanged();
        return true;
      }

      const body = {
        DNI: user.dni,
        Nombre: `${user.nombre} ${user.apellido}`,
        idRecurso: isTurno ? selectedRecursosTurno[0].idRecurso : selectedRecursoPack.idRecurso,
        TipoReserva: isTurno ? "turno" : packTipo,
      };

      if (isTurno) {
        body.DiaReserva = turnoFecha.format("YYYY-MM-DD");
        body.HorarioReserva = turnoHora.format("HH:mm");
        body.HorarioFin = turnoHora.clone().add(turnoDuracion, "minute").format("HH:mm");
      } else {
        body.DiaReserva = packFechaInicio.format("YYYY-MM-DD");
        body.HorarioReserva = null;
        body.HorarioFin = null;
      }

      const reservaRes = await authFetch(`${API_URL}/api/reservas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await reservaRes.json().catch(() => ({}));
      if (!reservaRes.ok) {
        if (reservaRes.status === 409 && data?.codigo === "SALDO_INSUFICIENTE") {
          setCreditosFaltantes(data.creditosFaltantes ?? 0);
          setCompraAbierta(true);
          message.warning(data.message);
          return false;
        }
        message.error(data.message || "Error al crear reserva");
        return false;
      }

      const sel = isTurno ? selectedRecursosTurno[0] : selectedRecursoPack;
      const espNombre =
        espacios.find((e) => e.Espacio === sel.idEspacio)?.Nombre ||
        sel.espacio_nombre ||
        "";

      const monto = parseFloat(data.Monto) || 0;

      if (isTurno) {
        setReservaCreada({
          id: data.idReserva,
          monto,
          creditos: data.creditos,
          tipo: "turno",
          espacio: espNombre,
          recurso: sel.Nombre,
          cliente: `${user.nombre} ${user.apellido}`,
          email: user.email,
          fecha: turnoFecha.format("DD/MM/YYYY"),
          horaInicio: turnoHora.format("HH:mm"),
          horaFin: turnoHora.clone().add(turnoDuracion, "minute").format("HH:mm"),
        });
      } else {
        const inicio = packFechaInicio;
        const fin = inicio.clone().add(packTipo === "semanal" ? 7 : 30, "day");
        setReservaCreada({
          id: data.idReserva,
          monto,
          creditos: data.creditos,
          tipo: packTipo,
          espacio: "Primer Piso",
          recurso: sel.Nombre,
          cliente: `${user.nombre} ${user.apellido}`,
          email: user.email,
          fechaInicio: inicio.format("DD/MM/YYYY"),
          fechaFin: fin.format("DD/MM/YYYY"),
        });
      }

      invalidarCreditos();
      setStep(2);
      notifyReservasChanged();
      return true;
    } catch {
      message.error("Error al conectar con el servidor");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const pedirConfirmacionReserva = () => {
    Modal.confirm({
      title: "¿Confirmar la reserva?",
      content:
        "Vas a registrar esta reserva con los datos mostrados. ¿Estás seguro de continuar?",
      okText: "Sí, confirmar",
      cancelText: "Cancelar",
      centered: true,
      okButtonProps: { className: styles.btnPrimary },
      onOk: async () => {
        const ok = await submitReserva();
        if (!ok) throw new Error("reserva-no-completada");
      },
    });
  };

  // Tarjeta de cada recurso seleccionable
  const renderResourceCard = (r) => {
    const isGrupo = r.esGrupo;
    const available = r.disponible !== false;
    const disabled = isGrupo || !available;
    const color = getResourceColor(r.Nombre);
    const icon = getResourceIcon(r.Nombre);
    const selected =
      activeTab === "turno"
        ? selectedRecursosTurno.some((x) => x.idRecurso === r.idRecurso)
        : activeTab === "fijo"
          ? selectedRecursoFijo?.idRecurso === r.idRecurso
          : selectedRecursoPack?.idRecurso === r.idRecurso;

    const precio = getPrecioUnitario(r, activeTab, packTipo);

    const onPick = () => {
      if (disabled) return;
      if (activeTab === "turno") {
        setSelectedRecursosTurno((prev) => {
          const has = prev.some((x) => x.idRecurso === r.idRecurso);
          if (has) return prev.filter((x) => x.idRecurso !== r.idRecurso);
          return [...prev, r];
        });
      } else if (activeTab === "fijo") {
        setSelectedRecursoFijo(r);
      } else {
        setSelectedRecursoPack(r);
      }
    };

    return (
      <button
        key={r.idRecurso}
        type="button"
        disabled={disabled}
        className={[
          styles.resourceCard,
          r.esCompleto ? styles.resourceCardCompleto : "",
          selected ? styles.resourceCardActive : "",
          disabled ? styles.resourceCardDisabled : "",
        ].filter(Boolean).join(" ")}
        style={!selected && !disabled ? { background: color.bg, borderColor: color.border } : undefined}
        onClick={onPick}
      >
        <span className={styles.resourceCardIcon} style={!selected ? { color: color.text } : undefined}>
          {r.esCompleto ? <ExpandAltOutlined /> : icon}
        </span>
        <span className={styles.resourceCardName}>{r.Nombre}</span>
        {!isGrupo && precio.etiqueta && (
          <span className={styles.resourceCardPrice}>{precio.etiqueta}</span>
        )}
        {!available && !isGrupo && <span className={styles.resourceCardBadge}>Ocupado</span>}
        {available && !isGrupo && <span className={styles.resourceCardAvail}>Disponible</span>}
      </button>
    );
  };

  const renderSections = (sections) =>
    sections.map((section, idx) => {
      if (section.type === "visual-group") {
        return (
          <div key={section.label} className={styles.resourceSection} style={{ animationDelay: `${idx * 70}ms` }}>
            <span className={styles.resourceSectionLabel}>{section.label}</span>
            <div className={styles.resourceGrid}>{section.items.map(renderResourceCard)}</div>
          </div>
        );
      }
      if (section.type === "db-group") {
        return (
          <div key={section.label} className={styles.resourceSection} style={{ animationDelay: `${idx * 70}ms` }}>
            <span className={styles.resourceSectionLabel}>{section.label}</span>
            <div className={styles.resourceGrid}>{section.items.map(renderResourceCard)}</div>
          </div>
        );
      }
      if (section.type === "standalone") {
        return (
          <div key={section.item.idRecurso} className={styles.resourceSection} style={{ animationDelay: `${idx * 70}ms` }}>
            <div className={styles.resourceGrid}>{renderResourceCard(section.item)}</div>
          </div>
        );
      }
      if (section.type === "completo") {
        return (
          <div key="completo" className={styles.resourceDivider} style={{ animationDelay: `${idx * 70}ms` }}>
            <div className={styles.dividerLine} />
            <span className={styles.resourceSectionLabel}>Espacio completo</span>
            <div className={styles.resourceGrid}>{section.items.map(renderResourceCard)}</div>
          </div>
        );
      }
      return null;
    });

  // Pantalla de acceso (cuando no hay sesión)
  const renderAuthGate = () => (
    <div className={styles.authGate}>
      <LockOutlined className={styles.authGateIcon} />
      <h2 className={styles.authGateTitle}>Inicia sesion para reservar</h2>
      <p className={styles.authGateSub}>
        Para reservar un espacio necesitas iniciar sesion o crear una cuenta.
      </p>
      <div className={styles.authGateButtons}>
        <Button type="primary" className={styles.btnPrimary} size="large" onClick={() => openAuthModal("login")}>
          Iniciar sesion
        </Button>
        <Button size="large" onClick={() => openAuthModal("register")}>
          Registrarse
        </Button>
      </div>
    </div>
  );

  if (authLoading) {
    return (
      <div>
        <Header />
        <main className={styles.wrapper}>
          <div style={{ textAlign: "center", padding: "4rem" }}><Spin size="large" /></div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated || !perfilCompleto) {
    return (
      <div>
        <Header />
        <main className={styles.wrapper}>
          <h1 className={styles.mainHeader}>
            Reserva tu <span className={styles.textEspacio}>Espacio</span>
          </h1>
          {renderAuthGate()}
        </main>
        <Footer />
      </div>
    );
  }

  // Paso 0: fecha/horario y disponibilidad en línea
  const renderStep0 = () => {
    const isTurno = activeTab === "turno";
    const isFijo = activeTab === "fijo";
    const duracionesUi = duracionesValidasParaCalendario();
    const dateForSlots = isFijo ? slotAnchorFijo : turnoFecha;
    const slotsInicio =
      dateForSlots && turnoDuracion ? iniciosDisponiblesParaDuracion(dateForSlots, turnoDuracion) : [];
    const slotsManana = slotsInicio.filter((s) => s.hour() < 14);
    const slotsTarde = slotsInicio.filter((s) => s.hour() >= 14);
    const stepFechaOk = isTurno ? !!turnoFecha : isFijo ? !!fijoFechaInicio : true;
    const stepDuracionOk = !!turnoDuracion;
    const stepHoraOk = !!turnoHora;

    const renderTimeSlotBtn = (slot) => {
      const active = turnoHora && slot.isSame(turnoHora, "minute");
      return (
        <button
          key={slot.format("YYYY-MM-DD-HH-mm")}
          type="button"
          className={[styles.timeSlot, active ? styles.timeSlotActive : ""].filter(Boolean).join(" ")}
          onClick={() => setTurnoHora(slot)}
        >
          {slot.format("HH:mm")}
        </button>
      );
    };

    return (
      <div className={styles.dateStep}>
        {isTurno ? (
          <>
            <div className={styles.bookingHero}>
              <h2 className={styles.dateStepTitle}>¿Cuándo querés reservar?</h2>
              <p className={styles.dateStepSub}>
                Elegí fecha, duración e inicio. Solo verás horarios válidos hasta las 21:00. Podés marcar varios
                lugares abajo si venís acompañado.
              </p>
              <span className={styles.hoursBadge} title="Horario operativo del coworking">
                <ClockCircleOutlined aria-hidden /> 09:00 – 21:00 hs
              </span>
            </div>

            <div className={styles.bookingFormCard}>
              <div className={styles.bookingStepRail} aria-hidden>
                <div className={styles.bookingStepItem}>
                  <span
                    className={[
                      styles.bookingStepDot,
                      stepFechaOk ? styles.bookingStepDotDone : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {stepFechaOk ? "✓" : "1"}
                  </span>
                  <span className={styles.bookingStepLabel}>Día</span>
                </div>
                <span className={styles.bookingStepConnector} />
                <div className={styles.bookingStepItem}>
                  <span
                    className={[
                      styles.bookingStepDot,
                      stepDuracionOk ? styles.bookingStepDotDone : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {stepDuracionOk ? "✓" : "2"}
                  </span>
                  <span className={styles.bookingStepLabel}>Duración</span>
                </div>
                <span className={styles.bookingStepConnector} />
                <div className={styles.bookingStepItem}>
                  <span
                    className={[
                      styles.bookingStepDot,
                      stepHoraOk ? styles.bookingStepDotDone : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {stepHoraOk ? "✓" : "3"}
                  </span>
                  <span className={styles.bookingStepLabel}>Inicio</span>
                </div>
              </div>

              <div className={styles.bookingSection}>
                <div className={styles.fieldLabelRow}>
                  <span className={styles.fieldLabelIcon}><CalendarOutlined /></span>
                  <label className={styles.fieldLabel} htmlFor="reserva-fecha">Fecha</label>
                </div>
                <div className={styles.dateInputShell}>
                  <DatePicker
                    id="reserva-fecha"
                    format="DD/MM/YYYY"
                    className={styles.datePickerFull}
                    placeholder="Seleccioná el día"
                    value={turnoFecha}
                    onChange={setTurnoFecha}
                    disabledDate={(d) => d && d.isBefore(dayjs().startOf("day"))}
                    getPopupContainer={(n) => n.parentElement || document.body}
                  />
                </div>
              </div>

              <div className={styles.bookingSection}>
                <div className={styles.fieldLabelRow}>
                  <span className={styles.fieldLabelIcon}><FieldTimeOutlined /></span>
                  <span className={styles.fieldLabel}>Duración</span>
                </div>
                <div className={styles.durationChips}>
                  {duracionesUi.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={[
                        styles.durationChip,
                        turnoDuracion === d ? styles.durationChipActive : "",
                      ].join(" ")}
                      onClick={() => setTurnoDuracion(d)}
                    >
                      {etiquetaDuracion(d)}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`${styles.bookingSection} ${styles.bookingSectionLast}`}>
                <div className={styles.fieldLabelRow}>
                  <span className={styles.fieldLabelIcon}><ScheduleOutlined /></span>
                  <span className={styles.fieldLabel}>Hora de inicio</span>
                </div>
                {!turnoFecha && (
                  <div className={styles.fieldHintBox}>
                    <p className={styles.fieldHint}>Elegí primero la fecha para continuar.</p>
                  </div>
                )}
                {turnoFecha && !turnoDuracion && (
                  <div className={styles.fieldHintBox}>
                    <p className={styles.fieldHint}>Elegí cuánto tiempo vas a quedar para ver los horarios.</p>
                  </div>
                )}
                {turnoFecha && turnoDuracion && slotsInicio.length === 0 && (
                  <div className={styles.fieldHintBox}>
                    <p className={styles.fieldHintWarn}>
                      No hay inicio posible para esta duración sin pasar las 21:00. Probá otra duración o fecha.
                    </p>
                  </div>
                )}
                {slotsManana.length > 0 && (
                  <div className={styles.timeSlotBlock}>
                    <span className={styles.timeSlotBlockTitle}>Mañana y mediodía</span>
                    <div className={styles.timeSlotGrid}>{slotsManana.map(renderTimeSlotBtn)}</div>
                  </div>
                )}
                {slotsTarde.length > 0 && (
                  <div className={styles.timeSlotBlock}>
                    <span className={styles.timeSlotBlockTitle}>Tarde</span>
                    <div className={styles.timeSlotGrid}>{slotsTarde.map(renderTimeSlotBtn)}</div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : isFijo ? (
          <>
            <div className={styles.bookingHero}>
              <h2 className={styles.dateStepTitle}>Tu horario fijo: 4 semanas</h2>
              <p className={styles.dateStepSub}>
                Elegí en el calendario el día del primer turno: ese mismo día de la semana se repite en las 4 semanas
                seguidas (solo días hábiles). Un solo pago con descuento vía Mercado Pago.
              </p>
              <span className={styles.hoursBadge} title="Horario operativo del coworking">
                <ClockCircleOutlined aria-hidden /> 09:00 – 21:00 hs
              </span>
            </div>
            <div className={styles.bookingFormCard}>
              <div className={styles.bookingSection}>
                <div className={styles.fieldLabelRow}>
                  <span className={styles.fieldLabelIcon}><CalendarOutlined /></span>
                  <label className={styles.fieldLabel} htmlFor="fijo-inicio">Fecha del primer turno</label>
                </div>
                <div className={styles.dateInputShell}>
                  <DatePicker
                    id="fijo-inicio"
                    format="DD/MM/YYYY"
                    className={styles.datePickerFull}
                    placeholder="Desde qué día"
                    value={fijoFechaInicio}
                    onChange={setFijoFechaInicio}
                    disabledDate={(d) => {
                      if (!d) return false;
                      if (d.isBefore(dayjs().startOf("day"))) return true;
                      const dow = d.day();
                      return dow === 0 || dow === 6;
                    }}
                    getPopupContainer={(n) => n.parentElement || document.body}
                  />
                </div>
              </div>
              <div className={styles.bookingSection}>
                <div className={styles.fieldLabelRow}>
                  <span className={styles.fieldLabelIcon}><FieldTimeOutlined /></span>
                  <span className={styles.fieldLabel}>Duración</span>
                </div>
                <div className={styles.durationChips}>
                  {duracionesUi.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={[
                        styles.durationChip,
                        turnoDuracion === d ? styles.durationChipActive : "",
                      ].join(" ")}
                      onClick={() => setTurnoDuracion(d)}
                    >
                      {etiquetaDuracion(d)}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`${styles.bookingSection} ${styles.bookingSectionLast}`}>
                <div className={styles.fieldLabelRow}>
                  <span className={styles.fieldLabelIcon}><ScheduleOutlined /></span>
                  <span className={styles.fieldLabel}>Hora de inicio</span>
                </div>
                {!fijoFechaInicio && (
                  <div className={styles.fieldHintBox}>
                    <p className={styles.fieldHint}>Elegí la fecha del primer turno (lun–vie); ese día se repetirá cada semana.</p>
                  </div>
                )}
                {slotAnchorFijo && !turnoDuracion && (
                  <div className={styles.fieldHintBox}>
                    <p className={styles.fieldHint}>Elegí la duración de cada turno.</p>
                  </div>
                )}
                {slotAnchorFijo && turnoDuracion && slotsInicio.length === 0 && (
                  <div className={styles.fieldHintBox}>
                    <p className={styles.fieldHintWarn}>
                      No hay inicio posible para esta duración sin pasar las 21:00. Probá otra duración.
                    </p>
                  </div>
                )}
                {slotsManana.length > 0 && (
                  <div className={styles.timeSlotBlock}>
                    <span className={styles.timeSlotBlockTitle}>Mañana y mediodía</span>
                    <div className={styles.timeSlotGrid}>{slotsManana.map(renderTimeSlotBtn)}</div>
                  </div>
                )}
                {slotsTarde.length > 0 && (
                  <div className={styles.timeSlotBlock}>
                    <span className={styles.timeSlotBlockTitle}>Tarde</span>
                    <div className={styles.timeSlotGrid}>{slotsTarde.map(renderTimeSlotBtn)}</div>
                  </div>
                )}
              </div>
              {fijoCotizacion && fijoCotizacion.nOcurrencias > 0 && (
                <div className={styles.fieldHintBox} style={{ marginTop: 8 }}>
                  <p className={styles.fieldHint}>
                    {fijoCotizacion.nOcurrencias} turno{fijoCotizacion.nOcurrencias !== 1 ? "s" : ""} (4 semanas)
                    {fijoCotizacion.precioListaTotal != null && fijoCotizacion.precioFinalTotal != null ? (
                      <>
                        {" "}
                        · Lista {formatPrecio(fijoCotizacion.precioListaTotal)} → con descuento{" "}
                        <strong>{formatPrecio(fijoCotizacion.precioFinalTotal)}</strong>
                      </>
                    ) : null}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className={styles.bookingHero}>
              <h2 className={styles.dateStepTitle}>Packs de oficina privada</h2>
              <p className={styles.dateStepSub}>
                Reservá un escritorio o la oficina completa por semana o mes.
              </p>
            </div>
            <div className={styles.bookingFormCard}>
              <div className={styles.packCardsRow}>
                <button
                  type="button"
                  className={[styles.packCard, packTipo === "semanal" ? styles.packCardActive : ""].join(" ")}
                  onClick={() => setPackTipo("semanal")}
                >
                  <CalendarOutlined className={styles.packCardIcon} />
                  <span className={styles.packCardTitle}>Semanal</span>
                  <span className={styles.packCardDesc}>7 días continuos</span>
                </button>
                <button
                  type="button"
                  className={[styles.packCard, packTipo === "mensual" ? styles.packCardActive : ""].join(" ")}
                  onClick={() => setPackTipo("mensual")}
                >
                  <CalendarOutlined className={styles.packCardIcon} />
                  <span className={styles.packCardTitle}>Mensual</span>
                  <span className={styles.packCardDesc}>30 días continuos</span>
                </button>
              </div>
              <div className={styles.packDateRowInner}>
                <div className={styles.fieldLabelRow}>
                  <span className={styles.fieldLabelIcon}><CalendarOutlined /></span>
                  <label className={styles.fieldLabel} htmlFor="pack-fecha-inicio">Fecha de inicio</label>
                </div>
                <div className={styles.dateInputShell}>
                  <DatePicker
                    id="pack-fecha-inicio"
                    format="DD/MM/YYYY"
                    className={styles.datePickerFull}
                    placeholder="¿Desde cuándo?"
                    value={packFechaInicio}
                    onChange={setPackFechaInicio}
                    disabledDate={(d) => d && d.isBefore(dayjs().startOf("day"))}
                    getPopupContainer={(n) => n.parentElement || document.body}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Resultados de disponibilidad */}
        <div className={styles.availabilitySection}>
          {loadingDispo && (
            <div className={styles.availabilityLoading}>
              <Spin /> <span>Buscando espacios disponibles...</span>
            </div>
          )}

          {!loadingDispo && dispoLoaded && disponibilidad.length === 0 && (
            <Empty description="No hay espacios disponibles para estos criterios. Proba con otra fecha u horario." />
          )}

          {!loadingDispo && dispoLoaded && disponibilidad.length > 0 && (
            <>
              <div className={styles.availabilityHeader}>
                <h3 className={styles.availabilityTitle}>
                  <AppstoreOutlined /> Espacios disponibles
                </h3>
                <span className={styles.availabilityCount}>
                  {availableCount} disponible{availableCount !== 1 ? "s" : ""}
                </span>
              </div>

              {(isTurno || isFijo) ? (
                recursoGroupsByEspacio.map(({ espId, espData, sections }) => (
                  <div key={espId} className={styles.espacioSection}>
                    <div className={styles.espacioSectionHeader}>
                      {espData?.imagen && (
                        <img src={espData.imagen} alt={espData?.Nombre} className={styles.espacioSectionImg} />
                      )}
                      <h3 className={styles.espacioSectionName}>{espData?.Nombre || `Espacio ${espId}`}</h3>
                    </div>
                    <div className={styles.resourcePicker}>{renderSections(sections)}</div>
                  </div>
                ))
              ) : (
                <div className={styles.espacioSection}>
                  <div className={styles.espacioSectionHeader}>
                    <img src={img3} alt="Oficina Privada" className={styles.espacioSectionImg} />
                    <h3 className={styles.espacioSectionName}>Oficina Privada - Primer Piso</h3>
                  </div>
                  <div className={styles.resourcePicker}>
                    <div className={styles.resourceGrid}>
                      {disponibilidad.map((r) => renderResourceCard(r))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {((isTurno && selectedRecursosTurno.length > 0) || (isFijo && selectedRecursoFijo) || (activeTab === "pack" && selectedRecursoPack)) && (
          <div className={styles.selectedBar}>
            <span>
              {isTurno ? (
                <>
                  Seleccionaste{" "}
                  <strong>
                    {selectedRecursosTurno.length === 1
                      ? selectedRecursosTurno[0].Nombre
                      : `${selectedRecursosTurno.length} lugares`}
                  </strong>
                  {selectedRecursosTurno.length > 1 && (
                    <span className={styles.fieldHint} style={{ display: "block", marginTop: 4 }}>
                      {selectedRecursosTurno.map((r) => r.Nombre).join(" · ")}
                    </span>
                  )}
                </>
              ) : isFijo ? (
                <>
                  Horario fijo (4 sem.): <strong>{selectedRecursoFijo.Nombre}</strong>
                </>
              ) : (
                <>
                  Seleccionaste: <strong>{selectedRecursoPack.Nombre}</strong>
                </>
              )}
              {montoTotal > 0 && (
                <span className={styles.selectedBarPrice}>{formatPrecio(montoTotal)}</span>
              )}
              {cotizacion && (
                <div className={styles.fieldHint}>
                  Costo: <strong>{etiquetaCreditos(cotizacion.creditosNecesarios)}</strong>
                  {" · "}
                  Tu saldo: {etiquetaCreditos(cotizacion.saldo)}
                  {!cotizacion.alcanza && (
                    <>
                      {" · "}
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0 }}
                        onClick={() => {
                          setCreditosFaltantes(cotizacion.creditosFaltantes);
                          setCompraAbierta(true);
                        }}
                      >
                        Te faltan {cotizacion.creditosFaltantes}: comprar créditos
                      </Button>
                    </>
                  )}
                </div>
              )}
            </span>
            <Button
              type="primary"
              className={`${styles.btnPrimary} ${styles.btnContinuar}`}
              onClick={() => setStep(1)}
              size="large"
            >
              <span className={styles.btnLabelInline}>
                Continuar
                <ArrowRightOutlined aria-hidden />
              </span>
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Paso 1: resumen del perfil y confirmación
  const renderStep1 = () => {
    const sel =
      activeTab === "turno"
        ? selectedRecursosTurno[0]
        : activeTab === "fijo"
          ? selectedRecursoFijo
          : selectedRecursoPack;
    const espNombre =
      espacios.find((e) => e.Espacio === sel?.idEspacio)?.Nombre ||
      sel?.espacio_nombre ||
      (activeTab === "pack" ? "Primer Piso" : "");
    const nombresTurno =
      activeTab === "turno" && selectedRecursosTurno.length > 1
        ? selectedRecursosTurno.map((r) => r.Nombre).join(", ")
        : sel?.Nombre;
    return (
      <div className={styles.datosStep}>
        <ReservaModificacionAviso className={styles.reservaAvisoTop} />
        <div className={styles.resumenMini}>
          <span className={styles.resumenTag}>{espNombre}</span>
          <span className={styles.resumenSep}>&#8250;</span>
          <span className={styles.resumenTag}>{nombresTurno}</span>
          {activeTab === "turno" && (
            <>
              <span className={styles.resumenSep}>&#183;</span>
              <span className={styles.resumenTag}>
                {turnoFecha?.format("DD/MM")} {turnoHora?.format("HH:mm")}-
                {turnoHora?.clone().add(turnoDuracion, "minute").format("HH:mm")}
              </span>
            </>
          )}
          {activeTab === "fijo" && fijoFechaInicio && (
            <>
              <span className={styles.resumenSep}>&#183;</span>
              <span className={styles.resumenTag}>
                Desde {fijoFechaInicio.format("DD/MM/YYYY")} (4 semanas) ·{" "}
                {DIAS_SEMANA_ISO.find((d) => d.v === fijoDiaSemanaIso)?.label} ·{" "}
                {turnoHora?.format("HH:mm")}-{turnoHora?.clone().add(turnoDuracion, "minute").format("HH:mm")}
              </span>
            </>
          )}
          {activeTab === "pack" && (
            <>
              <span className={styles.resumenSep}>&#183;</span>
              <span className={styles.resumenTag}>
                Pack {packTipo} desde {packFechaInicio?.format("DD/MM/YYYY")}
              </span>
            </>
          )}
          {montoTotal > 0 && (
            <>
              <span className={styles.resumenSep}>&#183;</span>
              <span className={styles.resumenTag} style={{ background: "#e8f5e9", color: "#2e7d32" }}>
                {formatPrecio(montoTotal)}
              </span>
            </>
          )}
        </div>

        <div className={styles.formulario}>
          <h3 className={styles.profileSummaryTitle}>Reservando como</h3>
          <div className={styles.profileSummaryGrid}>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Nombre</span>
              <span className={styles.resumenValue}>{user.nombre} {user.apellido}</span>
            </div>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>DNI</span>
              <span className={styles.resumenValue}>{user.dni}</span>
            </div>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Email</span>
              <span className={styles.resumenValue}>{user.email}</span>
            </div>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Telefono</span>
              <span className={styles.resumenValue}>{user.telefono}</span>
            </div>
            {montoTotal > 0 && (
              <div className={styles.resumenItem} style={{ gridColumn: "1 / -1" }}>
                <span className={styles.resumenLabel}>Total a pagar</span>
                <span className={styles.resumenValue} style={{ fontSize: 20, fontWeight: 700, color: "#2e7d32" }}>
                  {formatPrecio(montoTotal)}
                </span>
              </div>
            )}
          </div>

          {cotizacion && (
            <div className={styles.fieldHint}>
              Costo: <strong>{etiquetaCreditos(cotizacion.creditosNecesarios)}</strong>
              {" · "}
              Tu saldo: {etiquetaCreditos(cotizacion.saldo)}
              {!cotizacion.alcanza && (
                <>
                  {" · "}
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0 }}
                    onClick={() => {
                      setCreditosFaltantes(cotizacion.creditosFaltantes);
                      setCompraAbierta(true);
                    }}
                  >
                    Te faltan {cotizacion.creditosFaltantes}: comprar créditos
                  </Button>
                </>
              )}
            </div>
          )}

          <div className={styles.stepButtons}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(0)}>
              Volver
            </Button>
            <Button
              type="primary"
              className={styles.btnPrimary}
              loading={submitting}
              onClick={pedirConfirmacionReserva}
            >
              Confirmar Reserva
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Paso 2: confirmación y opciones de pago
  const renderStep2 = () => (
    <div className={styles.confirmStep}>
      <Result
        icon={<CheckCircleOutlined style={{ color: "#34c08f" }} />}
        title="Reserva confirmada!"
        subTitle={
          reservaCreada?.multiple
            ? "Tus lugares quedaron reservados."
            : reservaCreada?.serie
              ? "Tus turnos del mes quedaron reservados. Un solo pago cubre todos."
              : "Tu lugar esta reservado."
        }
      />

      {reservaCreada && (
        <div className={styles.resumenCard}>
          <h3 className={styles.resumenTitle}>Resumen de tu reserva</h3>
          <div className={styles.resumenGrid}>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Espacio</span>
              <span className={styles.resumenValue}>{reservaCreada.espacio}</span>
            </div>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>{reservaCreada.multiple ? "Recursos" : "Recurso"}</span>
              <span className={styles.resumenValue}>
                {reservaCreada.multiple
                  ? (reservaCreada.recursos || []).join(", ")
                  : reservaCreada.recurso}
              </span>
            </div>
            {reservaCreada.tipo === "turno" ? (
              <>
                <div className={styles.resumenItem}>
                  <span className={styles.resumenLabel}>Fecha</span>
                  <span className={styles.resumenValue}>{reservaCreada.fecha}</span>
                </div>
                <div className={styles.resumenItem}>
                  <span className={styles.resumenLabel}>Horario</span>
                  <span className={styles.resumenValue}>{reservaCreada.horaInicio} - {reservaCreada.horaFin}</span>
                </div>
              </>
            ) : reservaCreada.tipo === "fijo_mensual" ? (
              <>
                <div className={styles.resumenItem}>
                  <span className={styles.resumenLabel}>Período (4 semanas)</span>
                  <span className={styles.resumenValue}>{reservaCreada.periodoLabel}</span>
                </div>
                <div className={styles.resumenItem}>
                  <span className={styles.resumenLabel}>Recurrencia</span>
                  <span className={styles.resumenValue}>
                    Todos los {reservaCreada.diaLabel} · {reservaCreada.nOcurrencias} turno
                    {reservaCreada.nOcurrencias !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className={styles.resumenItem}>
                  <span className={styles.resumenLabel}>Horario</span>
                  <span className={styles.resumenValue}>{reservaCreada.horaInicio} - {reservaCreada.horaFin}</span>
                </div>
              </>
            ) : (
              <>
                <div className={styles.resumenItem}>
                  <span className={styles.resumenLabel}>Tipo</span>
                  <span className={styles.resumenValue}>Pack {reservaCreada.tipo === "semanal" ? "Semanal" : "Mensual"}</span>
                </div>
                <div className={styles.resumenItem}>
                  <span className={styles.resumenLabel}>Periodo</span>
                  <span className={styles.resumenValue}>{reservaCreada.fechaInicio} - {reservaCreada.fechaFin}</span>
                </div>
              </>
            )}
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Cliente</span>
              <span className={styles.resumenValue}>{reservaCreada.cliente}</span>
            </div>
            <div className={styles.resumenItem}>
              <span className={styles.resumenLabel}>Email</span>
              <span className={styles.resumenValue}>{reservaCreada.email}</span>
            </div>
            {reservaCreada.monto > 0 && (
              <div className={styles.resumenItem} style={{ gridColumn: "1 / -1" }}>
                <span className={styles.resumenLabel}>Total</span>
                <span className={styles.resumenValue} style={{ fontSize: 20, fontWeight: 700, color: "#2e7d32" }}>
                  {formatPrecio(reservaCreada.monto)}
                </span>
              </div>
            )}
          </div>

          <div className={styles.pagoSection}>
            <div className={styles.pagoDivider} />
            <h4 className={styles.pagoTitle}>Pago</h4>
            <p className={styles.fieldHint}>
              {reservaCreada.creditos
                ? `Se descontaron ${etiquetaCreditos(reservaCreada.creditos.descontados)} de tu saldo. Te quedan ${etiquetaCreditos(reservaCreada.creditos.saldo)}.`
                : "Tu reserva quedó confirmada."}
            </p>
          </div>
        </div>
      )}

      <div className={styles.stepButtons} style={{ justifyContent: "center" }}>
        <Button type="primary" className={styles.btnPrimary} onClick={resetAll}>
          Hacer otra reserva
        </Button>
      </div>
    </div>
  );

  // Configuración de los 3 pasos del asistente de reserva
  const stepsConfig = [
    { title: "Fecha y espacio", icon: <CalendarOutlined /> },
    { title: "Confirmar", icon: <UserOutlined /> },
    { title: "Listo", icon: <CheckCircleOutlined /> },
  ];

  const stepContents = [renderStep0, renderStep1, renderStep2];

  return (
    <div>
      <Header />
      <main className={styles.wrapper}>
        <div ref={topRef} aria-hidden className={styles.scrollAnchor} />
        <h1 className={styles.mainHeader}>
          Reserva tu <span className={styles.textEspacio}>Espacio</span>
        </h1>

        {step === 0 && <ReservaModificacionAviso className={styles.reservaAvisoTop} />}

        <div className={styles.tabBar} role="tablist" aria-label="Tipo de reserva">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "turno"}
            className={[styles.tab, activeTab === "turno" ? styles.tabActive : ""].join(" ")}
            onClick={() => switchTab("turno")}
          >
            <ClockCircleOutlined className={styles.tabIcon} />
            <span className={styles.tabLabel}>Reserva por turno</span>
            <span className={styles.tabHint}>Por horas</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "fijo"}
            className={[styles.tab, activeTab === "fijo" ? styles.tabActive : ""].join(" ")}
            onClick={() => switchTab("fijo")}
          >
            <FieldTimeOutlined className={styles.tabIcon} />
            <span className={styles.tabLabel}>Horario fijo</span>
            <span className={styles.tabHint}>4 semanas</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "pack"}
            className={[styles.tab, styles.tabPack, activeTab === "pack" ? styles.tabActive : ""].join(" ")}
            onClick={() => switchTab("pack")}
          >
            <CalendarOutlined className={styles.tabIcon} />
            <span className={styles.tabLabel}>Packs de Oficina</span>
            <span className={styles.tabHint}>Semanal / Mensual</span>
          </button>
        </div>

        <Steps current={step} className={styles.steps}>
          {stepsConfig.map((s) => (
            <Step key={s.title} title={s.title} icon={s.icon} />
          ))}
        </Steps>

        <div className={styles.stepContent}>{stepContents[step]()}</div>
      </main>
      <Footer />
      <ComprarCreditosModal
        abierto={compraAbierta}
        creditosFaltantes={creditosFaltantes}
        onCerrar={() => setCompraAbierta(false)}
      />
    </div>
  );
}
