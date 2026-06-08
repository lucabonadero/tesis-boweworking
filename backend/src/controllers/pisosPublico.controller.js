import pool from "../config/db.js";

// Endpoint público (sin auth) para la home: pisos publicados con su contenido para el carrusel.
export const obtenerPisosPublicos = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        "idPiso",
        "Nombre",
        "Descripcion",
        "IdealPara",
        "Amenities",
        "Imagenes",
        "Color",
        "ImagenUrl"
      FROM "Pisos"
      WHERE "Activo" = true
        AND "Publicado" = true
      ORDER BY "Orden", "idPiso"
    `);

    res.json(rows);
  } catch (error) {
    console.error("Error al obtener pisos públicos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
