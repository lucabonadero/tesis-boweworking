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
} from "../controllers/reservas.controller.js";
import { verificarToken, verificarStaff } from "../middleware/auth.middleware.js";
import { validateBody, validateCrearReservaBody, validateQuery } from "../middleware/validate.middleware.js";
import {
  crearReservasMultiplesSchema,
  serieMensualCotizarQuerySchema,
  serieMensualCrearBodySchema,
} from "../schemas/validation.schemas.js";

const router = Router();

router.get("/serie-mensual/cotizar", validateQuery(serieMensualCotizarQuerySchema), cotizarSerieMensual);
router.post("/serie-mensual", verificarToken, validateBody(serieMensualCrearBodySchema), crearSerieMensual);
router.get("/mis-reservas", verificarToken, obtenerMisReservas);
router.get("/ocupacion-dia", verificarToken, verificarStaff, obtenerReservasOcupacionDia);
router.get("/", verificarToken, verificarStaff, obtenerReservas);
router.get("/:id", verificarToken, obtenerReservaPorId);
router.post("/", verificarToken, validateCrearReservaBody, crearReserva);
router.post("/multiples", verificarToken, validateBody(crearReservasMultiplesSchema), crearReservasMultiples);
router.put("/:id", verificarToken, actualizarReserva);
router.patch("/:id/estado", verificarToken, verificarStaff, cambiarEstadoReserva);
router.post("/:id/extender", verificarToken, verificarStaff, extenderReserva);
router.delete("/:id", verificarToken, eliminarReserva);

export default router;
