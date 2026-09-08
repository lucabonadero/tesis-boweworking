import { Router } from "express";
import { sugerirReservaIA } from "../controllers/aiReserva.controller.js";
import { verificarToken, verificarCuentaActiva } from "../middleware/auth.middleware.js";
import { asistenteIaLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

// El limiter va después del token: la cuota se cuenta por cuenta, no por IP.
router.post(
  "/sugerir-reserva",
  verificarToken,
  verificarCuentaActiva,
  asistenteIaLimiter,
  sugerirReservaIA
);

export default router;
