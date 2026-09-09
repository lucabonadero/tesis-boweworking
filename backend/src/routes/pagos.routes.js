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
import {
  verificarToken,
  verificarPermiso,
  verificarPermisoAlguno,
} from "../middleware/auth.middleware.js";
import { mercadoPagoWebhookLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/crear-preferencia", verificarToken, crearPreferencia);
router.post("/webhook", mercadoPagoWebhookLimiter, webhook);
router.get("/verificar/:paymentId", verificarToken, verificarPago);
router.get("/estado/:idReserva", verificarToken, obtenerEstadoPago);

// Lectura del módulo financiero: ver_financiero
const puedeVerFinanciero = verificarPermiso("ver_financiero");
// Escritura: gestionar_pagos o registrar_pagos
const puedeGestionarPagos = verificarPermisoAlguno("gestionar_pagos", "registrar_pagos");

router.get("/reservas-sin-pago", verificarToken, puedeVerFinanciero, obtenerReservasSinPago);
router.get("/resumen", verificarToken, puedeVerFinanciero, obtenerResumenPagos);
router.get("/", verificarToken, puedeVerFinanciero, obtenerPagos);
router.get("/:id", verificarToken, puedeVerFinanciero, obtenerPagoPorId);
router.post("/", verificarToken, puedeGestionarPagos, registrarPago);
router.put("/:id", verificarToken, puedeGestionarPagos, actualizarPago);
router.patch("/:id/estado", verificarToken, puedeGestionarPagos, cambiarEstadoPago);
router.delete("/:id", verificarToken, puedeGestionarPagos, eliminarPago);

export default router;
