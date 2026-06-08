// Cálculo de extensiones de reserva. Reglas de negocio:
//  - La facturación es por bloques (fracciones) de 30 minutos.
//  - Siempre se redondea HACIA ARRIBA al siguiente bloque de 30 (40 min → 2, 15 min → 1).
//  - El precio de cada fracción de 30 min es la mitad del PrecioHora del recurso.
// Son funciones puras (sin I/O) para poder testearlas de forma aislada.

export const MINUTOS_POR_FRACCION = 30;

/** Bloques de 30 minutos a cobrar, redondeando hacia arriba. */
export function calcularFracciones(minutos) {
  const m = Number(minutos);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.ceil(m / MINUTOS_POR_FRACCION);
}

/** Redondea a 2 decimales evitando ruido de punto flotante. */
function redondear2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Importe de una extensión a partir del precio por hora del recurso (0 si no está cargado)
// y los minutos solicitados. Devuelve { fracciones, precioFraccion, monto }.
export function calcularMontoExtension(precioHora, minutos) {
  const fracciones = calcularFracciones(minutos);
  const ph = Number(precioHora);
  const precioFraccion = Number.isFinite(ph) && ph > 0 ? redondear2(ph / 2) : 0;
  const monto = redondear2(precioFraccion * fracciones);
  return { fracciones, precioFraccion, monto };
}

// Minuto de fin REAL al liquidar una extensión al cierre del turno.
// - Si el cierre ocurre otro día (o el turno ya pasó), se cobra toda la ventana reservada,
//   porque no se puede saber el momento exacto de salida.
// - Si el cierre ocurre el mismo día, el cliente usó hasta min(ahora, finActual), pero nunca
//   menos que el fin original (la extensión empieza después del fin original).
// El resultado queda acotado a [finOriginal, finActual].
export function minutoFinReal({ finOriginalMin, finActualMin, nowMin, mismoDia }) {
  if (!mismoDia) return finActualMin;
  let real = Math.min(Number(nowMin), Number(finActualMin));
  if (!Number.isFinite(real)) return finActualMin;
  if (real < finOriginalMin) real = finOriginalMin;
  return real;
}

/** Parsea "HH:MM" o "HH:MM:SS" a minutos desde medianoche. */
export function horaAMinutos(hhmm) {
  if (hhmm == null) return NaN;
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return NaN;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Convierte minutos desde medianoche a "HH:MM" (sin manejo de cruce de día). */
export function minutosAHora(min) {
  const m = Number(min);
  if (!Number.isFinite(m) || m < 0) return null;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Suma minutos a una hora "HH:MM". Devuelve null si el resultado se va de día (>= 24:00),
 * lo que aguas arriba se trata como fuera de la ventana operativa.
 */
export function sumarMinutosAHora(hhmm, minutos) {
  const base = horaAMinutos(hhmm);
  const add = Number(minutos);
  if (Number.isNaN(base) || !Number.isFinite(add)) return null;
  const total = base + add;
  if (total >= 24 * 60) return null;
  return minutosAHora(total);
}
