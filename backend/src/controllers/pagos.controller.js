import pool from "../config/db.js";
import { serializarHorariosReservaEnFilas } from "../services/horarioReserva.service.js";
import { parsePagination } from "../utils/pagination.js";

function buildPagosListFilters(query) {
  const conditions = [];
  const params = [];
  let i = 1;

  const qRaw = query.q ?? query.search;
  if (qRaw != null && String(qRaw).trim() !== "") {
    const term = `%${String(qRaw).trim()}%`;
    conditions.push(
      `(COALESCE(r."Nombre",'') ILIKE $${i} OR r."DNI"::text ILIKE $${i} OR COALESCE(rec."Nombre",'') ILIKE $${i} OR COALESCE(e."Nombre",'') ILIKE $${i})`
    );
    params.push(term);
    i++;
  }

  const metodo = query.metodo;
  if (metodo != null && String(metodo).trim() !== "" && String(metodo) !== "Todos") {
    conditions.push(`t."MetodoPago" = $${i}`);
    params.push(String(metodo).trim());
    i++;
  }

  if (query.desde) {
    conditions.push(`r."DiaReserva" >= $${i}::date`);
    params.push(query.desde);
    i++;
  }

  if (query.hasta) {
    conditions.push(`r."DiaReserva" <= $${i}::date`);
    params.push(query.hasta);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params, nextParamIndex: i };
}

export const obtenerResumenPagos = async (_req, res) => {
  try {
    const { rows: agg } = await pool.query(`
      SELECT
        COUNT(*)::int AS total_transacciones,
        COALESCE(SUM(CASE WHEN t."EstadoPago" = 'Pagado' THEN r."Monto"::numeric ELSE 0 END), 0)::numeric AS total_ingresos,
        COALESCE(SUM(
          CASE WHEN t."EstadoPago" = 'Pagado' AND r."DiaReserva" = CURRENT_DATE
          THEN r."Monto"::numeric ELSE 0 END
        ), 0)::numeric AS ingresos_hoy,
        COUNT(*) FILTER (WHERE t."TipoPago" = 'presencial')::int AS pagos_presencial,
        COUNT(*) FILTER (WHERE t."TipoPago" = 'online')::int AS pagos_online
      FROM "Transaccion" t
      LEFT JOIN "Reservas" r ON t."idReserva" = r."idReserva"
    `);

    const { rows: pend } = await pool.query(`
      SELECT COUNT(*)::int AS c
      FROM "Reservas" r
      WHERE NOT EXISTS (SELECT 1 FROM "Transaccion" t WHERE t."idReserva" = r."idReserva")
    `);

    const row = agg[0] || {};
    res.json({
      totalTransacciones: row.total_transacciones ?? 0,
      totalIngresosPagados: parseFloat(row.total_ingresos) || 0,
      ingresosHoy: parseFloat(row.ingresos_hoy) || 0,
      pendientesCobro: pend[0]?.c ?? 0,
      pagosPresencial: row.pagos_presencial ?? 0,
      pagosOnline: row.pagos_online ?? 0,
    });
  } catch (error) {
    console.error("Error al obtener resumen de pagos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerPagos = async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 200 });
    const { where, params, nextParamIndex } = buildPagosListFilters(req.query);

    const baseFrom = `
      FROM "Transaccion" t
      LEFT JOIN "Reservas" r ON t."idReserva" = r."idReserva"
      LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
      LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
    `;

    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS c ${baseFrom} ${where}`, params);
    const total = countRows[0]?.c ?? 0;

    const { rows } = await pool.query(
      `
      SELECT
        t."idTransaccion",
        t."idReserva",
        t."MetodoPago",
        t."EstadoPago",
        t."TipoPago",
        r."Nombre" AS reserva_nombre,
        r."DNI" AS cliente_dni,
        r."Monto",
        r."DiaReserva",
        r."HorarioReserva",
        r."HorarioFin",
        r."TipoReserva",
        rec."Nombre" AS recurso_nombre,
        e."Nombre" AS espacio_nombre
      ${baseFrom}
      ${where}
      ORDER BY r."DiaReserva" DESC NULLS LAST, t."idTransaccion" DESC
      LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
    `,
      [...params, limit, offset]
    );

    res.json({ items: serializarHorariosReservaEnFilas(rows), total, limit, offset });
  } catch (error) {
    console.error("Error al obtener transacciones:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerPagoPorId = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, r."Nombre" AS reserva_nombre, r."Monto", r."DiaReserva"
       FROM "Transaccion" t
       LEFT JOIN "Reservas" r ON t."idReserva" = r."idReserva"
       WHERE t."idTransaccion" = $1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Transaccion no encontrada" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener transaccion:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const registrarPago = async (req, res) => {
  try {
    const { idReserva, MetodoPago } = req.body;

    if (!idReserva || !MetodoPago) {
      return res.status(400).json({ message: "Reserva y método de pago son requeridos." });
    }

    const existing = await pool.query(
      'SELECT "idTransaccion", "EstadoPago" FROM "Transaccion" WHERE "idReserva" = $1',
      [idReserva]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].EstadoPago === "Pagado") {
        return res.status(409).json({ message: "Esta reserva ya está pagada." });
      }
      const { rows } = await pool.query(
        `UPDATE "Transaccion" SET "MetodoPago" = $1, "EstadoPago" = 'Pagado', "TipoPago" = 'presencial'
         WHERE "idTransaccion" = $2 RETURNING *`,
        [MetodoPago, existing.rows[0].idTransaccion]
      );
      return res.status(200).json(rows[0]);
    }

    const { rows } = await pool.query(
      `INSERT INTO "Transaccion" ("idReserva", "MetodoPago", "EstadoPago", "TipoPago")
       VALUES ($1, $2, 'Pagado', 'presencial')
       RETURNING *`,
      [idReserva, MetodoPago]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al registrar transaccion:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const actualizarPago = async (req, res) => {
  try {
    const { idReserva, MetodoPago, EstadoPago } = req.body;

    const result = await pool.query(
      'UPDATE "Transaccion" SET "idReserva" = $1, "MetodoPago" = $2, "EstadoPago" = $3 WHERE "idTransaccion" = $4',
      [idReserva, MetodoPago, EstadoPago, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Transaccion no encontrada" });
    }

    res.json({ message: "Transaccion actualizada" });
  } catch (error) {
    console.error("Error al actualizar transaccion:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const cambiarEstadoPago = async (req, res) => {
  try {
    const { EstadoPago } = req.body;
    if (!EstadoPago || !["Pagado", "Pendiente"].includes(EstadoPago)) {
      return res.status(400).json({ message: "EstadoPago inválido" });
    }

    const result = await pool.query(
      'UPDATE "Transaccion" SET "EstadoPago" = $1 WHERE "idTransaccion" = $2 RETURNING "idReserva"',
      [EstadoPago, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Transaccion no encontrada" });
    }

    res.json({ message: "Estado actualizado", EstadoPago });
  } catch (error) {
    console.error("Error al cambiar estado:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerReservasSinPago = async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 });

    const baseFrom = `
      FROM "Reservas" r
      LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
      LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
      WHERE NOT EXISTS (
        SELECT 1 FROM "Transaccion" t WHERE t."idReserva" = r."idReserva"
      )
    `;

    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS c ${baseFrom}`);
    const total = countRows[0]?.c ?? 0;

    const { rows } = await pool.query(
      `
      SELECT r.*,
             rec."Nombre" AS recurso_nombre,
             e."Nombre" AS espacio_nombre
      ${baseFrom}
      ORDER BY r."DiaReserva" DESC NULLS LAST, r."idReserva" DESC
      LIMIT $1 OFFSET $2
    `,
      [limit, offset]
    );

    res.json({ items: rows, total, limit, offset });
  } catch (error) {
    console.error("Error al obtener reservas sin pago:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const eliminarPago = async (req, res) => {
  try {
    const findResult = await pool.query(
      'SELECT "idReserva" FROM "Transaccion" WHERE "idTransaccion" = $1',
      [req.params.id]
    );
    if (findResult.rows.length === 0) {
      return res.status(404).json({ message: "Transaccion no encontrada" });
    }

    await pool.query('DELETE FROM "Transaccion" WHERE "idTransaccion" = $1', [req.params.id]);

    res.json({ message: "Transaccion eliminada" });
  } catch (error) {
    console.error("Error al eliminar transaccion:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
