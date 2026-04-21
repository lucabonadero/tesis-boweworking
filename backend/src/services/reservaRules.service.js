import pool from "../config/db.js";

/** Oficina completa (grupo privado): no se ofrece por franjas horarias. */
export function esOficinaCompletaSoloPack(recursoRow) {
  if (!recursoRow?.esCompleto) return false;
  const n = String(recursoRow.Nombre || "").toLowerCase();
  return n.includes("oficina");
}

/**
 * Reglas de exclusión del flujo por hora (turno), alineadas con crearReserva.
 * @param {Record<string, unknown>} row con Nombre, esCompleto, idRecursoPadre, parent_name (join opcional)
 * @returns {string | null} mensaje de error o null si el recurso admite turno por hora
 */
export function mensajeTurnoNoDisponibleParaFila(row) {
  if (!row) return null;
  if (esOficinaCompletaSoloPack(row)) {
    return "La oficina completa no está disponible por franjas horarias. Usá packs semanal o mensual u otro espacio.";
  }
  const name = String(row.Nombre || "").toLowerCase();
  const parentName = String(row.parent_name ?? "").toLowerCase();
  if (name.includes("escritorio") || (row.idRecursoPadre != null && parentName.includes("oficina"))) {
    return "Los escritorios de oficina privada solo pueden reservarse con pack semanal o mensual.";
  }
  return null;
}

export async function mensajeTurnoNoDisponibleParaRecurso(idRecurso) {
  const { rows } = await pool.query(
    `SELECT r."Nombre", r."esCompleto", r."idRecursoPadre", COALESCE(p."Nombre",'') AS parent_name
     FROM "Recursos" r
     LEFT JOIN "Recursos" p ON r."idRecursoPadre" = p."idRecurso"
     WHERE r."idRecurso" = $1`,
    [idRecurso]
  );
  if (rows.length === 0) return null;
  return mensajeTurnoNoDisponibleParaFila(rows[0]);
}

export async function permiteReservaPorTurno(idRecurso) {
  const msg = await mensajeTurnoNoDisponibleParaRecurso(idRecurso);
  return msg == null;
}
