import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import pool from "../config/db.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, tipo: "cliente", perfil_completo: user.perfil_completo },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
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

    const token = signToken(user);
    res.status(201).json({ token, usuario: safeUser(user) });
  } catch (error) {
    console.error("Error en registro cliente:", error);
    if (error.code === "23505") {
      return res.status(409).json({ message: "El email o DNI ya está registrado." });
    }
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── POST /login ────────────────────────────────────────────

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email y contraseña son obligatorios." });
    }

    const { rows } = await pool.query('SELECT * FROM "ClienteUsuario" WHERE email = $1', [email]);
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

    const token = signToken(user);
    res.json({ token, usuario: safeUser(user) });
  } catch (error) {
    console.error("Error en login cliente:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── POST /google ───────────────────────────────────────────

export const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: "Credential de Google requerida." });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, given_name, family_name } = payload;

    let { rows } = await pool.query('SELECT * FROM "ClienteUsuario" WHERE google_id = $1', [googleId]);

    if (rows.length === 0) {
      ({ rows } = await pool.query('SELECT * FROM "ClienteUsuario" WHERE email = $1', [email]));

      if (rows.length > 0) {
        await pool.query('UPDATE "ClienteUsuario" SET google_id = $1 WHERE id = $2', [googleId, rows[0].id]);
        rows[0].google_id = googleId;
      } else {
        ({ rows } = await pool.query(
          `INSERT INTO "ClienteUsuario" (email, google_id, nombre, apellido, perfil_completo)
           VALUES ($1,$2,$3,$4,false) RETURNING *`,
          [email, googleId, given_name || "", family_name || ""]
        ));
      }
    }

    const user = rows[0];
    const token = signToken(user);
    res.json({ token, usuario: safeUser(user) });
  } catch (error) {
    console.error("Error en Google auth:", error);
    res.status(401).json({ message: "Error al verificar cuenta de Google." });
  }
};

// ── GET /me ────────────────────────────────────────────────

export const me = async (req, res) => {
  try {
    if (req.usuario.tipo !== "cliente") {
      return res.status(403).json({ message: "Acceso denegado." });
    }

    const { rows } = await pool.query('SELECT * FROM "ClienteUsuario" WHERE id = $1', [req.usuario.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    res.json(safeUser(rows[0]));
  } catch (error) {
    console.error("Error en /me:", error);
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

    const token = signToken(user);
    res.json({ token, usuario: safeUser(user) });
  } catch (error) {
    console.error("Error en completar perfil:", error);
    if (error.code === "23505") {
      return res.status(409).json({ message: "Ese DNI ya está registrado." });
    }
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
