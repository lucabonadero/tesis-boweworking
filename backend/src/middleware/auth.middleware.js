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

/** Solo administradores: alta de usuarios staff, API de pagos / gestión financiera. */
export const verificarAdmin = (req, res, next) => {
  if (!req.usuario || req.usuario.rol !== "admin") {
    return res.status(403).json({ message: "Acceso restringido a administradores" });
  }
  next();
};

/** Admin o empleado (tabla `usuarios`): operación diaria (reservas, clientes en mostrador, espacios). */
export const verificarStaff = (req, res, next) => {
  const r = req.usuario?.rol;
  if (r !== "admin" && r !== "empleado") {
    return res.status(403).json({ message: "Acceso restringido al personal del coworking" });
  }
  next();
};
