import pool from "../config/db.js";

export const obtenerEspacios = async (req, res) => {
  const incluirInactivos = req.query.incluirInactivos === "true";
  const filtro = incluirInactivos ? "" : 'WHERE "Activo" = true';
  try {
    const { rows } = await pool.query(
      `SELECT * FROM "Espacios" ${filtro} ORDER BY "Orden", "Espacio" ASC`
    );
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
    const {
      Nombre, Capacidad, Disponible,
      idPiso, idEspacioPadre, Tipo, Orden, Descripcion,
    } = req.body;

    if (!Nombre) {
      return res.status(400).json({ message: "Nombre es requerido" });
    }
    const tipoFinal = Tipo || "espacio";
    if (!["sector", "area", "espacio"].includes(tipoFinal)) {
      return res.status(400).json({ message: "Tipo inválido (valores: sector, area, espacio)" });
    }

    const { rows } = await pool.query(
      `INSERT INTO "Espacios"
       ("Nombre","Capacidad","Disponible","idPiso","idEspacioPadre","Tipo","Orden","Descripcion","Activo")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *`,
      [
        Nombre, Capacidad ?? null, Disponible !== undefined ? Disponible : true,
        idPiso ?? null, idEspacioPadre ?? null, tipoFinal, Orden ?? 0, Descripcion ?? null,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear espacio:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const actualizarEspacio = async (req, res) => {
  try {
    const {
      Nombre, Capacidad, Disponible,
      idPiso, idEspacioPadre, Tipo, Orden, Descripcion, Activo,
    } = req.body;

    if (Tipo && !["sector", "area", "espacio"].includes(Tipo)) {
      return res.status(400).json({ message: "Tipo inválido" });
    }

    const result = await pool.query(
      `UPDATE "Espacios"
       SET "Nombre"=COALESCE($1,"Nombre"),
           "Capacidad"=COALESCE($2,"Capacidad"),
           "Disponible"=COALESCE($3,"Disponible"),
           "idPiso"=COALESCE($4,"idPiso"),
           "idEspacioPadre"=COALESCE($5,"idEspacioPadre"),
           "Tipo"=COALESCE($6,"Tipo"),
           "Orden"=COALESCE($7,"Orden"),
           "Descripcion"=COALESCE($8,"Descripcion"),
           "Activo"=COALESCE($9,"Activo")
       WHERE "Espacio"=$10`,
      [
        Nombre ?? null, Capacidad ?? null, Disponible ?? null,
        idPiso ?? null, idEspacioPadre ?? null, Tipo ?? null,
        Orden ?? null, Descripcion ?? null, Activo ?? null,
        req.params.id,
      ]
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

// Borrado lógico: marca Activo=false en vez de borrar, para no romper reservas históricas.
// Bloquea si todavía tiene sub-espacios o recursos activos.
export const eliminarEspacio = async (req, res) => {
  const idEspacio = req.params.id;
  try {
    const { rows: subEspacios } = await pool.query(
      `SELECT COUNT(*) AS n FROM "Espacios" WHERE "idEspacioPadre"=$1 AND "Activo"=true`,
      [idEspacio]
    );
    if (Number(subEspacios[0].n) > 0) {
      return res.status(409).json({
        message: `El espacio tiene ${subEspacios[0].n} sub-espacio(s) activo(s). Movelos o desactivalos primero.`,
      });
    }

    const { rows: recursos } = await pool.query(
      `SELECT COUNT(*) AS n FROM "Recursos" WHERE "idEspacio"=$1 AND "Activo"=true`,
      [idEspacio]
    );
    if (Number(recursos[0].n) > 0) {
      return res.status(409).json({
        message: `El espacio tiene ${recursos[0].n} recurso(s) activo(s). Movelos o desactivalos primero.`,
      });
    }

    const result = await pool.query(
      `UPDATE "Espacios" SET "Activo"=false WHERE "Espacio"=$1`,
      [idEspacio]
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
