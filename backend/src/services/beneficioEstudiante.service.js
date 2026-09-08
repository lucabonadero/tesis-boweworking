/**
 * Reglas del beneficio de reserva para estudiantes (RF21 - RF23).
 *
 * Lógica pura: el controlador relee el rol y los recursos marcados desde la
 * base y le pasa el resultado a estas funciones. Solo aplica a reservas por
 * turno; packs semanal/mensual y series mensuales se cobran siempre.
 */

export const ROL_ESTUDIANTE = "estudiante";
export const TIPOS_RESERVA_CON_BENEFICIO = ["turno"];

export function esEstudianteElegible(usuario) {
  return usuario?.tipo === "cliente" && usuario?.rol === ROL_ESTUDIANTE;
}

export function tipoAplicaBeneficio(tipoReserva) {
  return TIPOS_RESERVA_CON_BENEFICIO.includes(tipoReserva);
}

/**
 * Pone en 0 el monto de los recursos marcados como beneficio.
 *
 * @param {Array<{idRecurso:number, monto:number}>} items
 * @param {Set<number>|Array<number>} idsConBeneficio
 */
export function aplicarBeneficioAMontos(items, idsConBeneficio) {
  const set = idsConBeneficio instanceof Set ? idsConBeneficio : new Set(idsConBeneficio);
  const montoOriginal = items.reduce((acc, it) => acc + (it.monto || 0), 0);
  const recursosGratuitos = [];

  const montos = items.map((it) => {
    if (set.has(Number(it.idRecurso))) {
      recursosGratuitos.push(it.idRecurso);
      return { ...it, monto: 0 };
    }
    return it;
  });

  const montoFinal = montos.reduce((acc, it) => acc + (it.monto || 0), 0);

  return { montos, recursosGratuitos, montoOriginal, montoFinal };
}
