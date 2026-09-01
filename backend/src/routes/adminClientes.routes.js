import { Router } from "express";
import { verificarToken, verificarPermiso } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validate.middleware.js";
import {
  adminListarClientesUsuariosQuerySchema,
  adminCambiarEstadoCuentaSchema,
  adminResolverEstudianteSchema,
  adminIdParamSchema,
} from "../schemas/validation.schemas.js";
import {
  listarClientesUsuarios,
  obtenerClienteUsuario,
  listarSolicitudesEstudiante,
  obtenerComprobanteEstudiante,
  cambiarEstadoCuenta,
  resolverVerificacionEstudiante,
} from "../controllers/adminClientes.controller.js";

const router = Router();

// Gestion de usuarios finales: mismo permiso que la gestion de staff.
router.use(verificarToken, verificarPermiso("gestionar_usuarios"));

// Antes de "/:id" para que 'solicitudes-estudiante' no se lea como un id.
router.get("/solicitudes-estudiante", listarSolicitudesEstudiante);

router.get(
  "/",
  validateQuery(adminListarClientesUsuariosQuerySchema),
  listarClientesUsuarios
);

router.get("/:id", validateParams(adminIdParamSchema), obtenerClienteUsuario);

router.get(
  "/:id/comprobante",
  validateParams(adminIdParamSchema),
  obtenerComprobanteEstudiante
);

// RF01: bloquear / habilitar cuenta.
router.put(
  "/:id/estado",
  validateParams(adminIdParamSchema),
  validateBody(adminCambiarEstadoCuentaSchema),
  cambiarEstadoCuenta
);

// RF04: aprobar / rechazar la solicitud de rol Estudiante.
router.put(
  "/:id/verificacion-estudiante",
  validateParams(adminIdParamSchema),
  validateBody(adminResolverEstudianteSchema),
  resolverVerificacionEstudiante
);

export default router;
