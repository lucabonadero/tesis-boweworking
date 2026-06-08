// Reserva fija mensual (serie): mismo día ISO de la semana (1=lun … 7=dom) y mismo horario,
// con exactamente 4 ocurrencias — la fecha de inicio y las 3 semanas siguientes.
// Por defecto solo días hábiles (lun–vie): el día elegido debe ser 1–5.

// Cantidad de turnos semanales consecutivos (mismo día de semana) desde fechaInicio.
export const N_OCURRENCIAS_SERIE_MENSUAL = 4;

export function descuentoSerieMensualDefault() {
  const raw = process.env.RESERVA_SERIE_MENSUAL_DESCUENTO_PCT;
  const n = raw != null && String(raw).trim() !== "" ? parseFloat(String(raw).replace(",", ".")) : 0.1;
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Si es "false", se permiten sábado/domingo como día recurrente. */
export function serieSoloDiasHabiles() {
  const v = process.env.RESERVA_SERIE_SOLO_DIAS_HABILES;
  if (v != null && String(v).trim().toLowerCase() === "false") return false;
  return true;
}

function toIsoYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Primer día después de la última ocurrencia de la serie (4 semanas desde inicio). */
export function fechaFinPeriodoExclusiva(fechaInicioYmd) {
  const [y, m, d] = fechaInicioYmd.split("-").map(Number);
  const ultimoDesplazamiento = (N_OCURRENCIAS_SERIE_MENSUAL - 1) * 7;
  const finExclusivo = new Date(y, m - 1, d + ultimoDesplazamiento + 1);
  return toIsoYmd(finExclusivo);
}

/** ISO weekday (1–7) de una fecha YYYY-MM-DD en hora local. */
export function diaSemanaIsoDesdeYmd(fechaYmd) {
  const [y, m, d] = fechaYmd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  return dow === 0 ? 7 : dow;
}

// Todas las fechas en [fechaInicio, fechaFinExclusiva) que caen en ese día de semana ISO.
// Con soloDiasHabiles (por defecto true) se excluyen sábado y domingo aunque coincidan.
export function fechasDiaSemanaEnRango(fechaInicioYmd, fechaFinExclusivaYmd, diaSemanaIso, opts = {}) {
  const soloDiasHabiles = opts.soloDiasHabiles !== false;
  const [y0, m0, d0] = fechaInicioYmd.split("-").map(Number);
  const [y1, m1, d1] = fechaFinExclusivaYmd.split("-").map(Number);
  const inicio = new Date(y0, m0 - 1, d0);
  const finExclusivo = new Date(y1, m1 - 1, d1);
  const out = [];
  for (let cur = new Date(inicio); cur < finExclusivo; cur.setDate(cur.getDate() + 1)) {
    const dow = cur.getDay();
    const iso = dow === 0 ? 7 : dow;
    if (iso !== diaSemanaIso) continue;
    if (soloDiasHabiles && (iso === 6 || iso === 7)) continue;
    out.push(toIsoYmd(cur));
  }
  return out;
}

// Cuatro semanas desde fechaInicio: la fecha debe caer en ese día ISO; luego +7, +14 y +21 días.
// Devuelve las fechas YYYY-MM-DD, o [] si la fecha no coincide con el día o no es un día permitido.
export function fechasSerieMensualRodante(fechaInicioYmd, diaSemanaIso) {
  const [y0, m0, d0] = fechaInicioYmd.split("-").map(Number);
  const iso = diaSemanaIsoDesdeYmd(fechaInicioYmd);
  if (iso !== diaSemanaIso) return [];
  if (serieSoloDiasHabiles() && (iso === 6 || iso === 7)) return [];
  const out = [];
  for (let w = 0; w < N_OCURRENCIAS_SERIE_MENSUAL; w++) {
    const d = new Date(y0, m0 - 1, d0 + w * 7);
    out.push(toIsoYmd(d));
  }
  return out;
}

// Solo fechas >= fechaMin (YYYY-MM-DD); la comparación lexicográfica es válida para formato ISO.
export function filtrarDesdeFecha(fechasIso, fechaMinIso) {
  if (!fechaMinIso) return fechasIso;
  return fechasIso.filter((f) => f >= fechaMinIso);
}

// Reparte `total` en `n` partes con dos decimales; la última fila absorbe el redondeo.
export function repartirMontoTotal(total, n) {
  if (n <= 0) return [];
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  const resto = centavos - base * n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = base + (i === n - 1 ? resto : 0);
    out.push(c / 100);
  }
  return out;
}
