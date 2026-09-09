import { Router } from "express";
import { verificarToken, verificarCuentaActiva } from "../middleware/auth.middleware.js";
import { compraCreditosLimiter } from "../middleware/rateLimit.middleware.js";
import { validateBody, validateQuery } from "../middleware/validate.middleware.js";
import {
  creditosMovimientosQuerySchema,
  creditosCotizarSchema,
  creditosComprarSchema,
} from "../schemas/validation.schemas.js";
import {
  obtenerMiSaldo,
  obtenerMisMovimientos,
  obtenerPaquetesActivos,
  cotizarReserva,
  comprarCreditos,
} from "../controllers/creditos.controller.js";

const router = Router();

router.use(verificarToken, verificarCuentaActiva);

router.get("/saldo", obtenerMiSaldo);
router.get("/movimientos", validateQuery(creditosMovimientosQuerySchema), obtenerMisMovimientos);
router.get("/paquetes", obtenerPaquetesActivos);
router.post("/cotizar", validateBody(creditosCotizarSchema), cotizarReserva);
router.post(
  "/comprar",
  compraCreditosLimiter,
  validateBody(creditosComprarSchema),
  comprarCreditos
);

export default router;
