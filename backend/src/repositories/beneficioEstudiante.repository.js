/**
 * Acceso a datos del beneficio de reserva para estudiantes (RF21 - RF23).
 *
 * `db` es el pool para lecturas administrativas, o el client de la
 * transacción cuando la lectura decide si una reserva se cobra.
 */

/** ids de idsRecurso que están marcados como beneficio habilitado. */
export async function idsConBeneficio(db, idsRecurso) {
  if (!idsRecurso.length) return new Set();
  const { rows } = await db.query(
    `SELECT "idRecurso" FROM "RecursoBeneficioEstudiante"
     WHERE "idRecurso" = ANY($1::int[]) AND "habilitado" = true`,
    [idsRecurso]
  );
  return new Set(rows.map((r) => r.idRecurso));
}

export async function esBeneficioEstudiante(db, idRecurso) {
  const set = await idsConBeneficio(db, [idRecurso]);
  return set.has(Number(idRecurso));
}

/** Rol actual del cliente, releído de la base (el JWT puede estar desactualizado). */
export async function rolClienteUsuario(db, clienteUsuarioId) {
  const { rows } = await db.query(
    `SELECT rol FROM "ClienteUsuario" WHERE id = $1`,
    [clienteUsuarioId]
  );
  return rows.length ? rows[0].rol : null;
}

/** Recursos marcados, para el panel admin. */
export async function listarBeneficios(db) {
  const { rows } = await db.query(
    `SELECT r."idRecurso", r."Nombre",
            COALESCE(b."habilitado", false) AS "habilitado"
     FROM "Recursos" r
     LEFT JOIN "RecursoBeneficioEstudiante" b ON b."idRecurso" = r."idRecurso"
     WHERE r."Activo" = true
     ORDER BY r."idEspacio", r."idRecursoPadre" NULLS FIRST, r."Orden", r."idRecurso"`
  );
  return rows;
}

export async function fijarBeneficio(db, { idRecurso, habilitado, usuarioId }) {
  const { rows } = await db.query(
    `INSERT INTO "RecursoBeneficioEstudiante" ("idRecurso","habilitado","actualizado_at","actualizado_por")
     VALUES ($1,$2,NOW(),$3)
     ON CONFLICT ("idRecurso") DO UPDATE
       SET "habilitado" = $2, "actualizado_at" = NOW(), "actualizado_por" = $3
     RETURNING "idRecurso","habilitado","actualizado_at","actualizado_por"`,
    [idRecurso, habilitado, usuarioId ?? null]
  );
  return rows[0];
}
