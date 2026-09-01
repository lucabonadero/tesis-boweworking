/**
 * Acceso a datos de disponibilidad y bloqueos de recursos.
 *
 * Cada función recibe `db`: el pool para lecturas, o un client de transacción
 * para que la validación corra dentro de la misma transacción que la reserva.
 */

const COLUMNAS_BLOQUEO = `
  b."idBloqueo", b."idRecurso", b."FechaInicio", b."FechaFin",
  b."Motivo", b."creadoPor", b."createdAt"
`;

/** El recurso y todos sus ancestros: un bloqueo sobre el padre alcanza al hijo. */
export async function obtenerCadenaRecursos(db, idRecurso) {
  const { rows } = await db.query(
    `WITH RECURSIVE cadena AS (
       SELECT r."idRecurso", r."Nombre", r."Activo", r."idRecursoPadre"
       FROM "Recursos" r WHERE r."idRecurso" = $1
       UNION ALL
       SELECT p."idRecurso", p."Nombre", p."Activo", p."idRecursoPadre"
       FROM "Recursos" p JOIN cadena c ON p."idRecurso" = c."idRecursoPadre"
     )
     SELECT "idRecurso", "Nombre", "Activo" FROM cadena`,
    [idRecurso]
  );
  return rows;
}

export async function obtenerBloqueosSolapados(db, idsRecurso, inicio, fin) {
  if (!idsRecurso.length) return [];
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_BLOQUEO}
     FROM "BloqueosRecurso" b
     WHERE b."idRecurso" = ANY($1::int[])
       AND b."FechaInicio" < $3::timestamp
       AND b."FechaFin"    > $2::timestamp
     ORDER BY b."FechaInicio"`,
    [idsRecurso, inicio, fin]
  );
  return rows;
}

export async function obtenerFranjas(db, idRecurso) {
  const { rows } = await db.query(
    `SELECT "idDisponibilidad", "DiaSemana", "HoraInicio", "HoraFin"
     FROM "DisponibilidadRecurso"
     WHERE "idRecurso" = $1
     ORDER BY "DiaSemana", "HoraInicio"`,
    [idRecurso]
  );
  return rows;
}

/** Reemplaza el set completo de franjas. El caller abre la transacción. */
export async function reemplazarFranjas(db, idRecurso, franjas) {
  await db.query(`DELETE FROM "DisponibilidadRecurso" WHERE "idRecurso" = $1`, [idRecurso]);
  for (const f of franjas) {
    await db.query(
      `INSERT INTO "DisponibilidadRecurso" ("idRecurso","DiaSemana","HoraInicio","HoraFin")
       VALUES ($1,$2,$3,$4)`,
      [idRecurso, f.diaSemana, f.horaInicio, f.horaFin]
    );
  }
}

export async function listarBloqueos(db, { idRecurso, desde, hasta }) {
  const condiciones = [];
  const params = [];
  if (idRecurso) {
    params.push(idRecurso);
    condiciones.push(`b."idRecurso" = $${params.length}`);
  }
  if (desde) {
    params.push(desde);
    condiciones.push(`b."FechaFin" >= $${params.length}::timestamp`);
  }
  if (hasta) {
    params.push(hasta);
    condiciones.push(`b."FechaInicio" <= $${params.length}::timestamp`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_BLOQUEO}, r."Nombre" AS "nombreRecurso"
     FROM "BloqueosRecurso" b
     JOIN "Recursos" r ON r."idRecurso" = b."idRecurso"
     ${where}
     ORDER BY b."FechaInicio" DESC`,
    params
  );
  return rows;
}

export async function crearBloqueo(db, { idRecurso, fechaInicio, fechaFin, motivo, creadoPor }) {
  const { rows } = await db.query(
    `INSERT INTO "BloqueosRecurso" ("idRecurso","FechaInicio","FechaFin","Motivo","creadoPor")
     VALUES ($1,$2::timestamp,$3::timestamp,$4,$5)
     RETURNING "idBloqueo","idRecurso","FechaInicio","FechaFin","Motivo","creadoPor","createdAt"`,
    [idRecurso, fechaInicio, fechaFin, motivo ?? null, creadoPor ?? null]
  );
  return rows[0];
}

export async function actualizarBloqueo(db, idBloqueo, { fechaInicio, fechaFin, motivo }) {
  const { rows } = await db.query(
    `UPDATE "BloqueosRecurso"
     SET "FechaInicio" = $2::timestamp, "FechaFin" = $3::timestamp, "Motivo" = $4
     WHERE "idBloqueo" = $1
     RETURNING "idBloqueo","idRecurso","FechaInicio","FechaFin","Motivo","creadoPor","createdAt"`,
    [idBloqueo, fechaInicio, fechaFin, motivo ?? null]
  );
  return rows[0] ?? null;
}

export async function eliminarBloqueo(db, idBloqueo) {
  const { rowCount } = await db.query(`DELETE FROM "BloqueosRecurso" WHERE "idBloqueo" = $1`, [idBloqueo]);
  return rowCount > 0;
}

/** Reservas activas dentro del rango: se avisan al admin, no se cancelan. */
export async function obtenerReservasEnRango(db, idsRecurso, inicio, fin) {
  if (!idsRecurso.length) return [];
  const { rows } = await db.query(
    `SELECT res."idReserva", res."idRecurso", res."Nombre", res."DiaReserva",
            res."HorarioReserva", res."HorarioFin", res."Estado"
     FROM "Reservas" res
     WHERE res."idRecurso" = ANY($1::int[])
       AND res."Estado" IN ('activa','en_curso')
       AND res."DiaReserva" BETWEEN $2::date AND $3::date
     ORDER BY res."DiaReserva", res."HorarioReserva"`,
    [idsRecurso, inicio, fin]
  );
  return rows;
}
