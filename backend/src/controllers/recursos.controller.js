import pool from "../config/db.js";

export const obtenerRecursos = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, e."Nombre" AS espacio_nombre
      FROM "Recursos" r
      LEFT JOIN "Espacios" e ON r."idEspacio" = e."Espacio"
      ORDER BY r."idEspacio", r."idRecursoPadre" NULLS FIRST, r."idRecurso"
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener recursos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerRecursosPorEspacio = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM "Recursos"
       WHERE "idEspacio" = $1
       ORDER BY "idRecursoPadre" NULLS FIRST, "idRecurso"`,
      [req.params.idEspacio]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener recursos del espacio:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerRecursoPorId = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, e."Nombre" AS espacio_nombre
       FROM "Recursos" r
       LEFT JOIN "Espacios" e ON r."idEspacio" = e."Espacio"
       WHERE r."idRecurso" = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Recurso no encontrado" });
    res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener recurso:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const crearRecurso = async (req, res) => {
  try {
    const { idEspacio, idRecursoPadre, Nombre, Descripcion, esCompleto } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO "Recursos" ("idEspacio","idRecursoPadre","Nombre","Descripcion","esCompleto")
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [idEspacio, idRecursoPadre || null, Nombre, Descripcion || null, esCompleto || false]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear recurso:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const actualizarRecurso = async (req, res) => {
  try {
    const { idEspacio, idRecursoPadre, Nombre, Descripcion, esCompleto } = req.body;
    const result = await pool.query(
      `UPDATE "Recursos"
       SET "idEspacio"=$1,"idRecursoPadre"=$2,"Nombre"=$3,"Descripcion"=$4,"esCompleto"=$5
       WHERE "idRecurso"=$6`,
      [idEspacio, idRecursoPadre || null, Nombre, Descripcion, esCompleto, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "Recurso no encontrado" });
    res.json({ message: "Recurso actualizado" });
  } catch (error) {
    console.error("Error al actualizar recurso:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const eliminarRecurso = async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM "Recursos" WHERE "idRecurso" = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ message: "Recurso no encontrado" });
    res.json({ message: "Recurso eliminado" });
  } catch (error) {
    console.error("Error al eliminar recurso:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * GET /api/recursos/disponibilidad
 *
 * For turnos:  ?fecha=2026-04-15&horaInicio=10:00&horaFin=12:00
 * For packs:   ?tipo=semanal&fechaInicio=2026-04-15
 *              ?tipo=mensual&fechaInicio=2026-04-15
 *
 * Returns all recursos with `disponible: true/false`.
 * For pack queries, only returns Oficina resources.
 */
export const obtenerDisponibilidad = async (req, res) => {
  try {
    const { fecha, horaInicio, horaFin, tipo, fechaInicio } = req.query;

    const isPack = tipo === "semanal" || tipo === "mensual";

    if (!isPack && (!fecha || !horaInicio || !horaFin)) {
      return res.status(400).json({ message: "Parámetros requeridos: fecha, horaInicio, horaFin" });
    }
    if (isPack && !fechaInicio) {
      return res.status(400).json({ message: "Parámetro requerido: fechaInicio" });
    }

    const queryFecha = isPack ? fechaInicio : fecha;
    const dias = tipo === "semanal" ? 6 : tipo === "mensual" ? 29 : 0;
    const qHoraIni = isPack ? "00:00" : horaInicio;
    const qHoraFin = isPack ? "23:59" : horaFin;
    const qTipo = isPack ? tipo : "turno";

    const resourceFilter = isPack
      ? `WHERE r."idEspacio" = (SELECT "Espacio" FROM "Espacios" WHERE "Nombre" ILIKE '%Primer Piso%' LIMIT 1)
         AND (r."Nombre" ILIKE '%Escritorio%' OR r."Nombre" ILIKE '%Oficina%')`
      : "";

    const { rows: recursos } = await pool.query(`
      SELECT r.*, e."Nombre" AS espacio_nombre
      FROM "Recursos" r
      LEFT JOIN "Espacios" e ON r."idEspacio" = e."Espacio"
      ${resourceFilter}
      ORDER BY r."idEspacio", r."idRecursoPadre" NULLS FIRST, r."idRecurso"
    `);

    // For each reservable resource, check conflicts
    const results = [];
    for (const rec of recursos) {
      const hasChildren = recursos.some((r) => r.idRecursoPadre === rec.idRecurso);
      if (hasChildren) {
        results.push({ ...rec, disponible: null, esGrupo: true });
        continue;
      }

      const { rows: conflict } = await pool.query(
        `SELECT COUNT(*) AS n FROM "Reservas" res WHERE res."idRecurso" = $1 AND (
          (COALESCE(res."TipoReserva",'turno') = 'turno' AND (
            CASE $2
              WHEN 'turno' THEN res."DiaReserva" = $3::DATE AND res."HorarioReserva"::TIME < $5::TIME AND res."HorarioFin"::TIME > $4::TIME
              ELSE res."DiaReserva" BETWEEN $3::DATE AND ($3::DATE + $6::INT)
            END))
          OR (res."TipoReserva" = 'semanal' AND (
            CASE $2
              WHEN 'turno' THEN $3::DATE BETWEEN res."DiaReserva" AND (res."DiaReserva"::DATE + 6)
              ELSE res."DiaReserva" <= ($3::DATE + $6::INT) AND (res."DiaReserva"::DATE + 6) >= $3::DATE
            END))
          OR (res."TipoReserva" = 'mensual' AND (
            CASE $2
              WHEN 'turno' THEN $3::DATE BETWEEN res."DiaReserva" AND (res."DiaReserva"::DATE + 29)
              ELSE res."DiaReserva" <= ($3::DATE + $6::INT) AND (res."DiaReserva"::DATE + 29) >= $3::DATE
            END))
        )`,
        [rec.idRecurso, qTipo, queryFecha, qHoraIni, qHoraFin, dias]
      );
      results.push({ ...rec, disponible: parseInt(conflict[0].n) === 0, esGrupo: false });
    }

    // Apply "completo" logic: if a "completo" resource is NOT available,
    // all siblings remain as-is. If ALL individual siblings are taken,
    // the "completo" is also not available.
    for (const rec of results) {
      if (rec.esGrupo) continue;
      if (rec.esCompleto && rec.disponible) {
        const siblings = results.filter(
          (r) =>
            !r.esGrupo &&
            !r.esCompleto &&
            ((rec.idRecursoPadre && r.idRecursoPadre === rec.idRecursoPadre) ||
              (!rec.idRecursoPadre && r.idEspacio === rec.idEspacio && !r.idRecursoPadre))
        );
        if (siblings.some((s) => !s.disponible)) {
          rec.disponible = false;
        }
      }
      if (!rec.esCompleto && rec.disponible) {
        const completoRes = results.find(
          (r) =>
            r.esCompleto &&
            !r.esGrupo &&
            !r.disponible === false &&
            ((rec.idRecursoPadre && r.idRecursoPadre === rec.idRecursoPadre) ||
              (!rec.idRecursoPadre && r.idEspacio === rec.idEspacio && !r.idRecursoPadre))
        );
        // if completo is taken, mark individual as unavailable
        if (completoRes && completoRes.disponible === false) {
          rec.disponible = false;
        }
      }
    }

    res.json(results);
  } catch (error) {
    console.error("Error al obtener disponibilidad:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
