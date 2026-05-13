import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import pool from "../config/db.js";
import { sendMail } from "../services/mailer.service.js";

function getGoogleOAuthClient() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!id) return null;
  return new OAuth2Client(id);
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

function signClienteToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, dni: user.dni || null, tipo: "cliente", rol: "cliente", perfil_completo: user.perfil_completo },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function signAdminToken(admin, permisos = []) {
  return jwt.sign(
    { id: admin.id, email: admin.email, rol: admin.rol, tipo: admin.rol, permisos },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function getPermisos(usuarioId, rol) {
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

function safeUser(row) {
  const { password, ...rest } = row;
  return rest;
}

async function syncCliente(user) {
  if (!user.perfil_completo || !user.dni) return;
  const { rows } = await pool.query('SELECT "DNI" FROM "Cliente" WHERE "DNI" = $1', [user.dni]);
  if (rows.length === 0) {
    await pool.query(
      'INSERT INTO "Cliente" ("DNI","Nombre","Apellido","Email") VALUES ($1,$2,$3,$4)',
      [user.dni, user.nombre, user.apellido, user.email]
    );
  } else {
    await pool.query(
      'UPDATE "Cliente" SET "Nombre"=$1,"Apellido"=$2,"Email"=$3 WHERE "DNI"=$4',
      [user.nombre, user.apellido, user.email, user.dni]
    );
  }
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
    await syncCliente(user);

    const token = signClienteToken(user);
    res.status(201).json({
      token,
      usuario: { ...safeUser(user), rol: "cliente", tiene_password: true },
    });
  } catch (error) {
    console.error("Error en registro cliente:", error);
    if (error.code === "23505") {
      return res.status(409).json({ message: "El email o DNI ya está registrado." });
    }
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── POST /login (unified: checks admin/employee + client tables) ──

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
      const validAdmin = await bcrypt.compare(password, admin.password);
      if (validAdmin) {
        const permisos = await getPermisos(admin.id, admin.rol);
        const token = signAdminToken(admin, permisos);
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

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: "Credenciales incorrectas." });
    }

    const token = signClienteToken(user);
    res.json({
      token,
      usuario: { ...safeUser(user), rol: "cliente", tiene_password: Boolean(user.password) },
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── POST /google ───────────────────────────────────────────
// Flujo: Sign In con Google (ID token desde el front). No usa Client Secret ni callback en el servidor.

export const googleAuth = async (req, res) => {
  const googleClient = getGoogleOAuthClient();
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
        const existing = rows[0];
        if (existing.google_id && existing.google_id !== googleId) {
          return res.status(409).json({
            message:
              "Este email ya está vinculado a otra cuenta de Google. Usá esa cuenta o iniciá sesión con email y contraseña.",
          });
        }
        await pool.query('UPDATE "ClienteUsuario" SET google_id = $1 WHERE id = $2', [googleId, existing.id]);
        const refreshed = await pool.query('SELECT * FROM "ClienteUsuario" WHERE id = $1', [existing.id]);
        rows = refreshed.rows;
      } else {
        const inserted = await pool.query(
          `INSERT INTO "ClienteUsuario" (email, google_id, nombre, apellido, perfil_completo)
           VALUES ($1,$2,$3,$4,false) RETURNING *`,
          [email, googleId, given_name || "", family_name || ""]
        );
        rows = inserted.rows;
      }
    }

    const user = rows[0];
    const token = signClienteToken(user);
    res.json({
      token,
      usuario: { ...safeUser(user), rol: "cliente", tiene_password: Boolean(user.password) },
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

// ── GET /me (unified: handles admin + client) ────────────

export const me = async (req, res) => {
  try {
    if (req.usuario.rol === "admin" || req.usuario.rol === "empleado" || req.usuario.rol === "staff") {
      const { rows } = await pool.query(
        "SELECT id, email, rol FROM usuarios WHERE id = $1",
        [req.usuario.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: "Usuario no encontrado." });
      }
      const admin = rows[0];
      const permisos = await getPermisos(admin.id, admin.rol);
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
      ...safeUser(row),
      rol: "cliente",
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
    await syncCliente(user);

    const token = signClienteToken(user);
    res.json({
      token,
      usuario: { ...safeUser(user), rol: "cliente", tiene_password: Boolean(user.password) },
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
    await syncCliente(user);

    const token = signClienteToken(user);
    res.json({
      token,
      usuario: { ...safeUser(user), rol: "cliente", tiene_password: Boolean(user.password) },
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

function appBaseUrl() {
  const u = process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || "http://localhost:5173";
  return String(u).replace(/\/$/, "");
}

function hashResetToken(token) {
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
    const emailNorm = String(req.body.email).trim().toLowerCase();

    const { rows } = await pool.query(
      `SELECT id, email, password FROM "ClienteUsuario" WHERE LOWER(TRIM(email)) = $1`,
      [emailNorm]
    );

    if (rows.length === 0 || !rows[0].password) {
      return res.status(200).json(MSG_RECUPERACION_ENVIADA);
    }

    const user = rows[0];
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RECUPERACION_MS);

    await pool.query(
      `UPDATE "ClienteUsuario"
       SET password_reset_token_hash = $1, password_reset_expires_at = $2
       WHERE id = $3`,
      [tokenHash, expiresAt, user.id]
    );

    const link = `${appBaseUrl()}/restablecer-contrasena?token=${encodeURIComponent(rawToken)}`;
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
    const tokenHash = hashResetToken(token);
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
    const tokenHash = hashResetToken(token);

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
    const jwtToken = signClienteToken(user);
    res.json({
      message: "Contraseña actualizada. Ya podés iniciar sesión.",
      token: jwtToken,
      usuario: { ...safeUser(user), rol: "cliente", tiene_password: true },
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
    const jwtToken = signClienteToken(fresh);
    res.json({
      message: "Contraseña actualizada.",
      token: jwtToken,
      usuario: { ...safeUser(fresh), rol: "cliente", tiene_password: true },
    });
  } catch (error) {
    console.error("Error al cambiar contraseña:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
