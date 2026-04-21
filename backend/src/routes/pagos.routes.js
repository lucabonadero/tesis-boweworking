import { Router } from "express";
import {
  obtenerPagos,
  obtenerResumenPagos,
  obtenerPagoPorId,
  registrarPago,
  actualizarPago,
  cambiarEstadoPago,
  eliminarPago,
  obtenerReservasSinPago,
} from "../controllers/pagos.controller.js";
import {
  crearPreferencia,
  webhook,
  verificarPago,
  obtenerEstadoPago,
} from "../controllers/mercadopago.controller.js";
import { verificarToken, verificarAdmin } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { mercadoPagoWebhookLimiter } from "../middleware/rateLimit.middleware.js";
import { crearPreferenciaSchema } from "../schemas/validation.schemas.js";

const router = Router();

router.post(
  "/crear-preferencia",
  verificarToken,
  validateBody(crearPreferenciaSchema),
  crearPreferencia
);
router.post("/webhook", mercadoPagoWebhookLimiter, webhook);
router.get("/verificar/:paymentId", verificarToken, verificarPago);
router.get("/estado/:idReserva", verificarToken, obtenerEstadoPago);

router.get("/reservas-sin-pago", verificarToken, verificarAdmin, obtenerReservasSinPago);
router.get("/resumen", verificarToken, verificarAdmin, obtenerResumenPagos);
router.get("/", verificarToken, verificarAdmin, obtenerPagos);
router.get("/:id", verificarToken, verificarAdmin, obtenerPagoPorId);
router.post("/", verificarToken, verificarAdmin, registrarPago);
router.put("/:id", verificarToken, verificarAdmin, actualizarPago);
router.patch("/:id/estado", verificarToken, verificarAdmin, cambiarEstadoPago);
router.delete("/:id", verificarToken, verificarAdmin, eliminarPago);

export default router;
