import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";

// Login legado (tabla usuarios). El frontend usa POST /api/auth/cliente/login, que unifica admin, staff y cliente.
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows } = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    const usuario = rows[0];
    const passwordValido = await bcrypt.compare(password, usuario.password);

    if (!passwordValido) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      usuario: { id: usuario.id, email: usuario.email, rol: usuario.rol },
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const registrarAdmin = async (req, res) => {
  try {
    const { email, password, rol } = req.body;

    const { rows: existente } = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1',
      [email]
    );

    if (existente.length > 0) {
      return res.status(400).json({ message: "El email ya está registrado" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const { rows } = await pool.query(
      'INSERT INTO usuarios (email, password, rol) VALUES ($1, $2, $3) RETURNING *',
      [email, passwordHash, rol || "staff"]
    );

    res.status(201).json({ id: rows[0].id, email, rol: rol || "staff" });
  } catch (error) {
    console.error("Error al registrar admin:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
