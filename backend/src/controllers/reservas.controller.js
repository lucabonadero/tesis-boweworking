import pool from "../config/db.js";

export const obtenerReservas = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, c."Nombre" AS cliente_nombre, c."Apellido" AS cliente_apellido,
             e."Nombre" AS espacio_nombre
      FROM "Reservas" r
      LEFT JOIN "Cliente" c ON r."DNI" = c."DNI"
      LEFT JOIN "Espacios" e ON r."idEspacio" = e."Espacio"
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
      `SELECT r.*, c."Nombre" AS cliente_nombre, c."Apellido" AS cliente_apellido,
              e."Nombre" AS espacio_nombre
       FROM "Reservas" r
       LEFT JOIN "Cliente" c ON r."DNI" = c."DNI"
       LEFT JOIN "Espacios" e ON r."idEspacio" = e."Espacio"
       WHERE r."idReserva" = $1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Reserva no encontrada" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener reserva:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const crearReserva = async (req, res) => {
  try {
    const { DNI, Nombre, idEspacio, HorarioReserva, Monto, DiaReserva } = req.body;

    const { rows } = await pool.query(
      'INSERT INTO "Reservas" ("DNI", "Nombre", "idEspacio", "HorarioReserva", "Monto", "DiaReserva") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [DNI, Nombre, idEspacio, HorarioReserva, Monto, DiaReserva]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear reserva:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const actualizarReserva = async (req, res) => {
  try {
    const { DNI, Nombre, idEspacio, HorarioReserva, Monto, DiaReserva } = req.body;

    const result = await pool.query(
      'UPDATE "Reservas" SET "DNI" = $1, "Nombre" = $2, "idEspacio" = $3, "HorarioReserva" = $4, "Monto" = $5, "DiaReserva" = $6 WHERE "idReserva" = $7',
      [DNI, Nombre, idEspacio, HorarioReserva, Monto, DiaReserva, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Reserva no encontrada" });
    }

    res.json({ message: "Reserva actualizada" });
  } catch (error) {
    console.error("Error al actualizar reserva:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const eliminarReserva = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM "Reservas" WHERE "idReserva" = $1',
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Reserva no encontrada" });
    }

    res.json({ message: "Reserva eliminada" });
  } catch (error) {
    console.error("Error al eliminar reserva:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
