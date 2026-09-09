import pool from "../config/db.js";
import {
  obtenerFranjas,
  reemplazarFranjas,
  listarBloqueos,
  crearBloqueo,
  actualizarBloqueo,
  eliminarBloqueo,
  obtenerCadenaRecursos,
  obtenerReservasEnRango,
} from "../repositories/disponibilidadRecurso.repository.js";
import { calcularSlotsDelDia } from "../services/disponibilidadRecurso.service.js";

const MENSAJE_RANGO_INVALIDO = "La fecha de fin debe ser posterior a la de inicio.";

export const obtenerBloqueos = async (req, res) => {
  try {
    const { idRecurso, desde, hasta } = req.query;
    const filas = await listarBloqueos(pool, {
      idRecurso: idRecurso ? Number(idRecurso) : null,
      desde: desde || null,
      hasta: hasta || null,
    });
    res.json(filas);
  } catch (error) {
    console.error("obtenerBloqueos:", error);
    res.status(500).json({ message: "No se pudieron obtener los bloqueos." });
  }
};

export const postBloqueo = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { idRecurso, fechaInicio, fechaFin, motivo } = req.body;

    const cadena = await obtenerCadenaRecursos(client, idRecurso);
    if (cadena.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "El recurso no existe." });
    }

    const bloqueo = await crearBloqueo(client, {
      idRecurso,
      fechaInicio,
      fechaFin,
      motivo,
      creadoPor: req.usuario?.id ?? null,
    });

    // Se informan, no se cancelan: cancelar dispara devolución de créditos.
    const afectadas = await obtenerReservasEnRango(
      client,
      [idRecurso],
      String(fechaInicio).slice(0, 10),
      String(fechaFin).slice(0, 10)
    );

    await client.query("COMMIT");
    res.status(201).json({ bloqueo, reservasAfectadas: afectadas });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23514") {
      return res.status(400).json({ message: MENSAJE_RANGO_INVALIDO });
    }
    console.error("postBloqueo:", error);
    res.status(500).json({ message: "No se pudo crear el bloqueo." });
  } finally {
    client.release();
  }
};

export const putBloqueo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actualizado = await actualizarBloqueo(pool, id, req.body);
    if (!actualizado) return res.status(404).json({ message: "El bloqueo no existe." });
    res.json(actualizado);
  } catch (error) {
    if (error.code === "23514") {
      return res.status(400).json({ message: MENSAJE_RANGO_INVALIDO });
    }
    console.error("putBloqueo:", error);
    res.status(500).json({ message: "No se pudo actualizar el bloqueo." });
  }
};

export const deleteBloqueo = async (req, res) => {
  try {
    const ok = await eliminarBloqueo(pool, Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "El bloqueo no existe." });
    res.json({ message: "Bloqueo eliminado." });
  } catch (error) {
    console.error("deleteBloqueo:", error);
    res.status(500).json({ message: "No se pudo eliminar el bloqueo." });
  }
};

export const getDisponibilidadRecurso = async (req, res) => {
  try {
    const franjas = await obtenerFranjas(pool, Number(req.params.idRecurso));
    res.json(franjas);
  } catch (error) {
    console.error("getDisponibilidadRecurso:", error);
    res.status(500).json({ message: "No se pudo obtener la disponibilidad." });
  }
};

export const putDisponibilidadRecurso = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const idRecurso = Number(req.params.idRecurso);
    await reemplazarFranjas(client, idRecurso, req.body.franjas);
    const franjas = await obtenerFranjas(client, idRecurso);
    await client.query("COMMIT");
    res.json(franjas);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("putDisponibilidadRecurso:", error);
    res.status(500).json({ message: "No se pudo guardar la disponibilidad." });
  } finally {
    client.release();
  }
};

export const getSlots = async (req, res) => {
  try {
    const slots = await calcularSlotsDelDia(pool, Number(req.query.idRecurso), req.query.fecha);
    res.json(slots);
  } catch (error) {
    console.error("getSlots:", error);
    res.status(500).json({ message: "No se pudo obtener la disponibilidad del día." });
  }
};
