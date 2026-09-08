import { Router } from "express";
import {
  obtenerReservas,
  obtenerReservasOcupacionDia,
  obtenerReservaPorId,
  crearReserva,
  crearReservasMultiples,
  actualizarReserva,
  eliminarReserva,
  cambiarEstadoReserva,
  extenderReserva,
  obtenerMisReservas,
  cotizarSerieMensual,
  crearSerieMensual,
  previsualizarCancelacionReserva,
  cancelarReserva,
} from "../controllers/reservas.controller.js";
import {
  verificarToken,
  verificarStaff,
  verificarCuentaActiva,
} from "../middleware/auth.middleware.js";
import { reservaEscrituraLimiter } from "../middleware/rateLimit.middleware.js";
import { validateBody, validateCrearReservaBody, validateQuery } from "../middleware/validate.middleware.js";
import {
  crearReservasMultiplesSchema,
  serieMensualCotizarQuerySchema,
  serieMensualCrearBodySchema,
} from "../schemas/validation.schemas.js";

const router = Router();

// Toda la sección exige token. `verificarCuentaActiva` relee el estado de la
// cuenta en cada operación: el bloqueo de un usuario debe cortarle el acceso
// aunque su token siga vigente (RF01). Para el staff es un no-op.
router.get(
  "/serie-mensual/cotizar",
  verificarToken,
  verificarCuentaActiva,
  validateQuery(serieMensualCotizarQuerySchema),
  cotizarSerieMensual
);
router.post("/serie-mensual", verificarToken, verificarCuentaActiva, reservaEscrituraLimiter, validateBody(serieMensualCrearBodySchema), crearSerieMensual);
router.get("/mis-reservas", verificarToken, verificarCuentaActiva, obtenerMisReservas);
router.get("/ocupacion-dia", verificarToken, verificarStaff, obtenerReservasOcupacionDia);
router.get("/", verificarToken, verificarStaff, obtenerReservas);
router.get("/:id", verificarToken, verificarCuentaActiva, obtenerReservaPorId);
router.post("/", verificarToken, verificarCuentaActiva, reservaEscrituraLimiter, validateCrearReservaBody, crearReserva);
router.post("/multiples", verificarToken, verificarCuentaActiva, reservaEscrituraLimiter, validateBody(crearReservasMultiplesSchema), crearReservasMultiples);
router.put("/:id", verificarToken, verificarCuentaActiva, actualizarReserva);
router.patch("/:id/estado", verificarToken, verificarStaff, cambiarEstadoReserva);
router.get("/:id/cancelacion-preview", verificarToken, verificarCuentaActiva, previsualizarCancelacionReserva);
router.post("/:id/cancelar", verificarToken, verificarCuentaActiva, cancelarReserva);
router.post("/:id/extender", verificarToken, verificarStaff, extenderReserva);
router.delete("/:id", verificarToken, verificarCuentaActiva, eliminarReserva);

export default router;
