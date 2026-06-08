// Concurrencia al crear/actualizar reservas.
// verificarConflictos() solo hace un SELECT (COUNT) sobre "Reservas". Sin bloqueo, dos pedidos
// concurrentes pueden leer "sin conflicto" y ambos insertar turnos solapados (mismo recurso o
// reglas de "espacio completo" contra recursos hijos/individuales).
//
// Estrategia: en la misma transacción que el INSERT/UPDATE, bloqueamos todas las filas de
// "Recursos" de los espacios involucrados, en orden determinístico (idEspacio ASC y luego
// idRecurso ASC con FOR UPDATE). Así el segundo pedido espera a que el primero confirme y su
// INSERT sea visible para el COUNT siguiente. La lógica de conflictos solo cruza recursos del
// mismo idEspacio, por lo que no hace falta un nivel SERIALIZABLE.
export async function bloquearEspaciosDeRecursos(db, idsRecurso) {
  const unicos = [...new Set(idsRecurso.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (unicos.length === 0) return;

  const { rows } = await db.query(
    `SELECT DISTINCT "idEspacio" FROM "Recursos" WHERE "idRecurso" = ANY($1::int[])`,
    [unicos]
  );
  const espacios = rows.map((r) => r.idEspacio).sort((a, b) => a - b);

  for (const idEspacio of espacios) {
    await db.query(
      `SELECT "idRecurso" FROM "Recursos" WHERE "idEspacio" = $1 ORDER BY "idRecurso" ASC FOR UPDATE`,
      [idEspacio]
    );
  }
}
