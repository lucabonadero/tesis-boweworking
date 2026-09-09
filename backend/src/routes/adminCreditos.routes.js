import { Router } from "express";
import { verificarToken, verificarPermiso } from "../middleware/auth.middleware.js";
import { validateBody, validateParams } from "../middleware/validate.middleware.js";
import {
  creditosIdParamSchema,
  adminAjusteCreditosSchema,
  adminCrearPaqueteSchema,
  adminActualizarPaqueteSchema,
} from "../schemas/validation.schemas.js";
import {
  obtenerCreditosDeUsuario,
  ajustarCreditosDeUsuario,
  listarPaquetesAdmin,
  crearPaqueteAdmin,
  actualizarPaqueteAdmin,
  eliminarPaqueteAdmin,
} from "../controllers/adminCreditos.controller.js";

const router = Router();

router.use(verificarToken, verificarPermiso("gestionar_creditos"));

router.get("/paquetes", listarPaquetesAdmin);
router.post("/paquetes", validateBody(adminCrearPaqueteSchema), crearPaqueteAdmin);
router.put(
  "/paquetes/:id",
  validateParams(creditosIdParamSchema),
  validateBody(adminActualizarPaqueteSchema),
  actualizarPaqueteAdmin
);
router.delete("/paquetes/:id", validateParams(creditosIdParamSchema), eliminarPaqueteAdmin);

router.get("/usuarios/:id", validateParams(creditosIdParamSchema), obtenerCreditosDeUsuario);
router.post(
  "/usuarios/:id/ajuste",
  validateParams(creditosIdParamSchema),
  validateBody(adminAjusteCreditosSchema),
  ajustarCreditosDeUsuario
);

export default router;
