import { Router } from "express";
import { verificarToken, verificarPermiso, verificarAdmin } from "../middleware/auth.middleware.js";
import { validateBody, validateParams } from "../middleware/validate.middleware.js";
import {
  adminCrearUsuarioSchema,
  adminActualizarUsuarioSchema,
  adminCambiarRolUsuarioSchema,
  adminActualizarPermisosSchema,
  adminIdParamSchema,
} from "../schemas/validation.schemas.js";
import {
  listarUsuarios,
  listarPermisos,
  crearUsuario,
  actualizarUsuario,
  cambiarRolUsuario,
  actualizarPermisos,
  restaurarPermisosPorRol,
  eliminarUsuario,
} from "../controllers/adminUsuarios.controller.js";

const router = Router();

// Todas las rutas requieren token valido y permiso gestionar_usuarios
// (el rol admin lo cumple automaticamente).
router.use(verificarToken, verificarPermiso("gestionar_usuarios"));

router.get("/usuarios", listarUsuarios);
router.get("/permisos", listarPermisos);

router.post("/usuarios", validateBody(adminCrearUsuarioSchema), crearUsuario);

router.put(
  "/usuarios/:id",
  validateParams(adminIdParamSchema),
  validateBody(adminActualizarUsuarioSchema),
  actualizarUsuario
);

// Cambio de rol como operacion propia: recalcula los permisos en la misma
// transaccion, en lugar de mezclarse con la edicion de datos.
//
// Solo un administrador: quien reparte roles y permisos define quien manda en
// el sistema. Con solo `gestionar_usuarios`, un staff podia promoverse a admin
// o autoasignarse cualquier permiso.
router.put(
  "/usuarios/:id/rol",
  verificarAdmin,
  validateParams(adminIdParamSchema),
  validateBody(adminCambiarRolUsuarioSchema),
  cambiarRolUsuario
);

router.put(
  "/usuarios/:id/permisos",
  verificarAdmin,
  validateParams(adminIdParamSchema),
  validateBody(adminActualizarPermisosSchema),
  actualizarPermisos
);

// Reparacion desde la interfaz de cuentas con permisos inconsistentes.
router.post(
  "/usuarios/:id/restaurar-permisos",
  verificarAdmin,
  validateParams(adminIdParamSchema),
  restaurarPermisosPorRol
);

router.delete("/usuarios/:id", validateParams(adminIdParamSchema), eliminarUsuario);

export default router;
