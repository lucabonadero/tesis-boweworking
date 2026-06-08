import { ZodError } from "zod";
import { crearReservaSchemaCliente, crearReservaSchemaStaff } from "../schemas/validation.schemas.js";

function formatearErrorZod(error) {
  return {
    message: "Validación fallida",
    errors: error.flatten(),
  };
}

function esTokenDeStaff(usuario) {
  const rol = usuario?.rol;
  return rol === "admin" || rol === "empleado";
}

/** Valida req.body y reemplaza por el resultado parseado (coerciones de Zod aplicadas). */
export function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body ?? {});
      next();
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json(formatearErrorZod(e));
      next(e);
    }
  };
}

/** Valida req.query y reemplaza por el resultado parseado. */
export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query ?? {});
      next();
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json(formatearErrorZod(e));
      next(e);
    }
  };
}

/** POST /api/reservas: schema con o sin Monto según rol del token. */
export function validateCrearReservaBody(req, res, next) {
  try {
    const schema = esTokenDeStaff(req.usuario) ? crearReservaSchemaStaff : crearReservaSchemaCliente;
    req.body = schema.parse(req.body ?? {});
    next();
  } catch (e) {
    if (e instanceof ZodError) return res.status(400).json(formatearErrorZod(e));
    next(e);
  }
}
