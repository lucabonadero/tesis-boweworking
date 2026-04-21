/**
 * Normalización de horas de turno para persistencia y comparaciones en PostgreSQL.
 * Columnas "HorarioReserva" / "HorarioFin": tipo TIME; el contrato JSON con el front sigue siendo HH:MM (24 h).
 */

/**
 * @param {unknown} raw
 * @returns {{ value: string } | { error: string }}
 */
export function normalizarHoraTurnoInput(raw) {
  if (raw == null) return { value: "" };
  const s = String(raw).trim();
  if (s === "") return { value: "" };
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return { error: "Formato de hora inválido (usá HH:MM)." };
  let hh = parseInt(m[1], 10);
  let mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return { error: "Formato de hora inválido (usá HH:MM)." };
  hh = Math.min(23, Math.max(0, hh));
  mm = Math.min(59, Math.max(0, mm));
  return { value: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` };
}

/**
 * @param {unknown} horaIni
 * @param {unknown} horaFin
 * @returns {{ horaIni: string; horaFin: string } | { error: string }}
 */
export function horariosParaReservaTurno(horaIni, horaFin) {
  const a = normalizarHoraTurnoInput(horaIni);
  if (a.error) return a;
  const b = normalizarHoraTurnoInput(horaFin);
  if (b.error) return b;
  if (!a.value || !b.value) return { error: "Horario de inicio y fin son obligatorios." };
  return { horaIni: a.value, horaFin: b.value };
}

/**
 * Tras leer TIME desde PostgreSQL (node-pg suele devolver "HH:MM:SS" o en raros casos Date),
 * expone HH:MM como espera el front durante y después de la migración desde VARCHAR.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function formatearHoraParaApi(raw) {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) {
    const hh = String(raw.getUTCHours()).padStart(2, "0");
    const mm = String(raw.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const s = String(raw).trim();
  if (s === "") return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return s;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  return `${String(hh).padStart(2, "0")}:${m[2]}`;
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {Record<string, unknown> | null | undefined}
 */
export function serializarHorariosReservaEnFila(row) {
  if (row == null || typeof row !== "object") return row;
  const out = { ...row };
  if ("HorarioReserva" in out) out.HorarioReserva = formatearHoraParaApi(out.HorarioReserva);
  if ("HorarioFin" in out) out.HorarioFin = formatearHoraParaApi(out.HorarioFin);
  return out;
}

/**
 * @param {Record<string, unknown>[]} rows
 */
export function serializarHorariosReservaEnFilas(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => serializarHorariosReservaEnFila(r));
}

/**
 * Disponibilidad por rango: json_agg con detalle de reservas anidadas.
 * @param {Record<string, unknown>[]} rows
 */
export function normalizarHorariosEnDisponibilidadRango(rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const det = row.reservas_detalle;
    if (!Array.isArray(det)) continue;
    for (const d of det) {
      if (d && typeof d === "object") {
        d.HorarioReserva = formatearHoraParaApi(d.HorarioReserva);
        d.HorarioFin = formatearHoraParaApi(d.HorarioFin);
      }
    }
  }
}
