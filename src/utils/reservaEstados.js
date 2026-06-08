// Terminología canónica del sistema Bo WeWorking.
// - El estado del turno describe la reserva en sí (si el cliente asistió o no).
// - El estado del cobro/pago describe si la plata se acreditó.
// - Son ortogonales: una reserva puede estar Confirmada y Pendiente de pago a la vez.
// Usar SIEMPRE estas etiquetas en la UI, no improvisar textos.

import dayjs from "dayjs";

export const RESERVA_ESTADO_LABEL = {
  activa: "Confirmada",
  en_curso: "En curso",
  completada: "Asistió / Finalizada",
  no_asistio: "No asistió",
  cancelada: "Cancelada",
};

export const RESERVA_ESTADO_DESCRIPCION = {
  activa: "Reserva agendada, pendiente de recepción",
  en_curso: "Cliente recepcionado, turno en uso",
  completada: "Turno finalizado con asistencia",
  no_asistio: "Cliente no se presentó",
  cancelada: "Reserva anulada",
};

// Colores para Tag de Ant Design (consistente con tokens.css)
export const RESERVA_ESTADO_COLOR = {
  activa: "green",
  en_curso: "processing",
  completada: "blue",
  no_asistio: "red",
  cancelada: "default",
};

export const PAGO_ESTADO_LABEL = {
  Pagado: "Pagada",
  Pendiente: "Pendiente de pago",
  Rechazado: "Rechazada",
  Cancelado: "Cancelada",
  Fallido: "Fallida",
};

export const PAGO_ESTADO_COLOR = {
  Pagado: "success",
  Pendiente: "warning",
  Rechazado: "error",
  Cancelado: "default",
  Fallido: "error",
};

export function labelEstadoReserva(estadoRaw) {
  const e = (estadoRaw || "activa").toLowerCase();
  return RESERVA_ESTADO_LABEL[e] || estadoRaw || "—";
}

export function labelEstadoPago(estadoRaw) {
  if (!estadoRaw) return "Sin pago";
  const e = String(estadoRaw).trim();
  return PAGO_ESTADO_LABEL[e] || e;
}

// Estado efectivo a mostrar en la UI.
// Una reserva guardada como "en_curso" cuyo HorarioFin ya pasó se ve como "completada" aunque
// la base todavía no haya sido actualizada por el cierre automático del backend. Solo aplica a
// reservas tipo turno (los packs no tienen hora de fin dentro del día).
export function estadoReservaEfectivo(r, now = new Date()) {
  const estado = (r?.Estado || "activa").toLowerCase();
  if (estado !== "en_curso") return estado;
  const tipo = r?.TipoReserva || "turno";
  if (tipo !== "turno") return estado;
  if (!r?.DiaReserva || !r?.HorarioFin) return estado;
  const dia = dayjs(r.DiaReserva).format("YYYY-MM-DD");
  const hf = String(r.HorarioFin).slice(0, 5);
  const fin = dayjs(`${dia}T${hf}`);
  if (!fin.isValid()) return estado;
  return dayjs(now).isAfter(fin) ? "completada" : "en_curso";
}
