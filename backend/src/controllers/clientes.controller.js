import pool from "../config/db.js";

export const obtenerClientes = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT c.*, e."Nombre" AS empresa_nombre FROM "Cliente" c LEFT JOIN "Empresa" e ON c."idEmpresa" = e."idEmpresa" ORDER BY c."Apellido" ASC'
    );
    res.json(rows);
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
    const result = await pool.query(
      'DELETE FROM "Cliente" WHERE "DNI" = $1',
      [req.params.dni]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    res.json({ message: "Cliente eliminado" });
  } catch (error) {
    console.error("Error al eliminar cliente:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
