import { Router } from "express";
import { verificarToken, verificarCuentaActiva } from "../middleware/auth.middleware.js";
import { validateQuery } from "../middleware/validate.middleware.js";
import { creditosMovimientosQuerySchema } from "../schemas/validation.schemas.js";
import {
  obtenerMiSaldo,
  obtenerMisMovimientos,
  obtenerPaquetesActivos,
} from "../controllers/creditos.controller.js";

const router = Router();

router.use(verificarToken, verificarCuentaActiva);

router.get("/saldo", obtenerMiSaldo);
router.get("/movimientos", validateQuery(creditosMovimientosQuerySchema), obtenerMisMovimientos);
router.get("/paquetes", obtenerPaquetesActivos);

export default router;
