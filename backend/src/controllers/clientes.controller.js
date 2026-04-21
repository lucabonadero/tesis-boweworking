import pool from "../config/db.js";
import { parsePagination } from "../utils/pagination.js";

function buildClientesFilters(query) {
  const conditions = [];
  const params = [];
  let i = 1;

  const qRaw = query.q ?? query.search;
  if (qRaw != null && String(qRaw).trim() !== "") {
    const term = `%${String(qRaw).trim()}%`;
    conditions.push(
      `(c."DNI"::text ILIKE $${i} OR COALESCE(c."Nombre",'') ILIKE $${i} OR COALESCE(c."Apellido",'') ILIKE $${i} OR COALESCE(c."Email",'') ILIKE $${i})`
    );
    params.push(term);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params, nextParamIndex: i };
}

export const obtenerClientes = async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 30, maxLimit: 200 });
    const { where, params, nextParamIndex } = buildClientesFilters(req.query);

    const baseFrom = `FROM "Cliente" c LEFT JOIN "Empresa" e ON c."idEmpresa" = e."idEmpresa"`;

    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS c ${baseFrom} ${where}`, params);
    const total = countRows[0]?.c ?? 0;

    const { rows } = await pool.query(
      `
      SELECT c.*, e."Nombre" AS empresa_nombre
      ${baseFrom}
      ${where}
      ORDER BY c."Apellido" ASC NULLS LAST, c."Nombre" ASC NULLS LAST, c."DNI" ASC
      LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
    `,
      [...params, limit, offset]
    );

    res.json({ items: rows, total, limit, offset });
  } catch (error) {
    console.error("Error al obtener clientes:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerClientePorDni = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT c.*, e."Nombre" AS empresa_nombre FROM "Cliente" c LEFT JOIN "Empresa" e ON c."idEmpresa" = e."idEmpresa" WHERE c."DNI" = $1',
      [req.params.dni]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener cliente:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const crearCliente = async (req, res) => {
  try {
    const { DNI, Nombre, Apellido, Email, idEmpresa } = req.body;

    const { rows } = await pool.query(
      'INSERT INTO "Cliente" ("DNI", "Nombre", "Apellido", "Email", "idEmpresa") VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [DNI, Nombre, Apellido, Email, idEmpresa || null]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear cliente:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const actualizarCliente = async (req, res) => {
  try {
    const { Nombre, Apellido, Email, idEmpresa } = req.body;

    const result = await pool.query(
      'UPDATE "Cliente" SET "Nombre" = $1, "Apellido" = $2, "Email" = $3, "idEmpresa" = $4 WHERE "DNI" = $5',
      [Nombre, Apellido, Email, idEmpresa || null, req.params.dni]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    res.json({ message: "Cliente actualizado" });
  } catch (error) {
    console.error("Error al actualizar cliente:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const eliminarCliente = async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM "Cliente" WHERE "DNI" = $1', [req.params.dni]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    res.json({ message: "Cliente eliminado" });
  } catch (error) {
    console.error("Error al eliminar cliente:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
