import pool from "../config/db.js";

export const obtenerEspacios = async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM "Espacios" ORDER BY "Espacio" ASC');
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener espacios:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const obtenerEspacioPorId = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM "Espacios" WHERE "Espacio" = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Espacio no encontrado" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener espacio:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const crearEspacio = async (req, res) => {
  try {
    const { Nombre, Capacidad, Disponible } = req.body;

    const { rows } = await pool.query(
      'INSERT INTO "Espacios" ("Nombre", "Capacidad", "Disponible") VALUES ($1, $2, $3) RETURNING *',
      [Nombre, Capacidad, Disponible !== undefined ? Disponible : true]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear espacio:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const actualizarEspacio = async (req, res) => {
  try {
    const { Nombre, Capacidad, Disponible } = req.body;

    const result = await pool.query(
      'UPDATE "Espacios" SET "Nombre" = $1, "Capacidad" = $2, "Disponible" = $3 WHERE "Espacio" = $4',
      [Nombre, Capacidad, Disponible, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Espacio no encontrado" });
    }

    res.json({ message: "Espacio actualizado" });
  } catch (error) {
    console.error("Error al actualizar espacio:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const eliminarEspacio = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM "Espacios" WHERE "Espacio" = $1',
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Espacio no encontrado" });
    }

    res.json({ message: "Espacio eliminado" });
  } catch (error) {
    console.error("Error al eliminar espacio:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
