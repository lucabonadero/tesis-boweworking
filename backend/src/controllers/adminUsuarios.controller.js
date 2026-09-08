import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import {
  ROLES_ASIGNABLES,
  evaluarAltaUsuario,
  evaluarCambioRol,
  normalizarEmail,
  permisosParaRol,
} from "../services/rolUsuario.service.js";

/** Claves validas del catalogo, para rechazar permisos inexistentes. */
async function obtenerCatalogoPermisos(client) {
  const { rows } = await client.query("SELECT clave FROM permisos");
  return rows.map((r) => r.clave);
}

/** Reescribe por completo los permisos de un usuario. Debe correr en transaccion. */
async function reescribirPermisos(client, usuarioId, permisos) {
  await client.query("DELETE FROM usuario_permisos WHERE usuario_id = $1", [usuarioId]);
  if (permisos.length === 0) return;

  // Una sola sentencia con UNNEST en lugar de un INSERT por clave.
  await client.query(
    `INSERT INTO usuario_permisos (usuario_id, permiso_clave)
     SELECT $1, clave FROM UNNEST($2::varchar[]) AS clave
     ON CONFLICT DO NOTHING`,
    [usuarioId, permisos]
  );
}

/** Cantidad de administradores del sistema, para no degradar al ultimo. */
async function contarAdmins(client) {
  const { rows } = await client.query(
    "SELECT COUNT(*)::int AS total FROM usuarios WHERE rol = 'admin'"
  );
  return rows[0]?.total ?? 0;
}

/** Traduce el codigo de rechazo del servicio al estado HTTP correspondiente. */
function estadoHttpPara(codigo) {
  switch (codigo) {
    case "EMAIL_EN_USO":
      return 409;
    case "NO_ENCONTRADO":
      return 404;
    case "AUTO_DEGRADACION":
    case "ULTIMO_ADMIN":
      return 403;
    default:
      return 400;
  }
}

// GET /api/admin/usuarios
export const listarUsuarios = async (req, res) => {
  try {
    const { rol } = req.query;

    // Filtro opcional por rol (RF02).
    const condiciones = [];
    const params = [];
    if (rol && ROLES_ASIGNABLES.concat("empleado").includes(rol)) {
      params.push(rol);
      condiciones.push(`u.rol = $${params.length}`);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.rol,
        u.created_at,
        COALESCE(
          json_agg(up.permiso_clave ORDER BY up.permiso_clave)
          FILTER (WHERE up.permiso_clave IS NOT NULL),
          '[]'::json
        ) AS permisos
      FROM usuarios u
      LEFT JOIN usuario_permisos up ON u.id = up.usuario_id
      ${where}
      GROUP BY u.id, u.email, u.rol, u.created_at
      ORDER BY u.id
    `,
      params
    );
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

/**
 * POST /api/admin/usuarios
 *
 * Crea unicamente. Si el email ya existe responde 409 SIN escribir nada e
 * informa el rol actual, para que la interfaz pueda ofrecer el cambio de rol
 * como una operacion aparte y explicita.
 */
export const crearUsuario = async (req, res) => {
  // Body ya validado por Zod (adminCrearUsuarioSchema).
  const { email, password, rol, permisos } = req.body;

  // Solo un administrador crea administradores o elige permisos a mano: con
  // `gestionar_usuarios` alcanzaba para darse de alta una segunda cuenta admin.
  const esAdmin = req.usuario?.rol === "admin";
  if (!esAdmin && rol === "admin") {
    return res.status(403).json({
      message: "Solo un administrador puede crear otra cuenta de administrador",
      codigo: "SOLO_ADMIN_CREA_ADMIN",
    });
  }
  if (!esAdmin && Array.isArray(permisos) && permisos.length > 0) {
    return res.status(403).json({
      message: "Solo un administrador puede elegir permisos a mano. La cuenta se crea con los permisos por defecto del rol.",
      codigo: "SOLO_ADMIN_ASIGNA_PERMISOS",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const emailNormalizado = normalizarEmail(email);

    // Busqueda case-insensitive: el UNIQUE de la tabla es sensible a mayusculas.
    const { rows: existentes } = await client.query(
      "SELECT id, email, rol FROM usuarios WHERE LOWER(TRIM(email)) = $1",
      [emailNormalizado]
    );

    const decision = evaluarAltaUsuario({
      email: emailNormalizado,
      usuarioExistente: existentes[0] ?? null,
      rolSolicitado: rol,
      permisosSolicitados: permisos ?? null,
      catalogoPermisos: await obtenerCatalogoPermisos(client),
    });

    if (!decision.ok) {
      await client.query("ROLLBACK");
      return res.status(estadoHttpPara(decision.codigo)).json({
        message: decision.mensaje,
        codigo: decision.codigo,
        usuarioId: decision.usuarioId,
        rolActual: decision.rolActual,
        rolSolicitado: decision.rolSolicitado,
        puedeCambiarRol: decision.puedeCambiarRol,
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await client.query(
      "INSERT INTO usuarios (email, password, rol) VALUES ($1, $2, $3) RETURNING id, email, rol, created_at",
      [decision.email, hash, rol]
    );
    const usuario = rows[0];

    await reescribirPermisos(client, usuario.id, decision.permisosFinales);

    await client.query("COMMIT");
    res.status(201).json({ ...usuario, permisos: decision.permisosFinales });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error crear usuario:", err);
    // Red de seguridad: el UNIQUE de la tabla ante una carrera entre peticiones.
    if (err.code === "23505") {
      return res.status(409).json({
        message: "Ya existe una cuenta con este email",
        codigo: "EMAIL_EN_USO",
      });
    }
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/admin/usuarios/:id
 *
 * Edita email y contrasena. Ya NO acepta `rol`: el cambio de rol tiene su
 * propio endpoint porque debe recalcular los permisos en la misma
 * transaccion. Mezclar ambas operaciones era la causa de las cuentas rotas.
 */
export const actualizarUsuario = async (req, res) => {
  const { id } = req.params;
  const { email, password } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "SELECT id, rol FROM usuarios WHERE id = $1",
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (rows[0].rol === "admin" && req.usuario.id !== Number(id)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No podes modificar a otro administrador" });
    }

    // Cambiar la contrasena de otra cuenta equivale a apropiarsela: un staff
    // solo puede cambiar la propia. El admin sigue pudiendo resetear a su equipo.
    if (password !== undefined && req.usuario.rol !== "admin" && req.usuario.id !== Number(id)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Solo un administrador puede cambiar la contraseña de otra cuenta",
        codigo: "SOLO_ADMIN_CAMBIA_PASSWORD",
      });
    }

    const updates = [];
    const values = [];
    let i = 1;

    if (email !== undefined) {
      const emailNormalizado = normalizarEmail(email);

      // Chequeo previo a escribir: nunca pisar el email de otra cuenta.
      const { rows: enUso } = await client.query(
        "SELECT id FROM usuarios WHERE LOWER(TRIM(email)) = $1 AND id <> $2",
        [emailNormalizado, id]
      );
      if (enUso.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Ya existe otra cuenta con este email",
          codigo: "EMAIL_EN_USO",
          usuarioId: enUso[0].id,
        });
      }

      updates.push(`email = $${i++}`);
      values.push(emailNormalizado);
    }

    if (password !== undefined) {
      const hash = await bcrypt.hash(password, 10);
      updates.push(`password = $${i++}`);
      values.push(hash);
    }

    if (updates.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "No hay datos para actualizar" });
    }

    values.push(id);
    const { rows: updated } = await client.query(
      `UPDATE usuarios SET ${updates.join(", ")} WHERE id = $${i} RETURNING id, email, rol, created_at`,
      values
    );

    await client.query("COMMIT");
    res.json(updated[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error actualizar usuario:", err);
    if (err.code === "23505") {
      return res.status(409).json({
        message: "Ya existe otra cuenta con este email",
        codigo: "EMAIL_EN_USO",
      });
    }
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/admin/usuarios/:id/rol
 *
 * Cambia el rol y recalcula `usuario_permisos` en una unica transaccion.
 *
 * Corrige el bug por el que cambiar el rol dejaba la cuenta inconsistente:
 * al pasar a admin quedaban permisos huerfanos imposibles de limpiar desde
 * la interfaz, y al pasar a staff la cuenta se quedaba sin ningun permiso.
 */
export const cambiarRolUsuario = async (req, res) => {
  const { id } = req.params;
  const { rol, permisos } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // FOR UPDATE: bloquea la fila para que dos cambios simultaneos no
    // dejen el rol y los permisos desincronizados.
    const { rows } = await client.query(
      "SELECT id, email, rol FROM usuarios WHERE id = $1 FOR UPDATE",
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    const usuario = rows[0];

    const { rows: permisosActuales } = await client.query(
      "SELECT permiso_clave FROM usuario_permisos WHERE usuario_id = $1",
      [id]
    );

    const decision = evaluarCambioRol({
      rolActual: usuario.rol,
      rolNuevo: rol,
      permisosActuales: permisosActuales.map((r) => r.permiso_clave),
      permisosSolicitados: permisos ?? null,
      catalogoPermisos: await obtenerCatalogoPermisos(client),
      esAutoModificacion: Number(id) === req.usuario.id,
      totalAdmins: await contarAdmins(client),
    });

    if (!decision.ok) {
      await client.query("ROLLBACK");
      return res.status(estadoHttpPara(decision.codigo)).json({
        message: decision.mensaje,
        codigo: decision.codigo,
        permisosInvalidos: decision.permisosInvalidos,
      });
    }

    if (decision.sinCambios) {
      await client.query("ROLLBACK");
      return res.json({
        id: Number(id),
        email: usuario.email,
        rol: usuario.rol,
        permisos: decision.permisosFinales,
        sinCambios: true,
        message: decision.mensaje,
      });
    }

    // Rol y permisos se escriben juntos: nunca pueden divergir.
    await client.query("UPDATE usuarios SET rol = $1 WHERE id = $2", [rol, id]);
    if (decision.debeReescribirPermisos) {
      await reescribirPermisos(client, Number(id), decision.permisosFinales);
    }

    await client.query("COMMIT");
    res.json({
      id: Number(id),
      email: usuario.email,
      rol,
      rolAnterior: usuario.rol,
      permisos: decision.permisosFinales,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error cambiar rol de usuario:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

// PUT /api/admin/usuarios/:id/permisos
export const actualizarPermisos = async (req, res) => {
  const { id } = req.params;
  const { permisos } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "SELECT id, rol FROM usuarios WHERE id = $1 FOR UPDATE",
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    if (rows[0].rol === "admin") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Los permisos del administrador no se pueden modificar",
        codigo: "ADMIN_SIN_PERMISOS_EDITABLES",
      });
    }

    const catalogo = await obtenerCatalogoPermisos(client);
    const invalidas = permisos.filter((p) => !catalogo.includes(p));
    if (invalidas.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Permisos invalidos: ${invalidas.join(", ")}`,
        codigo: "PERMISOS_INVALIDOS",
        permisosInvalidos: invalidas,
      });
    }

    await reescribirPermisos(client, Number(id), permisos);

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

/**
 * POST /api/admin/usuarios/:id/restaurar-permisos
 *
 * Reasigna los permisos por defecto del rol. Sirve para reparar desde la
 * interfaz las cuentas que quedaron inconsistentes por el bug anterior.
 */
export const restaurarPermisosPorRol = async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "SELECT id, email, rol FROM usuarios WHERE id = $1 FOR UPDATE",
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const permisosFinales = permisosParaRol(rows[0].rol);
    await reescribirPermisos(client, Number(id), permisosFinales);

    await client.query("COMMIT");
    res.json({
      id: Number(id),
      email: rows[0].email,
      rol: rows[0].rol,
      permisos: permisosFinales,
      message: "Permisos restaurados segun el rol",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error restaurar permisos:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

// DELETE /api/admin/usuarios/:id
export const eliminarUsuario = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      "SELECT id, rol, email FROM usuarios WHERE id = $1",
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    if (rows[0].rol === "admin") {
      return res.status(400).json({ message: "No se puede eliminar al administrador" });
    }
    if (rows[0].id === req.usuario.id) {
      return res.status(400).json({ message: "No podes eliminarte a vos mismo" });
    }

    // usuario_permisos tiene ON DELETE CASCADE: no quedan filas huerfanas.
    await pool.query("DELETE FROM usuarios WHERE id = $1", [id]);
    res.json({ message: "Usuario eliminado correctamente" });
  } catch (err) {
    console.error("Error eliminar usuario:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
