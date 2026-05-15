/**
 * Reglas de negocio: qué reservas pueden editarse o eliminarse desde la app.
 * Usa zona horaria del coworking (por defecto Argentina) para comparar con el calendario del turno.
 */

export const COWORKING_TZ = process.env.COWORKING_TZ || "America/Argentina/Cordoba";

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Fecha calendario YYYY-MM-DD en la zona del coworking. */
export function ymdEnZona(now, tz = COWORKING_TZ) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(now);
}

/** Minutos desde medianoche en la zona del coworking. */
export function minutosDiaEnZona(now, tz = COWORKING_TZ) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const mi = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return h * 60 + mi;
}

/**
 * DATE de PostgreSQL: en node-pg suele venir como Date a medianoche UTC.
 */
export function pgDateToYmd(dia) {
  if (dia == null) return null;
  if (dia instanceof Date) {
    const y = dia.getUTCFullYear();
    const m = dia.getUTCMonth() + 1;
    const d = dia.getUTCDate();
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }
  const s = String(dia).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return pgDateToYmd(new Date(t));
}

export function parseHhMmAMinutos(hhmm) {
  if (hhmm == null || hhmm === "") return null;
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function addCalendarDaysYmd(ymd, n) {
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * true si el período reservado aún no terminó (reloj de pared en zona coworking).
 * Turno: hasta HorarioFin del día; packs: hasta el último día inclusive.
 */
export function reservaPeriodoAunNoTermino(row, now = new Date(), tz = COWORKING_TZ) {
  const ymdRes = pgDateToYmd(row.DiaReserva);
  if (!ymdRes) return false;
  const tipo = row.TipoReserva || "turno";
  const hoy = ymdEnZona(now, tz);
  const ahoraMin = minutosDiaEnZona(now, tz);

  if (tipo === "turno") {
    const finMin = parseHhMmAMinutos(row.HorarioFin) ?? 23 * 60 + 59;
    if (ymdRes > hoy) return true;
    if (ymdRes < hoy) return false;
    return ahoraMin < finMin;
  }
  if (tipo === "semanal") {
    const finPack = addCalendarDaysYmd(ymdRes, 6);
    return finPack >= hoy;
  }
  if (tipo === "mensual") {
    const finPack = addCalendarDaysYmd(ymdRes, 29);
    return finPack >= hoy;
  }
  return false;
}

/**
 * @param {Record<string, unknown>} row Fila de "Reservas" (y opcional EstadoPago del join; no altera la decisión).
 * @returns {{ puedeEditar: boolean; puedeEliminar: boolean; codigo: string | null; mensaje: string | null }}
 */
export function evaluarMutacionReserva(row, now = new Date()) {
  const estado = row.Estado || "activa";

  if (estado === "cancelada") {
    return {
      puedeEditar: false,
      puedeEliminar: false,
      codigo: "cancelada",
      mensaje: "Esta reserva está cancelada.",
    };
  }
  if (estado === "completada") {
    return {
      puedeEditar: false,
      puedeEliminar: false,
      codigo: "completada",
      mensaje: "El turno ya se cerró con asistencia; no se puede modificar ni eliminar desde acá.",
    };
  }
  if (estado === "en_curso") {
    return {
      puedeEditar: false,
      puedeEliminar: false,
      codigo: "en_curso",
      mensaje: "El turno está en curso; no se puede modificar ni eliminar mientras el cliente lo está usando.",
    };
  }
  if (estado === "no_asistio") {
    return {
      puedeEditar: false,
      puedeEliminar: false,
      codigo: "no_asistio",
      mensaje: "El turno figura como no asistido; no se puede modificar ni eliminar desde acá.",
    };
  }
  if (estado !== "activa") {
    return {
      puedeEditar: false,
      puedeEliminar: false,
      codigo: "estado_bloqueado",
      mensaje: "El estado del turno no permite cambios.",
    };
  }

  if (!reservaPeriodoAunNoTermino(row, now)) {
    return {
      puedeEditar: false,
      puedeEliminar: false,
      codigo: "historica",
      mensaje: "El turno ya pasó; solo se pueden cambiar reservas activas a futuro.",
    };
  }

  return { puedeEditar: true, puedeEliminar: true, codigo: null, mensaje: null };
}

/**
 * @param {Record<string, unknown>} opciones
 * @param {boolean} [opciones.staffNoEliminarSiPagado] — En listados / acciones de personal: no eliminar si hay cobro registrado como Pagado.
 */
export function enriquecerFilaConMutacion(rowSerializada, rowCruda, now = new Date(), opciones = {}) {
  const staffNoEliminarSiPagado = opciones.staffNoEliminarSiPagado === true;
  const ev = evaluarMutacionReserva(rowCruda, now);
  let puedeEliminar = ev.puedeEliminar;
  let mensajeNoEliminar = null;

  if (
    staffNoEliminarSiPagado &&
    puedeEliminar &&
    String(rowCruda.EstadoPago ?? "").trim() === "Pagado"
  ) {
    puedeEliminar = false;
    mensajeNoEliminar =
      "No podés eliminar desde Consultar reservas una reserva ya registrada como pagada. Gestioná la anulación o la devolución con administración o el área financiera.";
  }

  const out = {
    ...rowSerializada,
    puedeEditar: ev.puedeEditar,
    puedeEliminar,
    codigoMutacion: ev.codigo,
    mensajeMutacion: ev.mensaje,
  };
  if (mensajeNoEliminar) out.mensajeNoEliminar = mensajeNoEliminar;
  return out;
}
