import pool from "../config/db.js";

export const obtenerPagos = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, r."Nombre" AS reserva_nombre, r."Monto", r."DiaReserva"
      FROM "Transaccion" t
      LEFT JOIN "Reservas" r ON t."idReserva" = r."idReserva"
      ORDER BY t."idTransaccion" DESC
    `);
    res.json(rows);
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
    const { idReserva, MetodoPago, EstadoPago } = req.body;

    const { rows } = await pool.query(
      'INSERT INTO "Transaccion" ("idReserva", "MetodoPago", "EstadoPago") VALUES ($1, $2, $3) RETURNING *',
      [idReserva, MetodoPago, EstadoPago || "Pendiente"]
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

export const eliminarPago = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM "Transaccion" WHERE "idTransaccion" = $1',
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Transaccion no encontrada" });
    }

    res.json({ message: "Transaccion eliminada" });
  } catch (error) {
    console.error("Error al eliminar transaccion:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
