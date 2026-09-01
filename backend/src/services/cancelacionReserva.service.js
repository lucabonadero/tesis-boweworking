/**
 * Reglas de cancelación de reservas con reintegro de créditos (RF11 - RF15).
 *
 * Lógica pura: el controlador lee el estado, llama a estas funciones y aplica
 * el resultado dentro de una transacción.
 */

import {
  COWORKING_TZ,
  pgDateToYmd,
  parseHhMmAMinutos,
  reservaPeriodoAunNoTermino,
} from "./reservaMutability.service.js";

/** RF12/RF13: el corte que separa el reintegro total del parcial. */
export const HORAS_ANTICIPACION_REINTEGRO_TOTAL = 24;

export const PORCENTAJE_REINTEGRO_TOTAL = 100;
export const PORCENTAJE_REINTEGRO_PARCIAL = 50;

/**
 * Instante de inicio de la reserva como epoch ms, interpretando día y hora en
 * la zona del coworking.
 *
 * Se resuelve el offset real de esa fecha (no el de hoy) para que el cálculo no
 * se corra una hora si hubiera cambio de huso entre ahora y el turno.
 */
export function inicioReservaEnMs(row, tz = COWORKING_TZ) {
  const ymd = pgDateToYmd(row?.DiaReserva);
  if (!ymd) return null;

  // Los packs semanal/mensual no tienen hora de inicio: cuentan desde las 00:00
  // del primer día.
  const minutos = (row?.TipoReserva || "turno") === "turno"
    ? parseHhMmAMinutos(row?.HorarioReserva) ?? 0
    : 0;

  const [y, mo, d] = ymd.split("-").map(Number);
  const comoUtc = Date.UTC(y, mo - 1, d, Math.floor(minutos / 60), minutos % 60);

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(comoUtc));
  const v = (t) => Number(partes.find((p) => p.type === t)?.value);
  const enZona = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour") % 24, v("minute"), v("second"));

  return comoUtc - (enZona - comoUtc);
}

/** RF12/RF13/RF14: porcentaje según la anticipación en horas. */
export function porcentajeReintegro(horasDeAnticipacion) {
  if (!Number.isFinite(horasDeAnticipacion)) return 0;
  if (horasDeAnticipacion >= HORAS_ANTICIPACION_REINTEGRO_TOTAL) return PORCENTAJE_REINTEGRO_TOTAL;
  if (horasDeAnticipacion > 0) return PORCENTAJE_REINTEGRO_PARCIAL;
  return 0;
}

/** Se redondea hacia abajo: nunca se devuelven más créditos de los descontados. */
export function creditosAReintegrar(creditosUsados, porcentaje) {
  const usados = Math.trunc(Number(creditosUsados) || 0);
  if (usados <= 0 || porcentaje <= 0) return 0;
  return Math.floor((usados * porcentaje) / 100);
}

/**
 * Decide si la reserva puede cancelarse y cuánto se reintegra.
 *
 * @param {object} params
 * @param {object} params.reserva        Fila de "Reservas" (Estado, DiaReserva, HorarioReserva, TipoReserva).
 * @param {number} params.creditosUsados Créditos descontados al reservar (0 si la pagó el mostrador).
 * @param {Date}   params.ahora
 */
export function evaluarCancelacion({ reserva, creditosUsados = 0, ahora = new Date() } = {}) {
  const estado = (reserva?.Estado || "activa").toLowerCase();

  if (estado === "cancelada") {
    return { ok: false, codigo: "YA_CANCELADA", mensaje: "Esta reserva ya está cancelada." };
  }
  if (estado !== "activa") {
    return {
      ok: false,
      codigo: "ESTADO_NO_CANCELABLE",
      mensaje: "El turno ya empezó o se cerró; no se puede cancelar desde la app.",
    };
  }

  // RF14: si el período ya pasó, no se cancela y los créditos quedan consumidos.
  if (!reservaPeriodoAunNoTermino(reserva, ahora)) {
    return {
      ok: false,
      codigo: "FUERA_DE_PLAZO",
      mensaje: "El turno ya pasó. Al no cancelarlo a tiempo, los créditos no se reintegran.",
      porcentaje: 0,
      creditosAReintegrar: 0,
    };
  }

  const inicioMs = inicioReservaEnMs(reserva);
  if (inicioMs == null) {
    return { ok: false, codigo: "FECHA_INVALIDA", mensaje: "La reserva no tiene una fecha válida." };
  }

  const horas = (inicioMs - ahora.getTime()) / 3_600_000;

  // Ya empezó pero todavía no terminó: no se cancela en curso.
  if (horas <= 0) {
    return {
      ok: false,
      codigo: "EN_CURSO",
      mensaje: "El turno ya comenzó; no se puede cancelar.",
      porcentaje: 0,
      creditosAReintegrar: 0,
    };
  }

  const porcentaje = porcentajeReintegro(horas);
  const reintegro = creditosAReintegrar(creditosUsados, porcentaje);

  return {
    ok: true,
    horasDeAnticipacion: Math.round(horas * 100) / 100,
    porcentaje,
    creditosUsados: Math.trunc(Number(creditosUsados) || 0),
    creditosAReintegrar: reintegro,
    requiereMovimiento: reintegro > 0,
  };
}
