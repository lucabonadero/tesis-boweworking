import pool from "../config/db.js";
import { getDisponibilidadTurno } from "../services/disponibilidadTurno.service.js";
import { horariosParaReservaTurno } from "../services/horarioReserva.service.js";
import {
  validarVentanaOperativaTurno,
  validarDiaReservaNoEnElPasado,
  validarInicioTurnoNoEnElPasado,
} from "../services/coworkingHours.service.js";

export const obtenerRecursos = async (req, res) => {
  const incluirInactivos = req.query.incluirInactivos === "true";
  const filtro = incluirInactivos ? "" : 'WHERE r."Activo" = true';
  try {
    const { rows } = await pool.query(`
      SELECT r.*, e."Nombre" AS espacio_nombre
      FROM "Recursos" r
      LEFT JOIN "Espacios" e ON r."idEspacio" = e."Espacio"
      ${filtro}
      ORDER BY r."idEspacio", r."idRecursoPadre" NULLS FIRST, r."Orden", r."idRecurso"
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener recursos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerRecursosPorEspacio = async (req, res) => {
  const incluirInactivos = req.query.incluirInactivos === "true";
  const filtroActivo = incluirInactivos ? "" : 'AND "Activo" = true';
  try {
    const { rows } = await pool.query(
      `SELECT * FROM "Recursos"
       WHERE "idEspacio" = $1 ${filtroActivo}
       ORDER BY "idRecursoPadre" NULLS FIRST, "Orden", "idRecurso"`,
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
    const {
      idEspacio, idRecursoPadre, Nombre, Descripcion, esCompleto,
      PrecioHora, PrecioSemanal, PrecioMensual,
      Tipo, Orden, AceptaPackSemanal, AceptaPackMensual, EsReservablePorTurno,
    } = req.body;

    if (!idEspacio || !Nombre) {
      return res.status(400).json({ message: "idEspacio y Nombre son requeridos" });
    }

    const { rows } = await pool.query(
      `INSERT INTO "Recursos"
       ("idEspacio","idRecursoPadre","Nombre","Descripcion","esCompleto",
        "PrecioHora","PrecioSemanal","PrecioMensual",
        "Tipo","Orden","Activo","AceptaPackSemanal","AceptaPackMensual","EsReservablePorTurno")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13) RETURNING *`,
      [
        idEspacio, idRecursoPadre || null, Nombre, Descripcion || null, esCompleto || false,
        PrecioHora || null, PrecioSemanal || null, PrecioMensual || null,
        Tipo || null, Orden ?? 0,
        AceptaPackSemanal || false, AceptaPackMensual || false,
        EsReservablePorTurno !== undefined ? EsReservablePorTurno : true,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear recurso:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const actualizarRecurso = async (req, res) => {
  try {
    const {
      idEspacio, idRecursoPadre, Nombre, Descripcion, esCompleto,
      PrecioHora, PrecioSemanal, PrecioMensual,
      Tipo, Orden, Activo, AceptaPackSemanal, AceptaPackMensual, EsReservablePorTurno,
    } = req.body;

    const result = await pool.query(
      `UPDATE "Recursos"
       SET "idEspacio"=COALESCE($1,"idEspacio"),
           "idRecursoPadre"=$2,
           "Nombre"=COALESCE($3,"Nombre"),
           "Descripcion"=COALESCE($4,"Descripcion"),
           "esCompleto"=COALESCE($5,"esCompleto"),
           "PrecioHora"=$6,
           "PrecioSemanal"=$7,
           "PrecioMensual"=$8,
           "Tipo"=COALESCE($9,"Tipo"),
           "Orden"=COALESCE($10,"Orden"),
           "Activo"=COALESCE($11,"Activo"),
           "AceptaPackSemanal"=COALESCE($12,"AceptaPackSemanal"),
           "AceptaPackMensual"=COALESCE($13,"AceptaPackMensual"),
           "EsReservablePorTurno"=COALESCE($14,"EsReservablePorTurno")
       WHERE "idRecurso"=$15`,
      [
        idEspacio ?? null, idRecursoPadre ?? null, Nombre ?? null, Descripcion ?? null, esCompleto ?? null,
        PrecioHora ?? null, PrecioSemanal ?? null, PrecioMensual ?? null,
        Tipo ?? null, Orden ?? null, Activo ?? null,
        AceptaPackSemanal ?? null, AceptaPackMensual ?? null, EsReservablePorTurno ?? null,
        req.params.id,
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "Recurso no encontrado" });
    res.json({ message: "Recurso actualizado" });
  } catch (error) {
    console.error("Error al actualizar recurso:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * Soft delete: bloquea si hay reservas futuras o sub-recursos activos.
 */
export const eliminarRecurso = async (req, res) => {
  const idRecurso = req.params.id;
  try {
    const { rows: rsv } = await pool.query(
      `SELECT COUNT(*) AS n FROM "Reservas"
       WHERE "idRecurso"=$1 AND "DiaReserva" >= CURRENT_DATE`,
      [idRecurso]
    );
    if (Number(rsv[0].n) > 0) {
      return res.status(409).json({
        message: `El recurso tiene ${rsv[0].n} reserva(s) futura(s). Cancelalas antes de eliminar.`,
      });
    }

    const { rows: subs } = await pool.query(
      `SELECT COUNT(*) AS n FROM "Recursos" WHERE "idRecursoPadre"=$1 AND "Activo"=true`,
      [idRecurso]
    );
    if (Number(subs[0].n) > 0) {
      return res.status(409).json({
        message: `El recurso tiene ${subs[0].n} sub-recurso(s) activos. Eliminalos primero.`,
      });
    }

    const result = await pool.query(
      `UPDATE "Recursos" SET "Activo"=false WHERE "idRecurso"=$1`,
      [idRecurso]
    );
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
 * For pack queries, only returns recursos marked AceptaPack(Semanal|Mensual).
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

    if (!isPack) {
      const nh = horariosParaReservaTurno(horaInicio, horaFin);
      if (nh.error) return res.status(400).json({ message: nh.error });
      const errH = validarVentanaOperativaTurno(nh.horaIni, nh.horaFin);
      if (errH) return res.status(400).json({ message: errH });
      const errDia = validarDiaReservaNoEnElPasado(fecha);
      if (errDia) return res.status(400).json({ message: errDia });
      const errPasado = validarInicioTurnoNoEnElPasado(fecha, nh.horaIni);
      if (errPasado) return res.status(400).json({ message: errPasado });
      const results = await getDisponibilidadTurno(fecha, nh.horaIni, nh.horaFin);
      return res.json(results);
    }

    const queryFecha = fechaInicio;
    const errDiaPack = validarDiaReservaNoEnElPasado(queryFecha);
    if (errDiaPack) return res.status(400).json({ message: errDiaPack });
    const dias = tipo === "semanal" ? 6 : 29;
    const qHoraIni = "00:00";
    const qHoraFin = "23:59";
    const qTipo = tipo;

    // Filtrar por flag en lugar de nombre. AceptaPackSemanal/Mensual lo configura el admin.
    const flagCol = tipo === "semanal" ? "AceptaPackSemanal" : "AceptaPackMensual";

    const { rows: recursos } = await pool.query(`
      SELECT r.*, e."Nombre" AS espacio_nombre
      FROM "Recursos" r
      LEFT JOIN "Espacios" e ON r."idEspacio" = e."Espacio"
      WHERE r."Activo" = true
        AND r."${flagCol}" = true
      ORDER BY r."idEspacio", r."idRecursoPadre" NULLS FIRST, r."Orden", r."idRecurso"
    `);

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
