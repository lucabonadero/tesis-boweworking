import pool from "../config/db.js";
import { listarBeneficios, fijarBeneficio } from "../repositories/beneficioEstudiante.repository.js";

export const obtenerBeneficios = async (_req, res) => {
  try {
    const filas = await listarBeneficios(pool);
    res.json(filas);
  } catch (error) {
    console.error("obtenerBeneficios:", error);
    res.status(500).json({ message: "No se pudieron obtener los beneficios de estudiante." });
  }
};

export const putBeneficio = async (req, res) => {
  try {
    const idRecurso = Number(req.params.idRecurso);
    const { rows } = await pool.query('SELECT 1 FROM "Recursos" WHERE "idRecurso" = $1', [idRecurso]);
    if (rows.length === 0) return res.status(404).json({ message: "El recurso no existe." });

    const fila = await fijarBeneficio(pool, {
      idRecurso,
      habilitado: req.body.habilitado,
      usuarioId: req.usuario?.id ?? null,
    });
    res.json(fila);
  } catch (error) {
    console.error("putBeneficio:", error);
    res.status(500).json({ message: "No se pudo guardar el beneficio de estudiante." });
  }
};
