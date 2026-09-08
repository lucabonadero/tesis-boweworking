import jwt from "jsonwebtoken";
import pool from "../config/db.js";

/**
 * Relee el rol y los permisos reales del staff desde la base.
 *
 * El JWT dura horas: si a un admin lo degradan a staff, su token viejo sigue
 * diciendo "admin" hasta que expire. Para cualquier decisión de autorización
 * la fuente de verdad es la fila, no el token.
 *
 * El resultado se memoiza en `req` porque varias guardas encadenadas
 * (verificarStaff + verificarPermiso) corren en la misma petición.
 */
export async function estadoStaffVigente(req) {
  if (req._staffVigente !== undefined) return req._staffVigente;

  const usuario = req.usuario;
  if (!usuario || usuario.tipo === "cliente") {
    req._staffVigente = null;
    return null;
  }

  const { rows } = await pool.query("SELECT id, rol FROM usuarios WHERE id = $1", [usuario.id]);
  if (rows.length === 0) {
    req._staffVigente = null;
    return null;
  }

  const rol = rows[0].rol;
  let permisos = [];
  if (rol === "admin") {
    const { rows: todos } = await pool.query("SELECT clave FROM permisos");
    permisos = todos.map((r) => r.clave);
  } else {
    const { rows: propios } = await pool.query(
      "SELECT permiso_clave FROM usuario_permisos WHERE usuario_id = $1",
      [usuario.id]
    );
    permisos = propios.map((r) => r.permiso_clave);
  }

  // El resto del código lee req.usuario: se refresca para que nadie
  // siga viendo el rol viejo del token.
  req.usuario.rol = rol;
  req.usuario.permisos = permisos;

  req._staffVigente = { rol, permisos };
  return req._staffVigente;
}

export const verificarToken = (req, res, next) => {
  const encabezadoAuth = req.headers.authorization;

  if (!encabezadoAuth || !encabezadoAuth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  const token = encabezadoAuth.split(" ")[1];

  try {
    const decodificado = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decodificado;
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};

/** Solo un administrador vigente segun la base, no segun el token. */
export const verificarAdmin = async (req, res, next) => {
  if (!req.usuario) return res.status(401).json({ message: "No autenticado" });
  try {
    const vigente = await estadoStaffVigente(req);
    if (vigente?.rol !== "admin") {
      return res.status(403).json({ message: "Acceso restringido a administradores" });
    }
    next();
  } catch (err) {
    console.error("Error al verificar el rol de administrador:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const verificarStaff = async (req, res, next) => {
  if (!req.usuario) return res.status(401).json({ message: "No autenticado" });
  try {
    const vigente = await estadoStaffVigente(req);
    if (vigente?.rol !== "admin" && vigente?.rol !== "staff" && vigente?.rol !== "empleado") {
      return res.status(403).json({ message: "Acceso restringido al personal del coworking" });
    }
    next();
  } catch (err) {
    console.error("Error al verificar el rol de staff:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const verificarPermiso = (permiso) => async (req, res, next) => {
  if (!req.usuario) return res.status(401).json({ message: "No autenticado" });
  try {
    const vigente = await estadoStaffVigente(req);
    if (!vigente) {
      return res.status(403).json({ message: "No tenés permiso para realizar esta acción" });
    }
    if (vigente.rol === "admin") return next();
    if (!vigente.permisos.includes(permiso)) {
      return res.status(403).json({ message: "No tenés permiso para realizar esta acción" });
    }
    next();
  } catch (err) {
    console.error("Error al verificar permiso:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const verificarPermisoAlguno = (...claves) => async (req, res, next) => {
  if (!req.usuario) return res.status(401).json({ message: "No autenticado" });
  try {
    const vigente = await estadoStaffVigente(req);
    if (!vigente) {
      return res.status(403).json({ message: "No tenés permiso para realizar esta acción" });
    }
    if (vigente.rol === "admin") return next();
    if (!claves.some((c) => vigente.permisos.includes(c))) {
      return res.status(403).json({ message: "No tenés permiso para realizar esta acción" });
    }
    next();
  } catch (err) {
    console.error("Error al verificar permisos:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * Restringe el acceso segun el rol del usuario final (RF05).
 * El staff del panel (admin/staff) siempre pasa: para el se usa `verificarPermiso`.
 *
 * @param {...string} roles Roles permitidos: 'usuario', 'estudiante'.
 */
export const verificarRol = (...roles) => (req, res, next) => {
  const usuario = req.usuario;
  if (!usuario) return res.status(401).json({ message: "No autenticado" });

  if (usuario.rol === "admin" || usuario.rol === "staff") return next();

  if (usuario.estado_cuenta === "bloqueado") {
    return res.status(403).json({
      message: "Tu cuenta esta bloqueada. Contactate con el coworking.",
      codigo: "CUENTA_BLOQUEADA",
    });
  }

  if (roles.length > 0 && !roles.includes(usuario.rol)) {
    return res.status(403).json({
      message: "No tenes acceso a este recurso con tu rol actual",
      codigo: "ROL_NO_AUTORIZADO",
    });
  }

  next();
};

/**
 * Rechaza las peticiones de cuentas bloqueadas (RF01).
 * El token se emite al iniciar sesion, asi que un bloqueo posterior debe
 * cortar el acceso aunque el token siga vigente: se relee el estado.
 */
export const verificarCuentaActiva = async (req, res, next) => {
  const usuario = req.usuario;
  if (!usuario) return res.status(401).json({ message: "No autenticado" });

  // El staff no vive en ClienteUsuario.
  if (usuario.tipo !== "cliente") return next();

  try {
    const { rows } = await pool.query(
      'SELECT estado_cuenta, rol FROM "ClienteUsuario" WHERE id = $1',
      [usuario.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "La cuenta ya no existe" });
    }
    if (rows[0].estado_cuenta === "bloqueado") {
      return res.status(403).json({
        message: "Tu cuenta esta bloqueada. Contactate con el coworking.",
        codigo: "CUENTA_BLOQUEADA",
      });
    }

    // Refresca el rol por si cambio despues de emitido el token.
    req.usuario.rol = rows[0].rol;
    req.usuario.estado_cuenta = rows[0].estado_cuenta;
    next();
  } catch (err) {
    console.error("Error al verificar estado de cuenta:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
