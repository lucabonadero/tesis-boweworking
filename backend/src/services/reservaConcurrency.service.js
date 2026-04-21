/**
 * Concurrencia al crear/actualizar reservas
 * ----------------------------------------
 * verificarConflictos() solo hace SELECT (COUNT) sobre "Reservas". Sin bloqueo, dos
 * requests concurrentes pueden leer “sin conflicto” y ambas hacer INSERT con turnos
 * solapados (mismo recurso o reglas “espacio completo” vs recursos hijos/individuales).
 *
 * Estrategia: en la misma transacción que el INSERT/UPDATE, bloqueamos todas las filas
 * de "Recursos" del/los espacio(s) involucrado(s), en orden determinístico
 * (idEspacio ASC, luego idRecurso ASC con FOR UPDATE). Así el segundo request espera
 * hasta que el primero confirme y su INSERT sea visible para el COUNT siguiente.
 *
 * Alcance: la lógica actual de conflictos solo cruza recursos que comparten idEspacio
 * (mismo padre, esCompleto a nivel espacio, hijos del grupo). No hace falta un nivel
 * SERIALIZABLE si mantenemos este bloqueo alineado con esas consultas.
 *
 * @param {import("pg").PoolClient} db Cliente en transacción (BEGIN ya ejecutado).
 * @param {number[]} idsRecurso IDs de recursos cuyos espacios deben bloquearse (p. ej. recurso nuevo y, en UPDATE, el anterior).
 */
export async function bloquearEspaciosDeRecursos(db, idsRecurso) {
  const uniq = [...new Set(idsRecurso.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (uniq.length === 0) return;

  const { rows } = await db.query(
    `SELECT DISTINCT "idEspacio" FROM "Recursos" WHERE "idRecurso" = ANY($1::int[])`,
    [uniq]
  );
  const espacios = rows.map((r) => r.idEspacio).sort((a, b) => a - b);

  for (const idEspacio of espacios) {
    await db.query(
      `SELECT "idRecurso" FROM "Recursos" WHERE "idEspacio" = $1 ORDER BY "idRecurso" ASC FOR UPDATE`,
      [idEspacio]
    );
  }
}
