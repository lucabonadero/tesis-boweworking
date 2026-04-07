import pool from "../config/db.js";

async function esGrupo(idRecurso) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS n FROM "Recursos" WHERE "idRecursoPadre" = $1',
    [idRecurso]
  );
  return parseInt(rows[0].n) > 0;
}

/**
 * Universal overlap check: does a NEW reservation conflict with EXISTING ones?
 *
 * Existing reservations can be turno, semanal, or mensual.
 * The new reservation defines its "shadow" on the calendar:
 *   - turno:   single day + time range
 *   - semanal: DiaReserva .. DiaReserva+6  (all day)
 *   - mensual: DiaReserva .. DiaReserva+29 (all day)
 *
 * An existing reservation casts its own shadow. Two shadows conflict when
 * their date ranges overlap AND (if both are turnos on the same day) their
 * time ranges overlap.
 */
function conflictSQL(extraRecursoWhere, excludeId) {
  const ex = excludeId ? `AND res."idReserva" != ${parseInt(excludeId)}` : "";
  return `
    SELECT COUNT(*) AS n
    FROM "Reservas" res
    ${extraRecursoWhere ? 'JOIN "Recursos" rec ON res."idRecurso" = rec."idRecurso"' : ""}
    WHERE ${extraRecursoWhere || 'res."idRecurso" = $p_recurso'}
    ${ex}
    AND (
      (
        COALESCE(res."TipoReserva",'turno') = 'turno'
        AND (
          CASE $p_tipo
            WHEN 'turno' THEN
              res."DiaReserva" = $p_fecha::DATE
              AND res."HorarioReserva"::TIME < $p_horaFin::TIME
              AND res."HorarioFin"::TIME     > $p_horaIni::TIME
            ELSE
              res."DiaReserva" BETWEEN $p_fecha::DATE AND ($p_fecha::DATE + $p_dias::INT)
          END
        )
      )
      OR
      (
        res."TipoReserva" = 'semanal'
        AND (
          CASE $p_tipo
            WHEN 'turno' THEN
              $p_fecha::DATE BETWEEN res."DiaReserva" AND (res."DiaReserva"::DATE + 6)
            ELSE
              res."DiaReserva" <= ($p_fecha::DATE + $p_dias::INT)
              AND (res."DiaReserva"::DATE + 6) >= $p_fecha::DATE
          END
        )
      )
      OR
      (
        res."TipoReserva" = 'mensual'
        AND (
          CASE $p_tipo
            WHEN 'turno' THEN
              $p_fecha::DATE BETWEEN res."DiaReserva" AND (res."DiaReserva"::DATE + 29)
            ELSE
              res."DiaReserva" <= ($p_fecha::DATE + $p_dias::INT)
              AND (res."DiaReserva"::DATE + 29) >= $p_fecha::DATE
          END
        )
      )
    )
  `;
}

function packDays(tipo) {
  if (tipo === "semanal") return 6;
  if (tipo === "mensual") return 29;
  return 0;
}

async function verificarConflictos(idRecurso, DiaReserva, HorarioReserva, HorarioFin, TipoReserva, excludeReservaId) {
  const tipo = TipoReserva || "turno";
  const recursoRes = await pool.query('SELECT * FROM "Recursos" WHERE "idRecurso" = $1', [idRecurso]);
  if (recursoRes.rows.length === 0) return "Recurso no encontrado.";
  const recurso = recursoRes.rows[0];

  if (await esGrupo(idRecurso)) {
    return "Este recurso es un grupo. Elegí un recurso específico dentro del grupo.";
  }

  const dias = packDays(tipo);
  const horaIni = tipo === "turno" ? HorarioReserva : "00:00";
  const horaFin = tipo === "turno" ? HorarioFin : "23:59";
  const ex = excludeReservaId || null;

  const baseParams = {
    $p_tipo: tipo,
    $p_fecha: DiaReserva,
    $p_dias: dias,
    $p_horaIni: horaIni,
    $p_horaFin: horaFin,
  };

  const bind = (sql, extra) => {
    let s = sql;
    const vals = [];
    let i = 1;
    const map = { ...baseParams, ...extra };
    for (const [k, v] of Object.entries(map)) {
      s = s.replaceAll(k, `$${i}`);
      vals.push(v);
      i++;
    }
    return { text: s, vals };
  };

  // Direct conflict on the same resource
  const q1 = bind(
    conflictSQL(null, ex),
    { $p_recurso: idRecurso }
  );
  const r1 = await pool.query(q1.text, q1.vals);
  if (parseInt(r1.rows[0].n) > 0) {
    return "Este recurso ya está reservado en ese período.";
  }

  // "Completo" logic
  if (recurso.esCompleto) {
    if (recurso.idRecursoPadre) {
      const q = bind(
        conflictSQL(`rec."idRecursoPadre" = $p_padre AND rec."esCompleto" = false`, ex),
        { $p_padre: recurso.idRecursoPadre }
      );
      const r = await pool.query(q.text, q.vals);
      if (parseInt(r.rows[0].n) > 0)
        return "No se puede reservar completo: hay recursos individuales reservados en ese período.";
    } else {
      const q = bind(
        conflictSQL(`rec."idEspacio" = $p_esp AND rec."idRecurso" != $p_self`, ex),
        { $p_esp: recurso.idEspacio, $p_self: idRecurso }
      );
      const r = await pool.query(q.text, q.vals);
      if (parseInt(r.rows[0].n) > 0)
        return "No se puede reservar el espacio completo: hay recursos individuales reservados en ese período.";
    }
  } else {
    if (recurso.idRecursoPadre) {
      const q = bind(
        conflictSQL(`rec."idRecursoPadre" = $p_padre AND rec."esCompleto" = true`, ex),
        { $p_padre: recurso.idRecursoPadre }
      );
      const r = await pool.query(q.text, q.vals);
      if (parseInt(r.rows[0].n) > 0)
        return "El grupo completo ya está reservado en ese período.";
    }
    const q = bind(
      conflictSQL(`rec."idEspacio" = $p_esp AND rec."esCompleto" = true AND rec."idRecursoPadre" IS NULL`, ex),
      { $p_esp: recurso.idEspacio }
    );
    const r = await pool.query(q.text, q.vals);
    if (parseInt(r.rows[0].n) > 0)
      return "El espacio completo ya está reservado en ese período.";
  }

  return null;
}

// ── CRUD ────────────────────────────────────────────────────

export const obtenerReservas = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*,
             c."Nombre" AS cliente_nombre, c."Apellido" AS cliente_apellido,
             rec."Nombre" AS recurso_nombre, rec."esCompleto",
             e."Nombre" AS espacio_nombre
      FROM "Reservas" r
      LEFT JOIN "Cliente" c ON r."DNI" = c."DNI"
      LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
      LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
      ORDER BY r."DiaReserva" DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener reservas:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerReservaPorId = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              c."Nombre" AS cliente_nombre, c."Apellido" AS cliente_apellido,
              rec."Nombre" AS recurso_nombre, rec."esCompleto",
              e."Nombre" AS espacio_nombre
       FROM "Reservas" r
       LEFT JOIN "Cliente" c ON r."DNI" = c."DNI"
       LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
       LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
       WHERE r."idReserva" = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener reserva:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const crearReserva = async (req, res) => {
  try {
    const { DNI, Nombre, idRecurso, HorarioReserva, HorarioFin, Monto, DiaReserva, TipoReserva } = req.body;
    const tipo = TipoReserva || "turno";

    if (!DiaReserva) return res.status(400).json({ message: "La fecha de reserva es obligatoria." });
    if (!idRecurso) return res.status(400).json({ message: "Debés seleccionar un recurso a reservar." });
    if (tipo === "turno" && (!HorarioReserva || !HorarioFin))
      return res.status(400).json({ message: "Horario de inicio y fin son obligatorios." });

    const conflicto = await verificarConflictos(idRecurso, DiaReserva, HorarioReserva || "00:00", HorarioFin || "23:59", tipo, null);
    if (conflicto) return res.status(409).json({ message: conflicto });

    const { rows } = await pool.query(
      `INSERT INTO "Reservas" ("idReserva","DNI","Nombre","idRecurso","HorarioReserva","HorarioFin","Monto","DiaReserva","TipoReserva")
       SELECT COALESCE(MAX("idReserva"),0)+1, $1,$2,$3,$4,$5,$6,$7,$8 FROM "Reservas"
       RETURNING *`,
      [DNI, Nombre, idRecurso, HorarioReserva || null, HorarioFin || null, Monto, DiaReserva, tipo]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear reserva:", error);
    if (error.code === "23503")
      return res.status(400).json({ message: "El DNI no corresponde a un cliente registrado." });
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const actualizarReserva = async (req, res) => {
  try {
    const { DNI, Nombre, idRecurso, HorarioReserva, HorarioFin, Monto, DiaReserva, TipoReserva } = req.body;
    const tipo = TipoReserva || "turno";

    if (!DiaReserva) return res.status(400).json({ message: "La fecha de reserva es obligatoria." });
    if (tipo === "turno" && (!HorarioReserva || !HorarioFin))
      return res.status(400).json({ message: "Horario de inicio y fin son obligatorios." });

    const conflicto = await verificarConflictos(idRecurso, DiaReserva, HorarioReserva || "00:00", HorarioFin || "23:59", tipo, req.params.id);
    if (conflicto) return res.status(409).json({ message: conflicto });

    const result = await pool.query(
      `UPDATE "Reservas" SET "DNI"=$1,"Nombre"=$2,"idRecurso"=$3,
       "HorarioReserva"=$4,"HorarioFin"=$5,"Monto"=$6,"DiaReserva"=$7,"TipoReserva"=$8
       WHERE "idReserva"=$9`,
      [DNI, Nombre, idRecurso, HorarioReserva || null, HorarioFin || null, Monto, DiaReserva, tipo, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    res.json({ message: "Reserva actualizada" });
  } catch (error) {
    console.error("Error al actualizar reserva:", error);
    if (error.code === "23503") return res.status(400).json({ message: "El DNI o recurso no es válido." });
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const eliminarReserva = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query('DELETE FROM "Transaccion" WHERE "idReserva" = $1', [req.params.id]);
    const result = await client.query('DELETE FROM "Reservas" WHERE "idReserva" = $1', [req.params.id]);
    await client.query("COMMIT");
    if (result.rowCount === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    res.json({ message: "Reserva eliminada" });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* */ }
    console.error("Error al eliminar reserva:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};
