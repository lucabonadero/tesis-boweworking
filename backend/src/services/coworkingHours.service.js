/** Horario operativo del coworking (turnos por hora). */
export const COWORKING_APERTURA = "09:00";
export const COWORKING_CIERRE = "21:00";

/** Zona usada para comparar "hoy" y la hora actual con DiaReserva + TIME (sin TIMESTAMPTZ en BD). */
export const COWORKING_TIMEZONE = process.env.COWORKING_TIMEZONE || "America/Argentina/Buenos_Aires";

export function minutosDesdeMedianoche(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return NaN;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

// Fecha calendario YYYY-MM-DD en la zona del coworking.
export function fechaCalendarioEnZona(d = new Date(), tz = COWORKING_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const mo = parts.find((p) => p.type === "month")?.value;
  const da = parts.find((p) => p.type === "day")?.value;
  if (!y || !mo || !da) return "";
  return `${y}-${mo}-${da}`;
}

// Minutos desde medianoche en la zona del coworking.
export function minutosDesdeMedianocheEnZona(d = new Date(), tz = COWORKING_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const hh = parseInt(parts.find((p) => p.type === "hour")?.value ?? "", 10);
  const mm = parseInt(parts.find((p) => p.type === "minute")?.value ?? "", 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  return hh * 60 + mm;
}

// La fecha de reserva no puede ser anterior a "hoy" en la zona operativa.
export function validarDiaReservaNoEnElPasado(diaYmd) {
  const dr = String(diaYmd ?? "")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dr)) return "La fecha de reserva no es válida.";
  const hoy = fechaCalendarioEnZona();
  if (dr < hoy) return "No se pueden crear o modificar reservas en fechas pasadas.";
  return null;
}

// Para turnos del mismo día, el inicio no puede ser anterior a la hora actual (zona coworking).
export function validarInicioTurnoNoEnElPasado(diaYmd, horaIni) {
  const errDia = validarDiaReservaNoEnElPasado(diaYmd);
  if (errDia) return errDia;
  const dr = String(diaYmd ?? "")
    .trim()
    .slice(0, 10);
  const hoy = fechaCalendarioEnZona();
  if (dr > hoy) return null;
  const hi = minutosDesdeMedianoche(String(horaIni ?? ""));
  if (Number.isNaN(hi)) return "Horario de inicio inválido.";
  const ahoraMin = minutosDesdeMedianocheEnZona();
  if (Number.isNaN(ahoraMin)) return null;
  if (hi < ahoraMin) return "El horario de inicio ya pasó. Elegí un horario posterior al actual.";
  return null;
}

// Recepción: no marcar asistencia / inasistencia antes del horario de inicio del turno.
export function validarRecepcionNoAnticipada(diaYmd, horaIni) {
  const dr = String(diaYmd ?? "")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dr)) return null;
  const hoy = fechaCalendarioEnZona();
  if (dr !== hoy) return null;
  const hi = minutosDesdeMedianoche(String(horaIni ?? "").slice(0, 5));
  if (Number.isNaN(hi)) return null;
  const ahoraMin = minutosDesdeMedianocheEnZona();
  if (Number.isNaN(ahoraMin)) return null;
  if (ahoraMin < hi) {
    return "Todavía no comenzó el horario de esta reserva. Registrá la asistencia cuando corresponda.";
  }
  return null;
}

// Valida que un turno quede dentro de [09:00, 21:00] (fin inclusive hasta las 21:00).
export function validarVentanaOperativaTurno(horaInicio, horaFin) {
  const apertura = minutosDesdeMedianoche(COWORKING_APERTURA);
  const cierre = minutosDesdeMedianoche(COWORKING_CIERRE);
  const hi = minutosDesdeMedianoche(horaInicio);
  const hf = minutosDesdeMedianoche(horaFin);
  if (Number.isNaN(hi) || Number.isNaN(hf)) return "Horario inválido.";
  if (hi < apertura) return "El horario de apertura es a las 09:00 hs.";
  if (hf > cierre) return "La reserva no puede finalizar después de las 21:00 hs.";
  if (hi >= hf) return "El horario de fin debe ser posterior al inicio.";
  return null;
}
