import jwt from "jsonwebtoken";

export const verificarToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};

/** Solo administradores: gestión financiera, alta de usuarios staff. */
export const verificarAdmin = (req, res, next) => {
  if (!req.usuario || req.usuario.rol !== "admin") {
    return res.status(403).json({ message: "Acceso restringido a administradores" });
  }
  next();
};

/** Admin, empleado o staff: operación diaria (reservas, clientes, espacios). */
export const verificarStaff = (req, res, next) => {
  const r = req.usuario?.rol;
  if (r !== "admin" && r !== "empleado" && r !== "staff") {
    return res.status(403).json({ message: "Acceso restringido al personal del coworking" });
  }
  next();
};

/**
 * Middleware factory para permisos granulares.
 * El rol admin siempre pasa. Para empleado/staff verifica req.usuario.permisos (array en el JWT).
 *
 * Uso: router.get("/ruta", verificarToken, verificarPermiso("ver_reservas"), handler)
 */
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
