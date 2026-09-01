/**
 * Validación de disponibilidad de recursos (RF17) y bloqueos (RF16).
 *
 * `validarDisponibilidadRecurso` se llama SIEMPRE antes de crear o mover una
 * reserva, dentro de la transacción, para que un bloqueo creado en paralelo no
 * se cuele entre la validación y el INSERT.
 */
import {
  obtenerCadenaRecursos,
  obtenerBloqueosSolapados,
  obtenerFranjas,
} from "../repositories/disponibilidadRecurso.repository.js";
import {
  CODIGOS,
  diaSemanaDeYmd,
  diasAbarcados,
  sumarDiasYmd,
  turnoEntraEnFranjas,
  mensajeRecursoBloqueado,
  mensajeFueraDeDisponibilidad,
  mensajeDiaNoDisponible,
} from "./disponibilidadRecurso.rules.js";
import { COWORKING_APERTURA, COWORKING_CIERRE } from "./coworkingHours.service.js";

function tsDe(ymd, hhmm) {
  return `${String(ymd).slice(0, 10)}T${String(hhmm).slice(0, 5)}:00`;
}

export async function validarDisponibilidadRecurso(
  db,
  { idRecurso, diaReserva, horaInicio, horaFin, tipoReserva = "turno" }
) {
  const cadena = await obtenerCadenaRecursos(db, idRecurso);
  if (cadena.length === 0) {
    return { codigo: CODIGOS.RECURSO_INACTIVO, message: "El recurso no existe.", detalle: { idRecurso } };
  }

  const inactivo = cadena.find((r) => r.Activo === false);
  if (inactivo) {
    return {
      codigo: CODIGOS.RECURSO_INACTIVO,
      message: `${inactivo.Nombre} no está disponible para reservar.`,
      detalle: { idRecurso: inactivo.idRecurso },
    };
  }

  const propio = cadena.find((r) => r.idRecurso === Number(idRecurso)) ?? cadena[0];
  const dias = diasAbarcados(diaReserva, tipoReserva);
  const esTurno = tipoReserva === "turno";
  const hi = esTurno ? horaInicio : COWORKING_APERTURA;
  const hf = esTurno ? horaFin : COWORKING_CIERRE;

  // 1. Bloqueos: contra el recurso y todos sus ancestros.
  const ids = cadena.map((r) => r.idRecurso);
  const inicioRango = tsDe(dias[0], hi);
  const finRango = tsDe(dias[dias.length - 1], hf);
  const bloqueos = await obtenerBloqueosSolapados(db, ids, inicioRango, finRango);
  if (bloqueos.length > 0) {
    const bloqueo = bloqueos[0];
    const nombre = cadena.find((r) => r.idRecurso === bloqueo.idRecurso)?.Nombre ?? propio.Nombre;
    return mensajeRecursoBloqueado(nombre, bloqueo);
  }

  // 2. Disponibilidad configurada. Sin franjas, vale la ventana global.
  const franjas = await obtenerFranjas(db, idRecurso);
  if (franjas.length === 0) return null;

  for (const ymd of dias) {
    const delDia = franjas.filter((f) => f.DiaSemana === diaSemanaDeYmd(ymd));
    if (delDia.length === 0) return mensajeDiaNoDisponible(propio.Nombre, ymd);
    if (!turnoEntraEnFranjas(hi, hf, delDia)) {
      return mensajeFueraDeDisponibilidad(propio.Nombre, ymd, delDia);
    }
  }

  return null;
}

/** Turnos de una hora del día pedido, con el motivo por el que cada uno no se puede usar. */
export async function calcularSlotsDelDia(db, idRecurso, ymd) {
  const cadena = await obtenerCadenaRecursos(db, idRecurso);
  if (cadena.length === 0) return [];

  const ids = cadena.map((r) => r.idRecurso);
  const bloqueos = await obtenerBloqueosSolapados(db, ids, tsDe(ymd, "00:00"), tsDe(sumarDiasYmd(ymd, 1), "00:00"));
  const franjas = (await obtenerFranjas(db, idRecurso)).filter((f) => f.DiaSemana === diaSemanaDeYmd(ymd));

  const desde = Number(COWORKING_APERTURA.slice(0, 2));
  const hasta = Number(COWORKING_CIERRE.slice(0, 2));
  const slots = [];

  for (let h = desde; h < hasta; h++) {
    const hora = `${String(h).padStart(2, "0")}:00`;
    const horaFin = `${String(h + 1).padStart(2, "0")}:00`;
    const inicioSlot = new Date(tsDe(ymd, hora)).getTime();
    const finSlot = new Date(tsDe(ymd, horaFin)).getTime();

    const bloqueo = bloqueos.find(
      (b) => new Date(b.FechaInicio).getTime() < finSlot && new Date(b.FechaFin).getTime() > inicioSlot
    );
    if (bloqueo) {
      slots.push({ hora, disponible: false, motivo: bloqueo.Motivo ? `Bloqueado: ${bloqueo.Motivo}` : "Bloqueado" });
      continue;
    }
    if (!turnoEntraEnFranjas(hora, horaFin, franjas)) {
      slots.push({ hora, disponible: false, motivo: "Fuera del horario disponible" });
      continue;
    }
    slots.push({ hora, disponible: true, motivo: null });
  }

  return slots;
}
