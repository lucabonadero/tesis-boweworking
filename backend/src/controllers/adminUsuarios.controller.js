import bcrypt from "bcryptjs";
import pool from "../config/db.js";

// Permisos predeterminados por rol (excluyendo admin que tiene todos implícitamente)
const PERMISOS_DEFECTO = {
  staff: [
    "ver_reservas", "crear_reservas", "modificar_reservas", "eliminar_reservas",
    "ver_clientes", "gestionar_clientes",
    "ver_espacios", "gestionar_espacios",
    "ver_calendario", "altas_clientes",
  ],
};

// GET /api/admin/usuarios
export const listarUsuarios = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.rol,
        COALESCE(
          json_agg(up.permiso_clave ORDER BY up.permiso_clave)
          FILTER (WHERE up.permiso_clave IS NOT NULL),
          '[]'::json
        ) AS permisos
      FROM usuarios u
      LEFT JOIN usuario_permisos up ON u.id = up.usuario_id
      GROUP BY u.id, u.email, u.rol
      ORDER BY u.id
    `);
    res.json(rows);
  } catch (err) {
    console.error("Error listar usuarios:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// GET /api/admin/permisos
export const listarPermisos = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT clave, descripcion, modulo FROM permisos ORDER BY modulo, clave"
    );
    res.json(rows);
  } catch (err) {
    console.error("Error listar permisos:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// POST /api/admin/usuarios
export const crearUsuario = async (req, res) => {
  const { email, password, rol, permisos } = req.body;

  if (!email || !password || !rol) {
    return res.status(400).json({ message: "Email, contraseña y rol son obligatorios" });
  }
  if (!["admin", "staff"].includes(rol)) {
    return res.status(400).json({ message: "Rol inválido. Valores permitidos: admin, staff" });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existente } = await client.query(
      "SELECT id FROM usuarios WHERE email = $1",
      [email]
    );
    if (existente.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "El email ya está registrado" });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await client.query(
      "INSERT INTO usuarios (email, password, rol) VALUES ($1, $2, $3) RETURNING id, email, rol",
      [email, hash, rol]
    );
    const usuario = rows[0];

    // Determinar permisos a asignar
    let permisosAAsignar = [];
    if (rol !== "admin") {
      permisosAAsignar = Array.isArray(permisos) && permisos.length > 0
        ? permisos
        : (PERMISOS_DEFECTO[rol] || []);

      for (const clave of permisosAAsignar) {
        await client.query(
          "INSERT INTO usuario_permisos (usuario_id, permiso_clave) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [usuario.id, clave]
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ ...usuario, permisos: permisosAAsignar });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error crear usuario:", err);
    if (err.code === "23505") return res.status(409).json({ message: "El email ya está registrado" });
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

// PUT /api/admin/usuarios/:id
export const actualizarUsuario = async (req, res) => {
  const { id } = req.params;
  const { email, rol, password } = req.body;

  try {
    const { rows } = await pool.query("SELECT id, rol FROM usuarios WHERE id = $1", [id]);
    if (rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });

    if (rows[0].rol === "admin" && req.usuario.id !== Number(id)) {
      return res.status(403).json({ message: "No podés modificar a otro administrador" });
    }

    const updates = [];
    const values = [];
    let i = 1;

    if (email) { updates.push(`email = $${i++}`); values.push(email); }
    if (rol) {
      if (!["admin", "staff"].includes(rol)) {
        return res.status(400).json({ message: "Rol inválido" });
      }
      updates.push(`rol = $${i++}`);
      values.push(rol);
    }
    if (password) {
      if (password.length < 6) return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
      const hash = await bcrypt.hash(password, 10);
      updates.push(`password = $${i++}`);
      values.push(hash);
    }

    if (updates.length === 0) return res.status(400).json({ message: "No hay datos para actualizar" });

    values.push(id);
    const { rows: updated } = await pool.query(
      `UPDATE usuarios SET ${updates.join(", ")} WHERE id = $${i} RETURNING id, email, rol`,
      values
    );

    res.json(updated[0]);
  } catch (err) {
    console.error("Error actualizar usuario:", err);
    if (err.code === "23505") return res.status(409).json({ message: "El email ya está en uso" });
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// PUT /api/admin/usuarios/:id/permisos
export const actualizarPermisos = async (req, res) => {
  const { id } = req.params;
  const { permisos } = req.body;

  if (!Array.isArray(permisos)) {
    return res.status(400).json({ message: "permisos debe ser un array de claves" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query("SELECT id, rol FROM usuarios WHERE id = $1", [id]);
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    if (rows[0].rol === "admin") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Los permisos del administrador no se pueden modificar" });
    }

    // Verificar que las claves sean válidas
    if (permisos.length > 0) {
      const { rows: validos } = await client.query(
        "SELECT clave FROM permisos WHERE clave = ANY($1)",
        [permisos]
      );
      const clavesValidas = validos.map((r) => r.clave);
      const invalidas = permisos.filter((p) => !clavesValidas.includes(p));
      if (invalidas.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `Permisos inválidos: ${invalidas.join(", ")}` });
      }
    }

    await client.query("DELETE FROM usuario_permisos WHERE usuario_id = $1", [id]);
    for (const clave of permisos) {
      await client.query(
        "INSERT INTO usuario_permisos (usuario_id, permiso_clave) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [id, clave]
      );
    }

    await client.query("COMMIT");
    res.json({ id: Number(id), permisos });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error actualizar permisos:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

// DELETE /api/admin/usuarios/:id
export const eliminarUsuario = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query("SELECT id, rol, email FROM usuarios WHERE id = $1", [id]);
    if (rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    if (rows[0].rol === "admin") {
      return res.status(400).json({ message: "No se puede eliminar al administrador" });
    }
    if (rows[0].id === req.usuario.id) {
      return res.status(400).json({ message: "No podés eliminarte a vos mismo" });
    }

    await pool.query("DELETE FROM usuarios WHERE id = $1", [id]);
    res.json({ message: "Usuario eliminado correctamente" });
  } catch (err) {
    console.error("Error eliminar usuario:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
