import pool from "../config/db.js";
import { serializarHorariosReservaEnFilas } from "../services/horarioReserva.service.js";
import { parsePagination } from "../utils/pagination.js";

function armarFiltrosListaPagos(query) {
  const condiciones = [];
  const params = [];
  let i = 1;

  const consultaCruda = query.q ?? query.search;
  if (consultaCruda != null && String(consultaCruda).trim() !== "") {
    const termino = `%${String(consultaCruda).trim()}%`;
    condiciones.push(
      `(COALESCE(r."Nombre",'') ILIKE $${i} OR r."DNI"::text ILIKE $${i} OR COALESCE(rec."Nombre",'') ILIKE $${i} OR COALESCE(e."Nombre",'') ILIKE $${i})`
    );
    params.push(termino);
    i++;
  }

  const metodo = query.metodo;
  if (metodo != null && String(metodo).trim() !== "" && String(metodo) !== "Todos") {
    condiciones.push(`t."MetodoPago" = $${i}`);
    params.push(String(metodo).trim());
    i++;
  }

  if (query.desde) {
    condiciones.push(`r."DiaReserva" >= $${i}::date`);
    params.push(query.desde);
    i++;
  }

  if (query.hasta) {
    condiciones.push(`r."DiaReserva" <= $${i}::date`);
    params.push(query.hasta);
    i++;
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  return { where, params, siguienteIndiceParam: i };
}

/** Lote multi-recurso o serie fija (4 semanas): un solo pago debe cubrir todas las filas. */
async function idsReservasPagoUnificado(q, idReserva) {
  try {
    const { rows: one } = await q.query(
      'SELECT "idReservaGrupo", "idSerie" FROM "Reservas" WHERE "idReserva" = $1',
      [idReserva]
    );
    if (one.length === 0) return [idReserva];
    const g = one[0].idReservaGrupo;
    if (g != null) {
      const { rows } = await q.query(
        'SELECT "idReserva" FROM "Reservas" WHERE "idReservaGrupo" = $1 ORDER BY "idReserva" ASC',
        [g]
      );
      return rows.length ? rows.map((r) => r.idReserva) : [idReserva];
    }
    const s = one[0].idSerie;
    if (s != null) {
      const { rows } = await q.query(
        'SELECT "idReserva" FROM "Reservas" WHERE "idSerie" = $1 ORDER BY "idReserva" ASC',
        [s]
      );
      return rows.length ? rows.map((r) => r.idReserva) : [idReserva];
    }
    return [idReserva];
  } catch (e) {
    if (e.code === "42703") return [idReserva];
    throw e;
  }
}

async function enlazarTransaccionMultireserva(client, idTransaccion, idsReserva) {
  if (!idsReserva || idsReserva.length <= 1) return;
  try {
    await client.query('DELETE FROM "TransaccionReserva" WHERE "idTransaccion" = $1', [idTransaccion]);
    for (const rid of idsReserva) {
      await client.query(
        `INSERT INTO "TransaccionReserva" ("idTransaccion", "idReserva") VALUES ($1, $2)
         ON CONFLICT ("idTransaccion", "idReserva") DO NOTHING`,
        [idTransaccion, rid]
      );
    }
  } catch (e) {
    if (e.code !== "42P01") throw e;
  }
}

/**
 * Monto cobrado por transacción:
 *  - extensión: su propio importe (ext."Monto"),
 *  - pack serie (precioFinalTotal),
 *  - lote multi-recurso (suma vía TransaccionReserva),
 *  - turno simple (monto de la reserva ancla).
 */
const SQL_MONTO_TRANSACCION = `COALESCE(
  ext."Monto",
  rs."precioFinalTotal",
  (SELECT SUM(r2."Monto")::numeric FROM "TransaccionReserva" tr2
   INNER JOIN "Reservas" r2 ON r2."idReserva" = tr2."idReserva"
   WHERE tr2."idTransaccion" = t."idTransaccion"),
  r."Monto"::numeric
)`;

/** Mensaje de migración faltante para el módulo de extensiones. */
const MIGRACION_EXTENSION_HINT =
  "El servidor aún no tiene aplicada la migración backend/database/migration_extension_reserva.sql. Ejecutala contra Postgres y reiniciá el backend.";

export const obtenerResumenPagos = async (_req, res) => {
  try {
    const { rows: agg } = await pool.query(`
      SELECT
        COUNT(*)::int AS total_transacciones,
        COALESCE(SUM(CASE WHEN t."EstadoPago" = 'Pagado' THEN
          ${SQL_MONTO_TRANSACCION} ELSE 0 END), 0)::numeric AS total_ingresos,
        COALESCE(SUM(
          CASE WHEN t."EstadoPago" = 'Pagado' AND r."DiaReserva" = CURRENT_DATE
          THEN ${SQL_MONTO_TRANSACCION} ELSE 0 END
        ), 0)::numeric AS ingresos_hoy,
        COUNT(*) FILTER (WHERE t."TipoPago" = 'presencial')::int AS pagos_presencial,
        COUNT(*) FILTER (WHERE t."TipoPago" = 'online')::int AS pagos_online
      FROM "Transaccion" t
      LEFT JOIN "Reservas" r ON t."idReserva" = r."idReserva"
      LEFT JOIN "ReservaSerie" rs ON r."idSerie" = rs."idSerie"
      LEFT JOIN "ReservaExtension" ext ON t."idExtension" = ext."idExtension"
    `);

    const { rows: pend } = await pool.query(`
      SELECT COUNT(*)::int AS c
      FROM "Reservas" r
      WHERE NOT EXISTS (SELECT 1 FROM "Transaccion" t WHERE t."idReserva" = r."idReserva")
        AND NOT EXISTS (
          SELECT 1 FROM "TransaccionReserva" tr
          INNER JOIN "Transaccion" t2 ON t2."idTransaccion" = tr."idTransaccion"
          WHERE tr."idReserva" = r."idReserva"
        )
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
    if (error.code === "42P01" || error.code === "42703") {
      return res.status(503).json({ message: MIGRACION_EXTENSION_HINT });
    }
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerPagos = async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 200 });
    const { where, params, siguienteIndiceParam } = armarFiltrosListaPagos(req.query);

    const desdeBase = `
      FROM "Transaccion" t
      LEFT JOIN "Reservas" r ON t."idReserva" = r."idReserva"
      LEFT JOIN "ReservaSerie" rs ON r."idSerie" = rs."idSerie"
      LEFT JOIN "ReservaExtension" ext ON t."idExtension" = ext."idExtension"
      LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
      LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
    `;

    const { rows: filasConteo } = await pool.query(`SELECT COUNT(*)::int AS c ${desdeBase} ${where}`, params);
    const total = filasConteo[0]?.c ?? 0;

    const { rows } = await pool.query(
      `
      SELECT
        t."idTransaccion",
        t."idReserva",
        t."MetodoPago",
        t."EstadoPago",
        t."TipoPago",
        t."ClasificacionPago",
        t."idExtension",
        ext."MinutosExtension" AS extension_minutos,
        ext."Fracciones" AS extension_fracciones,
        ext."Veces" AS extension_veces,
        ext."Finalizada" AS extension_finalizada,
        TO_CHAR(ext."HorarioFinOriginal", 'HH24:MI') AS extension_fin_anterior,
        TO_CHAR(ext."HorarioFinActual", 'HH24:MI') AS extension_fin_nuevo,
        r."Nombre" AS reserva_nombre,
        r."DNI" AS cliente_dni,
        ${SQL_MONTO_TRANSACCION} AS "Monto",
        r."DiaReserva",
        r."HorarioReserva",
        r."HorarioFin",
        r."TipoReserva",
        CASE
          WHEN rs."idSerie" IS NOT NULL THEN rec."Nombre"
          WHEN (SELECT COUNT(*)::int FROM "TransaccionReserva" trc WHERE trc."idTransaccion" = t."idTransaccion") > 1
          THEN (SELECT STRING_AGG(recg."Nombre", ', ' ORDER BY rg."idReserva")
                FROM "TransaccionReserva" trg
                INNER JOIN "Reservas" rg ON rg."idReserva" = trg."idReserva"
                LEFT JOIN "Recursos" recg ON recg."idRecurso" = rg."idRecurso"
                WHERE trg."idTransaccion" = t."idTransaccion")
          ELSE rec."Nombre"
        END AS recurso_nombre,
        e."Nombre" AS espacio_nombre
      ${desdeBase}
      ${where}
      ORDER BY r."DiaReserva" DESC NULLS LAST, t."idTransaccion" DESC
      LIMIT $${siguienteIndiceParam} OFFSET $${siguienteIndiceParam + 1}
    `,
      [...params, limit, offset]
    );

    res.json({ items: serializarHorariosReservaEnFilas(rows), total, limit, offset });
  } catch (error) {
    console.error("Error al obtener transacciones:", error);
    if (error.code === "42P01" || error.code === "42703") {
      return res.status(503).json({ message: MIGRACION_EXTENSION_HINT });
    }
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

    const idsVinculados = await idsReservasPagoUnificado(pool, idReserva);
    const idAncla = Math.min(...idsVinculados);

    const { rows: metaClas } = await pool.query(
      'SELECT "idSerie", "idReservaGrupo" FROM "Reservas" WHERE "idReserva" = $1',
      [idAncla]
    );
    let clasificacionPago = null;
    if (metaClas[0]?.idSerie != null) clasificacionPago = "reserva_fija";
    else if (idsVinculados.length > 1 && metaClas[0]?.idReservaGrupo != null) clasificacionPago = "multirecurso";

    const existente = await pool.query(
      `SELECT t."idTransaccion", t."EstadoPago"
       FROM "Transaccion" t
       WHERE t."idReserva" = ANY($1::int[])
          OR t."idTransaccion" IN (
            SELECT tr."idTransaccion" FROM "TransaccionReserva" tr WHERE tr."idReserva" = ANY($1::int[])
          )
       ORDER BY t."idTransaccion" DESC
       LIMIT 1`,
      [idsVinculados]
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (existente.rows.length > 0) {
        if (existente.rows[0].EstadoPago === "Pagado") {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "Esta reserva ya está pagada." });
        }
        const { rows } = await client.query(
          `UPDATE "Transaccion" SET "MetodoPago" = $1, "EstadoPago" = 'Pagado', "TipoPago" = 'presencial',
             "ClasificacionPago" = COALESCE("ClasificacionPago", $3)
           WHERE "idTransaccion" = $2 RETURNING *`,
          [MetodoPago, existente.rows[0].idTransaccion, clasificacionPago]
        );
        await enlazarTransaccionMultireserva(client, rows[0].idTransaccion, idsVinculados);
        await client.query("COMMIT");
        return res.status(200).json(rows[0]);
      }

      const { rows } = await client.query(
        `INSERT INTO "Transaccion" ("idReserva", "MetodoPago", "EstadoPago", "TipoPago", "ClasificacionPago")
         VALUES ($1, $2, 'Pagado', 'presencial', $3)
         RETURNING *`,
        [idAncla, MetodoPago, clasificacionPago]
      );
      await enlazarTransaccionMultireserva(client, rows[0].idTransaccion, idsVinculados);
      await client.query("COMMIT");
      res.status(201).json(rows[0]);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* */
      }
      throw err;
    } finally {
      client.release();
    }
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
    const { EstadoPago, MetodoPago } = req.body;
    if (!EstadoPago || !["Pagado", "Pendiente"].includes(EstadoPago)) {
      return res.status(400).json({ message: "EstadoPago inválido" });
    }

    // Al cobrar (Pendiente → Pagado) se puede registrar el método elegido.
    // Útil para liquidar cargos de extensión que nacieron sin método.
    let result;
    if (EstadoPago === "Pagado" && MetodoPago != null && String(MetodoPago).trim() !== "") {
      result = await pool.query(
        `UPDATE "Transaccion"
         SET "EstadoPago" = $1, "MetodoPago" = $2, "TipoPago" = COALESCE("TipoPago", 'presencial')
         WHERE "idTransaccion" = $3 RETURNING "idReserva"`,
        [EstadoPago, String(MetodoPago).trim(), req.params.id]
      );
    } else {
      result = await pool.query(
        'UPDATE "Transaccion" SET "EstadoPago" = $1 WHERE "idTransaccion" = $2 RETURNING "idReserva"',
        [EstadoPago, req.params.id]
      );
    }

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

    const desdeBase = `
      FROM "Reservas" r
      LEFT JOIN "Recursos" rec ON r."idRecurso" = rec."idRecurso"
      LEFT JOIN "Espacios" e ON rec."idEspacio" = e."Espacio"
      WHERE NOT EXISTS (
        SELECT 1 FROM "Transaccion" t WHERE t."idReserva" = r."idReserva"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "TransaccionReserva" tr
        INNER JOIN "Transaccion" t2 ON t2."idTransaccion" = tr."idTransaccion"
        WHERE tr."idReserva" = r."idReserva"
      )
    `;

    const { rows: filasConteo } = await pool.query(`SELECT COUNT(*)::int AS c ${desdeBase}`);
    const total = filasConteo[0]?.c ?? 0;

    const { rows } = await pool.query(
      `
      SELECT r.*,
             rec."Nombre" AS recurso_nombre,
             e."Nombre" AS espacio_nombre
      ${desdeBase}
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
    const resultadoBusqueda = await pool.query(
      'SELECT "idReserva" FROM "Transaccion" WHERE "idTransaccion" = $1',
      [req.params.id]
    );
    if (resultadoBusqueda.rows.length === 0) {
      return res.status(404).json({ message: "Transaccion no encontrada" });
    }

    await pool.query('DELETE FROM "Transaccion" WHERE "idTransaccion" = $1', [req.params.id]);

    res.json({ message: "Transaccion eliminada" });
  } catch (error) {
    console.error("Error al eliminar transaccion:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
