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
  if (r !== "admin" && r !== "empleado" && r !== "staff") {
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
