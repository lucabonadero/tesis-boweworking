import pool from "../config/db.js";
import {
  evaluarCambioEstadoCuenta,
  evaluarResolucionEstudiante,
  usuarioFinalPublico,
} from "../services/rolClienteUsuario.service.js";

/** Columnas expuestas del usuario final. Nunca incluye password ni google_id. */
const COLUMNAS_PUBLICAS = `
  id, email, nombre, apellido, dni, telefono, perfil_completo, created_at,
  rol, estado_verificacion_estudiante, estado_cuenta,
  institucion_estudiante, solicitud_estudiante_at, resolucion_estudiante_at,
  motivo_rechazo_estudiante, bloqueado_at, motivo_bloqueo,
  (comprobante_estudiante IS NOT NULL) AS tiene_comprobante
`;

function estadoHttpPara(codigo) {
  switch (codigo) {
    case "NO_ENCONTRADO":
      return 404;
    case "CUENTA_BLOQUEADA":
      return 403;
    default:
      return 400;
  }
}

/**
 * GET /api/admin/clientes-usuarios
 * Lista los usuarios finales con filtro por rol y estado (RF01, RF02).
 */
export const listarClientesUsuarios = async (req, res) => {
  try {
    // Query ya validada por Zod (adminListarClientesUsuariosQuerySchema).
    const {
      rol,
      estado_cuenta: estadoCuenta,
      estado_verificacion_estudiante: estadoVerificacion,
      q,
      limit = 30,
      offset = 0,
    } = req.query;

    const condiciones = [];
    const params = [];

    if (rol) {
      params.push(rol);
      condiciones.push(`rol = $${params.length}`);
    }
    if (estadoCuenta) {
      params.push(estadoCuenta);
      condiciones.push(`estado_cuenta = $${params.length}`);
    }
    if (estadoVerificacion) {
      params.push(estadoVerificacion);
      condiciones.push(`estado_verificacion_estudiante = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const i = params.length;
      condiciones.push(
        `(email ILIKE $${i} OR nombre ILIKE $${i} OR apellido ILIKE $${i} OR COALESCE(dni,'') ILIKE $${i})`
      );
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

    const { rows: conteo } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM "ClienteUsuario" ${where}`,
      params
    );

    const { rows } = await pool.query(
      `SELECT ${COLUMNAS_PUBLICAS}
       FROM "ClienteUsuario"
       ${where}
       ORDER BY created_at DESC NULLS LAST, id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      items: rows.map(usuarioFinalPublico),
      total: conteo[0]?.total ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error("Error listar usuarios finales:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/** GET /api/admin/clientes-usuarios/:id */
export const obtenerClienteUsuario = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLUMNAS_PUBLICAS} FROM "ClienteUsuario" WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    res.json(usuarioFinalPublico(rows[0]));
  } catch (err) {
    console.error("Error obtener usuario final:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * GET /api/admin/clientes-usuarios/solicitudes-estudiante
 * Solicitudes pendientes de verificacion (RF04).
 */
export const listarSolicitudesEstudiante = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLUMNAS_PUBLICAS}
       FROM "ClienteUsuario"
       WHERE estado_verificacion_estudiante = 'pendiente'
       ORDER BY solicitud_estudiante_at ASC NULLS LAST, id ASC`
    );
    res.json({ items: rows.map(usuarioFinalPublico), total: rows.length });
  } catch (err) {
    console.error("Error listar solicitudes de estudiante:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * GET /api/admin/clientes-usuarios/:id/comprobante
 * Devuelve el comprobante para que el administrador pueda revisarlo.
 * Va aparte del listado para no cargar imagenes en cada consulta.
 */
export const obtenerComprobanteEstudiante = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT comprobante_estudiante, institucion_estudiante FROM "ClienteUsuario" WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    if (!rows[0].comprobante_estudiante) {
      return res.status(404).json({ message: "El usuario no adjunto comprobante" });
    }
    res.json({
      comprobante: rows[0].comprobante_estudiante,
      institucion: rows[0].institucion_estudiante,
    });
  } catch (err) {
    console.error("Error obtener comprobante:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * PUT /api/admin/clientes-usuarios/:id/estado
 * Bloquea o habilita una cuenta (RF01).
 */
export const cambiarEstadoCuenta = async (req, res) => {
  const { id } = req.params;
  const { accion, motivo } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      'SELECT id, email, estado_cuenta FROM "ClienteUsuario" WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const decision = evaluarCambioEstadoCuenta({
      usuario: rows[0],
      accion,
      motivo,
    });

    if (!decision.ok) {
      await client.query("ROLLBACK");
      return res.status(estadoHttpPara(decision.codigo)).json({
        message: decision.mensaje,
        codigo: decision.codigo,
      });
    }

    if (decision.sinCambios) {
      await client.query("ROLLBACK");
      return res.json({
        id: Number(id),
        estado_cuenta: decision.estadoFinal,
        sinCambios: true,
        message: decision.mensaje,
      });
    }

    const esBloqueo = decision.estadoFinal === "bloqueado";
    const { rows: actualizado } = await client.query(
      `UPDATE "ClienteUsuario"
       SET estado_cuenta = $1,
           motivo_bloqueo = $2,
           bloqueado_at = ${esBloqueo ? "NOW()" : "NULL"},
           bloqueado_por_usuario_id = $3
       WHERE id = $4
       RETURNING ${COLUMNAS_PUBLICAS}`,
      [decision.estadoFinal, decision.motivo, esBloqueo ? req.usuario.id : null, id]
    );

    await client.query("COMMIT");
    res.json(usuarioFinalPublico(actualizado[0]));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error cambiar estado de cuenta:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/admin/clientes-usuarios/:id/verificacion-estudiante
 * Aprueba o rechaza una solicitud de rol Estudiante (RF04).
 *
 * El rol y el estado de verificacion se escriben en la misma transaccion,
 * igual que en el cambio de rol del staff: nunca pueden divergir.
 */
export const resolverVerificacionEstudiante = async (req, res) => {
  const { id } = req.params;
  const { decision: decisionSolicitada, motivo } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, email, rol, estado_verificacion_estudiante
       FROM "ClienteUsuario" WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const decision = evaluarResolucionEstudiante({
      usuario: rows[0],
      decision: decisionSolicitada,
      motivo,
    });

    if (!decision.ok) {
      await client.query("ROLLBACK");
      return res.status(estadoHttpPara(decision.codigo)).json({
        message: decision.mensaje,
        codigo: decision.codigo,
      });
    }

    const { rows: actualizado } = await client.query(
      `UPDATE "ClienteUsuario"
       SET rol = $1,
           estado_verificacion_estudiante = $2,
           motivo_rechazo_estudiante = $3,
           resolucion_estudiante_at = NOW(),
           resuelto_por_usuario_id = $4
       WHERE id = $5
       RETURNING ${COLUMNAS_PUBLICAS}`,
      [decision.rolFinal, decision.estadoFinal, decision.motivo, req.usuario.id, id]
    );

    await client.query("COMMIT");
    res.json(usuarioFinalPublico(actualizado[0]));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error resolver verificacion de estudiante:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};
