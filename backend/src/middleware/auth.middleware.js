import jwt from "jsonwebtoken";

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

export const verificarAdmin = (req, res, next) => {
  if (!req.usuario || req.usuario.rol !== "admin") {
    return res.status(403).json({ message: "Acceso restringido a administradores" });
  }
  next();
};

export const verificarStaff = (req, res, next) => {
  const r = req.usuario?.rol;
  if (r !== "admin" && r !== "staff") {
    return res.status(403).json({ message: "Acceso restringido al personal del coworking" });
  }
  next();
};

export const verificarPermiso = (permiso) => (req, res, next) => {
  const usuario = req.usuario;
  if (!usuario) return res.status(401).json({ message: "No autenticado" });
  if (usuario.rol === "admin") return next();
  const permisos = Array.isArray(usuario.permisos) ? usuario.permisos : [];
  if (!permisos.includes(permiso)) {
    return res.status(403).json({ message: "No tenés permiso para realizar esta acción" });
  }
  next();
};

export const verificarPermisoAlguno = (...claves) => (req, res, next) => {
  const usuario = req.usuario;
  if (!usuario) return res.status(401).json({ message: "No autenticado" });
  if (usuario.rol === "admin") return next();
  const permisos = Array.isArray(usuario.permisos) ? usuario.permisos : [];
  if (!claves.some((c) => permisos.includes(c))) {
    return res.status(403).json({ message: "No tenés permiso para realizar esta acción" });
  }
  next();
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
    const { default: pool } = await import("../config/db.js");
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
