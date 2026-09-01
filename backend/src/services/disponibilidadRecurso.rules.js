/**
 * Reglas puras de disponibilidad de recursos (RF16/RF17).
 *
 * Sin acceso a base de datos: todo lo que decide "se puede o no reservar"
 * vive acá para poder testearlo sin infraestructura. Las queries están en
 * disponibilidadRecurso.repository.js.
 */
import {
  minutosDesdeMedianoche,
  COWORKING_APERTURA,
  COWORKING_CIERRE,
} from "./coworkingHours.service.js";

export const CODIGOS = {
  RECURSO_BLOQUEADO: "RECURSO_BLOQUEADO",
  FUERA_DE_DISPONIBILIDAD: "FUERA_DE_DISPONIBILIDAD",
  DIA_NO_DISPONIBLE: "DIA_NO_DISPONIBLE",
  RECURSO_INACTIVO: "RECURSO_INACTIVO",
};

const DIAS_SINGULAR = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_PLURAL = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

const DIAS_POR_TIPO = { turno: 1, semanal: 7, mensual: 30 };

function aMillis(valor) {
  return valor instanceof Date ? valor.getTime() : new Date(valor).getTime();
}

/** Dos rangos [inicio, fin) se solapan. Adyacentes (finA === inicioB) no solapan. */
export function rangosSeSolapan(inicioA, finA, inicioB, finB) {
  return aMillis(inicioA) < aMillis(finB) && aMillis(finA) > aMillis(inicioB);
}

/** 0=domingo … 6=sábado. Se parsea como UTC para que no lo corra la zona local. */
export function diaSemanaDeYmd(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function sumarDiasYmd(ymd, dias) {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/** Días de calendario que ocupa una reserva: 1 turno, 7 semanal, 30 mensual. */
export function diasAbarcados(diaReserva, tipoReserva) {
  const total = DIAS_POR_TIPO[tipoReserva] ?? 1;
  return Array.from({ length: total }, (_, i) => sumarDiasYmd(diaReserva, i));
}

/** El turno debe entrar completo en UNA franja. Sin franjas, vale la ventana global. */
export function turnoEntraEnFranjas(horaInicio, horaFin, franjas) {
  const hi = minutosDesdeMedianoche(String(horaInicio).slice(0, 5));
  const hf = minutosDesdeMedianoche(String(horaFin).slice(0, 5));
  if (Number.isNaN(hi) || Number.isNaN(hf) || hi >= hf) return false;

  const efectivas =
    Array.isArray(franjas) && franjas.length > 0
      ? franjas
      : [{ HoraInicio: COWORKING_APERTURA, HoraFin: COWORKING_CIERRE }];

  return efectivas.some((f) => {
    const fi = minutosDesdeMedianoche(String(f.HoraInicio).slice(0, 5));
    const ff = minutosDesdeMedianoche(String(f.HoraFin).slice(0, 5));
    return !Number.isNaN(fi) && !Number.isNaN(ff) && hi >= fi && hf <= ff;
  });
}

/** "12/03 a las 18:00" */
export function formatearFechaHoraCorta(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} a las ${hh}:${mi}`;
}

function listarFranjas(franjas) {
  return franjas
    .map((f) => `${String(f.HoraInicio).slice(0, 5)} a ${String(f.HoraFin).slice(0, 5)}`)
    .join(", ");
}

export function mensajeRecursoBloqueado(nombreRecurso, bloqueo) {
  const hasta = formatearFechaHoraCorta(bloqueo.FechaFin);
  const motivo = bloqueo.Motivo ? ` Motivo: ${bloqueo.Motivo}.` : "";
  return {
    codigo: CODIGOS.RECURSO_BLOQUEADO,
    message: `${nombreRecurso} está bloqueado hasta el ${hasta}.${motivo}`,
    detalle: {
      idBloqueo: bloqueo.idBloqueo,
      fechaInicio: bloqueo.FechaInicio,
      fechaFin: bloqueo.FechaFin,
      motivo: bloqueo.Motivo ?? null,
    },
  };
}

export function mensajeFueraDeDisponibilidad(nombreRecurso, ymd, franjas) {
  const dia = DIAS_PLURAL[diaSemanaDeYmd(ymd)];
  return {
    codigo: CODIGOS.FUERA_DE_DISPONIBILIDAD,
    message: `${nombreRecurso} no está disponible en ese horario. Los ${dia} se puede reservar de ${listarFranjas(franjas)}.`,
    detalle: { fecha: ymd, franjas },
  };
}

export function mensajeDiaNoDisponible(nombreRecurso, ymd) {
  const dia = DIAS_PLURAL[diaSemanaDeYmd(ymd)];
  return {
    codigo: CODIGOS.DIA_NO_DISPONIBLE,
    message: `${nombreRecurso} no está disponible los ${dia}.`,
    detalle: { fecha: ymd, diaSemana: diaSemanaDeYmd(ymd), nombreDia: DIAS_SINGULAR[diaSemanaDeYmd(ymd)] },
  };
}
