import dayjs from "dayjs";

export const COWORKING_OPEN_H = 9;
export const COWORKING_CLOSE_H = 21;

const APERTURA_MIN = COWORKING_OPEN_H * 60;
const CIERRE_MIN = COWORKING_CLOSE_H * 60;

export function minutosDesdeMedianoche(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return NaN;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

export function validarVentanaOperativaTurno(horaInicio, horaFin) {
  const hi = minutosDesdeMedianoche(horaInicio);
  const hf = minutosDesdeMedianoche(horaFin);
  if (Number.isNaN(hi) || Number.isNaN(hf)) return "Horario inválido.";
  if (hi < APERTURA_MIN) return "El horario de apertura es a las 09:00 hs.";
  if (hf > CIERRE_MIN) return "La reserva no puede finalizar después de las 21:00 hs.";
  if (hi >= hf) return "El horario de fin debe ser posterior al inicio.";
  return null;
}

export const DURACIONES_TURNO_MIN = [60, 120, 180, 240, 480];

const ETIQUETA_DURACION = {
  60: "1 h",
  120: "2 h",
  180: "3 h",
  240: "4 h",
  480: "8 h",
};

export function etiquetaDuracion(min) {
  return ETIQUETA_DURACION[min] || `${min / 60} h`;
}

/** Inicios cada 30 min dentro de la ventana para una duración dada (día concreto para dayjs). */
export function iniciosDisponiblesParaDuracion(fecha, duracionMin, opts = {}) {
  const { excluirPasados = true } = opts;
  if (!fecha || !duracionMin) return [];
  const out = [];
  for (let m = APERTURA_MIN; m + duracionMin <= CIERRE_MIN; m += 30) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(dayjs(fecha).hour(h).minute(mm).second(0).millisecond(0));
  }
  if (!excluirPasados || !fecha.isSame(dayjs(), "day")) return out;
  const n = dayjs();
  const ahoraMin = n.hour() * 60 + n.minute();
  return out.filter((s) => s.hour() * 60 + s.minute() >= ahoraMin);
}

/** Alineado con backend: fecha de reserva no anterior a hoy (calendario local del navegador). */
export function validarDiaReservaNoEnElPasadoLocal(fechaDayjs) {
  if (!fechaDayjs || !fechaDayjs.isValid?.()) return "Seleccioná una fecha válida.";
  const dr = fechaDayjs.format("YYYY-MM-DD");
  const hoy = dayjs().format("YYYY-MM-DD");
  if (dr < hoy) return "No se pueden reservar fechas pasadas.";
  return null;
}

/** Si es hoy, el inicio HH:MM no puede ser anterior a la hora actual (minuto). */
export function validarInicioTurnoNoEnElPasadoLocal(fechaDayjs, horaInicioHHmm) {
  const errDia = validarDiaReservaNoEnElPasadoLocal(fechaDayjs);
  if (errDia) return errDia;
  if (!fechaDayjs.isSame(dayjs(), "day")) return null;
  if (!horaInicioHHmm || typeof horaInicioHHmm !== "string") return "Elegí un horario de inicio.";
  const hi = minutosDesdeMedianoche(horaInicioHHmm);
  if (Number.isNaN(hi)) return "Horario de inicio inválido.";
  const n = dayjs();
  const ahoraMin = n.hour() * 60 + n.minute();
  if (hi < ahoraMin) return "El horario de inicio ya pasó. Elegí un horario posterior al actual.";
  return null;
}

/** Recepción: no marcar asistencia antes del inicio del turno (mismo criterio que backend). */
export function validarRecepcionNoAnticipadaLocal(diaYmd, horaIniHHmm) {
  const hoy = dayjs().format("YYYY-MM-DD");
  if (String(diaYmd || "").slice(0, 10) !== hoy) return null;
  const hi = minutosDesdeMedianoche(String(horaIniHHmm || "").slice(0, 5));
  if (Number.isNaN(hi)) return null;
  const n = dayjs();
  const ahoraMin = n.hour() * 60 + n.minute();
  if (ahoraMin < hi) {
    return "Todavía no comenzó el horario de esta reserva. Registrá la asistencia cuando corresponda.";
  }
  return null;
}

export function duracionesValidasParaCalendario() {
  return DURACIONES_TURNO_MIN.filter((d) => APERTURA_MIN + d <= CIERRE_MIN);
}
