import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import pool from "../config/db.js";
import { sendMail } from "../services/mailer.service.js";
import {
  beneficiosParaRol,
  evaluarSolicitudEstudiante,
} from "../services/rolClienteUsuario.service.js";

function obtenerClienteOAuthGoogle() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!id) return null;
  return new OAuth2Client(id);
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

function firmarTokenCliente(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      dni: user.dni || null,
      tipo: "cliente",
      // Rol real del usuario final (RF03/RF05). Antes iba fijo en "cliente".
      rol: user.rol || "usuario",
      estado_cuenta: user.estado_cuenta || "activo",
      estado_verificacion_estudiante: user.estado_verificacion_estudiante || "no_solicitado",
      perfil_completo: user.perfil_completo,
    },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function firmarTokenAdmin(admin, permisos = []) {
  return jwt.sign(
    { id: admin.id, email: admin.email, rol: admin.rol, tipo: admin.rol, permisos },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function obtenerPermisos(usuarioId, rol) {
  if (rol === "admin") {
    const { rows } = await pool.query("SELECT clave FROM permisos ORDER BY clave");
    return rows.map((r) => r.clave);
  }
  const { rows } = await pool.query(
    "SELECT permiso_clave FROM usuario_permisos WHERE usuario_id = $1",
    [usuarioId]
  );
  return rows.map((r) => r.permiso_clave);
}

function nombreDeRol(rol) {
  if (rol === "admin") return "Administrador";
  if (rol === "staff") return "Staff";
  return "Empleado";
}

function usuarioSeguro(row) {
  // Se excluye el comprobante: puede pesar mucho y no hace falta en cada respuesta.
  const { password, comprobante_estudiante, ...rest } = row;
  return { ...rest, tiene_comprobante_estudiante: Boolean(comprobante_estudiante) };
}

/**
 * Refleja los datos de la cuenta en la tabla `Cliente`, que usan las reservas.
 *
 * La version anterior buscaba por DNI y sobrescribia el Email sin avisar: si
 * dos cuentas compartian DNI, la segunda pisaba el Email de la primera y
 * dejaba la ficha del cliente apuntando a otra persona. Ahora, si el DNI ya
 * pertenece a un Cliente con otro email, no se toca la fila: se registra el
 * conflicto para que un administrador lo resuelva.
 */
async function sincronizarCliente(user) {
  if (!user.perfil_completo || !user.dni) return;

  const { rows } = await pool.query(
    'SELECT "DNI", "Email" FROM "Cliente" WHERE "DNI" = $1',
    [user.dni]
  );

  if (rows.length === 0) {
    await pool.query(
      'INSERT INTO "Cliente" ("DNI","Nombre","Apellido","Email") VALUES ($1,$2,$3,$4) ON CONFLICT ("DNI") DO NOTHING',
      [user.dni, user.nombre, user.apellido, user.email]
    );
    return;
  }

  const emailExistente = String(rows[0].Email ?? "").trim().toLowerCase();
  const emailCuenta = String(user.email ?? "").trim().toLowerCase();

  // El DNI ya esta tomado por un Cliente con otro email: no sobrescribir.
  if (emailExistente && emailExistente !== emailCuenta) {
    console.warn(
      `[sincronizarCliente] DNI ${user.dni} ya asociado a ${emailExistente}; ` +
      `no se sobrescribe con ${emailCuenta}. Revisar con reparacion_permisos_rol.sql (consulta 1.g).`
    );
    return;
  }

  await pool.query(
    'UPDATE "Cliente" SET "Nombre"=$1,"Apellido"=$2,"Email"=$3 WHERE "DNI"=$4',
    [user.nombre, user.apellido, user.email, user.dni]
  );
}

// ── POST /registro ─────────────────────────────────────────

export const registro = async (req, res) => {
  try {
    const { email, password, nombre, apellido, dni, telefono } = req.body;

    if (!email || !password || !nombre || !apellido || !dni || !telefono) {
      return res.status(400).json({ message: "Todos los campos son obligatorios." });
    }

    const { rows: existe } = await pool.query(
      'SELECT id FROM "ClienteUsuario" WHERE email = $1 OR dni = $2',
      [email, dni]
    );
    if (existe.length > 0) {
      return res.status(409).json({ message: "El email o DNI ya está registrado." });
    }

    const hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO "ClienteUsuario" (email, password, nombre, apellido, dni, telefono, perfil_completo)
       VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *`,
      [email, hash, nombre, apellido, dni, telefono]
    );

    const user = rows[0];
    await sincronizarCliente(user);

    const token = firmarTokenCliente(user);
    res.status(201).json({
      token,
      usuario: { ...usuarioSeguro(user), rol: user.rol || "usuario", tipo: "cliente", tiene_password: true },
    });
  } catch (error) {
    console.error("Error en registro cliente:", error);
    if (error.code === "23505") {
      return res.status(409).json({ message: "El email o DNI ya está registrado." });
    }
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── POST /login (unificado: busca en las tablas de admin/staff y de cliente) ──

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email y contraseña son obligatorios." });
    }

    const { rows: adminRows } = await pool.query(
      "SELECT * FROM usuarios WHERE email = $1",
      [email]
    );
    if (adminRows.length > 0) {
      const admin = adminRows[0];
      const adminValido = await bcrypt.compare(password, admin.password);
      if (adminValido) {
        const permisos = await obtenerPermisos(admin.id, admin.rol);
        const token = firmarTokenAdmin(admin, permisos);
        return res.json({
          token,
          usuario: {
            id: admin.id,
            email: admin.email,
            rol: admin.rol,
            nombre: nombreDeRol(admin.rol),
            perfil_completo: true,
            permisos,
          },
        });
      }
    }

    const { rows } = await pool.query(
      'SELECT * FROM "ClienteUsuario" WHERE email = $1',
      [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ message: "Credenciales incorrectas." });
    }

    const user = rows[0];
    if (!user.password) {
      return res.status(401).json({ message: "Esta cuenta usa inicio de sesión con Google." });
    }

    const passwordValida = await bcrypt.compare(password, user.password);
    if (!passwordValida) {
      return res.status(401).json({ message: "Credenciales incorrectas." });
    }

    // RF01: una cuenta bloqueada por un administrador no puede iniciar sesion.
    // Se verifica despues de la contrasena para no revelar que la cuenta existe.
    if (user.estado_cuenta === "bloqueado") {
      return res.status(403).json({
        message: "Tu cuenta está bloqueada. Contactate con el coworking.",
        codigo: "CUENTA_BLOQUEADA",
      });
    }

    const token = firmarTokenCliente(user);
    res.json({
      token,
      usuario: { ...usuarioSeguro(user), rol: user.rol || "usuario", tipo: "cliente", tiene_password: Boolean(user.password) },
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── POST /google ───────────────────────────────────────────
// Flujo: Sign In con Google (ID token desde el front). No usa Client Secret ni callback en el servidor.

export const googleAuth = async (req, res) => {
  const googleClient = obtenerClienteOAuthGoogle();
  if (!googleClient) {
    return res.status(503).json({
      message: "Google Sign-In no está configurado. Definí GOOGLE_CLIENT_ID en el .env del backend.",
    });
  }

  try {
    const { credential } = req.body;
    if (!credential || typeof credential !== "string") {
      return res.status(400).json({ message: "Falta el token de Google (credential)." });
    }

    const audience = process.env.GOOGLE_CLIENT_ID.trim();
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ message: "Respuesta de Google inválida." });
    }

    const { sub: googleId, email, given_name, family_name, email_verified } = payload;
    if (!email) {
      return res.status(401).json({ message: "Tu cuenta de Google no entregó un email. No se puede continuar." });
    }
    if (email_verified === false) {
      return res.status(401).json({ message: "El email de Google no está verificado." });
    }

    let { rows } = await pool.query('SELECT * FROM "ClienteUsuario" WHERE google_id = $1', [googleId]);

    if (rows.length === 0) {
      ({ rows } = await pool.query('SELECT * FROM "ClienteUsuario" WHERE email = $1', [email]));

      if (rows.length > 0) {
        const existente = rows[0];
        if (existente.google_id && existente.google_id !== googleId) {
          return res.status(409).json({
            message:
              "Este email ya está vinculado a otra cuenta de Google. Usá esa cuenta o iniciá sesión con email y contraseña.",
          });
        }
        await pool.query('UPDATE "ClienteUsuario" SET google_id = $1 WHERE id = $2', [googleId, existente.id]);
        const refrescado = await pool.query('SELECT * FROM "ClienteUsuario" WHERE id = $1', [existente.id]);
        rows = refrescado.rows;
      } else {
        const insertado = await pool.query(
          `INSERT INTO "ClienteUsuario" (email, google_id, nombre, apellido, perfil_completo)
           VALUES ($1,$2,$3,$4,false) RETURNING *`,
          [email, googleId, given_name || "", family_name || ""]
        );
        rows = insertado.rows;
      }
    }

    const user = rows[0];

    // RF01: el bloqueo tambien alcanza al ingreso con Google.
    if (user.estado_cuenta === "bloqueado") {
      return res.status(403).json({
        message: "Tu cuenta está bloqueada. Contactate con el coworking.",
        codigo: "CUENTA_BLOQUEADA",
      });
    }

    const token = firmarTokenCliente(user);
    res.json({
      token,
      usuario: { ...usuarioSeguro(user), rol: user.rol || "usuario", tipo: "cliente", tiene_password: Boolean(user.password) },
    });
  } catch (error) {
    console.error("Error en Google auth:", error);
    if (error.code === "23505") {
      return res.status(409).json({ message: "Ese email o cuenta de Google ya está en uso." });
    }
    const name = error?.name || "";
    if (name === "TokenExpiredError" || name === "JsonWebTokenError") {
      return res.status(401).json({ message: "El inicio de sesión con Google expiró o es inválido. Intentá de nuevo." });
    }
    const msg = String(error?.message || "");
    if (/invalid token|wrong number of segments|audience/i.test(msg)) {
      return res.status(401).json({
        message:
          "No se pudo validar Google. Comprobá que GOOGLE_CLIENT_ID en el backend sea el mismo Client ID que VITE_GOOGLE_CLIENT_ID en el front.",
      });
    }
    res.status(401).json({ message: "No se pudo completar el inicio de sesión con Google." });
  }
};

// ── GET /me (unificado: admin y cliente) ────────────

export const me = async (req, res) => {
  try {
    if (req.usuario.rol === "admin" || req.usuario.rol === "staff") {
      const { rows } = await pool.query(
        "SELECT id, email, rol FROM usuarios WHERE id = $1",
        [req.usuario.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: "Usuario no encontrado." });
      }
      const admin = rows[0];
      const permisos = await obtenerPermisos(admin.id, admin.rol);
      return res.json({
        id: admin.id,
        email: admin.email,
        rol: admin.rol,
        nombre: nombreDeRol(admin.rol),
        perfil_completo: true,
        permisos,
      });
    }

    if (req.usuario.tipo !== "cliente") {
      return res.status(403).json({ message: "Acceso denegado." });
    }

    const { rows } = await pool.query(
      'SELECT * FROM "ClienteUsuario" WHERE id = $1',
      [req.usuario.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const row = rows[0];
    res.json({
      ...usuarioSeguro(row),
      rol: row.rol || "usuario",
      tipo: "cliente",
      beneficios: beneficiosParaRol(row.rol),
      tiene_password: Boolean(row.password),
    });
  } catch (error) {
    console.error("Error en /me:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── PUT /perfil ───────────────────────────────────────────

export const actualizarPerfil = async (req, res) => {
  try {
    if (req.usuario.tipo !== "cliente") {
      return res.status(403).json({ message: "Acceso denegado." });
    }

    const { nombre, apellido, telefono } = req.body;
    if (!nombre || !apellido) {
      return res.status(400).json({ message: "Nombre y apellido son obligatorios." });
    }

    const { rows } = await pool.query(
      `UPDATE "ClienteUsuario" SET nombre=$1, apellido=$2, telefono=$3
       WHERE id=$4 RETURNING *`,
      [nombre, apellido, telefono || null, req.usuario.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const user = rows[0];
    await sincronizarCliente(user);

    const token = firmarTokenCliente(user);
    res.json({
      token,
      usuario: { ...usuarioSeguro(user), rol: user.rol || "usuario", tipo: "cliente", tiene_password: Boolean(user.password) },
    });
  } catch (error) {
    console.error("Error al actualizar perfil:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── PUT /completar-perfil ──────────────────────────────────

export const completarPerfil = async (req, res) => {
  try {
    if (req.usuario.tipo !== "cliente") {
      return res.status(403).json({ message: "Acceso denegado." });
    }

    const { dni, telefono } = req.body;
    if (!dni || !telefono) {
      return res.status(400).json({ message: "DNI y teléfono son obligatorios." });
    }

    const { rows: dniCheck } = await pool.query(
      'SELECT id FROM "ClienteUsuario" WHERE dni = $1 AND id != $2',
      [dni, req.usuario.id]
    );
    if (dniCheck.length > 0) {
      return res.status(409).json({ message: "Ese DNI ya está registrado en otra cuenta." });
    }

    const { rows } = await pool.query(
      `UPDATE "ClienteUsuario" SET dni=$1, telefono=$2, perfil_completo=true
       WHERE id=$3 RETURNING *`,
      [dni, telefono, req.usuario.id]
    );

    const user = rows[0];
    await sincronizarCliente(user);

    const token = firmarTokenCliente(user);
    res.json({
      token,
      usuario: { ...usuarioSeguro(user), rol: user.rol || "usuario", tipo: "cliente", tiene_password: Boolean(user.password) },
    });
  } catch (error) {
    console.error("Error en completar perfil:", error);
    if (error.code === "23505") {
      return res.status(409).json({ message: "Ese DNI ya está registrado." });
    }
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

const RECUPERACION_MS = 60 * 60 * 1000; // 1 h

function urlBaseApp() {
  const u = process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || "http://localhost:5173";
  return String(u).replace(/\/$/, "");
}

function hashTokenRecuperacion(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Respuesta uniforme: no revela si el email existe (cuentas solo Google o inexistentes). */
const MSG_RECUPERACION_ENVIADA = {
  message:
    "Si ese correo tiene una cuenta con contraseña, te enviamos un enlace para restablecerla. Revisá también spam.",
};

// ── POST /recuperacion/solicitar ───────────────────────────

export const solicitarRecuperacionPassword = async (req, res) => {
  try {
    const emailNormalizado = String(req.body.email).trim().toLowerCase();

    const { rows } = await pool.query(
      `SELECT id, email, password FROM "ClienteUsuario" WHERE LOWER(TRIM(email)) = $1`,
      [emailNormalizado]
    );

    if (rows.length === 0 || !rows[0].password) {
      return res.status(200).json(MSG_RECUPERACION_ENVIADA);
    }

    const user = rows[0];
    const tokenCrudo = randomBytes(32).toString("base64url");
    const tokenHash = hashTokenRecuperacion(tokenCrudo);
    const expiresAt = new Date(Date.now() + RECUPERACION_MS);

    await pool.query(
      `UPDATE "ClienteUsuario"
       SET password_reset_token_hash = $1, password_reset_expires_at = $2
       WHERE id = $3`,
      [tokenHash, expiresAt, user.id]
    );

    const link = `${urlBaseApp()}/restablecer-contrasena?token=${encodeURIComponent(tokenCrudo)}`;
    const nombre = user.nombre || "Hola";

    try {
      await sendMail({
        to: user.email,
        subject: "Restablecer contraseña — Bo WeWorking",
        html: `
          <p>${nombre},</p>
          <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
          <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#34c08f;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Elegir nueva contraseña</a></p>
          <p style="font-size:13px;color:#666;">El enlace caduca en 1 hora. Si no fuiste vos, ignorá este mensaje.</p>
          <p style="font-size:12px;color:#999;">Si el botón no funciona, copiá y pegá esta URL en el navegador:<br/><span style="word-break:break-all;">${link}</span></p>
        `,
        text: `Restablecer contraseña: ${link}\n\nCaduca en 1 hora.`,
      });
    } catch (mailErr) {
      console.error("[recuperacion] Error al enviar correo:", mailErr);
    }

    return res.status(200).json(MSG_RECUPERACION_ENVIADA);
  } catch (error) {
    console.error("Error en solicitar recuperación:", error);
    return res.status(200).json(MSG_RECUPERACION_ENVIADA);
  }
};

// ── GET /recuperacion/validar ──────────────────────────────

export const validarTokenRecuperacion = async (req, res) => {
  try {
    const token = req.query.token;
    const tokenHash = hashTokenRecuperacion(token);
    const { rows } = await pool.query(
      `SELECT id FROM "ClienteUsuario"
       WHERE password_reset_token_hash = $1 AND password_reset_expires_at > NOW()`,
      [tokenHash]
    );
    res.json({ valid: rows.length > 0 });
  } catch (error) {
    console.error("Error al validar token recuperación:", error);
    res.json({ valid: false });
  }
};

// ── POST /recuperacion/restablecer ─────────────────────────

export const restablecerPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const tokenHash = hashTokenRecuperacion(token);

    const { rows } = await pool.query(
      `SELECT id FROM "ClienteUsuario"
       WHERE password_reset_token_hash = $1 AND password_reset_expires_at > NOW()`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        message: "El enlace no es válido o expiró. Solicitá uno nuevo desde «Olvidé mi contraseña».",
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows: updated } = await pool.query(
      `UPDATE "ClienteUsuario"
       SET password = $1,
           password_reset_token_hash = NULL,
           password_reset_expires_at = NULL
       WHERE id = $2
       RETURNING *`,
      [hash, rows[0].id]
    );

    const user = updated[0];
    const jwtToken = firmarTokenCliente(user);
    res.json({
      message: "Contraseña actualizada. Ya podés iniciar sesión.",
      token: jwtToken,
      usuario: { ...usuarioSeguro(user), rol: user.rol || "usuario", tipo: "cliente", tiene_password: true },
    });
  } catch (error) {
    console.error("Error en restablecer contraseña:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── PUT /cambiar-contrasena (JWT cliente) ──────────────────

export const cambiarPassword = async (req, res) => {
  try {
    if (req.usuario.tipo !== "cliente") {
      return res.status(403).json({ message: "Solo disponible para cuentas de cliente." });
    }

    const { passwordActual, passwordNueva } = req.body;

    const { rows } = await pool.query('SELECT * FROM "ClienteUsuario" WHERE id = $1', [req.usuario.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const user = rows[0];
    if (!user.password) {
      return res.status(400).json({
        message: "Esta cuenta no tiene contraseña (solo Google). No se puede cambiar desde aquí.",
      });
    }

    const ok = await bcrypt.compare(passwordActual, user.password);
    if (!ok) {
      return res.status(401).json({ message: "La contraseña actual no es correcta." });
    }

    if (passwordActual === passwordNueva) {
      return res.status(400).json({ message: "La nueva contraseña debe ser distinta a la actual." });
    }

    const hash = await bcrypt.hash(passwordNueva, 10);
    const { rows: upd } = await pool.query(
      `UPDATE "ClienteUsuario" SET password = $1 WHERE id = $2 RETURNING *`,
      [hash, user.id]
    );

    const fresh = upd[0];
    const jwtToken = firmarTokenCliente(fresh);
    res.json({
      message: "Contraseña actualizada.",
      token: jwtToken,
      usuario: { ...usuarioSeguro(fresh), rol: fresh.rol || "usuario", tipo: "cliente", tiene_password: true },
    });
  } catch (error) {
    console.error("Error al cambiar contraseña:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── RF04: solicitud de cambio al rol Estudiante ────────────

/**
 * POST /api/auth/cliente/solicitar-estudiante
 *
 * Todo usuario se registra como "usuario" y puede pedir el cambio a
 * "estudiante". La cuenta queda en estado "pendiente" hasta que un
 * administrador la apruebe o la rechace: el rol NO cambia todavia.
 */
export const solicitarRolEstudiante = async (req, res) => {
  const { institucion, comprobante } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, email, rol, estado_cuenta, estado_verificacion_estudiante
       FROM "ClienteUsuario" WHERE id = $1 FOR UPDATE`,
      [req.usuario.id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const decision = evaluarSolicitudEstudiante(rows[0]);
    if (!decision.ok) {
      await client.query("ROLLBACK");
      const estado = decision.codigo === "CUENTA_BLOQUEADA" ? 403 : 409;
      return res.status(estado).json({
        message: decision.mensaje,
        codigo: decision.codigo,
      });
    }

    const { rows: actualizado } = await client.query(
      `UPDATE "ClienteUsuario"
       SET estado_verificacion_estudiante = $1,
           institucion_estudiante = $2,
           comprobante_estudiante = $3,
           solicitud_estudiante_at = NOW(),
           resolucion_estudiante_at = NULL,
           motivo_rechazo_estudiante = NULL,
           resuelto_por_usuario_id = NULL
       WHERE id = $4
       RETURNING id, email, rol, estado_cuenta, estado_verificacion_estudiante,
                 institucion_estudiante, solicitud_estudiante_at`,
      [decision.estadoDestino, institucion, comprobante ?? null, req.usuario.id]
    );

    await client.query("COMMIT");
    res.json({
      ...actualizado[0],
      message: "Solicitud enviada. Un administrador la va a revisar.",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error solicitar rol estudiante:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    client.release();
  }
};

/**
 * GET /api/auth/cliente/estado-estudiante
 * Estado de la solicitud, para que el usuario lo vea en su perfil.
 */
export const obtenerEstadoEstudiante = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT rol, estado_verificacion_estudiante, institucion_estudiante,
              solicitud_estudiante_at, resolucion_estudiante_at,
              motivo_rechazo_estudiante, estado_cuenta
       FROM "ClienteUsuario" WHERE id = $1`,
      [req.usuario.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const fila = rows[0];
    res.json({
      ...fila,
      beneficios: beneficiosParaRol(fila.rol),
      puede_solicitar: evaluarSolicitudEstudiante(fila).ok,
    });
  } catch (err) {
    console.error("Error obtener estado de estudiante:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
